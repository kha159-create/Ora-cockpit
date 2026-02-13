import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadManagementData, loadEmployeesData, loadProductAnalysisData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { KPIGrid } from '../components/dashboard/KPIGrid';
import { SalesChart } from '../components/dashboard/SalesChart';
import { QuickAccess } from '../components/dashboard/QuickAccess';
import { RankWidgets } from '../components/dashboard/RankWidgets';
import { TopSellingWidget } from '../components/dashboard/TopSellingWidget';
import { DailyReportModal } from '../components/dashboard/DailyReportModal';
import { StoreReportModal } from '../components/dashboard/StoreReportModal';
import { EmployeeReportModal } from '../components/dashboard/EmployeeReportModal';

import { generateStoreReportWithDaily, generateEmployeeReportByStore } from '../services/pdf/pdfService';
import { getPrevYearRange, getPrevYearDate } from '../utils/seasons';

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

type Mode = 'today' | 'yesterday' | 'mtd' | 'month' | 'custom';

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getEffectiveDate() {
  const now = new Date();
  // If before 1 AM, we effectively treat it as the previous day for "Today's" metrics
  if (now.getHours() < 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - 1);
    return d;
  }
  return now;
}

function getDefaultRange(mode: Mode, selYear?: number, selMonth?: number) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (mode === 'today') return { start: toYMD(now), end: toYMD(now) };
  if (mode === 'yesterday') return { start: toYMD(yesterday), end: toYMD(yesterday) };
  if (mode === 'mtd') return { start: toYMD(startOfCurrentMonth), end: toYMD(yesterday) };
  if (mode === 'month' && selYear != null && selMonth != null) {
    if (selMonth === 0) {
      return { start: `${selYear}-01-01`, end: `${selYear}-12-31` };
    }
    const start = new Date(selYear, selMonth - 1, 1);
    let end = new Date(selYear, selMonth, 0);
    if (end > now) end = new Date(now);
    return { start: toYMD(start), end: toYMD(end) };
  }
  return { start: toYMD(startOfCurrentMonth), end: toYMD(now) };
}

