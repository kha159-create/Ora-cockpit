import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { sumEmployeeTargetForDateRange, sumManagementTargetsForDateRange } from '../utils/march2026Targets';
import {
  buildTargetBuckets,
  clampBucket,
  daysInMonth,
  SplitGranularity,
  TargetBucket,
  ymd,
} from '../utils/targetSplitPeriods';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function safeNum(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}
function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

type PeriodMetrics = {
  target: number;
  sales: number;
  trans: number;
  visitors: number;
  achievement: number;
  avgInv: number;
  conversion: number;
  customerValue: number;
  /** للوضع «يوم» — اليومية المطلوبة لهذا اليوم (ديناميكي) */
  dailyTargetDynamic?: number;
  /** متبقي تحقيق الفترة (تارجت الفترة − مبيعات) */
  shortfallPeriod: number;
  /** مطلوب يومياً لإغلاق تارجت الشهر بعد نهاية الفترة */
  closeMonthDaily: number;
};

type EmployeePeriodMetrics = {
  target: number;
  sales: number;
  trans: number;
  achievement: number;
  avgInv: number;
  customerValue: number;
  dailyTargetDynamic?: number;
  items: number;
  contributionPct: number;
  shortfallPeriod: number;
  closeMonthDaily: number;
};

function sumSalesBetween(salesByDate: Record<string, number>, start: string, end: string): number {
  let s = 0;
  const a = new Date(start + 'T12:00:00');
  const b = new Date(end + 'T12:00:00');
  for (let w = new Date(a); w <= b; w.setDate(w.getDate() + 1)) {
    s += salesByDate[toYMD(w)] || 0;
  }
  return s;
}

function enrichGap(
  sales: number,
  periodExpected: number,
  fullMonthTarget: number,
  mtdSalesThroughPeriodEnd: number,
  dim: number,
  periodEndYmd: string,
): { shortfallPeriod: number; closeMonthDaily: number } {
  const dayNum = parseInt(periodEndYmd.slice(8, 10), 10);
  const remainingDays = Math.max(1, dim - dayNum + 1);
  const remainingMonthTarget = Math.max(0, fullMonthTarget - mtdSalesThroughPeriodEnd);
  const closeMonthDaily = remainingMonthTarget / remainingDays;
  const shortfallPeriod = Math.max(0, periodExpected - sales);
  return { shortfallPeriod, closeMonthDaily };
}

function aggregateMgmtForRange(
  raw: any,
  storeIds: Set<string>,
  start: string,
  end: string,
): { sales: number; trans: number; visitors: number } {
  let sales = 0,
    trans = 0,
    visitors = 0;
  (raw.sales || []).forEach(([d, sid, v]: any[]) => {
    const ds = String(d).substring(0, 10);
    if (!storeIds.has(String(sid))) return;
    if (ds >= start && ds <= end) sales += safeNum(v);
  });
  (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
    const ds = String(d).substring(0, 10);
    if (!storeIds.has(String(sid))) return;
    if (ds >= start && ds <= end) trans += safeNum(v);
  });
  (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
    const ds = String(d).substring(0, 10);
    if (!storeIds.has(String(sid))) return;
    if (ds >= start && ds <= end) visitors += safeNum(v);
  });
  return { sales, trans, visitors };
}

function buildSalesByDateForStore(raw: any, sid: string, start: string, end: string): Record<string, number> {
  const m: Record<string, number> = {};
  (raw.sales || []).forEach(([d, storeId, v]: any[]) => {
    if (String(storeId) !== sid) return;
    const ds = String(d).substring(0, 10);
    if (ds >= start && ds <= end) m[ds] = (m[ds] || 0) + safeNum(v);
  });
  return m;
}

function rollingDailyForDay(
  monthTarget: number,
  monthStart: string,
  dayDate: string,
  dim: number,
  salesByDate: Record<string, number>,
): { dailyTarget: number; achievement: number; daySales: number } {
  let achievedBefore = 0;
  const t0 = new Date(monthStart + 'T12:00:00');
  const tDay = new Date(dayDate + 'T12:00:00');
  for (let w = new Date(t0); w < tDay; w.setDate(w.getDate() + 1)) {
    const k = toYMD(w);
    achievedBefore += salesByDate[k] || 0;
  }
  const dayNum = parseInt(dayDate.slice(8, 10), 10);
  const remainingDays = Math.max(1, dim - dayNum + 1);
  const remainingTarget = Math.max(0, monthTarget - achievedBefore);
  const dailyTarget = remainingTarget / remainingDays;
  const daySales = salesByDate[dayDate] || 0;
  const achievement = dailyTarget > 0 ? (daySales / dailyTarget) * 100 : 0;
  return { dailyTarget, achievement, daySales };
}

