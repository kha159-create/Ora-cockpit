import { useMemo } from 'react';
import { CommissionData, EmployeeCommission } from '../types';

// Commission Rules based on Store Achievement
export const getStoreCommissionRate = (achievement: number): number => {
    if (achievement >= 100) return 2; // 2%
    if (achievement >= 90) return 1; // 1%
    if (achievement >= 80) return 0.5; // 0.5%
    return 0;
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
        const names = rawEmp.employee_names || {};

        // ===== 1. Calculate Store Stats (sales + target) =====
        const storeStats: Record<string, { sales: number; target: number; name: string }> = {};

        (rawMgmt.sales || []).forEach(([d, sid, amt]: any[]) => {
            const dateStr = String(d).substring(0, 10);
            if (dateStr >= start && dateStr <= end) {
                if (!storeStats[sid]) storeStats[sid] = { sales: 0, target: 0, name: storesMap[sid] || sid };
                storeStats[sid].sales += (amt || 0);
            }
        });

        (rawMgmt.targets || []).forEach(([d, sid, amt]: any[]) => {
            const dateStr = String(d).substring(0, 10);
            if (dateStr >= start && dateStr <= end) {
                if (!storeStats[sid]) storeStats[sid] = { sales: 0, target: 0, name: storesMap[sid] || sid };
                storeStats[sid].target += (amt || 0);
            }
        });

        // ===== 2. Aggregate employee data across ALL stores =====
        // Track per-employee: total sales, and per-store sales + latest date for primary store detection
        const empAgg: Record<string, {
            totalSales: number;
            storeStats: Record<string, number>;    // storeId -> sales in that store
            latestDates: Record<string, string>;   // storeId -> latest date
            firstStore: string;                     // first store seen
            name: string;
        }> = {};

        Object.entries(rawEmp.history as Record<string, any[]>).forEach(([storeId, records]) => {
            (records || []).forEach(rec => {
                const date = String(rec[0]).substring(0, 10);
                if (date < start || date > end) return;

                const rawId = rec[1];
                let empId = String(rawId || '').trim();
                let empName = empId;

                if (empId.includes('-')) {
                    const [a, b] = empId.split('-');
                    empId = (a || '').trim();
                    empName = (b || empId).trim();
                }

                if (!empId || empName === 'مرتجع') return;
                empName = names[empId] || names[empId.padStart(4, '0')] || empName;

                const sales = Number(rec[2]) || 0;

                if (!empAgg[empId]) {
                    empAgg[empId] = {
                        totalSales: 0,
                        storeStats: {},
                        latestDates: {},
                        firstStore: storeId,
                        name: empName,
                    };
                }

                empAgg[empId].totalSales += sales;

                // Track per-store sales for this employee
                if (!empAgg[empId].storeStats[storeId]) empAgg[empId].storeStats[storeId] = 0;
                empAgg[empId].storeStats[storeId] += sales;

                // Track latest date per store
                if (sales > 0) {
                    if (!empAgg[empId].latestDates[storeId] || date > empAgg[empId].latestDates[storeId]) {
                        empAgg[empId].latestDates[storeId] = date;
                    }
                }
            });
        });

        // ===== 3. Determine primary store (same logic as EmployeesPage) =====
        // Primary store = store where employee had the latest sale date
        const empByPrimaryStore: Record<string, { empId: string; name: string; totalSales: number }[]> = {};

        Object.entries(empAgg).forEach(([empId, data]) => {
            let primaryStore = data.firstStore;
            let latestDate = '';

            for (const [sCode, dStr] of Object.entries(data.latestDates)) {
                if (dStr > latestDate) {
                    latestDate = dStr;
                    primaryStore = sCode;
                }
            }

            if (!empByPrimaryStore[primaryStore]) empByPrimaryStore[primaryStore] = [];
            empByPrimaryStore[primaryStore].push({
                empId,
                name: data.name,
                totalSales: data.totalSales,
            });
        });

        // ===== 4. Resolve employee target for the selected month =====
        const targetsByMonth = rawEmp.targets_by_month || {};
        const monthlyTargets = rawEmp.monthly_targets || {};
        const flatTargets = rawEmp.targets || {};
        const monthKey = start.substring(0, 7); // YYYY-MM
        const monthKeyFull = `${monthKey}-01`;

        const resolveTargetForMonth = (empId: string) => {
            const id = String(empId).trim();
            // id can be '134', '0134', or name. Check unpadded and padded versions.
            const unpadded = String(parseInt(id, 10));
            const padded = id.padStart(4, '0');
            const cands = Array.from(new Set([id, padded, unpadded]));

            // 1. Try targets_by_month[YYYY-MM][empId]
            const tbm = targetsByMonth[monthKey];
            if (tbm) {
                for (const c of cands) {
                    if (tbm[c] != null) return Number(tbm[c]) || 0;
                }
            }

            // 2. Try monthly_targets[empId][YYYY-MM-01]
            for (const c of cands) {
                const mt = monthlyTargets[c];
                if (mt && typeof mt === 'object') {
                    const targetVal = mt[monthKeyFull];
                    if (targetVal != null) return Number(targetVal) || 0;
                }
            }

            // 3. Flat targets from targets object
            for (const c of cands) {
                if (flatTargets[c] != null) return Number(flatTargets[c]) || 0;
            }
            return 0;
        };

        // ===== 5. Assemble results =====
        const results: CommissionData[] = [];

        Object.entries(storeStats).forEach(([storeId, stats]) => {
            const storeAchievement = stats.target > 0 ? (stats.sales / stats.target) * 100 : 0;
            const storeRate = getStoreCommissionRate(storeAchievement);

            const storeEmployees: EmployeeCommission[] = [];
            const emps = empByPrimaryStore[storeId] || [];

            emps.forEach(({ empId, name, totalSales }) => {
                const empTarget = resolveTargetForMonth(empId);
                const empAchievement = empTarget > 0 ? (totalSales / empTarget) * 100 : 0;

                // If the employee has a target, multiply storeRate by their achievement %
                // If they have NO target (0), they just get the store's base rate directly.
                const finalRate = empTarget > 0 ? (empAchievement / 100) * storeRate : storeRate;

                storeEmployees.push({
                    id: empId,
                    name,
                    totalSales,
                    target: empTarget,
                    achievement: empAchievement,
                    commissionRate: finalRate,
                    commissionAmount: totalSales * (finalRate / 100),
                });
            });

            if (storeEmployees.length > 0 || stats.sales > 0) {
                results.push({
                    storeName: stats.name,
                    achievement: storeAchievement,
                    commissionRate: storeRate,
                    employees: storeEmployees.sort((a, b) => b.totalSales - a.totalSales),
                });
            }
        });

        return results.sort((a, b) => b.achievement - a.achievement);

    }, [rawMgmt, rawEmp, dateRange]);
}