const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export default function DashboardPage() {
  const [raw, setRaw] = useState<any>(null);
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [prodRaw, setProdRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<Mode>('mtd');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [selYear, setSelYear] = useState<number>(() => new Date().getFullYear());
  const [selMonth, setSelMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [dailyReportModalOpen, setDailyReportModalOpen] = useState(false);
  const [chartMode, setChartMode] = useState<'SALES' | 'VISITORS' | 'TARGET'>('SALES');
  const [topSellingMetric, setTopSellingMetric] = useState<'qty' | 'val'>('qty');
  // Report modals state
  const [storeReportModalOpen, setStoreReportModalOpen] = useState(false);
  const [employeeReportModalOpen, setEmployeeReportModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [includeAllPages, setIncludeAllPages] = useState(true);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [empFilterStatus, setEmpFilterStatus] = useState<Set<string>>(new Set(['active']));
  const user = getCurrentUser();
  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const formatSAR = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });

  const loadData = useCallback(() => {
    setRefreshing(true);
    Promise.all([loadManagementData(), loadEmployeesData(), loadProductAnalysisData()])
      .then(([m, e, p]) => {
        setRaw(m);
        setEmpRaw(e);
        setProdRaw(p);
        setLastUpdate(new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setErr(null);
      })
      .catch((e) => setErr(e?.message || String(e)))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (mode === 'custom') {
      if (!customStart || !customEnd) {
        const r = getDefaultRange('mtd');
        setCustomStart(customStart || r.start);
        setCustomEnd(customEnd || r.end);
      }
    } else if (mode !== 'month') {
      const r = getDefaultRange(mode);
      setCustomStart(r.start);
      setCustomEnd(r.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const range = useMemo(() => {
    if (mode === 'custom') return { start: customStart, end: customEnd };
    return getDefaultRange(mode, selYear, selMonth);
  }, [mode, customStart, customEnd, selYear, selMonth]);

  const handlePrintDailyReport = () => {
    // Open store report modal
    setSelectedBranch('all');
    setIncludeAllPages(true);
    setStoreReportModalOpen(true);
  };

  const handleGenerateStoreReport = async () => {
    if (!raw?.sales || !raw?.stores) return;

    const startOfMonth = `${yesterdayStr.substring(0, 8)}01`;
    const dateRange = { start: startOfMonth, end: yesterdayStr };
    const meta = raw.store_meta || {};
    const storesMap = raw.stores || {};

    // Get all dates from start of month to yesterday
    const dates: string[] = [];
    const startDate = new Date(startOfMonth);
    const endDate = new Date(yesterdayStr);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().substring(0, 10));
    }

    // Build seasonal prev-year date mapping
    const prevDateMap: Record<string, string> = {};
    const prevDatesSet = new Set<string>();
    dates.forEach(dt => {
      const prevDt = getPrevYearDate(dt);
      prevDateMap[dt] = prevDt;
      prevDatesSet.add(prevDt);
    });

    // Build daily data for all stores
    const byStore: Record<string, Record<string, { sales: number; trans: number; visitors: number }>> = {};
    const byStorePrev: Record<string, Record<string, { sales: number; trans: number; visitors: number }>> = {};

    // Initialize all stores and dates
    const storeIds = selectedBranch === 'all'
      ? Object.keys(storesMap).filter(sid => allowedStoreIds.has(sid))
      : [selectedBranch];

    storeIds.forEach(sid => {
      byStore[sid] = {};
      byStorePrev[sid] = {};
      dates.forEach(dt => {
        byStore[sid][dt] = { sales: 0, trans: 0, visitors: 0 };
        byStorePrev[sid][prevDateMap[dt]] = { sales: 0, trans: 0, visitors: 0 };
      });
    });

    // Fill in the data
    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!storeIds.includes(sid)) return;
      if (byStore[sid]?.[dateStr]) byStore[sid][dateStr].sales += v || 0;
      if (prevDatesSet.has(dateStr) && byStorePrev[sid]?.[dateStr]) {
        byStorePrev[sid][dateStr].sales += v || 0;
      }
    });

    (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!storeIds.includes(sid)) return;
      if (byStore[sid]?.[dateStr]) byStore[sid][dateStr].trans += v || 0;
    });

    (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!storeIds.includes(sid)) return;
      if (byStore[sid]?.[dateStr]) byStore[sid][dateStr].visitors += v || 0;
      if (prevDatesSet.has(dateStr) && byStorePrev[sid]?.[dateStr]) {
        byStorePrev[sid][dateStr].visitors += v || 0;
      }
    });

    // Build global daily data
    const globalData = dates.map(dt => {
      const prevDt = prevDateMap[dt];
      let sales = 0, salesPrev = 0, trans = 0, visitors = 0, visitorsPrev = 0;
      storeIds.forEach(sid => {
        sales += byStore[sid]?.[dt]?.sales || 0;
        trans += byStore[sid]?.[dt]?.trans || 0;
        visitors += byStore[sid]?.[dt]?.visitors || 0;
        salesPrev += byStorePrev[sid]?.[prevDt]?.sales || 0;
        visitorsPrev += byStorePrev[sid]?.[prevDt]?.visitors || 0;
      });
      const growth = salesPrev > 0 ? ((sales - salesPrev) / salesPrev * 100) : 0;
      const avgInv = trans > 0 ? sales / trans : 0;
      const customerValue = visitors > 0 ? sales / visitors : 0;
      const conversion = visitors > 0 ? (trans / visitors * 100) : 0;
      return { date: dt, sales, salesPrev, growth, trans, avgInv, customerValue, visitors, visitorsPrev, conversion };
    });

    // Build store data
    const storesData = includeAllPages ? storeIds.map(sid => {
      const storeName = storesMap[sid] || sid;
      const storeMeta = meta[sid] || {};
      const storeTarget = (raw.targets || []).filter(([d, s]: any[]) => s === sid && String(d).substring(0, 7) === startOfMonth.substring(0, 7)).reduce((acc: number, [, , v]: any[]) => acc + (v || 0), 0);

      const dailyData = dates.map(dt => {
        const prevDt = prevDateMap[dt];
        const d = byStore[sid]?.[dt] || { sales: 0, trans: 0, visitors: 0 };
        const dPrev = byStorePrev[sid]?.[prevDt] || { sales: 0, trans: 0, visitors: 0 };
        const growth = dPrev.sales > 0 ? ((d.sales - dPrev.sales) / dPrev.sales * 100) : 0;
        const avgInv = d.trans > 0 ? d.sales / d.trans : 0;
        const customerValue = d.visitors > 0 ? d.sales / d.visitors : 0;
        const conversion = d.visitors > 0 ? (d.trans / d.visitors * 100) : 0;
        return {
          date: dt,
          sales: d.sales,
          salesPrev: dPrev.sales,
          growth,
          trans: d.trans,
          avgInv,
          customerValue,
          visitors: d.visitors,
          visitorsPrev: dPrev.visitors,
          conversion
        };
      });

      return {
        id: sid,
        name: storeName,
        manager: storeMeta.manager,
        target: storeTarget,
        dailyData
      };
    }) : [];

    await generateStoreReportWithDaily(globalData, storesData, dateRange, storeIds.length);
    setStoreReportModalOpen(false);
  };

  const handleGenerateEmployeeReport = async () => {
    if (!empRaw?.history || !empRaw?.employee_names || !raw?.stores) return;

    const historyData: Record<string, any[]> = empRaw.history;
    const names: Record<string, string> = empRaw.employee_names;
    const targets: Record<string, number> = empRaw.targets || {};
    const storesMap = raw.stores || {};
    const norm = (s: unknown) => String(s || '').substring(0, 10);
    const startOfMonth = `${yesterdayStr.substring(0, 8)}01`;

    // Group employees by their PRIMARY store (the one where they last made a sale in the current period)
    const empPrimaryStore: Record<string, string> = {};
    const empLatestDate: Record<string, string> = {};

    Object.entries(historyData).forEach(([storeId, records]) => {
      if (!allowedStoreIds.has(storeId)) return;
      for (const rec of records || []) {
        const dateStr = norm(rec?.[0]);
        if (dateStr < startOfMonth || dateStr > yesterdayStr) continue;
        const rawId = rec?.[1];
        let id = String(rawId || '').split('-')[0].trim();
        if (!id || id === 'مرتجع') continue;
        const sales = Number(rec?.[2]) || 0;
        if (sales > 0 && (!empLatestDate[id] || dateStr > empLatestDate[id])) {
          empLatestDate[id] = dateStr;
          empPrimaryStore[id] = storeId;
        }
      }
    });

    // Grouping by primary store
    const byStore: Record<string, Record<string, any>> = {};

    Object.entries(historyData).forEach(([storeId, records]) => {
      if (!allowedStoreIds.has(storeId)) return;

      for (const rec of records || []) {
        const dateStr = norm(rec?.[0]);
        if (dateStr < startOfMonth || dateStr > yesterdayStr) continue;

        const rawId = rec?.[1];
        let id = String(rawId || '').split('-')[0].trim();
        if (!id || id === 'مرتجع') continue;

        // selection check
        if (selectedEmployees.size > 0 && !selectedEmployees.has(id)) continue;

        const empName = names[id] || names[id.padStart(4, '0')] || id;
        const target = targets[id] ?? targets[id.padStart(4, '0')] ?? 0;
        const sales = Number(rec?.[2]) || 0;
        const trans = Number(rec?.[3]) || 0;

        // Determine destination store (Primary)
        const destinationStoreId = empPrimaryStore[id] || storeId;
        if (!byStore[destinationStoreId]) byStore[destinationStoreId] = {};
        if (!byStore[destinationStoreId][id]) {
          byStore[destinationStoreId][id] = {
            name: empName,
            ySales: 0, yTrans: 0,
            mSales: 0, mTrans: 0,
            target: target
          };
        }

        if (dateStr === yesterdayStr) {
          byStore[destinationStoreId][id].ySales += sales;
          byStore[destinationStoreId][id].yTrans += trans;
        }
        if (dateStr >= startOfMonth && dateStr <= yesterdayStr) {
          byStore[destinationStoreId][id].mSales += sales;
          byStore[destinationStoreId][id].mTrans += trans;
        }
      }
    });

    // Build store employee data for PDF
    const storesData = Object.entries(byStore)
      .filter(([, emps]) => Object.keys(emps).length > 0)
      .map(([storeId, emps]) => {
        const storeTotalYSales = Object.values(emps).reduce((s: number, e: any) => s + (e.ySales || 0), 0);
        const storeTotalMSales = Object.values(emps).reduce((s: number, e: any) => s + (e.mSales || 0), 0);
        const daysInMonth = new Date(yesterday.getFullYear(), yesterday.getMonth() + 1, 0).getDate();
        const remainingDays = Math.max(0, daysInMonth - yesterday.getDate());

        const employees = Object.values(emps).map((e: any) => {
          const remaining = Math.max(0, e.target - e.mSales);
          return {
            name: e.name,
            ySales: e.ySales,
            yShare: storeTotalYSales > 0 ? (e.ySales / storeTotalYSales * 100) : 0,
            yTrans: e.yTrans,
            yAvgInv: e.yTrans > 0 ? e.ySales / e.yTrans : 0,
            mSales: e.mSales,
            mShare: storeTotalMSales > 0 ? (e.mSales / storeTotalMSales * 100) : 0,
            mTrans: e.mTrans,
            mAvgInv: e.mTrans > 0 ? e.mSales / e.mTrans : 0,
            target: e.target,
            achievement: e.target > 0 ? (e.mSales / e.target * 100) : 0,
            remaining,
            dailyReq: remainingDays > 0 ? remaining / remainingDays : 0
          };
        }).sort((a: any, b: any) => b.mSales - a.mSales);

        return {
          storeId,
          storeName: storesMap[storeId] || storeId,
          employees
        };
      })
      .sort((a, b) => {
        const aSales = a.employees.reduce((s, e) => s + e.mSales, 0);
        const bSales = b.employees.reduce((s, e) => s + e.mSales, 0);
        return bSales - aSales;
      });

    await generateEmployeeReportByStore(storesData, { yesterday: yesterdayStr, monthStart: startOfMonth });
    setEmployeeReportModalOpen(false);
  };

  const { allowedStoreIds, managers, branches, cities } = useMemo(() => {
    const meta: Record<string, { manager?: string; city?: string }> = raw?.store_meta || {};
    const stores = raw?.stores || {};
    const managersSet = new Set<string>();
    const citiesSet = new Set<string>();
    Object.values(meta).forEach((m: any) => {
      if (m?.manager) managersSet.add(String(m.manager));

      // Filter cities based on selected manager
      if (effectiveManager === 'all' || String(m?.manager) === effectiveManager) {
        if (m?.city) citiesSet.add(String(m.city));
      }
    });
    const managers = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const cities = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const branches = Object.keys(stores)
      .filter((sid) => {
        const m = meta[sid];
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && String(m?.city || '') !== city) return false;
        return true;
      })
      .sort((a, b) => (stores[a] || a).localeCompare(stores[b] || b, 'ar'));
    const allowed = new Set<string>();
    if (branch === 'all' && effectiveManager === 'all' && city === 'all') {
      Object.keys(stores).forEach((sid) => allowed.add(sid));
    } else {
      Object.keys(meta).forEach((sid) => {
        const m = meta[sid];
        if (branch !== 'all' && sid !== branch) return;
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return;
        if (city !== 'all' && String(m?.city || '') !== city) return;
        allowed.add(sid);
      });
      if (allowed.size === 0) Object.keys(stores).forEach((sid) => allowed.add(sid));
    }
    return { allowedStoreIds: allowed, managers, branches, cities };
  }, [raw, branch, effectiveManager, city]);

  const totals = useMemo(() => {
    if (!raw) return { sales: 0, trans: 0, visitors: 0, target: 0 };
    const inRange = (d: string) => {
      const x = String(d).substring(0, 10);
      return x >= range.start && x <= range.end;
    };
    const allow = (sid: string) => allowedStoreIds.has(sid);
    let sales = 0, trans = 0, visitors = 0, target = 0;
    (raw.sales || []).forEach(([d, s, v]: any[]) => { if (inRange(d) && allow(s)) sales += (v || 0); });
    (raw.transactions || []).forEach(([d, s, v]: any[]) => { if (inRange(d) && allow(s)) trans += (v || 0); });
    (raw.visitors || []).forEach(([d, s, v]: any[]) => { if (inRange(d) && allow(s)) visitors += (v || 0); });
    (raw.targets || []).forEach(([d, s, v]: any[]) => { if (inRange(d) && allow(s)) target += (v || 0); });
    return { sales, trans, visitors, target };
  }, [raw, range.start, range.end, allowedStoreIds]);

  // نفس الفترة من السنة الماضية للمقارنة (مع دعم المواسم الهجرية)
  const prevYearRange = useMemo(() => {
    return getPrevYearRange(range.start, range.end);
  }, [range.start, range.end]);

  const prevYearTotals = useMemo(() => {
    if (!raw) return { sales: 0, trans: 0, visitors: 0, target: 0 };
    const inRange = (d: string) => {
      const x = String(d).substring(0, 10);
      return x >= prevYearRange.start && x <= prevYearRange.end;
    };
    const allow = (sid: string) => allowedStoreIds.has(sid);
    let sales = 0, trans = 0, visitors = 0, target = 0;
    (raw.sales || []).forEach(([d, s, v]: any[]) => { if (inRange(d) && allow(s)) sales += (v || 0); });
    (raw.transactions || []).forEach(([d, s, v]: any[]) => { if (inRange(d) && allow(s)) trans += (v || 0); });
    (raw.visitors || []).forEach(([d, s, v]: any[]) => { if (inRange(d) && allow(s)) visitors += (v || 0); });
    (raw.targets || []).forEach(([d, s, v]: any[]) => { if (inRange(d) && allow(s)) target += (v || 0); });
    return { sales, trans, visitors, target };
  }, [raw, prevYearRange.start, prevYearRange.end, allowedStoreIds]);

  const inRange = useMemo(
    () => (d: string) => {
      const x = String(d).substring(0, 10);
      return x >= range.start && x <= range.end;
    },
    [range.start, range.end],
  );

  // دالة للتحقق من تاريخ ضمن نفس الفترة للسنة السابقة
  const inPrevYearRange = useMemo(
    () => (d: string) => {
      const x = String(d).substring(0, 10);
      return x >= prevYearRange.start && x <= prevYearRange.end;
    },
    [prevYearRange.start, prevYearRange.end],
  );

  const topStoresRank = useMemo(() => {
    if (!raw?.sales || !raw?.stores) return [];
    const allow = (sid: string) => allowedStoreIds.has(sid);
    const byStore: Record<string, { sales: number; trans: number; visitors: number; target: number; prevYearSales: number; prevYearVisitors: number }> = {};
    (raw.sales || []).forEach(([d, s, v]: any[]) => {
      if (!allow(s)) return;
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevYearSales: 0, prevYearVisitors: 0 };
      if (inRange(d)) byStore[s].sales += v || 0;
      // مقارنة بنفس الفترة من السنة السابقة
      if (inPrevYearRange(d)) byStore[s].prevYearSales += v || 0;
    });
    (raw.transactions || []).forEach(([d, s, v]: any[]) => {
      if (!allow(s)) return;
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevYearSales: 0, prevYearVisitors: 0 };
      if (inRange(d)) byStore[s].trans += v || 0;
    });
    (raw.visitors || []).forEach(([d, s, v]: any[]) => {
      if (!allow(s)) return;
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevYearSales: 0, prevYearVisitors: 0 };
      if (inRange(d)) byStore[s].visitors += v || 0;
      // مقارنة زوار نفس الفترة من السنة السابقة
      if (inPrevYearRange(d)) byStore[s].prevYearVisitors += v || 0;
    });
    (raw.targets || []).forEach(([d, s, v]: any[]) => {
      if (!allow(s)) return;
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevYearSales: 0, prevYearVisitors: 0 };
      if (inRange(d)) byStore[s].target += v || 0;
    });
    return Object.entries(byStore).map(([sid, v]) => {
      // النمو: الفترة الحالية مقابل نفس الفترة من السنة السابقة
      const growth = v.prevYearSales > 0 ? ((v.sales - v.prevYearSales) / v.prevYearSales) * 100 : 0;
      const achievement = v.target > 0 ? (v.sales / v.target) * 100 : 0;
      const avgInv = v.trans > 0 ? v.sales / v.trans : 0;
      return {
        name: raw.stores?.[sid] || sid,
        sales: v.sales,
        visitors: v.visitors,
        growth,
        achievement,
        avg_inv: avgInv,
      };
    });
  }, [raw, inRange, inPrevYearRange, allowedStoreIds]);

  const topEmployeesRank = useMemo(() => {
    if (!empRaw?.history || !empRaw?.employee_names) return [];
    const historyData: Record<string, any[]> = empRaw.history;
    const names: Record<string, string> = empRaw.employee_names;
    const targets: Record<string, number> = empRaw.targets || {};
    const storeMeta: Record<string, any> = raw?.store_meta || {};
    const norm = (s: unknown) => String(s || '').substring(0, 10);
    const agg: Record<string, { sales: number; trans: number; target: number; name: string }> = {};
    Object.entries(historyData).forEach(([storeId, records]) => {
      if (!allowedStoreIds.has(storeId)) return;
      // Exclude online stores
      const storeType = String(storeMeta[storeId]?.type || '').toLowerCase();
      if (storeType === 'online') return;
      for (const rec of records || []) {
        const date = rec?.[0];
        const rawId = rec?.[1];
        const sales = Number(rec?.[2]) || 0;
        const trans = Number(rec?.[3]) || 0;
        if (!norm(date) || norm(date) < range.start || norm(date) > range.end) continue;
        let id = String(rawId || '').trim();
        let empName = id;
        if (id.includes('-')) {
          const [a, b] = id.split('-');
          id = (a || '').trim();
          empName = (b || id).trim();
        }
        if (!id || empName === 'مرتجع') continue;
        empName = names[id] || names[id.padStart(4, '0')] || empName;
        if (!agg[id]) agg[id] = { sales: 0, trans: 0, target: targets[id] ?? targets[id.padStart(4, '0')] ?? 0, name: empName };
        agg[id].sales += sales;
        agg[id].trans += trans;
      }
    });
    return Object.entries(agg).map(([id, v]) => ({
      name: v.name || names[id] || names[id.padStart(4, '0')] || id,
      sales: v.sales,
      avg_inv: v.trans > 0 ? v.sales / v.trans : 0,
      achievement: v.target > 0 ? (v.sales / v.target) * 100 : 0,
    }));
  }, [empRaw, range.start, range.end, allowedStoreIds, raw?.store_meta]);

  if (err) {
    return <div className="p-6 bg-white rounded-xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  }
  // Move calculations before early returns to satisfy React Hook rules
  // Daily Report data (yesterday vs last year) - Standard
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toYMD(yesterday);

  const handlePrintEmployeeReport = () => {
    // Initialize employee selection with all active employees
    const allEmpIds = new Set<string>();
    const startOfMonth = `${yesterdayStr.substring(0, 8)}01`;
    Object.entries(empRaw?.history || {}).forEach(([sid, recs]: [string, any]) => {
      if (!allowedStoreIds.has(sid)) return;
      (recs || []).forEach((rec: any) => {
        const dt = rec?.[0];
        if (dt >= startOfMonth && dt <= yesterdayStr) {
          const empId = String(rec?.[1] || '').split('-')[0].trim();
          if (empId && empId !== 'مرتجع') allEmpIds.add(empId);
        }
      });
    });
    setSelectedEmployees(allEmpIds);
    setEmpFilterStatus(new Set(['active']));
    setEmployeeReportModalOpen(true);
  };

  // Calculate employee list for selection modal
  const employeeListForSelection = useMemo(() => {
    if (!empRaw?.history || !empRaw?.employee_names || !raw?.stores) return [];
    const startOfMonth = `${yesterdayStr.substring(0, 8)}01`;
    const historyData: Record<string, any[]> = empRaw.history;
    const names: Record<string, string> = empRaw.employee_names;
    const storesMap = raw.stores || {};

    const empData: Record<string, { id: string; name: string; storeId: string; storeName: string; sales: number }> = {};

    Object.entries(historyData).forEach(([sid, recs]: [string, any]) => {
      if (!allowedStoreIds.has(sid)) return;
      (recs || []).forEach((rec: any) => {
        const dt = rec?.[0];
        if (dt < startOfMonth || dt > yesterdayStr) return;
        const rawId = rec?.[1];
        let empId = String(rawId || '').split('-')[0].trim();
        if (!empId || empId === 'مرتجع') return;

        const sales = Number(rec?.[2]) || 0;
        const empName = names[empId] || names[empId.padStart(4, '0')] || rawId;

        if (!empData[empId]) {
          empData[empId] = {
            id: empId,
            name: empName,
            storeId: sid,
            storeName: storesMap[sid] || sid,
            sales: 0
          };
        }
        empData[empId].sales += sales;
      });
    });

    return Object.values(empData).sort((a, b) => b.sales - a.sales);
  }, [empRaw, raw, yesterdayStr, allowedStoreIds]);

  const lastYearYesterdayStr = getPrevYearDate(yesterdayStr);

  const dailyReportData = useMemo(() => {
    if (!raw) return [];
    const meta = raw.store_meta || {};
    const storesMap = raw.stores || {};
    const byStore: Record<string, {
      sales: number; // MTD
      yesterdaySales: number; // Daily
      totalMonthSales: number;
      trans: number;
      visitors: number;
      avgInv: number;
      prevSales: number; // Last Year MTD
      prevYesterdaySales: number; // Last Year Daily
      prevVisitors: number;
      dailyReq: number;
      target: number;
      ach: number
    }> = {};
    const startOfMonth = `${yesterdayStr.substring(0, 8)}01`;
    const startOfLastYearMonth = `${lastYearYesterdayStr.substring(0, 8)}01`;

    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, yesterdaySales: 0, totalMonthSales: 0, trans: 0, visitors: 0, avgInv: 0, prevSales: 0, prevYesterdaySales: 0, prevVisitors: 0, dailyReq: 0, target: 0, ach: 0 };

      if (dateStr === yesterdayStr) {
        byStore[sid].yesterdaySales += v || 0;
      }

      // Sales is now MTD Sales for other calcs if needed, but report wants Yesterday
      if (dateStr >= startOfMonth && dateStr <= yesterdayStr) {
        byStore[sid].sales += v || 0;
        byStore[sid].totalMonthSales += v || 0;
      }

      // Previous Sales Last Year MTD
      if (dateStr >= startOfLastYearMonth && dateStr <= lastYearYesterdayStr) {
        byStore[sid].prevSales += v || 0;
      }

      // Previous Sales Last Year (Single Day)
      if (dateStr === lastYearYesterdayStr) {
        byStore[sid].prevYesterdaySales += v || 0;
      }
    });

    (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, yesterdaySales: 0, totalMonthSales: 0, trans: 0, visitors: 0, avgInv: 0, prevSales: 0, prevYesterdaySales: 0, prevVisitors: 0, dailyReq: 0, target: 0, ach: 0 };
      if (dateStr === yesterdayStr) byStore[sid].trans += v || 0;
    });

    (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, yesterdaySales: 0, totalMonthSales: 0, trans: 0, visitors: 0, avgInv: 0, prevSales: 0, prevYesterdaySales: 0, prevVisitors: 0, dailyReq: 0, target: 0, ach: 0 };
      if (dateStr === yesterdayStr) byStore[sid].visitors += v || 0;
      if (dateStr === lastYearYesterdayStr) byStore[sid].prevVisitors += v || 0;
    });

    (raw.targets || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, yesterdaySales: 0, totalMonthSales: 0, trans: 0, visitors: 0, avgInv: 0, prevSales: 0, prevYesterdaySales: 0, prevVisitors: 0, dailyReq: 0, target: 0, ach: 0 };
      if (dateStr.startsWith(yesterdayStr.substring(0, 7))) {
        const target = v || 0;
        byStore[sid].target += target;
      }
    });

    // Post-aggregation calculation loop
    Object.keys(byStore).forEach(sid => {
      const v = byStore[sid];
      const remaining = Math.max(0, v.target - v.sales); // Remaining is based on MTD sales vs Month Target

      const nowForReq = new Date();
      const lastDayOfMonth = new Date(nowForReq.getFullYear(), nowForReq.getMonth() + 1, 0).getDate();
      let remainingDays = lastDayOfMonth - nowForReq.getDate() + 1;
      if (remainingDays < 1) remainingDays = 1;

      v.dailyReq = remainingDays > 0 ? remaining / remainingDays : 0;
      v.ach = v.target > 0 ? (v.sales / v.target) * 100 : 0; // Achievement is usually MTD vs Target
    });

    return Object.entries(byStore)
      .filter(([sid]) => {
        const m = meta[sid];
        if (effectiveManager !== 'all' && (!m || String(m.manager) !== effectiveManager)) return false;
        return byStore[sid].sales > 0 || byStore[sid].trans > 0 || byStore[sid].yesterdaySales > 0;
      })
      .map(([sid, v]) => {
        // Average Bill: Yesterday Sales / Yesterday Bills
        const avgInv = v.trans > 0 ? v.yesterdaySales / v.trans : 0;

        // Growth: Yesterday vs Last Year Yesterday
        const growth = v.prevYesterdaySales > 0 ? ((v.yesterdaySales - v.prevYesterdaySales) / v.prevYesterdaySales) * 100 : 0;
        const conversion = v.visitors > 0 ? (v.trans / v.visitors) * 100 : 0;

        return {
          sid,
          name: storesMap[sid] || sid,
          sales: v.yesterdaySales, // CHANGED: Now reporting Single Day Sales
          prevSales: v.prevYesterdaySales, // CHANGED: Now reporting Single Day LY Sales
          growth,
          trans: v.trans, // Yesterday
          avgInv: avgInv, // Yesterday
          visitors: v.visitors, // Yesterday
          prevVisitors: v.prevVisitors,
          dailyReq: v.dailyReq, // Valid: based on MTD remaining
          conversion,
          customerValue: v.visitors > 0 ? v.yesterdaySales / v.visitors : 0, // Yesterday
        };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [raw, yesterdayStr, lastYearYesterdayStr, effectiveManager]);

  // Chart data - adapts to selected period and filters
  const isFullYearView = mode === 'month';

  const monthlyChartData = useMemo(() => {
    if (!raw) return [];

    // Full-year view: show 12 monthly bars
    if (isFullYearView) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const currentYear = selYear || new Date().getFullYear();
      const data: any[] = [];

      for (let m = 0; m < 12; m++) {
        const monthStart = new Date(currentYear, m, 1);
        const monthEnd = new Date(currentYear, m + 1, 0);
        const monthStartStr = toYMD(monthStart);
        const monthEndStr = toYMD(monthEnd > new Date() ? new Date() : monthEnd);

        const seasonPrev = getPrevYearRange(monthStartStr, monthEndStr);

        let sales = 0, target = 0, prevSales = 0, visitors = 0, prevVisitors = 0;

        (raw.sales || []).forEach(([d, sid, v]: any[]) => {
          const dateStr = String(d).substring(0, 10);
          if (!allowedStoreIds.has(sid)) return;
          if (dateStr >= monthStartStr && dateStr <= monthEndStr) sales += v || 0;
          if (dateStr >= seasonPrev.start && dateStr <= seasonPrev.end) prevSales += v || 0;
        });

        (raw.targets || []).forEach(([d, sid, v]: any[]) => {
          const dateStr = String(d).substring(0, 10);
          if (!allowedStoreIds.has(sid)) return;
          if (dateStr >= monthStartStr && dateStr <= monthEndStr) target += v || 0;
        });

        (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
          const dateStr = String(d).substring(0, 10);
          if (!allowedStoreIds.has(sid)) return;
          if (dateStr >= monthStartStr && dateStr <= monthEndStr) visitors += v || 0;
          if (dateStr >= seasonPrev.start && dateStr <= seasonPrev.end) prevVisitors += v || 0;
        });

        const entry: any = { name: months[m] };
        if (chartMode === 'TARGET') { entry.Current = sales; entry.Previous = target; }
        else if (chartMode === 'SALES') { entry.Current = sales; entry.Previous = prevSales; }
        else { entry.Current = visitors; entry.Previous = prevVisitors; }
        entry.Sales = sales;
        entry.Visitors = visitors;
        data.push(entry);
      }
      return data;
    }

    // Period view: show daily data for the selected range
    const days: string[] = [];
    let curr = new Date(range.start + 'T00:00:00');
    const end = new Date(range.end + 'T00:00:00');
    while (curr <= end) {
      days.push(toYMD(curr));
      curr.setDate(curr.getDate() + 1);
    }

    // Build prev-date mapping
    const prevMap: Record<string, string> = {};
    const prevDatesSet = new Set<string>();
    days.forEach(dt => {
      const prev = getPrevYearDate(dt);
      prevMap[dt] = prev;
      prevDatesSet.add(prev);
    });

    // Aggregate daily data
    const dailyMap: Record<string, { sales: number; target: number; prevSales: number; visitors: number; prevVisitors: number }> = {};
    days.forEach(dt => { dailyMap[dt] = { sales: 0, target: 0, prevSales: 0, visitors: 0, prevVisitors: 0 }; });

    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!allowedStoreIds.has(sid)) return;
      if (dailyMap[dateStr]) dailyMap[dateStr].sales += v || 0;
      if (prevDatesSet.has(dateStr)) {
        // Find which current day maps to this prev date
        for (const dt of days) {
          if (prevMap[dt] === dateStr) { dailyMap[dt].prevSales += v || 0; break; }
        }
      }
    });

    (raw.targets || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!allowedStoreIds.has(sid)) return;
      if (dailyMap[dateStr]) dailyMap[dateStr].target += v || 0;
    });

    (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!allowedStoreIds.has(sid)) return;
      if (dailyMap[dateStr]) dailyMap[dateStr].visitors += v || 0;
      if (prevDatesSet.has(dateStr)) {
        for (const dt of days) {
          if (prevMap[dt] === dateStr) { dailyMap[dt].prevVisitors += v || 0; break; }
        }
      }
    });

    return days.map(dt => {
      const r = dailyMap[dt];
      const dayLabel = dt.substring(5).replace('-', '/'); // "02/03"
      const entry: any = { name: dayLabel };
      if (chartMode === 'TARGET') { entry.Current = r.sales; entry.Previous = r.target; }
      else if (chartMode === 'SALES') { entry.Current = r.sales; entry.Previous = r.prevSales; }
      else { entry.Current = r.visitors; entry.Previous = r.prevVisitors; }
      entry.Sales = r.sales;
      entry.Visitors = r.visitors;
      return entry;
    });
  }, [raw, allowedStoreIds, chartMode, selYear, isFullYearView, range.start, range.end]);


  const prodDerived = useMemo(() => {
    if (!prodRaw || !raw) return null;

    // We only care about MTD for the dashboard summary usually, 
    // or match the dashboard's selected range if possible. 
    // For now, let's stick to 'mtd' (Month to Date) as per common dashboard behavior,
    // or we could try to match 'mode' if it maps well. 
    // Let's use 'mtd' to ensure consistency with the "Top Selling" widget original context.
    const pData = prodRaw.periods?.['mtd'] || null;
    if (!pData) return null;

    const analysis: Record<string, any> = (pData?.analysis || {}) as any;
    const storeMeta: Record<string, any> = raw.store_meta || {};

    // Filter logic similar to ProductsPage but simplified for Dashboard
    // We aggregate ALL stores that the user has access to.
    let totalQty = 0;
    let totalAmt = 0;
    const catMap = new Map<string, { qty: number; amount: number; top: any }>();

    Object.entries(analysis).forEach(([sid, storeObj]) => {
      // Check accessibility
      if (isAdminOrAuditor(user?.role) || storeMeta[sid]?.manager === user?.name) {
        // Apply Dashboard Filters (Manager/City/Branch)
        const meta = storeMeta[sid] || {};
        if (effectiveManager !== 'all' && meta.manager !== effectiveManager) return;
        if (city !== 'all' && meta.city !== city) return;
        if (branch !== 'all' && String(sid) !== String(branch)) return;

        const categories: any[] = storeObj?.categories || [];
        categories.forEach((c) => {
          const catName = String(c.category || 'Uncategorized');
          const qty = Number(c.qty) || 0;
          const amount = Number(c.amount) || 0;
          totalQty += qty;
          totalAmt += amount;

          const prev = catMap.get(catName) || { qty: 0, amount: 0, top: null };
          prev.qty += qty;
          prev.amount += amount;

          // Simple Top Item Logic (by Qty for now as default)
          const topCandidate = {
            top_item_id: String(c.top_item_id || ''),
            top_item_name: String(c.top_item_name || ''),
            top_item_qty: Number(c.top_item_qty) || 0,
            top_item_amount: Number(c.top_item_amount) || 0,
          };
          const prevTop = prev.top;
          if (!prevTop || topCandidate.top_item_qty > prevTop.top_item_qty) {
            prev.top = topCandidate;
          }
          catMap.set(catName, prev);
        });
      }
    });

    const categoriesAgg = Array.from(catMap.entries()).map(([category, data]) => {
      // Share based on Total Quantity
      const share = totalQty > 0 ? (data.qty / totalQty) * 100 : 0;
      return {
        category,
        qty: data.qty,
        amount: data.amount,
        sharePercent: share,
        topItemId: data.top?.top_item_id || '',
        topItemName: data.top?.top_item_name || '',
      };
    });

    // Sort by Qty descending (default for categories)
    categoriesAgg.sort((a, b) => b.qty - a.qty);

    // ===== Catalog (products list) =====
    const catalog: Record<string, any[]> = (pData?.catalog || {}) as any;
    const catalogRows: any[] = [];

    // We reuse logic to flatten catalog based on scope
    Object.entries(catalog).forEach(([catName, items]) => {
      if (!Array.isArray(items)) return;
      for (const it of items) {
        const id = String(it?.id || '');
        const name = String(it?.name || id);
        const stores = it?.stores || {};

        let qty = 0;
        let amount = 0;
        // Simple scope check: iterate stores and match filters
        for (const [sid, stData] of Object.entries(stores)) {
          // Re-check accessibility and filters like we did for categories
          if (isAdminOrAuditor(user?.role) || storeMeta[sid]?.manager === user?.name) {
            // Check effective manager
            const meta = storeMeta[sid] || {};
            if (effectiveManager !== 'all' && meta.manager !== effectiveManager) continue;
            if (city !== 'all' && meta.city !== city) continue;
            if (branch !== 'all' && String(sid) !== String(branch)) continue;

            qty += Number((stData as any)?.q) || 0;
            amount += Number((stData as any)?.a) || 0;
          }
        }

        if (qty === 0 && amount === 0) continue;
        catalogRows.push({
          id,
          name,
          alias: String(it?.alias || ''),
          category: String(catName),
          qty,
          amount,
        });
      }
    });

    // Sort catalog based on selected metric is better done in UI or here? 
    // Let's return the full list and sort just before slicing for display to allow separate sorts if needed.
    // But for the widget, we want it sorted by the selected metric.
    catalogRows.sort((a, b) => (topSellingMetric === 'qty' ? b.qty - a.qty : b.amount - a.amount));

    return { categoriesAgg, catalogRows };
  }, [prodRaw, raw, user?.role, user?.name, effectiveManager, city, branch, topSellingMetric]);

  // Pagination for Top Selling Widget
  const [topSellingPage, setTopSellingPage] = useState(1);





  if (!raw) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <span className="text-sm text-neutral-500">
            آخر تحديث: {lastUpdate ?? '--:--:--'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={refreshing}
              className="btn-secondary py-2 px-4 text-sm"
            >
              {refreshing ? 'جاري التحديث...' : 'تحديث البيانات'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {isAdminOrAuditor(user?.role) && (
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</div>
              <select className="input" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="all">الكل</option>
                {managers.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفرع</div>
            <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {branches.map((code) => (
                <option key={code} value={code}>{raw?.stores?.[code] || code}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {cities.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفترة</div>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="mtd">الشهر الحالي (MTD)</option>
              <option value="month">شهر محدد</option>
              <option value="custom">فترة مخصصة</option>
            </select>
          </div>
          {mode === 'month' && (
            <>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">الشهر</div>
                <select className="input" value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}>
                  <option value={0}>الكل (سنة كاملة)</option>
                  {monthsAr.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">السنة</div>
                <select className="input" value={selYear} onChange={(e) => setSelYear(Number(e.target.value))}>
                  {[2026, 2025, 2024].map((y) => (<option key={y} value={y}>{y}</option>))}
                </select>
              </div>
            </>
          )}
          {mode === 'custom' && (
            <>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">من</div>
                <input className="input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">إلى</div>
                <input className="input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
          <div className="text-sm font-semibold text-neutral-700 flex items-end">
            {range.start} → {range.end}
          </div>
        </div>
      </div>

      <KPIGrid
        totals={totals}
        prevYearTotals={prevYearTotals}
        monthlyChartData={monthlyChartData as any}
        formatSAR={formatSAR}
      />




      {/* Early Warning Widget (Advanced Analysis) */}

      <SalesChart
        data={monthlyChartData as any}
        mode={chartMode}
        onModeChange={setChartMode}
      />

      {/* بطاقات الوصول السريع */}
      <QuickAccess
        onOpenDailyReport={() => setDailyReportModalOpen(true)}
      />

      {/* أعلى الموظفين / أعلى الفروع — هوية برتقالي وأسود */}
      {/* أعلى الموظفين / أعلى الفروع — هوية برتقالي وأسود */}
      <RankWidgets
        topEmployees={topEmployeesRank}
        topStores={topStoresRank}
        formatSAR={formatSAR}
      />

      {/* نافذة التقرير اليومي */}
      {
        <DailyReportModal
          isOpen={dailyReportModalOpen}
          onClose={() => setDailyReportModalOpen(false)}
          dailyReportData={dailyReportData}
          yesterdayStr={yesterdayStr}
          lastYearYesterdayStr={lastYearYesterdayStr}
          formatSAR={formatSAR}
          onPrintDailyReport={handlePrintDailyReport}
          onPrintEmployeeReport={handlePrintEmployeeReport}
        />
      }

      {/* Top Selling & Category Performance */}
      {
        prodDerived && (
          <div className="grid grid-cols-1 gap-6 mt-6">
            {/* Top Selling Products (Individual) - Full Width now */}
            <TopSellingWidget
              catalogRows={prodDerived.catalogRows}
              metric={topSellingMetric}
              onMetricChange={setTopSellingMetric}
              page={topSellingPage}
              onPageChange={setTopSellingPage}
              formatSAR={formatSAR}
            />
          </div>
        )
      }

      {/* نافذة اختيار الفرع للتقرير */}
      {
        <StoreReportModal
          isOpen={storeReportModalOpen}
          onClose={() => setStoreReportModalOpen(false)}
          selectedBranch={selectedBranch}
          setSelectedBranch={setSelectedBranch}
          allowedStoreIds={allowedStoreIds}
          storesMap={raw?.stores}
          includeAllPages={includeAllPages}
          setIncludeAllPages={setIncludeAllPages}
          onGenerate={handleGenerateStoreReport}
        />
      }

      {/* نافذة تقرير الموظفين */}
      {
        <EmployeeReportModal
          isOpen={employeeReportModalOpen}
          onClose={() => setEmployeeReportModalOpen(false)}
          empFilterStatus={empFilterStatus}
          setEmpFilterStatus={setEmpFilterStatus}
          selectedEmployees={selectedEmployees}
          setSelectedEmployees={setSelectedEmployees}
          employeeList={employeeListForSelection}
          yesterdayStr={yesterdayStr}
          onGenerate={handleGenerateEmployeeReport}
        />
      }

    </div >
  );
}

