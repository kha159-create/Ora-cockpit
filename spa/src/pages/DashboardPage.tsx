import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { KPICard, RankCard, LineChart, ChartCard } from '../components/DashboardComponents';
import { ChartPieIcon, CurrencyDollarIcon, ReceiptTaxIcon, UsersIcon, FireIcon, TagIcon, PauseIcon, OfficeBuildingIcon, XIcon } from '../components/Icons';

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
    const start = new Date(selYear, selMonth - 1, 1);
    let end = new Date(selYear, selMonth, 0);
    if (end > yesterday) end = new Date(yesterday);
    return { start: toYMD(start), end: toYMD(end) };
  }
  return { start: toYMD(startOfCurrentMonth), end: toYMD(yesterday) };
}

const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export default function DashboardPage() {
  const [raw, setRaw] = useState<any>(null);
  const [empRaw, setEmpRaw] = useState<any>(null);
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
  const [liveManager, setLiveManager] = useState<string>('all');
  const [dailyReportModalOpen, setDailyReportModalOpen] = useState(false);
  const [printData, setPrintData] = useState<{ type: 'stores' | 'employees'; title: string; rows: any[]; range: string } | null>(null);
  const [chartMode, setChartMode] = useState<'target' | 'growth' | 'visitors'>('target');
  const user = getCurrentUser();
  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const formatSAR = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });

  const loadData = useCallback(() => {
    setRefreshing(true);
    Promise.all([loadManagementData(), loadEmployeesData()])
      .then(([m, e]) => {
        setRaw(m);
        setEmpRaw(e);
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

  const topStoresRank = useMemo(() => {
    if (!raw?.sales || !raw?.stores) return [];
    const allow = (sid: string) => allowedStoreIds.has(sid);
    const byStore: Record<string, { sales: number; trans: number; visitors: number; target: number; prevSales: number; prevVisitors: number }> = {};
    (raw.sales || []).forEach(([d, s, v]: any[]) => {
      if (!allow(s)) return;
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevSales: 0, prevVisitors: 0 };
      if (inRange(d)) byStore[s].sales += v || 0;
      if (inPrevRange(d)) byStore[s].prevSales += v || 0;
    });
    (raw.transactions || []).forEach(([d, s, v]: any[]) => {
      if (!allow(s)) return;
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevSales: 0, prevVisitors: 0 };
      if (inRange(d)) byStore[s].trans += v || 0;
    });
    (raw.visitors || []).forEach(([d, s, v]: any[]) => {
      if (!allow(s)) return;
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevSales: 0, prevVisitors: 0 };
      if (inRange(d)) byStore[s].visitors += v || 0;
      if (inPrevRange(d)) byStore[s].prevVisitors += v || 0;
    });
    (raw.targets || []).forEach(([d, s, v]: any[]) => {
      if (!allow(s)) return;
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevSales: 0, prevVisitors: 0 };
      if (inRange(d)) byStore[s].target += v || 0;
    });
    return Object.entries(byStore).map(([sid, v]) => {
      const growth = v.prevSales > 0 ? ((v.sales - v.prevSales) / v.prevSales) * 100 : 0;
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
  }, [raw, inRange, inPrevRange, allowedStoreIds]);

  const topEmployeesRank = useMemo(() => {
    if (!empRaw?.history || !empRaw?.employee_names) return [];
    const historyData: Record<string, any[]> = empRaw.history;
    const names: Record<string, string> = empRaw.employee_names;
    const targets: Record<string, number> = empRaw.targets || {};
    const norm = (s: unknown) => String(s || '').substring(0, 10);
    const agg: Record<string, { sales: number; trans: number; target: number }> = {};
    Object.entries(historyData).forEach(([storeId, records]) => {
      if (!allowedStoreIds.has(storeId)) return;
      for (const rec of records || []) {
        const date = rec?.[0];
        const rawId = rec?.[1];
        const sales = Number(rec?.[2]) || 0;
        const trans = Number(rec?.[3]) || 0;
        if (!norm(date) || norm(date) < range.start || norm(date) > range.end) continue;
        let id = String(rawId || '').trim();
        let name = id;
        if (id.includes('-')) {
          const [a, b] = id.split('-');
          id = (a || '').trim();
          name = (b || id).trim();
        }
        if (!id || name === 'مرتجع') continue;
        name = names[id] || names[id.padStart(4, '0')] || name;
        if (!agg[id]) agg[id] = { sales: 0, trans: 0, target: targets[id] ?? targets[id.padStart(4, '0')] ?? 0 };
        agg[id].sales += sales;
        agg[id].trans += trans;
      }
    });
    return Object.entries(agg).map(([id, v]) => ({
      name: names[id] || names[id.padStart(4, '0')] || id,
      sales: v.sales,
      avg_inv: v.trans > 0 ? v.sales / v.trans : 0,
      achievement: v.target > 0 ? (v.sales / v.target) * 100 : 0,
    }));
  }, [empRaw, range.start, range.end, allowedStoreIds]);

  // Live data (today only)
  const todayStr = useMemo(() => toYMD(new Date()), []);
  const liveData = useMemo(() => {
    if (!raw || !empRaw) return { totals: { sales: 0, trans: 0 }, stores: [] };
    const meta = raw.store_meta || {};
    const storesMap = raw.stores || {};
    const historyData: Record<string, any[]> = empRaw.history || {};
    const names: Record<string, string> = empRaw.employee_names || {};
    const byStore: Record<string, { sales: number; trans: number; employees: Record<string, { sales: number; trans: number; name: string }> }> = {};

    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(todayStr)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, employees: {} };
        byStore[sid].sales += v || 0;
      }
    });
    (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(todayStr)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, employees: {} };
        byStore[sid].trans += v || 0;
      }
    });

    Object.entries(historyData).forEach(([storeCode, records]) => {
      if (!byStore[storeCode]) byStore[storeCode] = { sales: 0, trans: 0, employees: {} };
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
        const m = meta[sid];
        const targetManager = liveManager !== 'all' ? liveManager : effectiveManager;
        if (targetManager !== 'all' && (!m || String(m.manager) !== targetManager)) return false;
        return (byStore[sid].sales > 0 || byStore[sid].trans > 0);
      })
      .map(([sid, v]) => ({
        sid,
        name: storesMap[sid] || sid,
        sales: v.sales,
        trans: v.trans,
        employees: Object.entries(v.employees)
          .map(([id, e]) => ({
            id,
            name: e.name,
            sales: e.sales,
            trans: e.trans,
            avgInv: e.trans > 0 ? e.sales / e.trans : 0,
          }))
          .sort((a, b) => b.sales - a.sales),
        avgInv: v.trans > 0 ? v.sales / v.trans : 0,
      }))
      .sort((a, b) => b.sales - a.sales);

    const totalSales = storeList.reduce((s, st) => s + st.sales, 0);
    const totalTrans = storeList.reduce((s, st) => s + st.trans, 0);

    return { totals: { sales: totalSales, trans: totalTrans }, stores: storeList };
  }, [raw, empRaw, todayStr, effectiveManager, liveManager]);

  // Daily Report data (yesterday vs last year)
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }, []);
  const yesterdayStr = useMemo(() => toYMD(yesterday), [yesterday]);
  const lastYearYesterdayStr = useMemo(() => {
    const d = new Date(yesterday);
    d.setFullYear(d.getFullYear() - 1);
    return toYMD(d);
  }, [yesterday]);

  const dailyReportData = useMemo(() => {
    if (!raw) return [];
    const meta = raw.store_meta || {};
    const storesMap = raw.stores || {};
    const byStore: Record<string, { sales: number; trans: number; visitors: number; avgInv: number; prevSales: number; prevVisitors: number; dailyReq: number; target: number; ach: number }> = {};

    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, avgInv: 0, prevSales: 0, prevVisitors: 0, dailyReq: 0, target: 0, ach: 0 };
      if (dateStr === yesterdayStr) byStore[sid].sales += v || 0;
      if (dateStr === lastYearYesterdayStr) byStore[sid].prevSales += v || 0;
    });
    (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, avgInv: 0, prevSales: 0, prevVisitors: 0, dailyReq: 0, target: 0, ach: 0 };
      if (dateStr === yesterdayStr) byStore[sid].trans += v || 0;
    });
    (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, avgInv: 0, prevSales: 0, prevVisitors: 0, dailyReq: 0, target: 0, ach: 0 };
      if (dateStr === yesterdayStr) byStore[sid].visitors += v || 0;
      if (dateStr === lastYearYesterdayStr) byStore[sid].prevVisitors += v || 0;
    });
    (raw.targets || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).substring(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, avgInv: 0, prevSales: 0, prevVisitors: 0, dailyReq: 0, target: 0, ach: 0 };
      if (dateStr === yesterdayStr) {
        const target = v || 0;
        byStore[sid].target = target;
        const remaining = target - byStore[sid].sales;
        const daysInMonth = new Date(yesterday.getFullYear(), yesterday.getMonth() + 1, 0).getDate();
        const remainingDays = daysInMonth - yesterday.getDate() + 1;
        byStore[sid].dailyReq = remainingDays > 0 ? remaining / remainingDays : 0;
        byStore[sid].ach = target > 0 ? (byStore[sid].sales / target) * 100 : 0;
      }
    });

    return Object.entries(byStore)
      .filter(([sid]) => {
        const m = meta[sid];
        if (effectiveManager !== 'all' && (!m || String(m.manager) !== effectiveManager)) return false;
        return byStore[sid].sales > 0 || byStore[sid].trans > 0;
      })
      .map(([sid, v]) => {
        const avgInv = v.trans > 0 ? v.sales / v.trans : 0;
        const growth = v.prevSales > 0 ? ((v.sales - v.prevSales) / v.prevSales) * 100 : 0;
        const conversion = v.visitors > 0 ? (v.trans / v.visitors) * 100 : 0;
        const customerValue = v.visitors > 0 ? v.sales / v.visitors : 0;
        return {
          sid,
          name: storesMap[sid] || sid,
          sales: v.sales,
          prevSales: v.prevSales,
          growth,
          trans: v.trans,
          avgInv,
          visitors: v.visitors,
          prevVisitors: v.prevVisitors,
          dailyReq: v.dailyReq,
          conversion,
          customerValue,
          ach: v.ach,
        };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [raw, yesterdayStr, lastYearYesterdayStr, effectiveManager, yesterday]);

  const handlePrintDailyReport = (type: 'stores' | 'employees') => {
    if (type === 'stores') {
      setPrintData({
        type: 'stores',
        title: `تقرير المعارض اليومي - ${yesterdayStr}`,
        range: yesterdayStr,
        rows: dailyReportData.map(r => ({
          name: r.name,
          sales: r.sales,
          target: r.target,
          trans: r.trans,
          avgInv: r.avgInv,
          conversion: r.conversion,
          ach: r.ach
        }))
      });
    } else {
      // For employees, we need to aggregate employee sales for yesterday
      const history = empRaw?.history || {};
      const names = empRaw?.employee_names || {};
      const empData: Record<string, any> = {};
      Object.entries(history).forEach(([sid, recs]: [string, any]) => {
        const meta = raw?.store_meta?.[sid] || {};
        if (effectiveManager !== 'all' && meta.manager !== effectiveManager) return;
        if (city !== 'all' && meta.city !== city) return;
        if (branch !== 'all' && sid !== branch) return;

        recs.forEach((rec: any[]) => {
          if (rec[0] === yesterdayStr) {
            const rawId = String(rec[1] || '').split('-')[0].trim();
            const id = rawId.padStart(4, '0');
            if (rawId === 'مرتجع') return;
            if (!empData[id]) empData[id] = { name: names[id] || rawId, sales: 0, trans: 0, store: raw?.stores?.[sid] || sid };
            empData[id].sales += Number(rec[2]) || 0;
            empData[id].trans += Number(rec[3]) || 0;
          }
        });
      });
      const rows = Object.values(empData).sort((a, b) => b.sales - a.sales);
      setPrintData({
        type: 'employees',
        title: `أداء الموظفين اليومي - ${yesterdayStr}`,
        range: yesterdayStr,
        rows
      });
    }

    setTimeout(() => {
      window.print();
      setPrintData(null);
    }, 500);
  };

  // Dynamic chart data (Daily or Monthly based on range)
  const chartData = useMemo(() => {
    if (!raw) return [];

    const start = new Date(range.start);
    const end = new Date(range.end);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Granularity: Daily (up to 35 days) or Monthly (longer)
    const data: any[] = [];

    if (diffDays <= 35) {
      // Daily view
      for (let i = 0; i < diffDays; i++) {
        const current = new Date(start);
        current.setDate(start.getDate() + i);
        const dayStr = toYMD(current);

        const prevYear = new Date(current);
        prevYear.setFullYear(current.getFullYear() - 1);
        const prevDayStr = toYMD(prevYear);

        let sales = 0, target = 0, prevSales = 0, visitors = 0, prevVisitors = 0;

        (raw.sales || []).forEach(([d, sid, v]: any[]) => {
          const ds = String(d).substring(0, 10);
          if (!allowedStoreIds.has(sid)) return;
          if (ds === dayStr) sales += (v || 0);
          if (ds === prevDayStr) prevSales += (v || 0);
        });

        (raw.targets || []).forEach(([d, sid, v]: any[]) => {
          if (!allowedStoreIds.has(sid)) return;
          if (String(d).substring(0, 10) === dayStr) target += (v || 0);
        });

        (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
          const ds = String(d).substring(0, 10);
          if (!allowedStoreIds.has(sid)) return;
          if (ds === dayStr) visitors += (v || 0);
          if (ds === prevDayStr) prevVisitors += (v || 0);
        });

        const entry: any = { name: dayStr.substring(5) }; // MM-DD
        if (chartMode === 'target') {
          entry.Sales = sales;
          entry.Target = target;
        } else if (chartMode === 'growth') {
          entry.Current = sales;
          entry.Previous = prevSales;
        } else {
          entry.CurrentVisitors = visitors;
          entry.PreviousVisitors = prevVisitors;
        }
        data.push(entry);
      }
    } else {
      // Monthly view
      const monthsNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const currentYear = start.getFullYear();

      for (let m = 0; m < 12; m++) {
        const monthStart = new Date(currentYear, m, 1);
        const monthEnd = new Date(currentYear, m + 1, 0);
        const mStartStr = toYMD(monthStart);
        const mEndStr = toYMD(monthEnd);

        const pYearStart = new Date(currentYear - 1, m, 1);
        const pYearEnd = new Date(currentYear - 1, m + 1, 0);
        const pStartStr = toYMD(pYearStart);
        const pEndStr = toYMD(pYearEnd);

        let sales = 0, target = 0, prevSales = 0, visitors = 0, prevVisitors = 0;

        (raw.sales || []).forEach(([d, sid, v]: any[]) => {
          const ds = String(d).substring(0, 10);
          if (!allowedStoreIds.has(sid)) return;
          if (ds >= mStartStr && ds <= mEndStr) sales += (v || 0);
          if (ds >= pStartStr && ds <= pEndStr) prevSales += (v || 0);
        });

        (raw.targets || []).forEach(([d, sid, v]: any[]) => {
          if (!allowedStoreIds.has(sid)) return;
          const ds = String(d).substring(0, 10);
          if (ds >= mStartStr && ds <= mEndStr) target += (v || 0);
        });

        (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
          const ds = String(d).substring(0, 10);
          if (!allowedStoreIds.has(sid)) return;
          if (ds >= mStartStr && ds <= mEndStr) visitors += (v || 0);
          if (ds >= pStartStr && ds <= pEndStr) prevVisitors += (v || 0);
        });

        const entry: any = { name: monthsNames[m] };
        if (chartMode === 'target') {
          entry.Sales = sales;
          entry.Target = target;
        } else if (chartMode === 'growth') {
          entry.Current = sales;
          entry.Previous = prevSales;
        } else {
          entry.CurrentVisitors = visitors;
          entry.PreviousVisitors = prevVisitors;
        }
        data.push(entry);
      }
    }

    return data;
  }, [raw, allowedStoreIds, chartMode, range.start, range.end]);

  const chartKPIs = useMemo(() => {
    if (!chartData.length) return { ads: 0, ams: 0 };
    const totalSales = chartData.reduce((s, m) => s + (m.Sales || m.Current || 0), 0);
    const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const ads = dayOfYear > 0 ? totalSales / dayOfYear : 0;
    const ams = chartData.length > 0 ? totalSales / chartData.length : 0;
    return { ads, ams };
  }, [chartData]);

  if (err) {
    return <div className="p-6 bg-white rounded-xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  }
  if (!raw) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  const ach = totals.target > 0 ? (totals.sales / totals.target) * 100 : 0;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard
          title="المبيعات"
          value={totals.sales}
          format={formatSAR}
          icon={<CurrencyDollarIcon />}
          comparisonValue={prevYearTotals.sales}
          comparisonLabel="السنة الماضية"
        />
        <KPICard
          title="الفواتير"
          value={totals.trans}
          format={(v) => Math.round(v).toLocaleString()}
          icon={<ReceiptTaxIcon />}
          comparisonValue={prevYearTotals.trans}
          comparisonLabel="السنة الماضية"
        />
        <KPICard
          title="الزوار"
          value={totals.visitors}
          format={(v) => Math.round(v).toLocaleString()}
          icon={<UsersIcon />}
          comparisonValue={prevYearTotals.visitors}
          comparisonLabel="السنة الماضية"
        />
        <KPICard
          title="تحقيق الهدف"
          value={ach}
          format={(v) => `${v.toFixed(1)}%`}
          icon={<ChartPieIcon />}
          comparisonValue={totals.target}
          showProgress
          progressValue={ach}
          trend="neutral"
          trendValue={`المستهدف: ${formatSAR(totals.target)}`}
        />
        <KPICard
          title="قيمة العميل"
          value={totals.visitors > 0 ? totals.sales / totals.visitors : 0}
          format={formatSAR}
          icon={<UsersIcon />}
          comparisonValue={prevYearTotals.visitors > 0 ? prevYearTotals.sales / prevYearTotals.visitors : 0}
          comparisonLabel="السنة الماضية"
        />
      </div>

      {/* Monthly Performance Chart */}
      <div className="mb-8">
        <ChartCard title="أداء المبيعات الشهري (Monthly Sales Performance)" className="h-[480px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setChartMode('target')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${chartMode === 'target'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-orange-50'
                    }`}
                >
                  تارجت
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('growth')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${chartMode === 'growth'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-orange-50'
                    }`}
                >
                  نمو
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('visitors')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${chartMode === 'visitors'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-orange-50'
                    }`}
                >
                  زوار
                </button>
              </div>
              <div className="flex items-center gap-3">
                {chartMode === 'target' && (
                  <>
                    <div className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                      ADS: {formatSAR(chartKPIs.ads)}
                    </div>
                    <div className="px-3 py-1.5 rounded-full bg-green-50 text-green-600 text-xs font-semibold">
                      AMS: {formatSAR(chartKPIs.ams)}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex-grow min-h-[300px]">
              <LineChart data={chartData} />
            </div>
            <div className="flex items-center justify-center gap-4 pt-2 border-t border-neutral-200">
              {chartMode === 'target' && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-sm text-neutral-600">Sales</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500 border-2 border-dashed border-purple-500"></div>
                    <span className="text-sm text-neutral-600">Target</span>
                  </div>
                </>
              )}
              {chartMode === 'growth' && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <span className="text-sm text-neutral-600">Current</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span className="text-sm text-neutral-600">Previous Year</span>
                  </div>
                </>
              )}
              {chartMode === 'visitors' && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-sm text-neutral-600">Current Visitors</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                    <span className="text-sm text-neutral-600">Previous Year Visitors</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* بطاقات الوصول السريع */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
        <Link to="/stagnant" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><PauseIcon /></div>
          <div>
            <div className="font-bold text-neutral-900">المنتجات الراكدة</div>
            <div className="text-xs text-neutral-500">أصناف راكدة</div>
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
          data={topEmployeesRank as any}
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
          data={topStoresRank as any}
          format={(v, k) => {
            if (k === 'achievement' || k === 'growth') return `${Number(v).toFixed(1)}%`;
            if (k === 'sales') return formatSAR(v);
            return Number(v).toLocaleString();
          }}
          maxItems={10}
        />
      </div>

      {/* نافذة مبيعات اليوم */}
      {liveModalOpen && (
        <div className="modal-center-screen" onClick={() => setLiveModalOpen(false)}>
          <div className="modal-content max-w-5xl my-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <div className="text-xl font-bold text-neutral-900">مبيعات اليوم — لايف</div>
                <div className="text-sm text-neutral-500 mt-1">تاريخ اليوم: {todayStr}</div>
              </div>
              <button
                type="button"
                className="btn-secondary py-2 px-3 flex items-center gap-2"
                onClick={() => setLiveModalOpen(false)}
              >
                <XIcon /> إغلاق
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <KPICard title="المجموع (اليوم)" value={liveData.totals.sales} format={formatSAR} icon={<CurrencyDollarIcon />} />
              <KPICard
                title="الفواتير"
                value={liveData.totals.trans}
                format={(v) => Math.round(v).toLocaleString()}
                icon={<ReceiptTaxIcon />}
              />
              <KPICard
                title="معدل الفاتورة"
                value={liveData.totals.trans > 0 ? liveData.totals.sales / liveData.totals.trans : 0}
                format={formatSAR}
                icon={<FireIcon />}
              />
            </div>

            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 mb-6">
              <div className="text-xs font-bold text-orange-800 mb-2 uppercase tracking-wider">تصفية حسب مدير المنطقة</div>
              <select
                className="input bg-white border-orange-200 focus:ring-orange-500"
                value={liveManager}
                onChange={(e) => setLiveManager(e.target.value)}
              >
                <option value="all">كل مدراء المناطق</option>
                {managers.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto">
              {liveData.stores.map((store) => (
                <div
                  key={store.sid}
                  className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden identity-card"
                >
                  <div className="p-4 text-right">
                    <div className="flex items-center justify-between gap-2 overflow-hidden">
                      <div className="font-bold text-neutral-900 truncate flex-grow text-right">{store.name}</div>
                      <div className="text-[10px] font-bold text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100 whitespace-nowrap">
                        Avg: {formatSAR(store.avgInv)}
                      </div>
                    </div>
                    <div className="text-orange-600 font-bold mt-1 text-lg" dir="ltr">{formatSAR(store.sales)}</div>
                    {store.employees.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-semibold text-neutral-500 mb-2">الموظفون</div>
                        {store.employees.slice(0, 5).map((emp) => (
                          <div key={emp.id} className="flex flex-col py-2 border-b border-neutral-100 last:border-0">
                            <div className="flex justify-between items-center text-sm mb-1">
                              <span className="text-neutral-800 font-medium truncate ml-2">{emp.name}</span>
                              <span className="shrink-0 text-orange-600 font-bold" dir="ltr">{formatSAR(emp.sales)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-neutral-400 font-medium">
                              <span>معدل الفاتورة: {formatSAR(emp.avgInv)}</span>
                              <span>{Math.round(emp.trans)} فاتورة</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* نافذة التقرير اليومي */}
      {dailyReportModalOpen && (
        <div className="modal-center-screen" onClick={() => setDailyReportModalOpen(false)}>
          <div className="modal-content max-w-6xl my-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-base font-bold text-blue-600 flex items-center gap-2">
                  <span>📄</span>
                  <span>التقرير اليومي: تقرير الأمس ({yesterdayStr}) مقارنة بـ ({lastYearYesterdayStr})</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary py-1.5 px-4 text-xs font-bold flex items-center gap-2 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => handlePrintDailyReport('employees')}
                >
                  📄 PDF موظفين
                </button>
                <button
                  type="button"
                  className="btn-secondary py-1.5 px-4 text-xs font-bold flex items-center gap-2 border-primary-200 text-primary-700 hover:bg-orange-50"
                  onClick={() => handlePrintDailyReport('stores')}
                >
                  🏢 PDF معارض
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
                  {dailyReportData.map((row, idx) => (
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
      )}

      {/* Print-only View Layout (Unified Style) */}
      {printData && (
        <div className="fixed inset-0 bg-white z-[9999] p-8 overflow-y-auto print-view" dir="rtl">
          <div className="flex justify-between items-center border-b-4 border-orange-600 pb-4 mb-6">
            <div>
              <h1 className="text-3xl font-black text-neutral-900">{printData.title}</h1>
              <p className="text-neutral-500 font-bold mt-1">الفترة: {printData.range} | استخرج بواسطة: {user?.name}</p>
            </div>
            <div className="text-left font-arabic">
              <div className="text-2xl font-black text-orange-600 italic">ORA COCKPIT</div>
              <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Business Intelligence Report</div>
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-900 text-white print:bg-neutral-900 border-b-2 border-orange-600">
                <th className="p-3 text-right">#</th>
                <th className="p-3 text-right">{printData.type === 'stores' ? 'المعرض' : 'الموظف'}</th>
                {printData.type === 'stores' && <th className="p-3 text-center">الهدف</th>}
                <th className="p-3 text-center">المبيعات</th>
                <th className="p-3 text-center">الفواتير</th>
                <th className="p-3 text-center">متوسط الفاتورة</th>
                {printData.type === 'stores' && <th className="p-3 text-center">التحويل %</th>}
                {printData.type === 'stores' && <th className="p-3 text-center">التحقيق %</th>}
                {printData.type === 'employees' && <th className="p-3 text-center">المعرض</th>}
              </tr>
            </thead>
            <tbody>
              {printData.rows.map((row: any, idx: number) => (
                <tr key={idx} className="border-b border-neutral-200 hover:bg-neutral-50 even:bg-neutral-50">
                  <td className="p-3 text-neutral-500 font-bold">{idx + 1}</td>
                  <td className="p-3 font-black text-neutral-900">{row.name}</td>
                  {printData.type === 'stores' && <td className="p-3 text-center font-mono">{formatSAR(row.target)}</td>}
                  <td className="p-3 text-center font-black text-green-700 font-mono">{formatSAR(row.sales)}</td>
                  <td className="p-3 text-center font-bold text-neutral-700">{row.trans}</td>
                  <td className="p-3 text-center font-bold text-neutral-900 font-mono">{formatSAR(row.avgInv || (row.trans > 0 ? row.sales / row.trans : 0))}</td>
                  {printData.type === 'stores' && <td className="p-3 text-center font-black text-orange-600">{(row.conversion || 0).toFixed(1)}%</td>}
                  {printData.type === 'stores' && (
                    <td className="p-3 text-center">
                      <span className={`font-black ${row.ach >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                        {(row.ach || 0).toFixed(1)}%
                      </span>
                    </td>
                  )}
                  {printData.type === 'employees' && <td className="p-3 text-center text-neutral-600 font-medium">{row.store}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 pt-6 border-t border-neutral-100 flex justify-between items-center text-[10px] text-neutral-400 font-bold uppercase">
            <div>Generated on {new Date().toLocaleString()}</div>
            <div>Copyright &copy; {new Date().getFullYear()} ORA Cockpit</div>
          </div>

          <style dangerouslySetInnerHTML={{
            __html: `
            @media print {
              @page { size: A4; margin: 1cm; }
              body * { visibility: hidden; }
              .print-view, .print-view * { visibility: visible; }
              .print-view { position: absolute; left: 0; top: 0; width: 100%; border: none; padding: 0; }
              .bg-neutral-900 { background-color: #171717 !important; -webkit-print-color-adjust: exact; }
              .text-white { color: white !important; }
              .text-green-700 { color: #15803d !important; }
              .text-orange-600 { color: #ea580c !important; }
              .bg-neutral-50 { background-color: #fafafa !important; }
            }
          ` }} />
        </div>
      )}
    </div>
  );
}
