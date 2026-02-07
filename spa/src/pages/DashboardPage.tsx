import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadManagementData, loadEmployeesData, loadProductAnalysisData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { KPICard, RankCard, GrowthTrajectoryChart, BarChart, ChartCard } from '../components/DashboardComponents';
import { ChartPieIcon, CurrencyDollarIcon, ReceiptTaxIcon, UsersIcon, FireIcon, TagIcon, PauseIcon, OfficeBuildingIcon, XIcon, PrinterIcon, ExclamationIcon, CheckBadgeIcon, UserGroupIcon } from '../components/Icons';
import { generateDailyReportPDF, generateStoreReportWithDaily, generateEmployeeReportByStore } from '../services/pdf/pdfService';

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

function getDefaultRange(mode: Mode, selYear?: number, selMonth?: number) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  if (mode === 'today') return { start: toYMD(today), end: toYMD(today) };
  if (mode === 'yesterday') return { start: toYMD(yesterday), end: toYMD(yesterday) };
  if (mode === 'mtd') return { start: toYMD(startOfCurrentMonth), end: toYMD(yesterday) };
  if (mode === 'month' && selYear != null && selMonth != null) {
    if (selMonth === 0) {
      return { start: `${selYear}-01-01`, end: `${selYear}-12-31` };
    }
    const start = new Date(selYear, selMonth - 1, 1);
    let end = new Date(selYear, selMonth, 0);
    if (end > today) end = new Date(today);
    return { start: toYMD(start), end: toYMD(end) };
  }
  return { start: toYMD(startOfCurrentMonth), end: toYMD(today) };
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
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [dailyReportModalOpen, setDailyReportModalOpen] = useState(false);
  const [chartMode, setChartMode] = useState<'SALES' | 'VISITORS' | 'TARGET'>('SALES');
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [topSellingMetric, setTopSellingMetric] = useState<'qty' | 'val'>('qty');
  // Report modals state
  const [storeReportModalOpen, setStoreReportModalOpen] = useState(false);
  const [employeeReportModalOpen, setEmployeeReportModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [includeAllPages, setIncludeAllPages] = useState(true);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [empFilterBranch, setEmpFilterBranch] = useState<string>('all');
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
    const currentYear = new Date(yesterdayStr).getFullYear();
    const prevYear = currentYear - 1;

    // Get all dates from start of month to yesterday
    const dates: string[] = [];
    const startDate = new Date(startOfMonth);
    const endDate = new Date(yesterdayStr);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().substring(0, 10));
    }

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
        const prevYearDate = `${prevYear}-${dt.substring(5)}`;
        byStorePrev[sid][prevYearDate] = { sales: 0, trans: 0, visitors: 0 };
      });
    });

    // Fill in the data
    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!storeIds.includes(sid)) return;
      if (byStore[sid]?.[dateStr]) byStore[sid][dateStr].sales += v || 0;
      const prevYearDate = `${prevYear}-${dateStr.substring(5)}`;
      if (dateStr.startsWith(String(prevYear)) && byStorePrev[sid]?.[dateStr]) {
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
      if (dateStr.startsWith(String(prevYear)) && byStorePrev[sid]?.[dateStr]) {
        byStorePrev[sid][dateStr].visitors += v || 0;
      }
    });

    // Build global daily data
    const globalData = dates.map(dt => {
      const prevYearDate = `${prevYear}-${dt.substring(5)}`;
      let sales = 0, salesPrev = 0, trans = 0, visitors = 0, visitorsPrev = 0;
      storeIds.forEach(sid => {
        sales += byStore[sid]?.[dt]?.sales || 0;
        trans += byStore[sid]?.[dt]?.trans || 0;
        visitors += byStore[sid]?.[dt]?.visitors || 0;
        salesPrev += byStorePrev[sid]?.[prevYearDate]?.sales || 0;
        visitorsPrev += byStorePrev[sid]?.[prevYearDate]?.visitors || 0;
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
        const prevYearDate = `${prevYear}-${dt.substring(5)}`;
        const d = byStore[sid]?.[dt] || { sales: 0, trans: 0, visitors: 0 };
        const dPrev = byStorePrev[sid]?.[prevYearDate] || { sales: 0, trans: 0, visitors: 0 };
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

    // Group employees by store
    const byStore: Record<string, Record<string, any>> = {};

    Object.entries(historyData).forEach(([storeId, records]) => {
      if (!allowedStoreIds.has(storeId)) return;
      if (!byStore[storeId]) byStore[storeId] = {};

      for (const rec of records || []) {
        const date = rec?.[0];
        const dateStr = norm(date);
        const sales = Number(rec?.[2]) || 0;
        const trans = Number(rec?.[3]) || 0;

        if (dateStr < startOfMonth || dateStr > yesterdayStr) continue;

        const rawId = rec?.[1];
        let id = String(rawId || '').trim();
        let empName = id;
        if (id.includes('-')) {
          const [a, b] = id.split('-');
          id = (a || '').trim();
          empName = (b || id).trim();
        }
        if (!id || empName === 'مرتجع') continue;
        empName = names[id] || names[id.padStart(4, '0')] || empName;

        if (!byStore[storeId][id]) {
          byStore[storeId][id] = {
            name: empName,
            ySales: 0, yTrans: 0,
            mSales: 0, mTrans: 0,
            target: targets[id] ?? targets[id.padStart(4, '0')] ?? 0
          };
        }

        if (dateStr === yesterdayStr) {
          byStore[storeId][id].ySales += sales;
          byStore[storeId][id].yTrans += trans;
        }
        if (dateStr >= startOfMonth && dateStr <= yesterdayStr) {
          byStore[storeId][id].mSales += sales;
          byStore[storeId][id].mTrans += trans;
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
      if (m?.city) citiesSet.add(String(m.city));
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

  // نفس الفترة من السنة الماضية للمقارنة
  const prevYearRange = useMemo(() => {
    const [y, m, d] = range.start.split('-').map(Number);
    const [ye, me, de] = range.end.split('-').map(Number);
    return {
      start: `${y - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      end: `${ye - 1}-${String(me).padStart(2, '0')}-${String(de).padStart(2, '0')}`,
    };
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
  const prevRange = useMemo(() => {
    const [y, m] = range.start.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    start.setMonth(start.getMonth() - 1);
    const end = new Date(y, m - 1, 0);
    return { start: toYMD(start), end: toYMD(end) };
  }, [range.start]);
  const inPrevRange = useMemo(
    () => (d: string) => {
      const x = String(d).substring(0, 10);
      return x >= prevRange.start && x <= prevRange.end;
    },
    [prevRange.start, prevRange.end],
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
  const ach = totals.target > 0 ? (totals.sales / totals.target) * 100 : 0;
  // Live data (today only)
  const todayStr = toYMD(new Date());
  // Daily Report data (yesterday vs last year)
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
    setEmpFilterBranch('all');
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

  const liveData = useMemo(() => {
    if (!raw || !empRaw) return { totals: { sales: 0, trans: 0 }, stores: [] };
    const meta = raw.store_meta || {};
    const storesMap = raw.stores || {};
    const historyData: Record<string, any[]> = empRaw.history || {};
    const names: Record<string, string> = empRaw.employee_names || {};
    const byStore: Record<string, { sales: number; trans: number; visitors: number; employees: Record<string, { sales: number; trans: number; name: string }> }> = {};

    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(todayStr)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, employees: {} };
        byStore[sid].sales += v || 0;
      }
    });
    (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(todayStr)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, employees: {} };
        byStore[sid].trans += v || 0;
      }
    });
    (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(todayStr)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, employees: {} };
        byStore[sid].visitors += v || 0;
      }
    });

    Object.entries(historyData).forEach(([storeCode, records]) => {
      if (!byStore[storeCode]) byStore[storeCode] = { sales: 0, trans: 0, visitors: 0, employees: {} };
      for (const rec of records || []) {
        const date = rec?.[0];
        if (!String(date).startsWith(todayStr)) continue;
        const rawId = rec?.[1];
        const sales = Number(rec?.[2]) || 0;
        const trans = Number(rec?.[3]) || 0;
        let id = String(rawId || '').trim();
        let name = id;
        if (id.includes('-')) {
          const [a, b] = id.split('-');
          id = (a || '').trim();
          name = (b || id).trim();
        }
        if (!id || name === 'مرتجع') continue;
        name = names[id] || names[id.padStart(4, '0')] || name;
        if (!byStore[storeCode].employees[id]) byStore[storeCode].employees[id] = { sales: 0, trans: 0, name };
        byStore[storeCode].employees[id].sales += sales;
        byStore[storeCode].employees[id].trans += trans;
      }
    });

    const storeList = Object.entries(byStore)
      .filter(([sid]) => {
        // تصفية حسب المعارض المسموح بها
        if (!allowedStoreIds.has(sid)) return false;
        const m = meta[sid];
        if (effectiveManager !== 'all' && (!m || String(m.manager) !== effectiveManager)) return false;
        return (byStore[sid].sales > 0 || byStore[sid].trans > 0);
      })
      .map(([sid, v]) => ({
        sid,
        name: storesMap[sid] || sid,
        sales: v.sales,
        trans: v.trans,
        visitors: v.visitors,
        employees: Object.entries(v.employees)
          .map(([id, e]) => ({
            id,
            name: e.name,
            sales: e.sales,
            trans: e.trans,
            avgInv: e.trans > 0 ? e.sales / e.trans : 0,
          }))
          .sort((a, b) => b.sales - a.sales),
      }))
      .sort((a, b) => b.sales - a.sales);

    const totalSales = storeList.reduce((s, st) => s + st.sales, 0);
    const totalTrans = storeList.reduce((s, st) => s + st.trans, 0);

    return { totals: { sales: totalSales, trans: totalTrans }, stores: storeList };
  }, [raw, empRaw, todayStr, effectiveManager, allowedStoreIds]);

  const lastYearYesterday = new Date(yesterday);
  lastYearYesterday.setFullYear(lastYearYesterday.getFullYear() - 1);
  const lastYearYesterdayStr = toYMD(lastYearYesterday);

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

  // Monthly chart data
  const monthlyChartData = useMemo(() => {
    if (!raw) return [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = selYear || new Date().getFullYear();
    const data: { name: string; Sales?: number; Target?: number; Current?: number; Previous?: number; CurrentVisitors?: number; PreviousVisitors?: number }[] = [];

    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(currentYear, m, 1);
      const monthEnd = new Date(currentYear, m + 1, 0);
      const monthStartStr = toYMD(monthStart);
      const monthEndStr = toYMD(monthEnd > new Date() ? new Date() : monthEnd);

      const prevYearStart = new Date(currentYear - 1, m, 1);
      const prevYearEnd = new Date(currentYear - 1, m + 1, 0);
      const prevYearStartStr = toYMD(prevYearStart);
      const prevYearEndStr = toYMD(prevYearEnd);

      let sales = 0, target = 0, prevSales = 0, visitors = 0, prevVisitors = 0;

      (raw.sales || []).forEach(([d, sid, v]: any[]) => {
        const dateStr = String(d).substring(0, 10);
        if (!allowedStoreIds.has(sid)) return;
        if (dateStr >= monthStartStr && dateStr <= monthEndStr) sales += v || 0;
        if (dateStr >= prevYearStartStr && dateStr <= prevYearEndStr) prevSales += v || 0;
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
        if (dateStr >= prevYearStartStr && dateStr <= prevYearEndStr) prevVisitors += v || 0;
      });

      const entry: any = { name: months[m] };
      if (chartMode === 'TARGET') {
        entry.Current = sales;
        entry.Previous = target;
      } else if (chartMode === 'SALES') {
        entry.Current = sales;
        entry.Previous = prevSales;
      } else {
        entry.Current = visitors;
        entry.Previous = prevVisitors;
      }
      data.push(entry);
    }

    return data;
  }, [raw, allowedStoreIds, chartMode, selYear]);


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
  const TOP_SELLING_PER_PAGE = 10;





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
              onClick={() => setLiveModalOpen(true)}
              className={`py-2 px-4 text-sm font-semibold rounded-xl transition-all ${liveModalOpen
                ? 'bg-orange-500 text-white shadow-md'
                : 'bg-white text-orange-600 border border-orange-300 hover:bg-orange-50'
                }`}
            >
              مبيعات اليوم
            </button>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 sm:gap-3">
        <KPICard
          title="المبيعات"
          value={totals.sales}
          format={formatSAR}
          comparisonValue={prevYearTotals.sales}
          comparisonLabel="السنة الماضية"
          icon={<CurrencyDollarIcon />}
          trendData={monthlyChartData.map(d => d.Sales)}
        />
        <KPICard
          title="الفواتير"
          value={totals.trans}
          comparisonValue={prevYearTotals.trans}
          comparisonLabel="السنة الماضية"
          icon={<ReceiptTaxIcon />}
          trendData={monthlyChartData.map(d => d.Sales)}
        />
        <KPICard
          title="الزوار"
          value={totals.visitors}
          comparisonValue={prevYearTotals.visitors}
          comparisonLabel="السنة الماضية"
          icon={<UsersIcon />}
          trendData={monthlyChartData.map(d => d.Visitors)}
        />
        <KPICard
          title="قيمة العميل"
          value={totals.visitors > 0 ? totals.sales / totals.visitors : 0}
          format={formatSAR}
          comparisonValue={prevYearTotals.visitors > 0 ? prevYearTotals.sales / prevYearTotals.visitors : 0}
          comparisonLabel="السنة الماضية"
          icon={<UserGroupIcon />}
        />
        {/* Custom Target Card */}
        {/* Custom Target Card */}
        <div className="modern-kpi-card group p-2 sm:p-3 flex flex-col w-full h-full relative overflow-hidden text-center sm:text-right">
          <div className="kpi-card-background" />

          <div className="relative z-10 flex-1 flex flex-col justify-between">
            {/* Header */}
            <div className="flex justify-center sm:justify-end mb-2">
              <h3 className="kpi-title text-xs sm:text-sm truncate">تحقيق الهدف (Target)</h3>
            </div>

            {/* Content: Donut & Big Value */}
            <div className="flex items-center justify-between px-1 flex-1">
              {/* Donut Chart (Left) */}
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                  <path
                    className="text-gray-100/50"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <path
                    className={totals.target > 0 && (totals.sales / totals.target) >= 1 ? "text-green-500" : "text-orange-500"}
                    strokeDasharray={`${Math.min((totals.sales / (totals.target || 1)) * 100, 100)}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {/* Big Percentage (Right) */}
              <div className="flex flex-col items-end justify-center">
                <div className="text-2xl sm:text-3xl font-bold text-neutral-900 leading-tight">
                  {totals.target > 0 ? (totals.sales / totals.target * 100).toFixed(1) : '0.0'}%
                </div>
              </div>
            </div>

            {/* Footer: Target Value */}
            <div className="mt-2 text-center sm:text-right border-t border-neutral-100/50 pt-2">
              <span className="text-[10px] text-neutral-500">Target: </span>
              <span className="text-xs font-semibold text-neutral-700 dir-ltr inline-block">{formatSAR(totals.target)}</span>
            </div>
          </div>

          {/* Bottom Green Bar Decoration matching image */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-600 rounded-b-xl z-20" />
        </div>
      </div>




      {/* Early Warning Widget (Advanced Analysis) */}

      <GrowthTrajectoryChart
        data={monthlyChartData as any}
        mode={chartMode}
        onModeChange={setChartMode}
        format={chartMode === 'VISITORS' ? undefined : (v) => v.toLocaleString()}
      />

      {/* بطاقات الوصول السريع */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => setDailyReportModalOpen(true)}
          className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card text-right w-full"
        >
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><FireIcon /></div>
          <div>
            <div className="font-bold text-neutral-900">التقرير اليومي</div>
            <div className="text-xs text-neutral-500">تقرير الأمس</div>
          </div>
        </button>
        <Link to="/offers" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><TagIcon /></div>
          <div>
            <div className="font-bold text-neutral-900">تحليل العروض</div>
            <div className="text-xs text-neutral-500">عروض ومبيعات</div>
          </div>
        </Link>
        <Link to="/employees" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><UserGroupIcon /></div>
          <div>
            <div className="font-bold text-neutral-900">الموظفين</div>
            <div className="text-xs text-neutral-500">تحليل الأداء</div>
          </div>
        </Link>
        <Link to="/stores" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><OfficeBuildingIcon /></div>
          <div>
            <div className="font-bold text-neutral-900">المعارض</div>
            <div className="text-xs text-neutral-500">تفاصيل الفروع</div>
          </div>
        </Link>
      </div>

      {/* أعلى الموظفين / أعلى الفروع — هوية برتقالي وأسود */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankCard
          title="أعلى الموظفين (Top Employees)"
          metrics={[
            { key: 'avg_inv', label: 'معدل فاتورة' },
            { key: 'sales', label: 'بيع' },
            { key: 'achievement', label: 'تحقيق' },
          ]}
          data={topEmployeesRank}
          format={(v, k) => (k === 'achievement' ? `${Number(v).toFixed(1)}%` : k === 'sales' ? formatSAR(v) : Number(v).toLocaleString())}
          maxItems={10}
        />
        <RankCard
          title="أعلى الفروع (Top Stores)"
          metrics={[
            { key: 'avg_inv', label: 'معدل فاتورة' },
            { key: 'visitors', label: 'زوار' },
            { key: 'growth', label: 'نمو' },
            { key: 'achievement', label: 'تحقيق' },
            { key: 'sales', label: 'بيع' },
          ]}
          data={topStoresRank}
          format={(v, k) => {
            if (k === 'achievement' || k === 'growth') return `${Number(v).toFixed(1)}%`;
            if (k === 'sales') return formatSAR(v);
            return Number(v).toLocaleString();
          }}
          maxItems={10}
        />
      </div>

      {/* نافذة مبيعات اليوم */}
      {
        liveModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4" onClick={() => setLiveModalOpen(false)}>
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">🛒 مبيعات اليوم — لايف</h2>
                    <p className="text-orange-100 text-sm mt-1">
                      📅 {toYMD(new Date())} • 🕒 {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors"
                    onClick={() => setLiveModalOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                {/* Manager Filter */}
                {isAdminOrAuditor(user?.role) && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm text-orange-100">مدير المنطقة:</span>
                    <select
                      className="bg-white/20 border border-white/30 text-white rounded-lg py-1 px-3 text-sm"
                      value={manager}
                      onChange={(e) => setManager(e.target.value)}
                    >
                      <option value="all" className="text-black">الكل</option>
                      {managers.map((m) => (
                        <option key={m} value={m} className="text-black">{m}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* KPIs Summary */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 border-b">
                <div className="bg-white rounded-xl p-4 border shadow-sm">
                  <div className="text-sm text-gray-500">إجمالي المبيعات</div>
                  <div className="text-2xl font-bold text-orange-600" dir="ltr">{formatSAR(liveData.totals.sales)}</div>
                </div>
                <div className="bg-white rounded-xl p-4 border shadow-sm">
                  <div className="text-sm text-gray-500">عدد الفواتير</div>
                  <div className="text-2xl font-bold text-blue-600">{liveData.totals.trans}</div>
                  <div className="text-xs text-gray-400">متوسط: {formatSAR(liveData.totals.trans > 0 ? liveData.totals.sales / liveData.totals.trans : 0)}</div>
                </div>
              </div>

              {/* Store List */}
              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-sm font-bold text-gray-700 mb-3">المعارض ({liveData.stores.length})</h3>

                {liveData.stores.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-2">📊</div>
                    <div>لا توجد بيانات مبيعات لهذا اليوم</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {liveData.stores.map((store, idx) => {
                      const isExpanded = expandedStoreId === store.sid;
                      const storeName = store.name || raw?.stores?.[store.sid] || store.sid;
                      return (
                        <div key={store.sid} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                          {/* Store Row */}
                          <div
                            className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-orange-50 transition-colors border-b border-gray-100"
                            onClick={() => setExpandedStoreId(isExpanded ? null : store.sid)}
                          >
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-500 text-white rounded-lg flex items-center justify-center font-bold text-sm sm:text-base flex-shrink-0">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-bold text-gray-900 text-base sm:text-lg truncate">{storeName}</div>
                                <div className="font-bold text-orange-600 text-base sm:text-xl flex-shrink-0" dir="ltr">{formatSAR(store.sales)}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
                                <span className="flex items-center gap-1">
                                  <span>👥</span>
                                  <span className="font-medium">{store.employees?.length || 0} موظفين</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <span>🧾</span>
                                  <span className="font-medium">{store.trans || 0} فاتورة</span>
                                </span>
                                {store.trans > 0 && (
                                  <span className="flex items-center gap-1 text-orange-600">
                                    <span className="font-semibold">معدل:</span>
                                    <span className="font-bold" dir="ltr">{formatSAR(store.sales / store.trans)}</span>
                                  </span>
                                )}
                                {store.visitors > 0 && (
                                  <>
                                    <span className="flex items-center gap-1 text-blue-600">
                                      <span>👣</span>
                                      <span className="font-medium">{store.visitors.toLocaleString()} زائر</span>
                                    </span>
                                    <span className="flex items-center gap-1 text-green-600">
                                      <span className="font-semibold">تحويل:</span>
                                      <span className="font-bold" dir="ltr">{((store.trans / store.visitors) * 100).toFixed(1)}%</span>
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className={`text-gray-400 transition-transform text-xl ${isExpanded ? 'rotate-90' : ''} flex-shrink-0`}>▶</div>
                          </div>

                          {/* Employees Dropdown */}
                          {isExpanded && store.employees && store.employees.length > 0 && (
                            <div className="bg-gray-50 p-3 sm:p-4 overflow-x-auto">
                              <table className="w-full text-xs sm:text-sm">
                                <thead>
                                  <tr className="bg-white border-b-2 border-gray-200">
                                    <th className="text-right py-2 px-2 font-bold text-gray-700">#</th>
                                    <th className="text-right py-2 px-2 font-bold text-gray-700">الموظف</th>
                                    <th className="text-left py-2 px-2 font-bold text-gray-700">المبيعات</th>
                                    <th className="text-left py-2 px-2 font-bold text-gray-700">الفواتير</th>
                                    <th className="text-left py-2 px-2 font-bold text-gray-700">معدل</th>
                                    <th className="text-left py-2 px-2 font-bold text-gray-700">%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {store.employees.sort((a, b) => b.sales - a.sales).map((emp, empIdx) => {
                                    const avgInv = emp.avgInv || (emp.trans > 0 ? emp.sales / emp.trans : 0);
                                    return (
                                      <tr key={emp.id} className={`border-b border-gray-100 hover:bg-white transition-colors ${empIdx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                                        <td className="py-2 px-2 text-gray-500 font-medium text-center">{empIdx + 1}</td>
                                        <td className="py-2 px-2 font-semibold text-gray-900">{emp.name || emp.id}</td>
                                        <td className="py-2 px-2 font-bold text-orange-600" dir="ltr">{formatSAR(emp.sales)}</td>
                                        <td className="py-2 px-2 text-gray-700 font-medium">{emp.trans}</td>
                                        <td className="py-2 px-2 font-bold text-blue-600" dir="ltr">{formatSAR(avgInv)}</td>
                                        <td className="py-2 px-2">
                                          <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-md text-xs font-bold">
                                            {store.sales > 0 ? ((emp.sales / store.sales) * 100).toFixed(0) : 0}%
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div >
            </div >
          </div >
        )
      }

      {/* نافذة التقرير اليومي */}
      {
        dailyReportModalOpen && (
          <div className="modal-center-screen" onClick={() => setDailyReportModalOpen(false)}>
            <div className="modal-content max-w-6xl my-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-base font-bold text-blue-600 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-2xl sm:text-base">📄</span>
                    <div className="flex flex-col">
                      <span>التقرير اليومي</span>
                      <span className="text-xs sm:text-sm text-gray-500 font-normal mt-1">
                        تقرير الأمس ({yesterdayStr}) مقارنة بـ ({lastYearYesterdayStr})
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary py-1.5 px-3 text-sm flex items-center gap-2"
                    onClick={handlePrintDailyReport}
                  >
                    <PrinterIcon className="w-4 h-4" /> طباعة التقرير
                  </button>
                  <button
                    type="button"
                    className="bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 py-1.5 px-3 rounded-lg text-sm flex items-center gap-2 transition-colors font-medium shadow-sm"
                    onClick={handlePrintEmployeeReport}
                  >
                    <UsersIcon className="w-4 h-4 text-orange-500" /> تقرير الموظفين
                  </button>
                  <button
                    type="button"
                    className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-2"
                    onClick={() => setDailyReportModalOpen(false)}
                  >
                    <XIcon /> إغلاق
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-orange-500 text-white">
                      <th className="text-right py-3 px-4 font-semibold">#</th>
                      <th className="text-right py-3 px-4 font-semibold">الفرع</th>
                      <th className="text-right py-3 px-4 font-semibold">مبيعات الأمس</th>
                      <th className="text-right py-3 px-4 font-semibold">العام الماضي</th>
                      <th className="text-right py-3 px-4 font-semibold">النمو %</th>
                      <th className="text-right py-3 px-4 font-semibold">اليومية المتبقية</th>
                      <th className="text-right py-3 px-4 font-semibold">عدد الفواتير</th>
                      <th className="text-right py-3 px-4 font-semibold">متوسط الفاتورة</th>
                      <th className="text-right py-3 px-4 font-semibold">زوار</th>
                      <th className="text-right py-3 px-4 font-semibold">زوار (LY)</th>
                      <th className="text-right py-3 px-4 font-semibold">تحويل %</th>
                      <th className="text-right py-3 px-4 font-semibold">قيمة العميل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyReportData.map((row: any, idx) => (
                      <tr key={row.sid} className={`border-b border-neutral-100 hover:bg-neutral-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}>
                        <td className="py-3 px-4 text-neutral-500">{idx + 1}</td>
                        <td className="py-3 px-4 font-medium text-blue-600">{row.name}</td>
                        <td className="py-3 px-4" dir="ltr">{formatSAR(row.sales)}</td>
                        <td className="py-3 px-4" dir="ltr">{formatSAR(row.prevSales)}</td>
                        <td className={`py-3 px-4 font-semibold ${row.growth >= 0 ? 'text-green-600' : 'text-red-500'}`} dir="ltr">
                          {row.growth >= 0 ? '+' : ''}{row.growth.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-red-500 font-semibold" dir="ltr">{formatSAR(row.dailyReq)}</td>
                        <td className="py-3 px-4" dir="ltr">{row.trans.toLocaleString()}</td>
                        <td className="py-3 px-4" dir="ltr">{Math.round(row.avgInv).toLocaleString()}</td>
                        <td className="py-3 px-4" dir="ltr">{row.visitors.toLocaleString()}</td>
                        <td className="py-3 px-4" dir="ltr">{row.prevVisitors.toLocaleString()}</td>
                        <td className="py-3 px-4" dir="ltr">{row.conversion.toFixed(1)}%</td>
                        <td className="py-3 px-4 font-bold" dir="ltr">{Math.round(row.customerValue).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      }

      {/* Top Selling & Category Performance */}
      {
        prodDerived && (
          <div className="grid grid-cols-1 gap-6 mt-6">
            {/* Top Selling Products (Individual) - Full Width now */}
            <ChartCard title="أكثر المنتجات مبيعاً (Top Selling Products)">
              <div className="flex items-center justify-end mb-3 gap-2">
                <div className="text-sm font-semibold text-neutral-500">الترتيب حسب:</div>
                <div className="flex bg-neutral-100 rounded-lg p-1">
                  <button
                    onClick={() => setTopSellingMetric('qty')}
                    className={`px-3 py-1 rounded-md text-sm font-bold transition-all ${topSellingMetric === 'qty' ? 'bg-white text-orange-600 shadow' : 'text-neutral-500 hover:text-neutral-700'}`}
                  >
                    📦 الكمية
                  </button>
                  <button
                    onClick={() => setTopSellingMetric('val')}
                    className={`px-3 py-1 rounded-md text-sm font-bold transition-all ${topSellingMetric === 'val' ? 'bg-white text-green-600 shadow' : 'text-neutral-500 hover:text-neutral-700'}`}
                  >
                    💰 القيمة
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-orange-50/50">
                      <th className="th w-[60px] text-center">#</th>
                      <th className="th">المنتج</th>
                      <th className="th text-center">الكمية</th>
                      <th className="th text-center">سعر الوحدة</th>
                      <th className="th text-center">القيمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const list = prodDerived.catalogRows;
                      const totalPages = Math.ceil(list.length / TOP_SELLING_PER_PAGE);
                      const safePage = Math.min(topSellingPage, totalPages);
                      const start = (safePage - 1) * TOP_SELLING_PER_PAGE;
                      const visible = list.slice(start, start + TOP_SELLING_PER_PAGE);

                      return visible.map((p: any, idx: number) => {
                        const unitPrice = p.qty > 0 ? p.amount / p.qty : 0;
                        return (
                          <tr key={p.id} className="hover:bg-orange-50 border-b border-neutral-100 last:border-0">
                            <td className="td text-center text-neutral-500 font-mono">{start + idx + 1}</td>
                            <td className="td">
                              <div className="font-bold text-neutral-800">{p.name}</div>
                              <div className="text-xs text-neutral-400 font-mono">{p.id}</div>
                            </td>
                            <td className={`td text-center font-semibold ${topSellingMetric === 'qty' ? 'text-orange-700 bg-orange-50/50' : 'text-neutral-600'}`}>
                              {Math.round(p.qty).toLocaleString()}
                            </td>
                            <td className="td text-center text-neutral-600 font-mono">
                              {formatSAR(unitPrice)}
                            </td>
                            <td className={`td text-center font-semibold ${topSellingMetric === 'val' ? 'text-green-700 bg-green-50/50' : 'text-neutral-600'}`} dir="ltr">
                              {formatSAR(p.amount)}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {prodDerived.catalogRows.length > TOP_SELLING_PER_PAGE && (() => {
                const totalPages = Math.ceil(prodDerived.catalogRows.length / TOP_SELLING_PER_PAGE);
                const safePage = Math.min(topSellingPage, totalPages);
                return (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 mt-2">
                    <div className="text-xs text-neutral-500">صفحة {safePage} من {totalPages}</div>
                    <div className="flex gap-2">
                      <button disabled={safePage <= 1} onClick={() => setTopSellingPage(safePage - 1)} className="px-2 py-1 border rounded disabled:opacity-50 text-xs">السابق</button>
                      <button disabled={safePage >= totalPages} onClick={() => setTopSellingPage(safePage + 1)} className="px-2 py-1 border rounded disabled:opacity-50 text-xs">التالي</button>
                    </div>
                  </div>
                );
              })()}
            </ChartCard>
          </div>
        )
      }

      {/* نافذة اختيار الفرع للتقرير */}
      {
        storeReportModalOpen && (
          <div className="modal-center-screen" onClick={() => setStoreReportModalOpen(false)}>
            <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">تصدير التقرير PDF</h3>
                <button onClick={() => setStoreReportModalOpen(false)} className="text-neutral-500 hover:text-neutral-700">
                  <XIcon />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">اختر الفرع:</label>
                  <select
                    className="input w-full"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    <option value="all">الكل (ملخص عام)</option>
                    {Array.from(allowedStoreIds).map(sid => (
                      <option key={sid} value={sid}>{raw?.stores?.[sid] || sid}</option>
                    ))}
                  </select>
                </div>

                {selectedBranch === 'all' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeAllPages"
                      checked={includeAllPages}
                      onChange={(e) => setIncludeAllPages(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label htmlFor="includeAllPages" className="text-sm text-neutral-600">
                      إنشاء صفحة تفصيلية لكل فرع (عند اختيار الكل)
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setStoreReportModalOpen(false)}
                  className="btn-secondary py-2 px-4"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleGenerateStoreReport}
                  className="btn-primary py-2 px-4"
                >
                  تصدير
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* نافذة تقرير الموظفين */}
      {
        employeeReportModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4" onClick={() => setEmployeeReportModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📄</span>
                    <div>
                      <h2 className="text-lg font-bold">اختيار الموظفين (PDF)</h2>
                      <p className="text-green-100 text-sm">اختر الموظفين للتقرير وازل المستقيلين</p>
                    </div>
                  </div>
                  <button onClick={() => setEmployeeReportModalOpen(false)} className="bg-white/20 hover:bg-white/30 p-2 rounded-lg">✕</button>
                </div>
              </div>

              {/* Filters */}
              <div className="p-3 sm:p-4 bg-gray-50 border-b">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={empFilterStatus.has('active')}
                        onChange={(e) => {
                          const newSet = new Set(empFilterStatus);
                          e.target.checked ? newSet.add('active') : newSet.delete('active');
                          setEmpFilterStatus(newSet);
                        }}
                        className="w-4 h-4 text-green-600 rounded"
                      />
                      <span className="text-green-600 font-medium">✓ موظف نشط</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={empFilterStatus.has('review')}
                        onChange={(e) => {
                          const newSet = new Set(empFilterStatus);
                          e.target.checked ? newSet.add('review') : newSet.delete('review');
                          setEmpFilterStatus(newSet);
                        }}
                        className="w-4 h-4 text-orange-600 rounded"
                      />
                      <span className="text-orange-600 font-medium">□ مراجعة (معيار واحد)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={empFilterStatus.has('resigned')}
                        onChange={(e) => {
                          const newSet = new Set(empFilterStatus);
                          e.target.checked ? newSet.add('resigned') : newSet.delete('resigned');
                          setEmpFilterStatus(newSet);
                        }}
                        className="w-4 h-4 text-red-600 rounded"
                      />
                      <span className="text-red-600 font-medium">□ مستقيل (معياران)</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    المحددين: <strong>{selectedEmployees.size}</strong> من <strong>{employeeListForSelection.length}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={() => setSelectedEmployees(new Set(employeeListForSelection.map(e => e.id)))}
                    className="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 transition-colors"
                  >
                    ✓ تحديد الكل
                  </button>
                  <button
                    onClick={() => setSelectedEmployees(new Set())}
                    className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    ✗ إلغاء الكل
                  </button>
                  <button
                    onClick={() => {
                      const activeEmps = employeeListForSelection.filter(e => e.sales > 0).map(e => e.id);
                      setSelectedEmployees(new Set(activeEmps));
                    }}
                    className="text-sm bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    👤 النشطين فقط
                  </button>
                </div>
              </div>

              {/* Employee List */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-3 text-right w-10">
                        <input
                          type="checkbox"
                          checked={selectedEmployees.size === employeeListForSelection.length && employeeListForSelection.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEmployees(new Set(employeeListForSelection.map(emp => emp.id)));
                            } else {
                              setSelectedEmployees(new Set());
                            }
                          }}
                          className="w-4 h-4"
                        />
                      </th>
                      <th className="p-3 text-right font-semibold text-gray-700">الموظف</th>
                      <th className="p-3 text-right font-semibold text-gray-700">الفرع</th>
                      <th className="p-3 text-left font-semibold text-gray-700">المبيعات</th>
                      <th className="p-3 text-center font-semibold text-gray-700">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeListForSelection.map((emp, idx) => (
                      <tr key={emp.id} className={`border-b hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedEmployees.has(emp.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedEmployees);
                              e.target.checked ? newSet.add(emp.id) : newSet.delete(emp.id);
                              setSelectedEmployees(newSet);
                            }}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-gray-800">{emp.name}</div>
                          <div className="text-xs text-gray-400">{emp.id}</div>
                        </td>
                        <td className="p-3 text-gray-600 text-xs">{emp.storeName}</td>
                        <td className="p-3 font-bold text-gray-800" dir="ltr">{Math.round(emp.sales).toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">نشط</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {employeeListForSelection.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-2">👥</div>
                    <div>لا توجد بيانات موظفين للفترة المحددة</div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 sm:p-4 border-t flex justify-end gap-3 bg-gray-50">
                <div className="text-sm text-gray-500">
                  الفترة: من {yesterdayStr.substring(0, 8)}01 إلى {yesterdayStr}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEmployeeReportModalOpen(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleGenerateEmployeeReport}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                    disabled={selectedEmployees.size === 0}
                  >
                    📄 إنشاء التقرير
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

    </div >
  );
}

