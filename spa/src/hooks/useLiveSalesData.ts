import { useState, useEffect, useCallback } from 'react';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';

function toYMD(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getEffectiveDate() {
    const now = new Date();
    if (now.getHours() < 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - 1);
        return d;
    }
    return now;
}

function isAdminOrAuditor(role?: string) {
    return role === 'Admin' || role === 'Auditor';
}

export function useLiveSalesData() {
    const [raw, setRaw] = useState<any>(null);
    const [empRaw, setEmpRaw] = useState<any>(null);
    const [lastUpdate, setLastUpdate] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const user = getCurrentUser();
    const todayStr = toYMD(getEffectiveDate());

    // Manager filter state for global usage (defaults to 'all', or user name if not admin)
    // Inside the modal, this state is controlled. 
    // We can expose a default manager here?
    // Actually, MainLayout might want to own the manager filter state if it had UI for it.
    // But since the UI is inside the modal (or passed to it), we let the consumer handle the filter state if needed.
    // The HOOK returns the RAW data + processed data based on arguments?
    // Or just raw data + helper function?
    // Let's stick to returning raw data and a calculated object based on *internal* or *passed* filters.
    // To keep it simple for MainLayout, let's expose raw data and a function to calculate specific view.
    // BUT the DashboardPage logic was complex. Let's copy the calculation logic here and expose `getLiveData(manager, branch, city)`?
    // Or just return `raw` and `empRaw` and let a `useMemo` in the consumer do it?
    // DashboardPage had a BIG `useMemo` for `liveData`.
    // Let's include that `useMemo` here, but parameterized.

    const loadData = useCallback(() => {
        setRefreshing(true);
        Promise.all([loadManagementData(), loadEmployeesData()])
            .then(([m, e]) => {
                setRaw(m);
                setEmpRaw(e);
                setLastUpdate(new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                setError(null);
            })
            .catch((e) => setError(e?.message || String(e)))
            .finally(() => setRefreshing(false));
    }, []);

    useEffect(() => {
        loadData();
        // Optional: Auto-refresh interval? user asked for "pulsing", maybe implied live?
        // Let's stick to manual refresh or initial load for now.
        const interval = setInterval(loadData, 5 * 60 * 1000); // 5 min refresh
        return () => clearInterval(interval);
    }, [loadData]);


    // Calculation Logic
    const calculateLiveData = useCallback((manager: string = 'all', branch: string = 'all', city: string = 'all') => {
        if (!raw || !empRaw) return { liveData: { totals: { sales: 0, trans: 0, target: 0 }, stores: [] }, managersList: [] };

        const meta = raw.store_meta || {};
        const storesMap = raw.stores || {};
        const historyData: Record<string, any[]> = empRaw.history || {};
        const names: Record<string, string> = empRaw.employee_names || {};
        const empTargets: Record<string, number> = empRaw.targets || {};

        // Determine Allowed Stores Code from DashboardPage logic
        // We need to replicate the `allowedStoreIds` logic (lines 390-427 of DashboardPage)
        // Simplified version:
        const effectiveManager = isAdminOrAuditor(user?.role) ? manager : (user?.name || manager);

        // 1. Filter Check
        const allowedStoreIds = new Set<string>();
        Object.keys(meta).forEach((sid) => {
            const m = meta[sid];
            if (branch !== 'all' && sid !== branch) return;
            if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return;
            if (city !== 'all' && String(m?.city || '') !== city) return;
            allowedStoreIds.add(sid);
        });
        // Fallback if no specific filter but we have access to some? 
        // If Admin and all selected -> add all.
        if (allowedStoreIds.size === 0 && branch === 'all' && effectiveManager === 'all' && city === 'all') {
            Object.keys(storesMap).forEach((sid) => allowedStoreIds.add(sid));
        }

        // 2. Managers List (for UI)
        const managersList = Array.from(new Set(Object.values(meta).map((m: any) => String(m?.manager)))).sort() as string[];


        const byStore: Record<string, {
            sales: number;
            trans: number;
            visitors: number;
            target: number;
            monthSales: number;
            monthTarget: number;
            dailyReq: number;
            remainingDays: number;
            achievement: number;
            employees: Record<string, { sales: number; trans: number; name: string; achievement: number; dailyTarget: number }>
        }> = {};

        const now = new Date();
        const currentMonthKey = todayStr.substring(0, 7);
        const startOfMonthStr = `${currentMonthKey}-01`;
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const remainingDays = daysInMonth - now.getDate() + 1;

        // Pre-calculate MTD sales for employees
        const empMTDSales: Record<string, number> = {};
        Object.values(historyData).forEach((records) => {
            (records || []).forEach((rec: any) => {
                const dt = rec?.[0];
                if (dt < startOfMonthStr || dt > todayStr) return;
                const rawId = rec?.[1];
                const sales = Number(rec?.[2]) || 0;
                let id = String(rawId || '').trim().split('-')[0].trim();
                if (!id || id === 'مرتجع') return;
                empMTDSales[id] = (empMTDSales[id] || 0) + sales;
            });
        });

        const ensureStore = (sid: string) => {
            if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, target: 0, monthSales: 0, monthTarget: 0, dailyReq: 0, remainingDays, achievement: 0, employees: {} };
        };

        // Daily & Month Totals from Management Data
        (raw.sales || []).forEach(([d, sid, v]: any[]) => {
            const dateStr = String(d).substring(0, 10);
            if (dateStr >= startOfMonthStr && dateStr <= todayStr) {
                ensureStore(sid);
                byStore[sid].monthSales += v || 0;
                if (dateStr === todayStr) byStore[sid].sales += v || 0;
            }
        });

        (raw.targets || []).forEach(([d, sid, v]: any[]) => {
            const dateStr = String(d).substring(0, 10);
            if (dateStr.startsWith(currentMonthKey)) {
                ensureStore(sid);
                byStore[sid].monthTarget += v || 0;
            }
        });

        (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
            if (String(d).startsWith(todayStr)) {
                ensureStore(sid);
                byStore[sid].trans += v || 0;
            }
        });
        (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
            if (String(d).startsWith(todayStr)) {
                ensureStore(sid);
                byStore[sid].visitors += v || 0;
            }
        });

        // Store Calculations
        Object.values(byStore).forEach(s => {
            const monthSalesUntilYesterday = s.monthSales - s.sales; // Approx
            const remainingForMonth = Math.max(0, s.monthTarget - monthSalesUntilYesterday);
            s.dailyReq = remainingDays > 0 ? remainingForMonth / remainingDays : 0;

            s.achievement = s.dailyReq > 0 ? (s.sales / s.dailyReq) * 100 : 0;
        });

        // Employee Data for Today
        Object.entries(historyData).forEach(([storeCode, records]) => {
            ensureStore(storeCode);
            for (const rec of records || []) {
                const date = rec?.[0];
                if (!String(date).startsWith(todayStr)) continue;
                const rawId = rec?.[1];
                const sales = Number(rec?.[2]) || 0;
                const trans = Number(rec?.[3]) || 0;
                let id = String(rawId || '').trim().split('-')[0].trim();
                if (!id || id === 'مرتجع') continue;

                const name = names[id] || names[id.padStart(4, '0')] || id;
                const eTarget = empTargets[id] || empTargets[id.padStart(4, '0')] || 0;
                const eMTDSales = empMTDSales[id] || 0;
                // Remaining Daily Logic
                const eDailyTarget = (eTarget > eMTDSales && remainingDays > 0) ? (eTarget - eMTDSales) / remainingDays : 0;
                // const eAchievement = eDailyTarget > 0 ? (sales / eDailyTarget) * 100 : 0; // Achievement against Today's requirement?
                // Dashboard used: eTarget > 0 ? (eMTDSales / eTarget) * 100 : 0; -> This is MONTHLY achievement.
                // But the modal shows a progress bar... let's check LiveSalesModal again.
                // The modal uses `emp.achievement` for the progress bar.
                // Dashboard logic: `const eAchievement = eTarget > 0 ? (eMTDSales / eTarget) * 100 : 0;` (Month Ach)
                // Wait, LiveSalesModal line 293: `Math.round(emp.achievement)%`.
                // If it's daily view, maybe we want Daily Achievement?
                // Dashboard code had: `achievement: e.dailyTarget > 0 ? (e.sales / e.dailyTarget) * 100 : 0` inside the map.
                // Line 808 of DashboardPage.tsx.
                // Let's use THAT one.
                const effectiveDailyTarget = eDailyTarget > 0 ? eDailyTarget : (eTarget / daysInMonth);
                const eAchievement = effectiveDailyTarget > 0 ? (sales / effectiveDailyTarget) * 100 : 0;

                if (!byStore[storeCode].employees[id]) byStore[storeCode].employees[id] = { sales: 0, trans: 0, name, achievement: 0, dailyTarget: effectiveDailyTarget };
                byStore[storeCode].employees[id].sales += sales;
                byStore[storeCode].employees[id].trans += trans;
                byStore[storeCode].employees[id].achievement = eAchievement; // Update with latest sales
            }
        });

        // Filter and Map to Array
        const storeList = Object.entries(byStore)
            .filter(([sid]) => {
                if (!allowedStoreIds.has(sid)) return false;
                return (byStore[sid].sales > 0 || byStore[sid].trans > 0);
            })
            .map(([sid, v]) => ({
                sid,
                name: storesMap[sid] || sid,
                sales: v.sales,
                trans: v.trans,
                visitors: v.visitors,
                target: v.target,
                monthSales: v.monthSales,
                monthTarget: v.monthTarget,
                dailyReq: v.dailyReq,
                remainingDays: v.remainingDays,
                achievement: v.achievement,
                employees: Object.entries(v.employees)
                    .map(([id, e]) => ({
                        id,
                        name: e.name,
                        sales: e.sales,
                        trans: e.trans,
                        avgInv: e.trans > 0 ? e.sales / e.trans : 0,
                        dailyTarget: e.dailyTarget,
                        achievement: e.achievement
                    }))
                    .sort((a, b) => b.sales - a.sales),
            }))
            .sort((a, b) => b.sales - a.sales);

        const totalSales = storeList.reduce((s, st) => s + st.sales, 0);
        const totalTrans = storeList.reduce((s, st) => s + st.trans, 0);
        const totalTarget = storeList.reduce((s, st) => s + st.target, 0);

        return {
            liveData: { totals: { sales: totalSales, trans: totalTrans, target: totalTarget }, stores: storeList },
            managersList
        };

    }, [raw, empRaw, user?.role, user?.name, todayStr]);

    return {
        raw,
        empRaw,
        loading: !raw && refreshing,
        refreshing,
        error,
        refresh: loadData,
        lastUpdate,
        calculateLiveData,
        isAdminOrAuditor: isAdminOrAuditor(user?.role),
    };
}