function metricsFromAgg(
  target: number,
  sales: number,
  trans: number,
  visitors: number,
  dailyTargetDynamic: number | undefined,
  gap: { shortfallPeriod: number; closeMonthDaily: number },
): PeriodMetrics {
  const achievementBase = target > 0 ? (sales / target) * 100 : 0;
  const avgInv = trans > 0 ? sales / trans : 0;
  const conversion = visitors > 0 ? (trans / visitors) * 100 : 0;
  const customerValue = visitors > 0 ? sales / visitors : 0;
  const out: PeriodMetrics = {
    target,
    sales,
    trans,
    visitors,
    achievement: dailyTargetDynamic != null && dailyTargetDynamic > 0 ? (sales / dailyTargetDynamic) * 100 : achievementBase,
    avgInv,
    conversion,
    customerValue,
    shortfallPeriod: gap.shortfallPeriod,
    closeMonthDaily: gap.closeMonthDaily,
  };
  if (dailyTargetDynamic != null) out.dailyTargetDynamic = dailyTargetDynamic;
  return out;
}

function employeeMetricsFromAgg(
  target: number,
  sales: number,
  trans: number,
  visitorsProrated: number,
  dailyTargetDynamic: number | undefined,
  items: number,
  storeSalesInBucket: number,
  gap: { shortfallPeriod: number; closeMonthDaily: number },
): EmployeePeriodMetrics {
  const achievementBase = target > 0 ? (sales / target) * 100 : 0;
  const avgInv = trans > 0 ? sales / trans : 0;
  const customerValue = visitorsProrated > 0 ? sales / visitorsProrated : 0;
  const contributionPct = storeSalesInBucket > 0 ? (sales / storeSalesInBucket) * 100 : 0;
  return {
    target,
    sales,
    trans,
    achievement: dailyTargetDynamic != null && dailyTargetDynamic > 0 ? (sales / dailyTargetDynamic) * 100 : achievementBase,
    avgInv,
    customerValue,
    dailyTargetDynamic,
    items,
    contributionPct,
    shortfallPeriod: gap.shortfallPeriod,
    closeMonthDaily: gap.closeMonthDaily,
  };
}

function resolveEmployeeName(rawId: string, fallback: string, names: Record<string, string>) {
  const id = String(rawId || '').trim();
  if (!id) return fallback;
  if (names[id]) return names[id];
  if (/^\d+$/.test(id)) {
    const p = id.padStart(4, '0');
    if (names[p]) return names[p];
  }
  return fallback || id;
}

