import React, { useEffect, useMemo, useState } from 'react';
import { loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { AchievementBar, ChartCard, KPICard, LineChart } from '../components/DashboardComponents';
import { CurrencyDollarIcon, ReceiptTaxIcon, UserGroupIcon } from '../components/Icons';

type Period = 'today' | 'yesterday' | 'mtd' | 'mtd_yest' | 'month';
type SortKey =
  | 'name'
  | 'storeName'
  | 'sales'
  | 'transactions'
  | 'avg_ticket'
  | 'items_per_inv'
  | 'achievement'
  | 'target'
  | 'branchShare'
  | 'shareGrowth'
  | 'dailyReq'
  | 'max_ticket';

type EmployeeAgg = {
  id: string;
  name: string;
  storeCode: string;
  storeName: string;
  manager: string;
  sales: number;
  prevSales: number;
  transactions: number;
  items: number;
  max_ticket: number;
  target: number;
  achievement: number;
  avg_ticket: number;
  items_per_inv: number;
  branchShare: number;
  shareGrowth: number;
  dailyReq: number;
};

type BranchStats = Record<string, { current: number; prev: number; transactions: number; items: number }>;
type EmployeeDailyMaps = Record<string, Record<string, { date: string; sales: number; inv: number; items: number }>>;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalYMD(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
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

function normalizeTargetsByMonth(employeesJson: any) {
  // Supports 2 formats:
  // 1) targets_by_month: { "YYYY-MM": { empId: target, ... } }
  // 2) monthly_targets: { empId: { "YYYY-MM-01": target, ... } }
  const direct = employeesJson?.targets_by_month;
  if (direct && typeof direct === 'object') return direct as Record<string, Record<string, number>>;

  const monthlyTargets = employeesJson?.monthly_targets;
  const byMonth: Record<string, Record<string, number>> = {};
  if (monthlyTargets && typeof monthlyTargets === 'object') {
    for (const [empIdRaw, mp] of Object.entries(monthlyTargets)) {
      if (!mp || typeof mp !== 'object') continue;
      const empId = String(empIdRaw);
      for (const [monthStart, val] of Object.entries(mp as Record<string, number>)) {
        const monthKey = String(monthStart).substring(0, 7); // YYYY-MM
        if (!byMonth[monthKey]) byMonth[monthKey] = {};
        byMonth[monthKey][empId] = safeNum(val);
      }
    }
  }
  return byMonth;
}

function resolveEmployeeName(rawId: string, fallbackName: string, employeeNames: Record<string, string>) {
  const id = String(rawId || '').trim();
  if (!id) return fallbackName || id;
  if (employeeNames?.[id]) return employeeNames[id];
  if (/^\d+$/.test(id)) {
    const padded = id.padStart(4, '0');
    if (employeeNames?.[padded]) return employeeNames[padded];
    const unpadded = String(parseInt(id, 10));
    if (unpadded !== id && employeeNames?.[unpadded]) return employeeNames[unpadded];
  }
  return fallbackName || id;
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  return (
    <th
      className={`th select-none cursor-pointer ${className || ''}`}
      onClick={() => onClick(sortKey)}
      title="Click to sort"
    >
      <span className="inline-flex items-center gap-2">
        {label}
        <span className={`text-xs ${isActive ? 'opacity-100' : 'opacity-40'}`}>{isActive ? (direction === 'asc' ? '↑' : '↓') : '⇅'}</span>
      </span>
    </th>
  );
}

function EmployeeDetailsModal({
  open,
  employee,
  branchStats,
  dailyMaps,
  onClose,
  periodLabel,
  targetEnabled,
}: {
  open: boolean;
  employee: EmployeeAgg | null;
  branchStats: BranchStats;
  dailyMaps: EmployeeDailyMaps;
  periodLabel: string;
  targetEnabled: boolean;
  onClose: () => void;
}) {
  const detail = employee;
  if (!open || !detail) return null;

  const b = branchStats[detail.storeCode];
  const bAvgTicket = b && b.transactions > 0 ? b.current / b.transactions : 0;
  const bAvgUPT = b && b.transactions > 0 ? b.items / b.transactions : 0;

  const diffPct = (val: number, base: number) => (base > 0 ? ((val - base) / base) * 100 : 0);
  const diffClass = (v: number) => (Math.abs(v) < 1 ? 'diff-neutral' : v >= 0 ? 'diff-pos' : 'diff-neg');

  const daily = Object.values(dailyMaps[detail.id] || {});
  daily.sort((a, b2) => String(a.date).localeCompare(String(b2.date)));
  const chartData = daily.map((d) => {
    const dd = new Date(d.date);
    const name = `${dd.getDate()}/${dd.getMonth() + 1}`;
    return { name, Sales: d.sales };
  });

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/50 rounded-2xl overflow-auto" onClick={onClose}>
      <div className="modal-content max-w-4xl my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xl font-bold text-neutral-900 truncate">{detail.name}</div>
            <div className="text-sm text-neutral-500 mt-1">
              {detail.storeName} · {detail.manager} · {periodLabel}
            </div>
          </div>
          <button className="btn-secondary py-2 px-3" onClick={onClose}>
            إغلاق
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
          <KPICard title="المبيعات" value={detail.sales} format={formatSAR} icon={<CurrencyDollarIcon />} />
          <KPICard title="الفواتير" value={detail.transactions} format={(v) => Math.round(v).toLocaleString()} icon={<ReceiptTaxIcon />} />
          <KPICard title="معدل الفاتورة" value={detail.avg_ticket} format={formatSAR} />
          <KPICard title="متوسط القطع" value={detail.items_per_inv} format={(v) => v.toFixed(2)} />
          <KPICard title="حصة الفرع" value={detail.branchShare} format={(v) => `${v.toFixed(1)}%`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          <ChartCard title="⚡ مقارنة بجودة الفرع">
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50">
                <div className="text-sm font-semibold text-neutral-700 mb-1">Avg Ticket</div>
                <div className="flex items-end justify-between gap-3">
                  <div className="text-2xl font-bold text-neutral-900">{formatSAR(detail.avg_ticket)}</div>
                  <div className={`diff-badge ${diffClass(diffPct(detail.avg_ticket, bAvgTicket))}`}>
                    {bAvgTicket > 0 ? `${diffPct(detail.avg_ticket, bAvgTicket) >= 0 ? '▲' : '▼'} ${Math.abs(diffPct(detail.avg_ticket, bAvgTicket)).toFixed(0)}%` : '-'}
                  </div>
                </div>
                <div className="text-xs text-neutral-500 mt-2">
                  متوسط الفرع: <span className="font-semibold">{formatSAR(bAvgTicket)}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50">
                <div className="text-sm font-semibold text-neutral-700 mb-1">Items / Inv</div>
                <div className="flex items-end justify-between gap-3">
                  <div className="text-2xl font-bold text-neutral-900">{detail.items_per_inv.toFixed(2)}</div>
                  <div className={`diff-badge ${diffClass(diffPct(detail.items_per_inv, bAvgUPT))}`}>
                    {bAvgUPT > 0 ? `${diffPct(detail.items_per_inv, bAvgUPT) >= 0 ? '▲' : '▼'} ${Math.abs(diffPct(detail.items_per_inv, bAvgUPT)).toFixed(0)}%` : '-'}
                  </div>
                </div>
                <div className="text-xs text-neutral-500 mt-2">
                  متوسط الفرع: <span className="font-semibold">{bAvgUPT.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="📈 تطور المبيعات">
            <div className="h-[280px]">
              <LineChart data={chartData} />
            </div>
          </ChartCard>

          <ChartCard title="🎯 الهدف والتحقيق">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-600">الهدف</div>
                <div className="font-bold text-neutral-900">{targetEnabled ? formatSAR(detail.target) : '-'}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-600">التحقيق</div>
                <div className="font-bold text-neutral-900">{targetEnabled ? `${detail.achievement.toFixed(1)}%` : '-'}</div>
              </div>
              {targetEnabled && <AchievementBar percentage={detail.achievement} />}
              <div className="text-xs text-neutral-500">
                اليومية المتبقية: <span className="font-semibold text-neutral-900">{detail.dailyReq > 0 ? formatSAR(detail.dailyReq) : '-'}</span>
              </div>
            </div>
          </ChartCard>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  const user = getCurrentUser();
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [mgmtRaw, setMgmtRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');
  const [period, setPeriod] = useState<Period>('mtd_yest');
  const [selYear, setSelYear] = useState<number>(() => new Date().getFullYear());
  const [selMonth, setSelMonth] = useState<number>(() => new Date().getMonth() + 1); // 1-12
  const [search, setSearch] = useState<string>('');

  const [sortKey, setSortKey] = useState<SortKey>('sales');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [chartMetric, setChartMetric] = useState<SortKey>('sales');
  const [chartOrder, setChartOrder] = useState<'desc' | 'asc'>('desc');

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadEmployeesData(), loadManagementData()])
      .then(([e, m]) => {
        setEmpRaw(e);
        setMgmtRaw(m);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  // Role enforcement: non Admin/Auditor are scoped to their manager name
  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const monthsAr = useMemo(
    () => ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    [],
  );

  const derived = useMemo(() => {
    const historyData: Record<string, any[]> = empRaw?.history || {};
    const targetsData: Record<string, number> = empRaw?.targets || {};
    const employeeNames: Record<string, string> = empRaw?.employee_names || {};
    const storeMeta: Record<string, any> = mgmtRaw?.store_meta || {};
    const storesData: Record<string, string> = mgmtRaw?.stores || {};
    const targetsByMonth: Record<string, Record<string, number>> = normalizeTargetsByMonth(empRaw);

    const managersSet = new Set<string>();
    Object.values(storeMeta).forEach((m: any) => {
      const mgr = m?.manager;
      if (mgr && mgr !== 'online') managersSet.add(String(mgr));
    });
    const managers = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));

    const branches = Object.keys(historyData || {}).sort((a, b) => (storesData[a] || a).localeCompare(storesData[b] || b, 'ar'));

    // ===== Date logic (matches employees.html) =====
    const today = new Date();
    const todayStr = toLocalYMD(today);
    const todayYear = today.getFullYear();
    const todayMonth0 = today.getMonth(); // 0-11
    const todayDay = today.getDate();
    const todayVal = todayYear * 10000 + (todayMonth0 + 1) * 100 + todayDay;

    const prevMonthDate = new Date(todayYear, todayMonth0 - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth0 = prevMonthDate.getMonth();

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalYMD(yesterday);
    const yesterdayDay = yesterday.getDate();

    const normDate = (s: unknown) => String(s || '').substring(0, 10);

    const checkPeriod = (d: Date, dateStr: string) => {
      // 0 none, 1 current, 2 previous
      const dYear = d.getFullYear();
      const dMonth0 = d.getMonth();
      const dDay = d.getDate();
      const dVal = dYear * 10000 + (dMonth0 + 1) * 100 + dDay;
      const dNorm = normDate(dateStr);

      // current
      if (period === 'mtd') {
        if (dYear === todayYear && dMonth0 === todayMonth0 && dVal <= todayVal) return 1;
      } else if (period === 'mtd_yest') {
        if (dYear === todayYear && dMonth0 === todayMonth0 && dVal < todayVal) return 1;
      } else if (period === 'month') {
        if (dYear === selYear && dMonth0 === selMonth - 1) return 1;
      } else if (period === 'yesterday') {
        if (dNorm === yesterdayStr) return 1;
      } else if (period === 'today') {
        if (dNorm === todayStr) return 1;
      }

      // previous
      const prevYearForMode = period === 'month' ? selYear - 1 : prevYear;
      const prevMonthForMode = period === 'month' ? selMonth - 1 : prevMonth0;

      if (dYear === prevYearForMode && dMonth0 === prevMonthForMode) {
        if (period === 'mtd') {
          if (dDay <= todayDay) return 2;
        } else if (period === 'mtd_yest') {
          if (dDay <= yesterdayDay) return 2;
        } else if (period === 'month') {
          return 2;
        } else if (period === 'yesterday') {
          if (dDay === yesterdayDay) return 2;
        } else if (period === 'today') {
          if (dDay === todayDay) return 2;
        }
      }

      return 0;
    };

    const resolveTarget = (empId: string) => {
      const id = String(empId || '').trim();
      if (!id) return 0;
      const candidates = [id, id.padStart(4, '0'), String(parseInt(id, 10))].filter(Boolean);

      // For month filter, prefer that month target
      if (period === 'month') {
        const monthKey = `${selYear}-${pad2(selMonth)}`;
        const tbm = targetsByMonth[monthKey];
        for (const c of candidates) {
          const v = tbm?.[c];
          if (v != null) return safeNum(v);
        }
        return 0;
      }

      // Default: current month target
      for (const c of candidates) {
        const v = targetsData[c];
        if (v != null) return safeNum(v);
      }

      // Fallback to current month in monthly targets
      const curMonthKey = `${todayYear}-${pad2(todayMonth0 + 1)}`;
      const tbm = targetsByMonth[curMonthKey];
      for (const c of candidates) {
        const v = tbm?.[c];
        if (v != null) return safeNum(v);
      }
      return 0;
    };

    const branchStats: BranchStats = {};
    const employeeDailyMaps: EmployeeDailyMaps = {};

    // Aggregate employee data
    const empAgg: Record<string, any> = {};

    for (const [storeCode, records] of Object.entries(historyData)) {
      if (!branchStats[storeCode]) branchStats[storeCode] = { current: 0, prev: 0, transactions: 0, items: 0 };

      for (const rec of records || []) {
        // Data Format: [Date, NameOrId, Sales, Trans, Items, MaxTicket]
        const date = rec?.[0];
        const rawName = rec?.[1];
        const sales = safeNum(rec?.[2]);
        const trans = safeNum(rec?.[3]);
        const items = safeNum(rec?.[4]);
        const maxTicket = safeNum(rec?.[5]);

        const dNorm = normDate(date);
        if (!dNorm) continue;
        const dObj = new Date(dNorm);
        if (Number.isNaN(dObj.getTime())) continue;

        const pStatus = checkPeriod(dObj, dNorm);
        if (pStatus === 0) continue;

        if (pStatus === 1) {
          branchStats[storeCode].current += sales;
          branchStats[storeCode].transactions += trans;
          branchStats[storeCode].items += items;
        } else if (pStatus === 2) {
          branchStats[storeCode].prev += sales;
        }

        let empId = String(rawName || '');
        let empName = String(rawName || '');
        if (empId.includes('-')) {
          const parts = empId.split('-');
          empId = parts[0].trim();
          empName = (parts[1] || '').trim() || empId;
        }
        if (!empId) continue;
        if (empName === 'مرتجع') continue;

        empName = resolveEmployeeName(empId, empName, employeeNames);

        const key = empId;

        if (pStatus === 1) {
          if (!employeeDailyMaps[key]) employeeDailyMaps[key] = {};
          if (!employeeDailyMaps[key][dNorm]) employeeDailyMaps[key][dNorm] = { date: dNorm, sales: 0, inv: 0, items: 0 };
          employeeDailyMaps[key][dNorm].sales += sales;
          employeeDailyMaps[key][dNorm].inv += trans;
          employeeDailyMaps[key][dNorm].items += items;
        }

        if (!empAgg[key]) {
          empAgg[key] = {
            id: empId,
            name: empName,
            storeCode,
            storeName: storesData[storeCode] || storeCode,
            sales: 0,
            prevSales: 0,
            transactions: 0,
            items: 0,
            max_ticket: 0,
            target: resolveTarget(empId),
            storeStats: {} as Record<string, number>,
            latestDates: {} as Record<string, string>,
          };
        }

        // Track store stats for primary-store detection (transfers)
        if (pStatus === 1) {
          if (!empAgg[key].storeStats[storeCode]) empAgg[key].storeStats[storeCode] = 0;
          empAgg[key].storeStats[storeCode] += sales;
          if (sales > 0) {
            if (!empAgg[key].latestDates[storeCode] || dNorm > empAgg[key].latestDates[storeCode]) {
              empAgg[key].latestDates[storeCode] = dNorm;
            }
          }
        }

        if (pStatus === 1) {
          empAgg[key].sales += sales;
          empAgg[key].transactions += trans;
          empAgg[key].items += items;
          if (maxTicket > empAgg[key].max_ticket) empAgg[key].max_ticket = maxTicket;
        } else if (pStatus === 2) {
          empAgg[key].prevSales += sales;
        }
      }
    }

    // Determine primary store + apply filters
    let empList: EmployeeAgg[] = Object.values(empAgg)
      .map((e: any) => {
        let bestStore = e.storeCode;
        let latest = '';
        for (const [sCode, dStr] of Object.entries(e.latestDates || {})) {
          if (String(dStr) > latest) {
            latest = String(dStr);
            bestStore = String(sCode);
          }
        }
        e.storeCode = bestStore;
        e.storeName = storesData[bestStore] || bestStore;
        return e;
      })
      .filter((e: any) => {
        if (branch !== 'all' && String(e.storeCode) !== branch) return false;
        if (effectiveManager !== 'all') {
          const meta = storeMeta[e.storeCode];
          if (!meta || String(meta.manager) !== effectiveManager) return false;
        }
        // Filter non-active in period
        return e.sales > 0 || e.transactions > 0;
      })
      .map((e: any) => {
        const meta = storeMeta[e.storeCode];
        const mgr = meta?.manager ? String(meta.manager) : 'غير معيّن';

        const avg_ticket = e.transactions > 0 ? e.sales / e.transactions : 0;
        const items_per_inv = e.transactions > 0 ? Math.abs(e.items) / e.transactions : 0;

        const showTarget = period === 'mtd' || period === 'mtd_yest' || period === 'month';
        const achievement = showTarget && e.target > 0 ? (e.sales / e.target) * 100 : 0;

        const bStats = branchStats[e.storeCode];
        const branchTotalCurr = bStats ? bStats.current : 0;
        const branchTotalPrev = bStats ? bStats.prev : 0;
        const branchShare = branchTotalCurr > 0 ? (e.sales / branchTotalCurr) * 100 : 0;
        const prevShare = branchTotalPrev > 0 ? (e.prevSales / branchTotalPrev) * 100 : 0;
        const shareGrowth = branchShare - prevShare;

        return {
          id: String(e.id),
          name: String(e.name),
          storeCode: String(e.storeCode),
          storeName: String(e.storeName),
          manager: mgr,
          sales: safeNum(e.sales),
          prevSales: safeNum(e.prevSales),
          transactions: safeNum(e.transactions),
          items: safeNum(e.items),
          max_ticket: safeNum(e.max_ticket),
          target: safeNum(e.target),
          achievement: safeNum(achievement),
          avg_ticket,
          items_per_inv,
          branchShare,
          shareGrowth,
          dailyReq: 0,
        } satisfies EmployeeAgg;
      });

    // search filter
    const sTerm = search.trim().toLowerCase();
    if (sTerm) empList = empList.filter((e) => e.name.toLowerCase().includes(sTerm));

    // Daily req logic (only meaningful for current month)
    const todayForDaily = new Date();
    const lastDayOfMonth = new Date(todayForDaily.getFullYear(), todayForDaily.getMonth() + 1, 0).getDate();
    let remainingDays = lastDayOfMonth - todayForDaily.getDate() + 1;
    if (period === 'month' && (selYear !== todayForDaily.getFullYear() || selMonth !== todayForDaily.getMonth() + 1)) remainingDays = 0;
    empList = empList.map((e) => {
      if ((period === 'mtd' || period === 'month') && e.target > e.sales && remainingDays > 0) {
        return { ...e, dailyReq: (e.target - e.sales) / remainingDays };
      }
      return e;
    });

    // Sort
    const sorted = [...empList].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name' || sortKey === 'storeName') {
        const cmp = String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'ar');
        return cmp * dir;
      }
      const va = safeNum((a as any)[sortKey]);
      const vb = safeNum((b as any)[sortKey]);
      return (vb - va) * dir;
    });

    // totals
    const totalSales = sorted.reduce((s, e) => s + e.sales, 0);
    const totalTarget = sorted.reduce((s, e) => s + ((period === 'mtd' || period === 'month' || period === 'mtd_yest') ? e.target : 0), 0);
    const totalEmployees = sorted.length;
    const topEmployee = sorted.length ? [...sorted].sort((a, b) => b.sales - a.sales)[0] : null;

    // Chart top10 list
    const chartSorted = [...sorted].sort((a, b) => {
      const va = safeNum((a as any)[chartMetric]);
      const vb = safeNum((b as any)[chartMetric]);
      return chartOrder === 'desc' ? vb - va : va - vb;
    });
    const top10 = chartSorted.slice(0, 10);

    // Group by manager
    const byManager: Record<string, EmployeeAgg[]> = {};
    for (const e of sorted) {
      const m = e.manager || 'غير معيّن';
      if (!byManager[m]) byManager[m] = [];
      byManager[m].push(e);
    }

    return {
      managers,
      branches,
      branchStats,
      employeeDailyMaps,
      employees: sorted,
      byManager,
      totals: { totalSales, totalTarget, totalEmployees, topEmployee },
      top10,
      labels: { todayStr, yesterdayStr },
    };
  }, [
    branch,
    chartMetric,
    chartOrder,
    effectiveManager,
    empRaw,
    mgmtRaw,
    monthsAr,
    period,
    search,
    selMonth,
    selYear,
    sortDir,
    sortKey,
    user?.role,
  ]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return derived.employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [derived.employees, selectedEmployeeId]);

  const targetEnabled = period === 'mtd' || period === 'mtd_yest' || period === 'month';
  const periodLabel = useMemo(() => {
    if (period === 'today') return `اليوم (${derived.labels.todayStr})`;
    if (period === 'yesterday') return `أمس (${derived.labels.yesterdayStr})`;
    if (period === 'mtd') return 'الشهر الحالي (MTD)';
    if (period === 'mtd_yest') return 'من بداية الشهر إلى أمس';
    return `شهر محدد: ${monthsAr[selMonth - 1] || selMonth} ${selYear}`;
  }, [derived.labels.todayStr, derived.labels.yesterdayStr, monthsAr, period, selMonth, selYear]);

  const handleHeaderSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(k);
      setSortDir(k === 'name' || k === 'storeName' ? 'asc' : 'desc');
    }
  };

  if (err) {
    return <div className="p-6 bg-white rounded-xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  }
  if (!empRaw || !mgmtRaw) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  const { totals } = derived;
  const totalAch = totals.totalTarget > 0 ? (totals.totalSales / totals.totalTarget) * 100 : 0;

  return (
    <div className="space-y-6 relative min-h-[400px]">
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className={`${isAdminOrAuditor(user?.role) ? '' : 'hidden'}`}>
            <div className="text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</div>
            <select className="input" value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value="all">الكل</option>
              {derived.managers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفرع</div>
            <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {derived.branches.map((code) => (
                <option key={code} value={code}>
                  {mgmtRaw?.stores?.[code] || code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفترة</div>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="today">اليوم</option>
              <option value="mtd">الشهر الحالي (MTD)</option>
              <option value="mtd_yest">من بداية الشهر إلى أمس</option>
              <option value="month">شهر محدد</option>
              <option value="yesterday">أمس فقط</option>
            </select>
          </div>

          {period === 'month' ? (
            <>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">الشهر</div>
                <select className="input" value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}>
                  {monthsAr.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">السنة</div>
                <select className="input" value={selYear} onChange={(e) => setSelYear(Number(e.target.value))}>
                  {[2026, 2025, 2024].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="lg:col-span-2">
              <div className="text-xs font-semibold text-neutral-500 mb-1">بحث موظف</div>
              <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الموظف..." />
            </div>
          )}

          <div className="lg:col-span-5 grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">ترتيب حسب</div>
              <select
                className="input"
                value={sortKey}
                onChange={(e) => {
                  const k = e.target.value as SortKey;
                  setSortKey(k);
                  setSortDir(k === 'name' || k === 'storeName' ? 'asc' : 'desc');
                }}
              >
                <option value="sales">المبيعات</option>
                <option value="achievement">نسبة التحقيق %</option>
                <option value="transactions">الفواتير</option>
                <option value="avg_ticket">معدل الفاتورة</option>
                <option value="items_per_inv">متوسط القطع</option>
                <option value="branchShare">حصة الفرع %</option>
                <option value="shareGrowth">تطور الحصة</option>
                <option value="target">الهدف</option>
                <option value="dailyReq">اليومية المتبقية</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">بحث موظف</div>
              <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الموظف..." />
            </div>
            <div className="text-sm font-semibold text-neutral-600 flex items-end">
              <div className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50">
                <div className="text-xs text-neutral-500">الفترة الحالية</div>
                <div className="text-neutral-900">{periodLabel}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="إجمالي الموظفين" value={totals.totalEmployees} format={(v) => Math.round(v).toLocaleString()} icon={<UserGroupIcon />} />
        <KPICard title="إجمالي المبيعات" value={totals.totalSales} format={formatSAR} icon={<CurrencyDollarIcon />} />
        <KPICard
          title={targetEnabled && totals.totalTarget > 0 ? 'نسبة تحقيق الهدف' : 'متوسط مبيعات/موظف'}
          value={targetEnabled && totals.totalTarget > 0 ? totalAch : totals.totalEmployees > 0 ? totals.totalSales / totals.totalEmployees : 0}
          format={(v) => (targetEnabled && totals.totalTarget > 0 ? `${v.toFixed(1)}%` : formatSAR(v))}
          icon={<ReceiptTaxIcon />}
        />
        <KPICard
          title="أعلى موظف"
          value={totals.topEmployee?.sales || 0}
          format={(v) => `${totals.topEmployee?.name || '-'} · ${formatSAR(v)}`}
          icon={<CurrencyDollarIcon />}
        />
      </div>

      {/* Top 10 */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="text-lg font-bold text-neutral-900">📊 تحليل الموظفين (Top 10)</div>
          <div className="flex flex-wrap gap-2">
            <select className="input" value={chartMetric} onChange={(e) => setChartMetric(e.target.value as SortKey)}>
              <option value="sales">المبيعات</option>
              <option value="achievement">نسبة التحقيق %</option>
              <option value="max_ticket">أعلى قيمة فاتورة</option>
              <option value="avg_ticket">معدل الفاتورة</option>
              <option value="items_per_inv">متوسط القطع</option>
            </select>
            <select className="input" value={chartOrder} onChange={(e) => setChartOrder(e.target.value as 'asc' | 'desc')}>
              <option value="desc">الأعلى (Top 10)</option>
              <option value="asc">الأقل (Bottom 10)</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th w-[60px] text-center">#</th>
                <th className="th">الموظف</th>
                <th className="th text-left">الفرع</th>
                <th className="th text-left">القيمة</th>
              </tr>
            </thead>
            <tbody>
              {derived.top10.map((e, idx) => {
                const metricVal = safeNum((e as any)[chartMetric]);
                const display =
                  chartMetric === 'achievement'
                    ? `${metricVal.toFixed(1)}%`
                    : chartMetric === 'items_per_inv'
                      ? metricVal.toFixed(2)
                      : formatSAR(metricVal);
                return (
                  <tr key={`${e.id}-${idx}`} className="hover:bg-orange-50 cursor-pointer" onClick={() => setSelectedEmployeeId(e.id)}>
                    <td className="td text-center text-neutral-500">{idx + 1}</td>
                    <td className="td font-semibold text-neutral-900">{e.name}</td>
                    <td className="td text-neutral-600">{e.storeName}</td>
                    <td className="td font-bold text-orange-600">{display}</td>
                  </tr>
                );
              })}
              {derived.top10.length === 0 && (
                <tr>
                  <td className="td text-center text-neutral-500" colSpan={4}>
                    لا توجد بيانات بعد تطبيق الفلاتر.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leaderboards by manager */}
      <div className="space-y-6">
        <div className="text-lg font-bold text-neutral-900">🏆 ترتيب الموظفين (Leaderboard)</div>
        {Object.keys(derived.byManager)
          .sort((a, b) => a.localeCompare(b, 'ar'))
          .map((m) => {
            const list = derived.byManager[m] || [];
            const storesCount = new Set(list.map((e) => e.storeCode)).size;
            const mTotal = list.reduce((s, e) => s + e.sales, 0);
            return (
              <div key={m} className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
                <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-neutral-900">{m}</div>
                      <div className="text-sm text-neutral-600 mt-1">
                        عدد الفروع: {storesCount} · الموظفين: {list.length}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-extrabold text-neutral-900">{formatSAR(mTotal)}</div>
                      <div className="text-xs text-neutral-500">إجمالي المبيعات</div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="th w-[70px] text-center">#</th>
                        <SortableTh label="الموظف" sortKey="name" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} />
                        <SortableTh label="الفرع" sortKey="storeName" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} className="hidden md:table-cell" />
                        <SortableTh label="المبيعات" sortKey="sales" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} />
                        <SortableTh label="حصة الفرع %" sortKey="branchShare" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} />
                        <SortableTh label="تطور الحصة" sortKey="shareGrowth" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} />
                        <SortableTh label="الهدف" sortKey="target" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} />
                        <SortableTh label="التحقيق %" sortKey="achievement" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} />
                        <SortableTh label="اليومية المتبقية" sortKey="dailyReq" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} />
                        <SortableTh label="الفواتير" sortKey="transactions" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} className="hidden md:table-cell" />
                        <SortableTh label="معدل الفاتورة" sortKey="avg_ticket" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} className="hidden md:table-cell" />
                        <SortableTh label="متوسط القطع" sortKey="items_per_inv" activeKey={sortKey} direction={sortDir} onClick={handleHeaderSort} className="hidden md:table-cell" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((e, idx) => {
                        const rank = idx + 1;
                        const rankClass =
                          rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
                        return (
                          <tr key={`${e.id}-${e.storeCode}`} className="hover:bg-orange-50 cursor-pointer" onClick={() => setSelectedEmployeeId(e.id)}>
                            <td className="td text-center">
                              <span className={`rank-badge ${rankClass}`}>{rank}</span>
                            </td>
                            <td className="td">
                              <div className="font-semibold text-orange-700 underline">{e.name}</div>
                              <div className="text-xs text-neutral-500 md:hidden">{e.storeName}</div>
                            </td>
                            <td className="td hidden md:table-cell text-neutral-600">{e.storeName}</td>
                            <td className="td font-bold text-green-700">{formatSAR(e.sales)}</td>
                            <td className="td text-center">
                              <div className="w-[90px] mx-auto">
                                <div className="w-full bg-neutral-200 rounded-full h-2">
                                  <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, e.branchShare))}%` }} />
                                </div>
                                <div className="text-xs text-neutral-500 mt-1">{e.branchShare.toFixed(1)}%</div>
                              </div>
                            </td>
                            <td className={`td text-center font-bold ${e.shareGrowth >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {e.shareGrowth > 0 ? '▲' : e.shareGrowth < 0 ? '▼' : '-'} {Math.abs(e.shareGrowth).toFixed(1)}%
                            </td>
                            <td className="td text-center">{targetEnabled ? formatSAR(e.target) : '-'}</td>
                            <td className="td text-center">
                              {targetEnabled && e.target > 0 ? (
                                <span className={`font-bold ${e.achievement >= 100 ? 'text-green-700' : e.achievement >= 80 ? 'text-amber-700' : 'text-red-600'}`}>
                                  {e.achievement.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-neutral-400">-</span>
                              )}
                            </td>
                            <td className="td text-center font-bold text-red-600">{e.dailyReq > 0 ? formatSAR(e.dailyReq) : '-'}</td>
                            <td className="td hidden md:table-cell text-center">{Math.round(e.transactions).toLocaleString()}</td>
                            <td className="td hidden md:table-cell text-center">{formatSAR(e.avg_ticket)}</td>
                            <td className="td hidden md:table-cell text-center">{e.items_per_inv.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                      {list.length === 0 && (
                        <tr>
                          <td className="td text-center text-neutral-500" colSpan={12}>
                            لا توجد بيانات موظفين بعد تطبيق الفلاتر.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
      </div>

      <EmployeeDetailsModal
        open={!!selectedEmployee}
        employee={selectedEmployee}
        branchStats={derived.branchStats}
        dailyMaps={derived.employeeDailyMaps}
        onClose={() => setSelectedEmployeeId(null)}
        periodLabel={periodLabel}
        targetEnabled={targetEnabled}
      />
    </div>
  );
}

