import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadEmployeeProductsData, loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { KPICard } from '../components/DashboardComponents';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { SalesIcon, PremiumTargetIcon, VisitorsIcon } from '../components/Icons';
import * as XLSX from 'xlsx';
import EmployeeCompareModal from '../components/EmployeeCompareModal';
import {
  getMarch2026TargetMetrics,
  getEmployeeTargetForEffectiveDate,
  dateWithinMarchPhaseSalesBounds,
  sumEmployeeTargetForDateRange,
} from '../utils/march2026Targets';

type Period = 'today' | 'yesterday' | 'mtd' | 'month' | 'custom';
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

/** نافذة منبثقة لتفاصيل الموظف */
function EmployeeDetailModal({
  open,
  employee: detail,
  branchStats,

  onClose,
  periodLabel,
  rangeStart,
  rangeEnd,
  targetEnabled,
  empRaw, // New prop for sales history
  empProductsRaw,
  productsPeriodKey,
}: {
  open: boolean;
  employee: EmployeeAgg | null;
  branchStats: BranchStats;

  periodLabel: string;
  rangeStart: string;
  rangeEnd: string;
  targetEnabled: boolean;
  empRaw: any;
  empProductsRaw: any;
  productsPeriodKey: 'mtd' | 'yest' | '7d' | '14d' | '30d';
  onClose: () => void;
}) {

  const employeeDailySales = useMemo(() => {
    if (!open || !detail || !empRaw || !rangeStart || !rangeEnd) return [];
    const historyData: Record<string, any[]> = empRaw?.history || {};
    const idRaw = String(detail.id || '').trim();
    const idClean = idRaw.replace(/^0+/, '');
    const idPadded = idRaw.padStart(4, '0');
    const matchesEmployee = (rawName: unknown) => {
      const raw = String(rawName || '').trim();
      if (!raw) return false;
      const empPart = raw.includes('-') ? raw.split('-')[0].trim() : raw;
      const empClean = empPart.replace(/^0+/, '');
      return empPart === idRaw || empPart === idPadded || empClean === idClean;
    };

    const currByDate: Record<string, { sales: number; trans: number; items: number }> = {};

    let d = new Date(rangeStart);
    const end = new Date(rangeEnd);
    while (d <= end) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const currDate = `${y}-${m}-${day}`;
      currByDate[currDate] = { sales: 0, trans: 0, items: 0 };
      d.setDate(d.getDate() + 1);
    }

    Object.values(historyData).forEach((records) => {
      (records || []).forEach((rec: any[]) => {
        const recDate = String(rec?.[0] || '').substring(0, 10);
        if (!recDate || !matchesEmployee(rec?.[1])) return;
        const sales = safeNum(rec?.[2]);
        const trans = safeNum(rec?.[3]);
        const items = safeNum(rec?.[4]);
        if (recDate >= rangeStart && recDate <= rangeEnd) {
          currByDate[recDate].sales += sales;
          currByDate[recDate].trans += trans;
          currByDate[recDate].items += items;
        }
      });
    });

    return Object.keys(currByDate)
      .sort((a, b) => a.localeCompare(b))
      .map((date) => {
        const sales = currByDate[date].sales;
        const trans = currByDate[date].trans;
        const items = currByDate[date].items;
        const avgTicket = trans > 0 ? sales / trans : 0;
        const itemsPerInv = trans > 0 ? items / trans : 0;
        return { date, sales, trans, avgTicket, itemsPerInv };
      })
      .reduce((acc: any[], row: any) => {
        const [yy, mm, dd] = row.date.split('-').map(Number);
        const monthDays = new Date(yy, mm, 0).getDate() || 30;
        const remainingDays = Math.max(1, monthDays - (dd || 1) + 1);
        const achievedBeforeToday = acc.reduce((s, r) => s + (r.sales || 0), 0);
        const remainingTargetBeforeToday = Math.max(0, (detail.target || 0) - achievedBeforeToday);
        const dailyTargetToday = remainingDays > 0 ? remainingTargetBeforeToday / remainingDays : 0;
        const dailyAchievement = dailyTargetToday > 0 ? (row.sales / dailyTargetToday) * 100 : 0;
        acc.push({ ...row, dailyTargetToday, dailyAchievement });
        return acc;
      }, []);
  }, [open, detail, empRaw, rangeStart, rangeEnd]);

  const employeeProductsSnapshot = useMemo(() => {
    if (!open || !detail || !empProductsRaw?.periods) return { categories: [], items: [] };
    const periods = empProductsRaw.periods || {};
    const scoped = periods[productsPeriodKey] || periods.mtd || {};
    const empBlock = scoped?.[String(detail.id)] || scoped?.[String(detail.id).padStart(4, '0')] || null;
    const categories = Array.isArray(empBlock?.categories) ? empBlock.categories : [];
    const items = Array.isArray(empBlock?.items) ? empBlock.items : [];
    return { categories, items };
  }, [open, detail, empProductsRaw, productsPeriodKey]);

  // Early return NOW, after hooks
  if (!open || !detail) return null;

  const b = branchStats[detail.storeCode];
  const bAvgTicket = b && b.transactions > 0 ? b.current / b.transactions : 0;
  const bAvgUPT = b && b.transactions > 0 ? b.items / b.transactions : 0;


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={onClose} role="dialog" aria-label="تفاصيل الموظف">
      <div className="modal-content max-w-5xl w-full my-4 max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-neutral-200 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 pb-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-neutral-900 truncate">{detail.name}</h2>
            <p className="text-sm text-neutral-500 mt-0.5">{detail.storeName} · {detail.manager} · {periodLabel}</p>
          </div>
          <button type="button" className="btn-secondary py-2 px-3" onClick={onClose} aria-label="إغلاق">إغلاق</button>
        </div>

        {/* KPIs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-neutral-500 text-sm">المبيعات الإجمالية</div>
            <div className="text-2xl font-bold text-orange-600 mt-1">{formatSAR(detail.sales)}</div>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-neutral-500 text-sm">معدل الفاتورة (ATV)</div>
            <div className="text-2xl font-bold text-neutral-900 mt-1">{formatSAR(detail.avg_ticket)}</div>
            {bAvgTicket > 0 && (
              <div className={`text-xs mt-1 ${detail.avg_ticket >= bAvgTicket ? 'text-green-600' : 'text-red-600'}`}>
                متوسط الفرع: {formatSAR(bAvgTicket)} {detail.avg_ticket >= bAvgTicket ? '▲' : '▼'}
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-neutral-500 text-sm">متوسط القطع/فاتورة</div>
            <div className="text-2xl font-bold text-neutral-900 mt-1">{detail.items_per_inv.toFixed(2)}</div>
            {bAvgUPT > 0 && (
              <div className={`text-xs mt-1 ${detail.items_per_inv >= bAvgUPT ? 'text-green-600' : 'text-red-600'}`}>
                متوسط الفرع: {bAvgUPT.toFixed(2)} {detail.items_per_inv >= bAvgUPT ? '▲' : '▼'}
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-neutral-500 text-sm">التحقيق</div>
            <div className="text-2xl font-bold text-neutral-900 mt-1">{targetEnabled ? `${detail.achievement.toFixed(1)}%` : '-'}</div>
            {targetEnabled && detail.dailyReq > 0 && (
              <div className="text-xs text-neutral-500 mt-1 border-t border-neutral-100 pt-1">
                مطلوب يومياً: <span className="font-bold text-neutral-800">{formatSAR(detail.dailyReq)}</span>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-neutral-500 text-sm">مساهمة مبيعات الفرع</div>
            <div className="text-2xl font-bold text-neutral-900 mt-1">{detail.branchShare.toFixed(1)}%</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 overflow-hidden mt-6">
          <h3 className="text-lg font-bold text-neutral-900 mb-4">تحليل الموظف 360 — الفئات والمنتجات</h3>
          {employeeProductsSnapshot.categories.length === 0 && employeeProductsSnapshot.items.length === 0 ? (
            <div className="text-center text-neutral-400 py-6">لا توجد بيانات منتجات لهذا الموظف ضمن الفترة.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-neutral-200 overflow-hidden">
                <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200 font-semibold text-neutral-800">Top 5 الفئات</div>
                <div className="p-3 space-y-2">
                  {employeeProductsSnapshot.categories
                    .slice()
                    .sort((a: any, b: any) => safeNum(b.qty) - safeNum(a.qty))
                    .slice(0, 5)
                    .map((c: any, idx: number) => (
                      <div key={`${c?.name || idx}`} className="flex items-center justify-between text-sm">
                        <span className="text-neutral-700 truncate">{String(c?.name || '-')}</span>
                        <span className="font-bold text-neutral-900 dir-ltr">{Math.round(safeNum(c?.qty)).toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 overflow-hidden">
                <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200 font-semibold text-neutral-800">Top 5 المنتجات</div>
                <div className="p-3 space-y-2">
                  {employeeProductsSnapshot.items
                    .slice()
                    .sort((a: any, b: any) => safeNum(b.qty) - safeNum(a.qty))
                    .slice(0, 5)
                    .map((it: any, idx: number) => (
                      <div key={`${it?.id || idx}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-neutral-700 truncate" title={String(it?.name || '-')}>{String(it?.name || '-')}</span>
                        <span className="font-bold text-neutral-900 dir-ltr whitespace-nowrap">{Math.round(safeNum(it?.qty)).toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <span>📅</span> تفاصيل الأيام ({rangeStart} → {rangeEnd})
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-neutral-800 text-white">
                  <th className="th text-right">التاريخ</th>
                  <th className="th text-center">المبيعات</th>
                  <th className="th text-center">اليومية لهذا اليوم</th>
                  <th className="th text-center">تحقيق اليومية %</th>
                  <th className="th text-center">الفواتير</th>
                  <th className="th text-center">متوسط الفاتورة</th>
                  <th className="th text-center">متوسط القطع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {employeeDailySales.map((row) => (
                  <tr key={row.date} className="hover:bg-neutral-50 transition-colors">
                    <td className="td font-mono font-medium text-neutral-600">{row.date}</td>
                    <td className="td text-center font-bold text-neutral-900">{formatSAR(row.sales)}</td>
                    <td className="td text-center text-neutral-600">{formatSAR(row.dailyTargetToday)}</td>
                    <td className={`td text-center font-bold ${row.dailyAchievement >= 100 ? 'text-green-600' : 'text-red-500'}`}>
                      {row.dailyAchievement.toFixed(1)}%
                    </td>
                    <td className="td text-center font-medium text-neutral-700">{Math.round(row.trans)}</td>
                    <td className="td text-center font-medium text-neutral-700">{formatSAR(row.avgTicket)}</td>
                    <td className="td text-center font-medium text-neutral-700">{row.itemsPerInv.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {(() => {
                  if (employeeDailySales.length === 0) return null;
                  const totalSales = employeeDailySales.reduce((a, r) => a + r.sales, 0);
                  const totalTrans = employeeDailySales.reduce((a, r) => a + r.trans, 0);
                  const lastDailyTarget = employeeDailySales[employeeDailySales.length - 1]?.dailyTargetToday || 0;
                  const totalDailyAchievement = detail.target > 0 ? (totalSales / detail.target) * 100 : 0;
                  const avgInv = totalTrans > 0 ? totalSales / totalTrans : 0;
                  const avgItems = totalTrans > 0 ? employeeDailySales.reduce((a, r) => a + (r.itemsPerInv * r.trans), 0) / totalTrans : 0;
                  return (
                    <tr className="bg-neutral-100 border-t-2 border-neutral-300 font-black">
                      <td className="td font-bold text-neutral-700">الإجمالي</td>
                      <td className="td text-center text-neutral-900">{formatSAR(totalSales)}</td>
                      <td className="td text-center text-neutral-600">{formatSAR(lastDailyTarget)}</td>
                      <td className={`td text-center ${totalDailyAchievement >= 100 ? 'text-green-600' : 'text-red-500'}`}>{totalDailyAchievement.toFixed(1)}%</td>
                      <td className="td text-center">{Math.round(totalTrans)}</td>
                      <td className="td text-center">{formatSAR(avgInv)}</td>
                      <td className="td text-center">{avgItems.toFixed(2)}</td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
          {employeeDailySales.length === 0 && (
            <div className="text-center text-neutral-400 py-6">لا توجد بيانات يومية لهذا الموظف ضمن الفترة المحددة.</div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" className="btn-secondary px-6" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  const user = getCurrentUser();
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [mgmtRaw, setMgmtRaw] = useState<any>(null);
  const [empProductsRaw, setEmpProductsRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>(user?.storeId || 'all');
  const [city, setCity] = useState<string>('all');
  const [storeType, setStoreType] = useState<string>('all');
  const [period, setPeriod] = useState<Period>('mtd');
  const [selYear, setSelYear] = useState<number>(() => new Date().getFullYear());
  const [selMonth, setSelMonth] = useState<number>(() => new Date().getMonth() + 1); // 1-12
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  /** آذار 2026 + MTD: نفس تقسيم صفحة العمولات — الفترة 1 (1–19) أو 2 (20–31) */
  const [marchMtdPhase, setMarchMtdPhase] = useState<'1' | '2'>('1');
  const [search, setSearch] = useState<string>('');

  const [sortKey, setSortKey] = useState<SortKey>('sales');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [chartMetric, setChartMetric] = useState<SortKey>('sales');
  const [chartOrder, setChartOrder] = useState<'desc' | 'asc'>('desc');

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Excel export states
  const [excelDropdownOpen, setExcelDropdownOpen] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetEmpList, setTargetEmpList] = useState<any[]>([]);
  const [targetSelected, setTargetSelected] = useState<Set<string>>(new Set());
  const excelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([loadEmployeesData(), loadManagementData(), loadEmployeeProductsData()])
      .then(([e, m, ep]) => {
        setEmpRaw(e);
        setMgmtRaw(m);
        setEmpProductsRaw(ep);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const eidParam = searchParams.get('eid');

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
    const employeeNames: Record<string, string> = empRaw?.employee_names || {};
    const storeMeta: Record<string, any> = mgmtRaw?.store_meta || {};
    const storesData: Record<string, string> = mgmtRaw?.stores || {};

    const managersSet = new Set<string>();
    const citiesSet = new Set<string>();
    Object.values(storeMeta).forEach((m: any) => {
      const mgr = m?.manager;
      if (mgr && mgr !== 'online') managersSet.add(String(mgr));

      // Filter cities based on selected manager
      if (effectiveManager === 'all' || String(m?.manager) === effectiveManager) {
        if (m?.city) citiesSet.add(String(m.city));
      }
    });
    const managers = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const cities = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ar'));

    const branches = Object.keys(historyData || {})
      .filter((sid) => {
        const m = storeMeta[sid];
        if (user?.role === 'BranchManager' && sid !== user?.storeId) return false;
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && String(m?.city || '') !== city) return false;
        if (storeType !== 'all') {
          const type = String(m?.type || '').toLowerCase();
          const isOnline = type === 'online' || type === 'platform' || type === 'warehouse';
          if (storeType === 'online' && !isOnline) return false;
          if (storeType === 'store' && isOnline) return false;
        }
        return true;
      })
      .sort((a, b) => (storesData[a] || a).localeCompare(storesData[b] || b, 'ar'));

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

    const normDate = (s: unknown) => String(s || '').substring(0, 10);

    function getDefaultRange(mode: Period, selYear?: number, selMonth?: number) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      if (mode === 'today') return { start: toLocalYMD(today), end: toLocalYMD(today) };
      if (mode === 'yesterday') return { start: toLocalYMD(yesterday), end: toLocalYMD(yesterday) };
      if (mode === 'mtd') {
        const endMtd = yesterday.getMonth() !== startOfCurrentMonth.getMonth() ? today : yesterday;
        return { start: toLocalYMD(startOfCurrentMonth), end: toLocalYMD(endMtd) };
      }
      if (mode === 'month' && selYear && selMonth) {
        const startOfMonth = new Date(selYear, selMonth - 1, 1);
        const endOfMonth = new Date(selYear, selMonth, 0);
        return { start: toLocalYMD(startOfMonth), end: toLocalYMD(endOfMonth) };
      }
      if (mode === 'custom') {
        const start = new Date(today);
        start.setDate(1);
        return { start: toLocalYMD(start), end: toLocalYMD(today) };
      }
      return { start: toLocalYMD(today), end: toLocalYMD(today) };
    }

    let { start: defaultRangeStart, end: defaultRangeEnd } = getDefaultRange(period, selYear, selMonth);

    const maxDateStr = (a: string, b: string) => (a >= b ? a : b);
    const minDateStr = (a: string, b: string) => (a <= b ? a : b);

    if (period === 'mtd' && todayYear === 2026 && todayMonth0 === 2) {
      const endMtd = defaultRangeEnd;
      if (marchMtdPhase === '1') {
        defaultRangeStart = maxDateStr('2026-03-01', defaultRangeStart);
        defaultRangeEnd = minDateStr('2026-03-19', endMtd);
      } else {
        defaultRangeStart = maxDateStr('2026-03-20', defaultRangeStart);
        defaultRangeEnd = minDateStr('2026-03-31', endMtd);
      }
    }

    const rangeStart = (period === 'custom' && customStart) ? customStart : defaultRangeStart;
    const rangeEnd = (period === 'custom' && customEnd) ? customEnd : defaultRangeEnd;

    const checkPeriod = (d: Date, dateStr: string) => {
      const dNorm = normDate(dateStr);
      if (period === 'custom') {
        if (dNorm >= rangeStart && dNorm <= rangeEnd) return 1;
        const [ys, ms, ds] = rangeStart.split('-').map(Number);
        const [ye, me, de] = rangeEnd.split('-').map(Number);
        const prevStart = `${ys - 1}-${String(ms).padStart(2, '0')}-${String(ds).padStart(2, '0')}`;
        const prevEnd = `${ye - 1}-${String(me).padStart(2, '0')}-${String(de).padStart(2, '0')}`;
        if (dNorm >= prevStart && dNorm <= prevEnd) return 2;
        return 0;
      }
      const dYear = d.getFullYear();
      const dMonth0 = d.getMonth();
      const dDay = d.getDate();
      const dVal = dYear * 10000 + (dMonth0 + 1) * 100 + dDay;

      if (period === 'mtd') {
        if (dNorm >= rangeStart && dNorm <= rangeEnd) return 1;
      } else if (period === 'month') {
        if (selMonth === 0) {
          // Yearly logic
          if (dYear === selYear) return 1;
        } else {
          if (dYear === selYear && dMonth0 === selMonth - 1) return 1;
        }
      } else if (period === 'yesterday') {
        if (dNorm === yesterdayStr) return 1;
      } else if (period === 'today') {
        if (dNorm === todayStr) return 1;
      }

      const prevYearForMode = period === 'month' ? selYear - 1 : prevYear;
      const prevMonthForMode = period === 'month' ? (selMonth === 0 ? -1 : selMonth - 1) : prevMonth0;
      const yesterdayDay = yesterday.getDate();

      if (period === 'month' && selMonth === 0) {
        // Compare with previous year fully
        if (dYear === prevYearForMode) return 2;
      } else if (dYear === prevYearForMode && dMonth0 === prevMonthForMode) {
        if (period === 'mtd' && dDay <= todayDay) return 2;
        if (period === 'month') return 2;
        if (period === 'yesterday' && dDay === yesterdayDay) return 2;
        if (period === 'today' && dDay === todayDay) return 2;
      }
      return 0;
    };

    /** تاريخ مرجعي لمرحلة تارجت آذار 2026 + اختيار تارجت الموظف */
    const refForEmployeeTarget = period === 'yesterday' ? yesterdayStr : period === 'today' ? todayStr : rangeEnd;
    const resolveTargetForMonth = (empId: string) =>
      period === 'custom'
        ? sumEmployeeTargetForDateRange(empRaw, empId, rangeStart, rangeEnd)
        : getEmployeeTargetForEffectiveDate(empRaw, empId, refForEmployeeTarget);

    const branchStats: BranchStats = {};

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

        // فترة مخصصة: نجمع كل المبيعات ضمن [rangeStart, rangeEnd] فقط — لا نطبّق تقسيم مراحل آذار 2026
        const skipMarchCurrent =
          period !== 'custom' &&
          refForEmployeeTarget.startsWith('2026-03') &&
          !dateWithinMarchPhaseSalesBounds(dNorm, refForEmployeeTarget);

        if (pStatus === 1 && !skipMarchCurrent) {
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
            target: resolveTargetForMonth(empId),
            storeStats: {} as Record<string, number>,
            latestDates: {} as Record<string, string>,
          };
        }

        // Track store stats for primary-store detection (transfers)
        if (pStatus === 1 && !skipMarchCurrent) {
          if (!empAgg[key].storeStats[storeCode]) empAgg[key].storeStats[storeCode] = 0;
          empAgg[key].storeStats[storeCode] += sales;
          if (sales > 0) {
            if (!empAgg[key].latestDates[storeCode] || dNorm > empAgg[key].latestDates[storeCode]) {
              empAgg[key].latestDates[storeCode] = dNorm;
            }
          }
        }

        if (pStatus === 1 && !skipMarchCurrent) {
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
        if (city !== 'all') {
          const meta = storeMeta[e.storeCode];
          if (String(meta?.city || '') !== city) return false;
        }
        // Filter non-active in period
        return e.sales > 0 || e.transactions > 0;
      })
      .map((e: any) => {
        const meta = storeMeta[e.storeCode];
        const mgr = meta?.manager ? String(meta.manager) : 'غير معيّن';

        const avg_ticket = e.transactions > 0 ? e.sales / e.transactions : 0;
        const items_per_inv = e.transactions > 0 ? Math.abs(e.items) / e.transactions : 0;

        const showTarget = period === 'mtd' || period === 'month' || period === 'custom';
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
    const targetM = getMarch2026TargetMetrics(todayForDaily);
    let remainingDays = targetM.remainingDaysInclusive;
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
    const totalTarget = sorted.reduce((s, e) => s + ((period === 'mtd' || period === 'month' || period === 'custom') ? e.target : 0), 0);
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
      cities,
      branchStats,
      employees: sorted,
      byManager,
      totals: { totalSales, totalTarget, totalEmployees, topEmployee },
      top10,
      labels: { todayStr, yesterdayStr },
      range: { start: rangeStart, end: rangeEnd },
    };
  }, [
    empRaw,
    mgmtRaw,
    effectiveManager,
    city,
    branch,
    period,
    selYear,
    selMonth,
    customStart,
    customEnd,
    marchMtdPhase,

    search,
    sortKey,
    sortDir,
    chartMetric,
    chartOrder,
    user?.role,
    user?.storeId,
    storeType,
  ]);

  // Handle eid param from global search
  useEffect(() => {
    if (eidParam && derived.employees.length > 0) {
      const targetEmp = derived.employees.find(e => e.id === eidParam);
      if (targetEmp) {
        setSelectedEmployeeId(targetEmp.id);
        // Clean up URL
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('eid');
          return next;
        }, { replace: true });
      }
    }
  }, [eidParam, derived.employees, setSearchParams]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return derived.employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [derived.employees, selectedEmployeeId]);

  const targetEnabled = period === 'mtd' || period === 'month' || period === 'custom';
  const productsPeriodKey: 'mtd' | 'yest' | '7d' | '14d' | '30d' =
    period === 'yesterday' ? 'yest' : period === 'today' ? 'yest' : period === 'custom' ? 'mtd' : period === 'month' ? 'mtd' : period;
  const periodLabel = useMemo(() => {
    if (period === 'today') return `اليوم (${derived.labels.todayStr})`;
    if (period === 'yesterday') return `أمس (${derived.labels.yesterdayStr})`;
    if (period === 'mtd') {
      const now = new Date();
      if (now.getFullYear() === 2026 && now.getMonth() === 2) {
        const rs = derived.range?.start;
        const re = derived.range?.end;
        const phaseLabel = marchMtdPhase === '1' ? 'الفترة الأولى (1–19 آذار)' : 'الفترة الثانية (20–31 آذار)';
        return `الشهر الحالي — ${phaseLabel}${rs && re ? ` · ${rs} → ${re}` : ''}`;
      }
      return 'الشهر الحالي (MTD)';
    }
    if (period === 'custom') return `فترة مخصصة: ${customStart || '...'} → ${customEnd || '...'}`;
    return `شهر محدد: ${monthsAr[selMonth - 1] || selMonth} ${selYear}`;
  }, [
    customEnd,
    customStart,
    derived.labels.todayStr,
    derived.labels.yesterdayStr,
    derived.range?.end,
    derived.range?.start,
    marchMtdPhase,
    monthsAr,
    period,
    selMonth,
    selYear,
  ]);

  useEffect(() => {
    if (period === 'custom' && (!customStart || !customEnd)) {
      const start = new Date();
      start.setDate(1);
      setCustomStart(toLocalYMD(start));
      setCustomEnd(toLocalYMD(new Date()));
    }
  }, [period]);

  // Close dropdown when clicking outside (must be before any conditional return)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (excelDropdownRef.current && !excelDropdownRef.current.contains(e.target as Node)) {
        setExcelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!empRaw || !mgmtRaw) {
    return <DashboardSkeleton />;
  }

  const handleHeaderSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(k);
      setSortDir(k === 'name' || k === 'storeName' ? 'asc' : 'desc');
    }
  };

  // Export current employee data to Excel
  const exportCurrentData = () => {
    setExcelDropdownOpen(false);
    const rows = derived.employees.map((emp: EmployeeAgg) => ({
      'رقم الموظف': emp.id,
      'اسم الموظف': emp.name,
      'الفرع': emp.storeName,
      'المدير': emp.manager,
      'المبيعات': Math.round(emp.sales),
      'الفواتير': emp.transactions,
      'معدل الفاتورة': Math.round(emp.avg_ticket),
      'أعلى فاتورة': Math.round(emp.max_ticket),
      'متوسط القطع': Number(emp.items_per_inv.toFixed(1)),
      'التارجت': Math.round(emp.target),
      'نسبة التحقيق %': emp.target > 0 ? Number(((emp.sales / emp.target) * 100).toFixed(1)) : 0,
      'المطلوب يومياً': Math.round(emp.dailyReq),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 20 },
      { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 15 }, { wch: 14 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees Data');
    XLSX.writeFile(wb, `employees_data_${toLocalYMD(new Date())}.xlsx`);
  };

  // Open target template modal
  const openTargetTemplateModal = () => {
    setExcelDropdownOpen(false);
    const emps = derived.employees as EmployeeAgg[];
    const list = emps.map((e) => ({
      id: e.id,
      name: e.name,
      storeId: e.storeCode,
      storeName: e.storeName,
      mtdSales: e.sales,
      target: e.target,
      active: e.sales > 0,
    }));
    setTargetEmpList(list);
    setTargetSelected(new Set(list.filter((e) => e.active).map((e) => e.id)));
    setShowTargetModal(true);
  };

  // Export target template Excel
  const exportTargetTemplate = () => {
    const selectedEmps = targetEmpList.filter((e: any) => targetSelected.has(e.id));
    if (selectedEmps.length === 0) { alert('الرجاء اختيار موظف واحد على الأقل'); return; }

    const data = selectedEmps.map((e: any) => ({
      'Employee ID': String(e.id).replace(/unknown/gi, '').replace(/unkown/gi, '').trim(),
      'Employee Name': e.name,
      'Store': e.storeName,
      'Current Target': e.target || '',
      'Target Amount': '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Targets Template');

    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthName = nextMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    XLSX.writeFile(wb, `Target_Template_${monthName}.xlsx`);
    setShowTargetModal(false);
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
      {/* Header export bar */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowCompareModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl text-sm transition-colors"
        >
          <span>⚖️</span> مقارنة موظفين
        </button>
        <div ref={excelDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setExcelDropdownOpen(!excelDropdownOpen)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-xl text-sm transition-colors"
          >
            <span>📊</span> تصدير Excel <span className="text-xs opacity-70">▼</span>
          </button>
          {excelDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-neutral-200 z-50 min-w-[220px] overflow-hidden">
              <button
                type="button"
                onClick={exportCurrentData}
                className="w-full text-right px-4 py-3 hover:bg-neutral-50 text-sm font-medium text-neutral-800 border-b border-neutral-100 flex items-center gap-2"
              >
                <span>📋</span> البيانات الحالية
              </button>
              <button
                type="button"
                onClick={openTargetTemplateModal}
                className="w-full text-right px-4 py-3 hover:bg-neutral-50 text-sm font-medium text-neutral-800 flex items-center gap-2"
              >
                <span>🎯</span> قالب تارجت الشهر القادم
              </button>
            </div>
          )}
        </div>
      </div>

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

          <div className={`${user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}`}>
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

          <div className={`${user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}`}>
            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {(derived.cities || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">نوع المعرض</div>
            <select className="input" value={storeType} onChange={(e) => setStoreType(e.target.value)}>
              <option value="all">الكل</option>
              <option value="store">المعارض فقط</option>
              <option value="online">الأونلاين فقط</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفترة</div>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="mtd">الشهر الحالي (MTD)</option>
              <option value="month">شهر محدد</option>
              <option value="custom">فترة مخصصة</option>
            </select>
          </div>

          {period === 'mtd' && new Date().getFullYear() === 2026 && new Date().getMonth() === 2 && (
            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-neutral-500 mb-1">فترة آذار (مثل العمولات)</div>
              <div className="flex items-center gap-2 bg-orange-50/80 p-2 rounded-xl border border-orange-200">
                <span className="text-xs font-semibold text-orange-800 whitespace-nowrap shrink-0">تقسيم الشهر</span>
                <select
                  className="input flex-1 min-w-0 bg-white font-semibold text-neutral-800 border-orange-200"
                  value={marchMtdPhase}
                  onChange={(e) => setMarchMtdPhase(e.target.value as '1' | '2')}
                >
                  <option value="1">الفترة الأولى (1–19 آذار)</option>
                  <option value="2">الفترة الثانية (20–31 آذار)</option>
                </select>
              </div>
            </div>
          )}

          {period === 'month' ? (
            <>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">الشهر</div>
                <select className="input" value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}>
                  <option value={0}>الكل (سنة كاملة)</option>
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
          ) : period === 'custom' ? (
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
        <KPICard title="إجمالي الموظفين" value={totals.totalEmployees} format={(v) => Math.round(v).toLocaleString()} icon={<VisitorsIcon />} />
        <KPICard title="إجمالي المبيعات" value={totals.totalSales} format={formatSAR} icon={<SalesIcon />} />
        <KPICard
          title={targetEnabled && totals.totalTarget > 0 ? 'نسبة تحقيق الهدف' : 'متوسط مبيعات/موظف'}
          value={targetEnabled && totals.totalTarget > 0 ? totalAch : totals.totalEmployees > 0 ? totals.totalSales / totals.totalEmployees : 0}
          format={(v) => (targetEnabled && totals.totalTarget > 0 ? `${v.toFixed(1)}%` : formatSAR(v))}
          icon={<PremiumTargetIcon />}
        />
        <KPICard
          title="أعلى موظف"
          value={totals.topEmployee?.sales || 0}
          format={(v) => `${totals.topEmployee?.name || '-'} · ${formatSAR(v)}`}
          icon={<SalesIcon />}
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
                                <div className="w-[85px] mx-auto flex flex-col items-center">
                                  <div className="w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full bg-gradient-to-r transition-all duration-500 ${e.achievement >= 100
                                        ? 'from-emerald-500 to-emerald-400'
                                        : e.achievement >= 50
                                          ? 'from-amber-500 to-amber-400'
                                          : 'from-red-500 to-red-400'
                                        }`}
                                      style={{ width: `${Math.min(100, Math.max(0, e.achievement))}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] font-bold text-neutral-600 mt-1">{e.achievement.toFixed(1)}%</div>
                                </div>
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

      {selectedEmployee && (
        <EmployeeDetailModal
          open={!!selectedEmployee}
          employee={selectedEmployee}
          branchStats={derived.branchStats}

          onClose={() => setSelectedEmployeeId(null)}
          periodLabel={periodLabel}
          rangeStart={derived.range.start}
          rangeEnd={derived.range.end}
          targetEnabled={targetEnabled}
          empRaw={empRaw}
          empProductsRaw={empProductsRaw}
          productsPeriodKey={productsPeriodKey}
        />
      )}

      {/* Employee Comparison Modal */}
      <EmployeeCompareModal
        open={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        employees={derived.employees}
      />

      {/* Target Template Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setShowTargetModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-100 bg-neutral-50">
              <h3 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
                🎯 اختيار الموظفين لقالب التارجت
              </h3>
              <p className="text-sm text-neutral-500 mt-1">اختر الموظفين الذين تريد تضمينهم في قالب الشهر القادم</p>
            </div>

            <div className="p-4 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button type="button" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200" onClick={() => setTargetSelected(new Set(targetEmpList.map((e: any) => e.id)))}>
                  تحديد الكل
                </button>
                <button type="button" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-neutral-100 text-neutral-700 hover:bg-neutral-200" onClick={() => setTargetSelected(new Set())}>
                  إلغاء الكل
                </button>
                <button type="button" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-100 text-green-700 hover:bg-green-200" onClick={() => setTargetSelected(new Set(targetEmpList.filter((e: any) => e.active).map((e: any) => e.id)))}>
                  النشطين فقط
                </button>
              </div>
              <div className="text-sm text-neutral-500">
                المحددين: <span className="font-bold text-neutral-800">{targetSelected.size}</span> من <span className="font-bold">{targetEmpList.length}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-800 text-white">
                  <tr>
                    <th className="p-2 text-center w-10">
                      <input type="checkbox" checked={targetSelected.size === targetEmpList.length && targetEmpList.length > 0} onChange={(e) => { if (e.target.checked) setTargetSelected(new Set(targetEmpList.map((emp: any) => emp.id))); else setTargetSelected(new Set()); }} />
                    </th>
                    <th className="p-2 text-right">الموظف</th>
                    <th className="p-2 text-right">الفرع</th>
                    <th className="p-2 text-center">المبيعات (MTD)</th>
                    <th className="p-2 text-center">التارجت الحالي</th>
                    <th className="p-2 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {targetEmpList.map((emp: any) => {
                    const isSelected = targetSelected.has(emp.id);
                    return (
                      <tr key={emp.id} className={`hover:bg-neutral-50 cursor-pointer ${emp.active ? '' : 'bg-red-50'}`} onClick={() => { const next = new Set(targetSelected); if (next.has(emp.id)) next.delete(emp.id); else next.add(emp.id); setTargetSelected(next); }}>
                        <td className="p-2 text-center"><input type="checkbox" checked={isSelected} readOnly /></td>
                        <td className="p-2 font-medium text-neutral-800">{emp.name}</td>
                        <td className="p-2 text-neutral-600">{emp.storeName}</td>
                        <td className="p-2 text-center font-mono">{Math.round(emp.mtdSales).toLocaleString()}</td>
                        <td className="p-2 text-center font-mono text-neutral-500">{emp.target ? Math.round(emp.target).toLocaleString() : '-'}</td>
                        <td className="p-2 text-center">
                          {emp.active
                            ? <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">نشط</span>
                            : <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-600">غير نشط</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-neutral-100 flex justify-between items-center">
              <button type="button" className="btn-secondary py-2 px-4" onClick={() => setShowTargetModal(false)}>إلغاء</button>
              <button type="button" className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl transition-colors flex items-center gap-2" onClick={exportTargetTemplate}>
                📥 تصدير المحددين ({targetSelected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