export default function TargetSplitPage() {
  const user = getCurrentUser();
  const [raw, setRaw] = useState<any>(null);
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [manager, setManager] = useState('all');
  const [city, setCity] = useState('all');
  const [branch, setBranch] = useState<string>(user?.storeId || 'all');
  const [storeType, setStoreType] = useState<'all' | 'store' | 'online'>('all');
  const [selYear, setSelYear] = useState(() => new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(() => new Date().getMonth() + 1);
  const [granularity, setGranularity] = useState<SplitGranularity>('10');
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const [showEmpDetails, setShowEmpDetails] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([loadManagementData(), loadEmployeesData()])
      .then(([m, e]) => {
        setRaw(m);
        setEmpRaw(e);
        setErr(null);
      })
      .catch((e) => setErr(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const allowedStoreIds = useMemo(() => {
    if (!raw?.stores) return new Set<string>();
    const meta = raw.store_meta || {};
    return new Set(
      Object.keys(raw.stores).filter((sid) => {
        if (user?.role === 'BranchManager' && sid !== user?.storeId) return false;
        return true;
      }),
    );
  }, [raw, user?.role, user?.storeId]);

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toYMD(yesterday);

  const monthStart = useMemo(() => ymd(selYear, selMonth, 1), [selYear, selMonth]);
  const monthEnd = useMemo(() => ymd(selYear, selMonth, daysInMonth(selYear, selMonth)), [selYear, selMonth]);

  const lastAvailableInMonth = useMemo(() => {
    if (selYear === now.getFullYear() && selMonth === now.getMonth() + 1) {
      return yesterdayStr >= monthStart && yesterdayStr <= monthEnd ? yesterdayStr : monthStart;
    }
    return monthEnd;
  }, [selYear, selMonth, now, yesterdayStr, monthStart, monthEnd]);

  const buckets = useMemo(() => {
    const rawBuckets = buildTargetBuckets(selYear, selMonth, granularity);
    return rawBuckets.map((b) => clampBucket(b, lastAvailableInMonth)).filter((x): x is TargetBucket => x != null);
  }, [selYear, selMonth, granularity, lastAvailableInMonth]);

  const filtersDerived = useMemo(() => {
    if (!raw?.store_meta) {
      return { managers: [] as string[], cities: [] as string[], branches: [] as string[] };
    }
    const meta = raw.store_meta;
    const mgr = new Set<string>();
    const cities = new Set<string>();
    Object.values(meta).forEach((m: any) => {
      if (m?.manager && m.manager !== 'online') mgr.add(String(m.manager));
    });
    Object.entries(meta).forEach(([sid, m]: [string, any]) => {
      if (!allowedStoreIds.has(sid)) return;
      if (effectiveManager !== 'all' && String(m?.manager) !== effectiveManager) return;
      if (m?.city) cities.add(String(m.city));
    });
    const branches = Object.keys(raw.stores || {})
      .filter((sid) => {
        const m = meta[sid];
        if (!allowedStoreIds.has(sid)) return false;
        if (user?.role === 'BranchManager' && sid !== user?.storeId) return false;
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && String(m?.city || '') !== city) return false;
        if (storeType !== 'all') {
          const t = String(m?.type || '').toLowerCase();
          const isOnline = t === 'online' || t === 'platform' || t === 'warehouse';
          if (storeType === 'online' && !isOnline) return false;
          if (storeType === 'store' && isOnline) return false;
        }
        return true;
      })
      .sort((a, b) => (raw.stores[a] || a).localeCompare(raw.stores[b] || b, 'ar'));

    return {
      managers: Array.from(mgr).sort((a, b) => a.localeCompare(b, 'ar')),
      cities: Array.from(cities).sort((a, b) => a.localeCompare(b, 'ar')),
      branches,
    };
  }, [raw, allowedStoreIds, effectiveManager, city, storeType, user?.role, user?.storeId]);

  /** موظفون مع معرّف فرعهم الأساسي داخل الشهر (أكبر مبيعات) */
  const employeePrimaryStore = useMemo(() => {
    const history = empRaw?.history || {};
    const names = empRaw?.employee_names || {};
    const primary: Record<string, { storeId: string; name: string }> = {};
    const vol: Record<string, Record<string, number>> = {};

    for (const [sid, records] of Object.entries(history)) {
      if (!allowedStoreIds.has(sid)) continue;
      for (const rec of records || []) {
        const dt = String(rec?.[0] || '').substring(0, 10);
        if (dt < monthStart || dt > lastAvailableInMonth) continue;
        const rawName = rec?.[1];
        let empId = String(rawName || '');
        if (empId.includes('-')) empId = empId.split('-')[0].trim();
        if (!empId || empId === 'مرتجع') continue;
        const sales = safeNum(rec?.[2]);
        if (!vol[empId]) vol[empId] = {};
        vol[empId][sid] = (vol[empId][sid] || 0) + sales;
      }
    }

    for (const [empId, byStore] of Object.entries(vol)) {
      let best = '';
      let bestV = -1;
      for (const [sid, v] of Object.entries(byStore)) {
        if (v > bestV) {
          bestV = v;
          best = sid;
        }
      }
      if (best) {
        primary[empId] = {
          storeId: best,
          name: resolveEmployeeName(empId, empId, names),
        };
      }
    }
    return primary;
  }, [empRaw, allowedStoreIds, monthStart, lastAvailableInMonth]);

  const storeRows = useMemo(() => {
    if (!raw || !empRaw) return [];

    const meta = raw.store_meta || {};
    const storesMap = raw.stores || {};
    const targetsRows = raw.targets;

    const list: {
      sid: string;
      name: string;
      manager: string;
      monthTarget: number;
      monthSales: number;
      monthAch: number;
      gap: number;
      buckets: { bucket: TargetBucket; metrics: PeriodMetrics }[];
      employees: {
        id: string;
        name: string;
        monthTarget: number;
        monthSales: number;
        buckets: { bucket: TargetBucket; metrics: EmployeePeriodMetrics }[];
      }[];
    }[] = [];

    for (const sid of filtersDerived.branches) {
      if (branch !== 'all' && sid !== branch) continue;

      const m = meta[sid];
      if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) continue;
      if (city !== 'all' && String(m?.city || '') !== city) continue;
      if (storeType !== 'all') {
        const t = String(m?.type || '').toLowerCase();
        const isOnline = t === 'online' || t === 'platform' || t === 'warehouse';
        if (storeType === 'online' && !isOnline) continue;
        if (storeType === 'store' && isOnline) continue;
      }

      const storeIds = new Set([sid]);
      const monthT = sumManagementTargetsForDateRange(targetsRows, monthStart, lastAvailableInMonth)[sid] || 0;
      const monthAgg = aggregateMgmtForRange(raw, storeIds, monthStart, lastAvailableInMonth);
      const monthAch = monthT > 0 ? (monthAgg.sales / monthT) * 100 : 0;

      const salesByDate = buildSalesByDateForStore(raw, sid, monthStart, lastAvailableInMonth);
      const fullMonthTarget =
        sumManagementTargetsForDateRange(targetsRows, monthStart, monthEnd)[sid] ||
        sumManagementTargetsForDateRange(targetsRows, monthStart, lastAvailableInMonth)[sid] ||
        0;

      const bucketMetrics: { bucket: TargetBucket; metrics: PeriodMetrics }[] = [];
      const dim = daysInMonth(selYear, selMonth);

      for (const b of buckets) {
        const effStart = b.start;
        const effEnd = b.end <= lastAvailableInMonth ? b.end : lastAvailableInMonth;
        if (effStart > effEnd) continue;
        const t = sumManagementTargetsForDateRange(targetsRows, effStart, effEnd)[sid] || 0;
        const agg = aggregateMgmtForRange(raw, storeIds, effStart, effEnd);
        const mtdThrough = aggregateMgmtForRange(raw, storeIds, monthStart, effEnd).sales;

        if (granularity === 'day') {
          const rd = rollingDailyForDay(fullMonthTarget, monthStart, effStart, dim, salesByDate);
          const gap = enrichGap(rd.daySales, rd.dailyTarget, fullMonthTarget, mtdThrough, dim, effEnd);
          bucketMetrics.push({
            bucket: b,
            metrics: metricsFromAgg(monthT, rd.daySales, agg.trans, agg.visitors, rd.dailyTarget, gap),
          });
        } else {
          const gap = enrichGap(agg.sales, t, fullMonthTarget, mtdThrough, dim, effEnd);
          bucketMetrics.push({
            bucket: b,
            metrics: metricsFromAgg(t, agg.sales, agg.trans, agg.visitors, undefined, gap),
          });
        }
      }

      const emps: typeof list[0]['employees'] = [];
      for (const [eid, pinfo] of Object.entries(employeePrimaryStore)) {
        if (pinfo.storeId !== sid) continue;
        const mt = sumEmployeeTargetForDateRange(empRaw, eid, monthStart, lastAvailableInMonth);
        let ms = 0;
        const history = empRaw?.history || {};
        const empSalesByDate: Record<string, number> = {};
        Object.values(history).forEach((records: any) => {
          for (const rec of records || []) {
            const dt = String(rec?.[0] || '').substring(0, 10);
            if (dt < monthStart || dt > lastAvailableInMonth) continue;
            let id = String(rec?.[1] || '');
            if (id.includes('-')) id = id.split('-')[0].trim();
            if (id !== eid) continue;
            const s = safeNum(rec?.[2]);
            ms += s;
            empSalesByDate[dt] = (empSalesByDate[dt] || 0) + s;
          }
        });

        const empFullMonthT = sumEmployeeTargetForDateRange(empRaw, eid, monthStart, monthEnd);
        const eb: { bucket: TargetBucket; metrics: EmployeePeriodMetrics }[] = [];
        const dimEmp = daysInMonth(selYear, selMonth);
        for (const b of buckets) {
          const effStart = b.start;
          const effEnd = b.end <= lastAvailableInMonth ? b.end : lastAvailableInMonth;
          if (effStart > effEnd) continue;
          const tt = sumEmployeeTargetForDateRange(empRaw, eid, effStart, effEnd);
          let es = 0,
            et = 0,
            items = 0;
          Object.values(history).forEach((records: any) => {
            for (const rec of records || []) {
              const dt = String(rec?.[0] || '').substring(0, 10);
              if (dt < effStart || dt > effEnd) continue;
              let id = String(rec?.[1] || '');
              if (id.includes('-')) id = id.split('-')[0].trim();
              if (id !== eid) continue;
              es += safeNum(rec?.[2]);
              et += safeNum(rec?.[3]);
              items += safeNum(rec?.[4]);
            }
          });
          const storeBucket = aggregateMgmtForRange(raw, new Set([sid]), effStart, effEnd);
          const ev = storeBucket.sales > 0 ? storeBucket.visitors * (es / storeBucket.sales) : 0;
          const empMtdThrough = sumSalesBetween(empSalesByDate, monthStart, effEnd);

          if (granularity === 'day') {
            const rd = rollingDailyForDay(empFullMonthT, monthStart, effStart, dimEmp, empSalesByDate);
            const gap = enrichGap(rd.daySales, rd.dailyTarget, empFullMonthT, empMtdThrough, dimEmp, effEnd);
            eb.push({
              bucket: b,
              metrics: employeeMetricsFromAgg(mt, rd.daySales, et, ev, rd.dailyTarget, items, storeBucket.sales, gap),
            });
          } else {
            const gap = enrichGap(es, tt, empFullMonthT, empMtdThrough, dimEmp, effEnd);
            eb.push({
              bucket: b,
              metrics: employeeMetricsFromAgg(tt, es, et, ev, undefined, items, storeBucket.sales, gap),
            });
          }
        }

        emps.push({
          id: eid,
          name: pinfo.name,
          monthTarget: mt,
          monthSales: ms,
          buckets: eb,
        });
      }

      emps.sort((a, b) => b.monthSales - a.monthSales);

      list.push({
        sid,
        name: storesMap[sid] || sid,
        manager: String(m?.manager || '—'),
        monthTarget: monthT,
        monthSales: monthAgg.sales,
        monthAch,
        gap: monthT - monthAgg.sales,
        buckets: bucketMetrics,
        employees: emps,
      });
    }

    list.sort((a, b) => b.monthSales - a.monthSales);
    return list;
  }, [
    raw,
    empRaw,
    filtersDerived.branches,
    branch,
    effectiveManager,
    city,
    storeType,
    buckets,
    granularity,
    monthStart,
    monthEnd,
    lastAvailableInMonth,
    selYear,
    selMonth,
    employeePrimaryStore,
  ]);

  const insights = useMemo(() => {
    if (!storeRows.length) return null;
    const weak = storeRows.filter((r) => r.monthTarget > 0 && r.monthAch < 85).slice(0, 5);
    const strong = storeRows.filter((r) => r.monthTarget > 0 && r.monthAch >= 100).slice(0, 5);
    const totalT = storeRows.reduce((s, r) => s + r.monthTarget, 0);
    const totalS = storeRows.reduce((s, r) => s + r.monthSales, 0);
    const w = totalT > 0 ? (totalS / totalT) * 100 : 0;
    return { weak, strong, totalT, totalS, weighted: w };
  }, [storeRows]);

  const toggleStore = (sid: string) => {
    setExpandedStores((prev) => {
      const n = new Set(prev);
      if (n.has(sid)) n.delete(sid);
      else n.add(sid);
      return n;
    });
  };

  const toggleEmp = (key: string) => {
    setShowEmpDetails((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  if (loading && !raw) {
    return <DashboardSkeleton />;
  }

  if (err) {
    return (
      <div className="p-6 bg-white rounded-xl border border-red-200 text-red-700">
        {err}
        <button type="button" className="btn-primary mt-3 block" onClick={load}>
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  return (
    <div className="space-y-5 pb-10">
      {/* رأس ذكي */}
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br from-slate-900 via-slate-800 to-orange-900 p-6 text-white shadow-xl">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute -bottom-16 -right-10 h-48 w-48 rounded-full bg-amber-400/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-200/90">تحليل أهداف</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">تقسيمة التارجت</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-200/90 leading-relaxed">
              قارن التارجت مع الأداء الفعلي حسب <span className="font-semibold text-white">فترات ذكية</span> داخل الشهر — يوم
              بيوم مع اليومية الديناميكية، أو نوافذ 10 و15 يوماً — ثم انزل لمستوى الموظفين داخل كل فرع.
            </p>
          </div>
          {insights && (
            <div className="flex flex-wrap gap-3">
              <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm border border-white/10">
                <div className="text-[10px] text-slate-300">تحقيق مرجّح (الشهر)</div>
                <div className="text-2xl font-black text-emerald-300">{insights.weighted.toFixed(1)}%</div>
              </div>
              <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm border border-white/10">
                <div className="text-[10px] text-slate-300">فجوة على مستوى العرض</div>
                <div className="text-lg font-bold text-amber-200">
                  {formatSAR(Math.max(0, insights.totalT - insights.totalS))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* فلاتر */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {isAdminOrAuditor(user?.role) && (
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</div>
              <select className="input w-full" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="all">الكل</option>
                {filtersDerived.managers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={user?.role === 'BranchManager' ? 'pointer-events-none opacity-70' : ''}>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفرع</div>
            <select className="input w-full" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {filtersDerived.branches.map((code) => (
                <option key={code} value={code}>
                  {raw?.stores?.[code] || code}
                </option>
              ))}
            </select>
          </div>
          <div className={user?.role === 'BranchManager' ? 'pointer-events-none opacity-70' : ''}>
            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
            <select className="input w-full" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {filtersDerived.cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">نوع المعرض</div>
            <select className="input w-full" value={storeType} onChange={(e) => setStoreType(e.target.value as typeof storeType)}>
              <option value="all">الكل</option>
              <option value="store">معارض فقط</option>
              <option value="online">أونلاين</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الشهر</div>
            <div className="flex gap-2">
              <select className="input flex-1 min-w-0" value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}>
                {monthsAr.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select className="input w-24 shrink-0" value={selYear} onChange={(e) => setSelYear(Number(e.target.value))}>
                {[2026, 2025, 2024].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">تقسيم التارجت</div>
            <select
              className="input w-full font-semibold border-orange-200 bg-orange-50/60"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as SplitGranularity)}
            >
              <option value="day">يوم — اليومية الديناميكية</option>
              <option value="10">نوافذ 10 أيام</option>
              <option value="15">نوافذ 15 يوماً</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-neutral-500 mt-3 border-t border-neutral-100 pt-3">
          البيانات حتى <span className="font-mono font-semibold">{lastAvailableInMonth}</span>
          {selYear === now.getFullYear() && selMonth === now.getMonth() + 1
            ? ' (الشهر الحالي — لا يُحسب ما لم يحن بعد)'
            : ''}
          · وضع «يوم» يعرض نفس منطق صفحة الموظفين: التارجت المتبقي يُوزَّع على الأيام المتبقية من الشهر.
        </p>
      </div>

      {/* قرارات سريعة */}
      {insights && insights.weak.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <div className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            يحتاج انتباه — تحقيق أقل من 85%
          </div>
          <ul className="mt-2 text-sm text-amber-950/90 list-disc list-inside space-y-1">
            {insights.weak.map((r) => (
              <li key={r.sid}>
                <span className="font-semibold">{r.name}</span>: {r.monthAch.toFixed(1)}% — فجوة {formatSAR(Math.max(0, r.gap))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* جدول الفروع */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-md overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/80 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold text-neutral-900">المعارض</h2>
          <span className="text-xs text-neutral-500">{storeRows.length} فرع</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-neutral-900 text-white">
                <th className="th text-right w-10" />
                <th className="th text-right">المعرض</th>
                <th className="th text-center">تارجت الشهر</th>
                <th className="th text-center">مبيعات</th>
                <th className="th text-center">تحقيق</th>
                <th className="th text-center">الفجوة</th>
              </tr>
            </thead>
            <tbody>
              {storeRows.map((row) => {
                const open = expandedStores.has(row.sid);
                return (
                  <React.Fragment key={row.sid}>
                    <tr
                      className="border-b border-neutral-100 hover:bg-orange-50/40 cursor-pointer"
                      onClick={() => toggleStore(row.sid)}
                    >
                      <td className="td text-center text-neutral-400">{open ? '▼' : '◀'}</td>
                      <td className="td font-bold text-neutral-900">
                        {row.name}
                        <span className="block text-xs font-normal text-neutral-500">{row.manager}</span>
                      </td>
                      <td className="td text-center dir-ltr">{formatSAR(row.monthTarget)}</td>
                      <td className="td text-center dir-ltr font-semibold">{formatSAR(row.monthSales)}</td>
                      <td className="td text-center">
                        <span
                          className={`inline-flex min-w-[3.5rem] justify-center rounded-lg px-2 py-0.5 font-bold ${
                            row.monthAch >= 100 ? 'bg-emerald-100 text-emerald-800' : row.monthAch >= 85 ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {row.monthAch.toFixed(1)}%
                        </span>
                      </td>
                      <td className="td text-center text-neutral-700 dir-ltr">{formatSAR(Math.max(0, row.gap))}</td>
                    </tr>
                    {open && (
                      <tr key={`${row.sid}-detail`} className="bg-neutral-50/50">
                        <td colSpan={6} className="p-0">
                          <div className="p-4 space-y-6 border-t border-orange-100">
                            <div>
                              <h3 className="text-sm font-bold text-orange-800 mb-2 flex items-center gap-2">
                                <span className="h-1 w-8 rounded-full bg-orange-500" />
                                فترات التارجت — {granularity === 'day' ? 'يومي' : granularity === '10' ? 'كل 10 أيام' : 'كل 15 يوماً'}
                              </h3>
                              <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-xl border border-neutral-200">
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="bg-orange-600 text-white">
                                      <th className="th text-right whitespace-nowrap">الفترة</th>
                                      <th className="th text-center whitespace-nowrap">
                                        {granularity === 'day' ? 'اليومية المطلوبة' : 'تارجت الفترة'}
                                      </th>
                                      <th className="th text-center">مبيعات</th>
                                      <th className="th text-center">تحقيق</th>
                                      <th className="th text-center">معدل فاتورة</th>
                                      <th className="th text-center">تحويل %</th>
                                      <th className="th text-center">قيمة عميل</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.buckets.map(({ bucket, metrics }) => (
                                      <React.Fragment key={bucket.id}>
                                        <tr className="border-b border-neutral-100 hover:bg-white">
                                          <td className="td font-mono text-neutral-700 whitespace-nowrap">{bucket.label}</td>
                                          <td className="td text-center dir-ltr">
                                            {formatSAR(granularity === 'day' ? metrics.dailyTargetDynamic || 0 : metrics.target)}
                                          </td>
                                          <td className="td text-center dir-ltr font-semibold">{formatSAR(metrics.sales)}</td>
                                          <td className="td text-center">
                                            <span
                                              className={`font-bold ${
                                                metrics.achievement >= 100 ? 'text-emerald-600' : metrics.achievement >= 85 ? 'text-amber-700' : 'text-red-600'
                                              }`}
                                            >
                                              {metrics.achievement.toFixed(1)}%
                                            </span>
                                          </td>
                                          <td className="td text-center dir-ltr">{formatSAR(metrics.avgInv)}</td>
                                          <td className="td text-center">{metrics.conversion.toFixed(1)}%</td>
                                          <td className="td text-center dir-ltr">{Math.round(metrics.customerValue).toLocaleString()}</td>
                                        </tr>
                                        {metrics.achievement < 100 && (
                                          <tr className="bg-rose-50/90 border-b border-rose-100">
                                            <td colSpan={7} className="py-2 px-3 text-[11px] text-rose-900 leading-relaxed">
                                              <span className="font-semibold">لم يُحقَّق كامل التارجت:</span>{' '}
                                              <span className="dir-ltr inline-block">متبقي للفترة {formatSAR(metrics.shortfallPeriod)}</span>
                                              {' · '}
                                              <span className="text-neutral-700">
                                                مطلوب يومياً لإغلاق تارجت الشهر:{' '}
                                                <span className="dir-ltr inline-block font-bold">{formatSAR(metrics.closeMonthDaily)}</span>
                                              </span>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {row.employees.length > 0 && (
                              <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-2">الموظفون في هذا الفرع</h3>
                                <div className="space-y-2">
                                  {row.employees.map((emp) => {
                                    const ek = `${row.sid}-${emp.id}`;
                                    const eopen = showEmpDetails.has(ek);
                                    const eAch = emp.monthTarget > 0 ? (emp.monthSales / emp.monthTarget) * 100 : 0;
                                    return (
                                      <div key={ek} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                                        <button
                                          type="button"
                                          className="w-full flex items-center justify-between px-3 py-2 text-right hover:bg-neutral-50"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleEmp(ek);
                                          }}
                                        >
                                          <span className="font-semibold text-neutral-900">
                                            {emp.name}{' '}
                                            <span className="text-xs font-normal text-neutral-500">({emp.id})</span>
                                          </span>
                                          <span className="text-xs text-neutral-500">{eopen ? 'إخفاء الجدول' : 'تفاصيل الفترات'}</span>
                                        </button>
                                        <div className="px-3 pb-2 text-xs text-neutral-600 flex flex-wrap gap-4 border-t border-neutral-50">
                                          <span>
                                            تارجت الشهر: <b className="dir-ltr inline-block">{formatSAR(emp.monthTarget)}</b>
                                          </span>
                                          <span>
                                            مبيعات: <b className="dir-ltr inline-block">{formatSAR(emp.monthSales)}</b>
                                          </span>
                                          <span>
                                            تحقيق:{' '}
                                            <b className={eAch >= 100 ? 'text-emerald-600' : 'text-neutral-800'}>{eAch.toFixed(1)}%</b>
                                          </span>
                                        </div>
                                        {eopen && (
                                          <div className="border-t border-neutral-100 p-2 overflow-x-auto max-h-80 overflow-y-auto">
                                            <table className="min-w-full text-[11px]">
                                              <thead>
                                                <tr className="bg-slate-700 text-white">
                                                  <th className="th text-right">الفترة</th>
                                                  <th className="th text-center">{granularity === 'day' ? 'اليومية' : 'تارجت'}</th>
                                                  <th className="th text-center">مبيعات</th>
                                                  <th className="th text-center">تحقيق</th>
                                                  <th className="th text-center">ATV</th>
                                                  <th className="th text-center">مساهمة %</th>
                                                  <th className="th text-center">قطع</th>
                                                  <th className="th text-center">قيمة عميل</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {emp.buckets.map(({ bucket, metrics }) => (
                                                  <React.Fragment key={bucket.id}>
                                                    <tr className="border-b border-neutral-100">
                                                      <td className="td font-mono">{bucket.label}</td>
                                                      <td className="td text-center dir-ltr">
                                                        {formatSAR(granularity === 'day' ? metrics.dailyTargetDynamic || 0 : metrics.target)}
                                                      </td>
                                                      <td className="td text-center dir-ltr">{formatSAR(metrics.sales)}</td>
                                                      <td className="td text-center">
                                                        <span
                                                          className={`font-bold ${
                                                            metrics.achievement >= 100 ? 'text-emerald-600' : metrics.achievement >= 85 ? 'text-amber-700' : 'text-red-600'
                                                          }`}
                                                        >
                                                          {metrics.achievement.toFixed(1)}%
                                                        </span>
                                                      </td>
                                                      <td className="td text-center dir-ltr">{formatSAR(metrics.avgInv)}</td>
                                                      <td className="td text-center font-medium">{metrics.contributionPct.toFixed(1)}%</td>
                                                      <td className="td text-center">{Math.round(metrics.items).toLocaleString()}</td>
                                                      <td className="td text-center dir-ltr">{Math.round(metrics.customerValue).toLocaleString()}</td>
                                                    </tr>
                                                    {metrics.achievement < 100 && (
                                                      <tr className="bg-rose-50/90 border-b border-rose-100">
                                                        <td colSpan={8} className="py-2 px-3 text-[10px] text-rose-900 leading-relaxed">
                                                          <span className="font-semibold">لم يُحقَّق كامل التارجت:</span>{' '}
                                                          <span className="dir-ltr inline-block">متبقي للفترة {formatSAR(metrics.shortfallPeriod)}</span>
                                                          {' · '}
                                                          <span className="text-neutral-700">
                                                            مطلوب يومياً لإغلاق تارجت الشهر:{' '}
                                                            <span className="dir-ltr inline-block font-bold">{formatSAR(metrics.closeMonthDaily)}</span>
                                                          </span>
                                                        </td>
                                                      </tr>
                                                    )}
                                                  </React.Fragment>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {storeRows.length === 0 && (
          <div className="p-12 text-center text-neutral-500">لا توجد فروع مطابقة للفلاتر أو لا توجد بيانات.</div>
        )}
      </div>
    </div>
  );
}
