import { useMemo } from 'react';
import { CommissionData, EmployeeCommission } from '../types';

// Commission Rules based on Store Achievement
export const getStoreCommissionRate = (achievement: number): number => {
    if (achievement >= 100) return 2; // 2%
    if (achievement >= 90) return 1; // 1%
    if (achievement >= 80) return 0.5; // 0.5%
    return 0;
};

// Helper to check date range
const isDateInRange = (dateStr: string, start: string, end: string) => {
    return dateStr >= start && dateStr <= end;
};

export function useCommissions(
    rawMgmt: any,
    rawEmp: any,
    dateRange: { start: string; end: string }
) {
    return useMemo(() => {
        if (!rawMgmt?.sales || !rawEmp?.history || !rawEmp?.employee_names) return [];

        const { start, end } = dateRange;
        const storesMap = rawMgmt.stores || {};
        const targets = rawEmp.targets || {};
        const names = rawEmp.employee_names || {};

        // 1. Calculate Store Achievement
        // Structure: StoreID -> { sales, target }
        const storeStats: Record<string, { sales: number; target: number, name: string }> = {};

        // 1a. Store Sales from rawMgmt.sales (Daily sales)
        // rawMgmt.sales is [[date, storeId, amount], ...]
        rawMgmt.sales.forEach(([d, sid, amt]: any[]) => {
            const dateStr = String(d).substring(0, 10);
            if (dateStr >= start && dateStr <= end) {
                if (!storeStats[sid]) {
                    storeStats[sid] = { sales: 0, target: 0, name: storesMap[sid] || sid };
                }
                storeStats[sid].sales += (amt || 0);
            }
        });

        // 1b. Store Targets
        // rawMgmt.targets is [[date, storeId, amount], ...]
        // Targets are usually monthly, date is YYYY-MM-01.
        // We need to approximate daily target or take full month if range covers it.
        // For simplicity in this logic: if any day of the target month is in range, we might need to prorate.
        // Actually, rawMgmt.targets might come as daily targets or monthly. 
        // Let's assume rawMgmt.targets are rows of [date, storeId, amount].
        if (rawMgmt.targets) {
            rawMgmt.targets.forEach(([d, sid, amt]: any[]) => {
                const dateStr = String(d).substring(0, 10);
                if (dateStr >= start && dateStr <= end) {
                    if (!storeStats[sid]) {
                        storeStats[sid] = { sales: 0, target: 0, name: storesMap[sid] || sid };
                    }
                    storeStats[sid].target += (amt || 0);
                }
            });
        }

        // 2. Calculate Employee Sales & Achievement
        // Structure: StoreID -> [EmployeeData]
        const employeesByStore: Record<string, Record<string, { sales: number; target: number; name: string }>> = {};

        // rawEmp.history: { storeId: [[date, empId, sales, trans], ...] }
        Object.entries(rawEmp.history as Record<string, any[]>).forEach(([storeId, records]) => {
            if (!storeStats[storeId]) return; // Skip if store not found in sales

            records.forEach(rec => {
                const date = String(rec[0]).substring(0, 10);
                if (date < start || date > end) return;

                const rawId = rec[1];
                let empId = String(rawId || '').trim();
                let empName = empId;

                // Handle "ID - Name" format
                if (empId.includes('-')) {
                    const [a, b] = empId.split('-');
                    empId = (a || '').trim();
                    empName = (b || empId).trim();
                }

                // Skip returns/unknown
                if (!empId || empName === 'مرتجع') return;

                // Resolve Name
                empName = names[empId] || names[empId.padStart(4, '0')] || empName;
                const cleanId = empId; // Use ID for uniqueness

                if (!employeesByStore[storeId]) employeesByStore[storeId] = {};
                if (!employeesByStore[storeId][cleanId]) {
                    employeesByStore[storeId][cleanId] = { sales: 0, target: 0, name: empName };
                }

                employeesByStore[storeId][cleanId].sales += (Number(rec[2]) || 0);
            });
        });

        // 2b. Employee Targets
        // rawEmp.targets: { empId: number (monthly target) } ?? 
        // Actually rawEmp.targets is usually a single number (current month). 
        // If we are looking at a range, we might need to be careful. 
        // For now, assuming standard month view, we use the target value.
        // If the range is partial month, we should ideally prorate, but let's use the provided target for the period.
        // Ref: DashboardPage logic uses specific target logic.
        // Let's assume rawEmp.targets contains the target for the CURRENT context.

        // 3. Assemble Final Data
        const results: CommissionData[] = [];

        Object.entries(storeStats).forEach(([storeId, stats]) => {
            const storeAchievement = stats.target > 0 ? (stats.sales / stats.target) * 100 : 0;
            const storeRate = getStoreCommissionRate(storeAchievement);

            const storeEmployees: EmployeeCommission[] = [];
            const emps = employeesByStore[storeId] || {};

            const targetsByMonth = rawEmp.targets_by_month || {};
            const monthlyTargets = rawEmp.monthly_targets || {};
            const targets = rawEmp.targets || {};

            const resolveTargetForMonth = (empId: string) => {
                const id = String(empId).trim();
                const cands = [id, id.padStart(4, '0')];

                // Get month key for the range (YYYY-MM)
                const monthKey = start.substring(0, 7);

                // 1. Try targets_by_month
                const tbm = targetsByMonth[monthKey];
                if (tbm) {
                    for (const c of cands) {
                        if (tbm[c] != null) return Number(tbm[c]) || 0;
                    }
                }

                // 2. Try monthly_targets
                for (const c of cands) {
                    const mt = monthlyTargets[c];
                    if (mt && typeof mt === 'object') {
                        const targetVal = mt[`${monthKey}-01`];
                        if (targetVal != null) return Number(targetVal) || 0;
                    }
                }

                // 3. Current month default
                for (const c of cands) {
                    if (targets[c] != null) return Number(targets[c]) || 0;
                }
                return 0;
            };

            Object.entries(emps).forEach(([empId, empStats]) => {
                // Individual Target
                const empTarget = resolveTargetForMonth(empId);

                const empAchievement = empTarget > 0 ? (empStats.sales / empTarget) * 100 : 0;

                const finalRate = (empAchievement / 100) * storeRate;

                storeEmployees.push({
                    id: empId,
                    name: empStats.name,
                    totalSales: empStats.sales,
                    target: empTarget,
                    achievement: empAchievement,
                    commissionRate: finalRate,
                    commissionAmount: empStats.sales * (finalRate / 100)
                });
            });

            results.push({
                storeName: stats.name,
                achievement: storeAchievement,
                commissionRate: storeRate, // 2, 1, or 0.5
                employees: storeEmployees.sort((a, b) => b.totalSales - a.totalSales)
            });
        });

        return results.sort((a, b) => b.achievement - a.achievement);

    }, [rawMgmt, rawEmp, dateRange]);
}
