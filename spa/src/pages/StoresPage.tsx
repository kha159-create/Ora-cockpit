import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadEmployeesData, loadManagementData, loadProductAnalysisData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { ChartCard, KPICard, PieChart } from '../components/DashboardComponents';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { SalesIcon, InvoicesIcon, VisitorsIcon, FireIcon, CustomerValueIcon } from '../components/Icons';
import { runProductValueAnalysis, safeNum } from '../services/analysisHelpers';
import StoreCompareModal from '../components/StoreCompareModal';
import { getPrevYearRange, getPrevYearDate } from '../utils/seasons';

type Mode = 'mtd' | 'yesterday' | 'today' | 'standard' | 'custom';

type StoreRow = {
  sid: string;
  name: string;
  manager: string;
  city: string;
  type: string;
  val: number;
  prevVal: number;
  target: number;
  trans: number;
  visitors: number;
  prevVisitors: number;
  growth: number;
  growthVal: number;
  ach: number;
  avgInv: number;
  dailyReq: number;
  conversion: number;
  customerValue: number;
};

type RangeStat = { s: number; t: number; i: number; target: number };

type StoreSortKey = 'name' | 'val' | 'prevVal' | 'target' | 'ach' | 'growth' | 'growthVal' | 'trans' | 'avgInv' | 'visitors' | 'prevVisitors' | 'dailyReq' | 'conversion' | 'customerValue';

function SortableTh({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
  className = '',
}: {
  label: string;
  sortKey: StoreSortKey;
  activeKey: StoreSortKey;
  direction: 'asc' | 'desc';
  onClick: (k: StoreSortKey) => void;
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  return (
    <th
      className={`th select-none cursor-pointer hover:bg-orange-100 ${className}`}
      onClick={() => onClick(sortKey)}
      title="اضغط للترتيب"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-xs ${isActive ? 'opacity-100' : 'opacity-40'}`}>
          {isActive ? (direction === 'asc' ? '↑' : '↓') : '⇅'}
        </span>
      </span>
    </th>
  );
}

type EmpRec = [string, string, number, number, number?, number?]; // [date, rawName, sales, trans, items, maxTicket]

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function toLocalYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}
function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}
function normDate(s: unknown) {
  return String(s || '').substring(0, 10);
}

function getRange(mode: Mode, standardYear: number, standardMonth: string, customStart: string, customEnd: string) {
  const now = new Date();
  const today = new Date(now);
  if (now.getHours() < 1) {
    today.setDate(now.getDate() - 1);
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let currStart: Date;
  let currEnd: Date;

  if (mode === 'mtd') {
    currStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
    currEnd = new Date(yesterday); // Standardize MTD to end at yesterday
    currEnd.setHours(23, 59, 59, 999);
  } else if (mode === 'yesterday') {
    currStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
    currEnd = new Date(yesterday);
    currEnd.setHours(23, 59, 59, 999);
  } else if (mode === 'today') {
    currStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    currEnd = new Date(today);
    currEnd.setHours(23, 59, 59, 999);
  } else if (mode === 'custom') {
    currStart = customStart ? new Date(customStart) : new Date(today.getFullYear(), today.getMonth(), 1);
    currEnd = customEnd ? new Date(customEnd) : today;
    currStart.setHours(0, 0, 0, 0);
    currEnd.setHours(23, 59, 59, 999);
  } else {
    const y = standardYear || today.getFullYear();
    if (standardMonth === 'all') {
      currStart = new Date(y, 0, 1, 0, 0, 0);
      currEnd = y === today.getFullYear() ? new Date(today) : new Date(y, 11, 31);
    } else {
      const m = Math.max(1, Math.min(12, Number(standardMonth)));
      currStart = new Date(y, m - 1, 1, 0, 0, 0);
      currEnd = new Date(y, m, 0);
    }
    currEnd.setHours(23, 59, 59, 999);
    if (currEnd > today) currEnd = new Date(today);
  }

  const startYMD = toLocalYMD(currStart);
  const endYMD = toLocalYMD(currEnd);

  // Use seasonal prev-year range (Hijri-aligned when in season)
  const seasonalPrev = getPrevYearRange(startYMD, endYMD);
  const prevStartYMD = seasonalPrev.start;
  const prevEndYMD = seasonalPrev.end;

  const prevStart = new Date(prevStartYMD + 'T00:00:00');
  const prevEnd = new Date(prevEndYMD + 'T23:59:59');

  return { currStart, currEnd, prevStart, prevEnd, startYMD, endYMD, prevStartYMD, prevEndYMD };
}

function StoreDetailsModal({
  open,
  onClose,
  store,
  mgmtRaw,
  employeesJson,
  mode,
  startYMD,
  endYMD,
  prodRaw,
}: {
  open: boolean;
  onClose: () => void;
  store: StoreRow | null;
  mgmtRaw: any;
  employeesJson: any;
  mode: Mode;
  startYMD: string;
  endYMD: string;
  prodRaw: any;
}) {
  const rangeLabel = useMemo(() => {
    if (!startYMD || !endYMD) return '-';
    if (startYMD === endYMD) return startYMD;
    return `${startYMD} → ${endYMD} `;
  }, [endYMD, startYMD]);

  const details = useMemo(() => {
    if (!store || !employeesJson) return null;
    const history: Record<string, EmpRec[]> = employeesJson?.history || {};
    const targets: Record<string, number> = employeesJson?.targets || {};
    const targetsByMonth: Record<string, Record<string, number>> = employeesJson?.targets_by_month || {};
    const monthlyTargets: Record<string, Record<string, number>> = employeesJson?.monthly_targets || {};
    const employeeNames: Record<string, string> = employeesJson?.employee_names || {};

    const rec: EmpRec[] = history?.[store.sid] || [];
    const rangeStart = startYMD;
    const rangeEnd = endYMD;

    const monthKeys: string[] = [];
    if (rangeStart && rangeEnd) {
      const s = new Date(rangeStart);
      const e = new Date(rangeEnd);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
        const cur = new Date(s.getFullYear(), s.getMonth(), 1);
        const endM = new Date(e.getFullYear(), e.getMonth(), 1);
        while (cur <= endM) {
          monthKeys.push(`${cur.getFullYear()} -${pad2(cur.getMonth() + 1)} `);
          cur.setMonth(cur.getMonth() + 1);
        }
      }
    }

    const resolveTargetForRange = (empId: string) => {
      if (!empId) return 0;
      const id = String(empId).trim();
      const cands = [id, id.padStart(4, '0')];

      let sumT = 0;
      if (monthKeys.length > 0) {
        for (const mk of monthKeys) {
          const tbm = targetsByMonth?.[mk];
          for (const c of cands) {
            const v = tbm?.[c];
            if (v != null) {
              sumT += safeNum(v);
              break;
            }
          }
          const mt = monthlyTargets?.[id] || monthlyTargets?.[id.padStart(4, '0')];
          if (mt && typeof mt === 'object') {
            const v = (mt as any)[`${mk}-01`];
            if (v != null) sumT += safeNum(v);
          }
        }
        if (sumT > 0) return sumT;
      }

      for (const c of cands) {
        if (targets[c] != null) return safeNum(targets[c]);
      }
      return 0;
    };



    const resolveName = (raw: string) => {
      let empId = raw.trim();
      let name = raw.trim();
      if (raw.includes('-')) {
        const p = raw.split('-');
        empId = p[0].trim();
        name = (p[1] || '').trim() || empId;
      }
      const hit = employeeNames?.[empId] || employeeNames?.[empId.padStart(4, '0')];
      return { empId, name: hit || name || empId };
    };

    const rangeStats: Record<string, RangeStat> = {};

    for (const r of rec) {
      const d = normDate(r?.[0]);
      const rawName = String(r?.[1] || '');
      if (!rawName || rawName === 'None' || rawName === 'null') continue;
      const salesVal = safeNum(r?.[2]);
      const transVal = safeNum(r?.[3]);

      const { empId, name } = resolveName(rawName);

      if (d && d >= rangeStart && d <= rangeEnd) {
        if (!rangeStats[name]) rangeStats[name] = { s: 0, t: 0, i: 0, target: resolveTargetForRange(empId) };
        rangeStats[name].s += salesVal;
        rangeStats[name].t += transVal;
        rangeStats[name].i += safeNum(r?.[4]);
      }
    }

    const toList = <T extends { s: number }>(obj: Record<string, T>) =>
      Object.entries(obj)
        .map(([name, st]) => ({ name, ...st }))
        .sort((a, b) => b.s - a.s);

    const dailyBreakdown: Record<string, { sales: number; trans: number; visitors: number; prevSales: number; prevVisitors: number }> = {};
    const visitorsData = mgmtRaw?.visitors || [];

    for (const r of rec) {
      const d = normDate(r?.[0]);
      if (d && d >= rangeStart && d <= rangeEnd) {
        if (!dailyBreakdown[d]) dailyBreakdown[d] = { sales: 0, trans: 0, visitors: 0, prevSales: 0, prevVisitors: 0 };
        dailyBreakdown[d].sales += safeNum(r?.[2]);
        dailyBreakdown[d].trans += safeNum(r?.[3]);
      }
    }

    visitorsData.forEach(([d, sid, v]: any[]) => {
      if (sid !== store?.sid) return;
      const dateStr = normDate(d);
      if (dateStr && dateStr >= rangeStart && dateStr <= rangeEnd) {
        if (!dailyBreakdown[dateStr]) dailyBreakdown[dateStr] = { sales: 0, trans: 0, visitors: 0, prevSales: 0, prevVisitors: 0 };
        dailyBreakdown[dateStr].visitors += safeNum(v);
      }
    });

    // Build seasonal prev-year date mapping for daily breakdown
    const currentDates = Object.keys(dailyBreakdown);
    const prevToCurrentMap: Record<string, string> = {};
    currentDates.forEach(dt => {
      const prevDt = getPrevYearDate(dt);
      prevToCurrentMap[prevDt] = dt;
    });
    const prevRange = getPrevYearRange(rangeStart, rangeEnd);

    for (const r of rec) {
      const d = normDate(r?.[0]);
      if (d && d >= prevRange.start && d <= prevRange.end) {
        const currentDateStr = prevToCurrentMap[d];
        if (currentDateStr && dailyBreakdown[currentDateStr]) {
          dailyBreakdown[currentDateStr].prevSales += safeNum(r?.[2]);
        }
      }
    }

    // Add previous year visitors for LY column
    visitorsData.forEach(([d, sid, v]: any[]) => {
      if (sid !== store?.sid) return;
      const dateStr = normDate(d);
      if (dateStr && dateStr >= prevRange.start && dateStr <= prevRange.end) {
        const currentDateStr = prevToCurrentMap[dateStr];
        if (currentDateStr) {
          if (!dailyBreakdown[currentDateStr]) dailyBreakdown[currentDateStr] = { sales: 0, trans: 0, visitors: 0, prevSales: 0, prevVisitors: 0 };
          dailyBreakdown[currentDateStr].prevVisitors += safeNum(v);
        }
      }
    });

    const dailyList = Object.entries(dailyBreakdown)
      .map(([date, stats]) => ({
        date,
        ...stats,
        growth: stats.prevSales > 0 ? ((stats.sales - stats.prevSales) / stats.prevSales) * 100 : 0,
        growthVal: stats.sales - stats.prevSales,
        avgInv: stats.trans > 0 ? stats.sales / stats.trans : 0,
        conversion: stats.visitors > 0 ? (stats.trans / stats.visitors) * 100 : 0,
        customerValue: stats.visitors > 0 ? stats.sales / stats.visitors : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const analysisMode = mode === 'yesterday' ? 'yest' : 'mtd';
    const pData = prodRaw?.periods?.[analysisMode] || prodRaw?.periods?.mtd || {};
    const catalogData = pData?.catalog || {};
    const missedByStoreMap = pData?.missed_opportunities || {};
    const branchMissed = store ? (missedByStoreMap[store.sid] || []) : [];

    const valueAnalysis = runProductValueAnalysis({
      catalog: catalogData,
      storeId: store?.sid,
    });

    const rowsForTotal = toList(rangeStats);
    const totalSAccum = rowsForTotal.reduce((s, r) => s + safeNum(r.s), 0);
    const totalTAccum = rowsForTotal.reduce((s, r) => s + safeNum(r.t), 0);
    const totalIAccum = rowsForTotal.reduce((s, r) => s + safeNum(r.i), 0);
    const avgItemsStore = totalTAccum > 0 ? totalIAccum / totalTAccum : 0;

    const missedByEmployee = (() => {
      const agg: Record<string, number> = {};
      branchMissed.forEach((m: any) => {
        const empName = m.employee || m.emp_name || m.processed_by || '';
        if (empName) {
          agg[empName] = (agg[empName] || 0) + safeNum(m.total_count || m.count || 1);
        }
      });
      return agg;
    })();

    return {
      rangeLabel,
      rangeList: rowsForTotal,
      dailyList,
      valueAnalysis,
      branchMissed,
      missedByEmployee,
      avgItemsStore,
      totalI: totalIAccum,
      totalT: totalTAccum,
      totalS: totalSAccum,
      catalog: catalogData,
      analysisMode
    };
  }, [employeesJson, endYMD, startYMD, store, prodRaw, mode, mgmtRaw]);

  // Product Mix (Store Level Interaction) - Use category keys from catalog
  const productMix = useMemo(() => {
    if (!details?.catalog) return [];

    const sid = store?.sid || '';
    // Catalog is Record<category_name, item[]>. Use the category keys for proper classification.
    const categoryTotals: Record<string, { amount: number; qty: number }> = {};
    let totalAmt = 0;
    let totalQty = 0;

    Object.entries(details.catalog || {}).forEach(([catKey, catItems]: [string, any]) => {
      if (!Array.isArray(catItems)) return;
      let catAmt = 0;
      let catQty = 0;
      catItems.forEach((item: any) => {
        const storeData = item.stores?.[sid];
        const amt = storeData ? (Number(storeData.a) || 0) : (Number(item.amount) || 0);
        const qty = storeData ? (Number(storeData.q) || 0) : (Number(item.qty) || 0);
        if (amt > 0 || qty > 0) {
          catAmt += amt;
          catQty += qty;
        }
      });
      if (catAmt > 0 || catQty > 0) {
        if (!categoryTotals[catKey]) categoryTotals[catKey] = { amount: 0, qty: 0 };
        categoryTotals[catKey].amount += catAmt;
        categoryTotals[catKey].qty += catQty;
        totalAmt += catAmt;
        totalQty += catQty;
      }
    });

    if (totalAmt === 0 && totalQty === 0) return [];

    return Object.entries(categoryTotals)
      .map(([name, data]) => ({
        name,
        value: data.amount,
        qty: data.qty,
        percentage: totalAmt > 0 ? (data.amount / totalAmt) * 100 : 0,
        qtyPercentage: totalQty > 0 ? (data.qty / totalQty) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

  }, [details?.catalog, store]);


  if (!open || !store) return null;

  return (
    <>
      <div className="modal-center-screen" onClick={onClose}>
        <div className="modal-content max-w-7xl my-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 mb-6">
            <div className="min-w-0">
              <div className="text-2xl font-bold text-neutral-900 truncate">{store.name}</div>
              <div className="text-sm text-neutral-500 mt-1">
                {store.manager || 'مدير غير محدد'} · {store.city || '-'} · {store.type || '-'}
              </div>
            </div>
            <button className="btn-secondary py-2 px-4 shadow-sm" onClick={onClose}>
              إغلاق
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <KPICard title="الهدف" value={store.target} format={formatSAR} icon={<SalesIcon />} />
            <KPICard title="المبيعات" value={store.val} format={formatSAR} icon={<SalesIcon />} />
            <KPICard title="تحقيق الهدف" value={store.ach} format={(v) => `${v.toFixed(1)}% `} showProgress progressValue={store.ach} />
            <KPICard title="قيمة العميل" value={store.customerValue} format={(v) => formatSAR(v)} icon={<CustomerValueIcon />} />
            <KPICard title="التحويل %" value={store.conversion} format={(v) => `${v.toFixed(1)}% `} icon={<FireIcon />} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* Target 100% Tracking */}
            <KPICard
              title="المتبقي للـ 100%"
              value={Math.max(0, (store.target || 0) - store.val)}
              format={formatSAR}
              icon={<FireIcon />}
              subtitle={`اليومية المطلوبة: ${formatSAR((() => {
                const todayNow = new Date();
                const daysInM = new Date(todayNow.getFullYear(), todayNow.getMonth() + 1, 0).getDate();
                const remDays = daysInM - todayNow.getDate() + 1;
                const rem = Math.max(0, (store.target || 0) - store.val);
                return remDays > 0 ? rem / remDays : 0;
              })())}`}
            />

            {/* Target 90% Tracking */}
            <KPICard
              title="المتبقي للـ 90%"
              value={Math.max(0, ((store.target || 0) * 0.9) - store.val)}
              format={formatSAR}
              icon={<SalesIcon />}
              subtitle={`اليومية المطلوبة: ${formatSAR((() => {
                const todayNow = new Date();
                const daysInM = new Date(todayNow.getFullYear(), todayNow.getMonth() + 1, 0).getDate();
                const remDays = daysInM - todayNow.getDate() + 1;
                const rem = Math.max(0, ((store.target || 0) * 0.9) - store.val);
                return remDays > 0 ? rem / remDays : 0;
              })())}`}
            />
          </div>


          <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 overflow-hidden mt-6">
            <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <span>📅</span> تفاصيل الأيام ({details?.rangeLabel || '-'})
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-neutral-800 text-white">
                    <th className="th text-right">التاريخ</th>
                    <th className="th text-center">المبيعات</th>
                    <th className="th text-center">العام الماضي</th>
                    <th className="th text-center">النمو %</th>
                    <th className="th text-center">قيمة النمو</th>
                    <th className="th text-center">الفواتير</th>
                    <th className="th text-center">متوسط الفاتورة</th>
                    <th className="th text-center">الزوار</th>
                    <th className="th text-center">زوار (LY)</th>
                    <th className="th text-center">التحويل %</th>
                    <th className="th text-center">قيمة العميل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {details?.dailyList.map((row) => (
                    <tr key={row.date} className="hover:bg-neutral-50 transition-colors">
                      <td className="td font-mono font-medium text-neutral-600">{row.date}</td>
                      <td className="td text-center font-bold text-neutral-900">{formatSAR(row.sales)}</td>
                      <td className="td text-center text-neutral-400">{formatSAR(row.prevSales)}</td>
                      <td className={`td text-center font-bold ${row.growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {row.growth >= 0 ? '+' : ''}{row.growth.toFixed(1)}%
                      </td>
                      <td className={`td text-center font-medium ${row.growthVal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {formatSAR(row.growthVal)}
                      </td>
                      <td className="td text-center font-medium text-neutral-700">{Math.round(row.trans)}</td>
                      <td className="td text-center font-medium text-neutral-700">{formatSAR(row.avgInv)}</td>
                      <td className="td text-center font-medium text-neutral-700">{Math.round(row.visitors)}</td>
                      <td className="td text-center text-neutral-400 font-medium">{Math.round(row.prevVisitors)}</td>
                      <td className="td text-center font-bold text-orange-600">{row.conversion.toFixed(1)}%</td>
                      <td className="td text-center font-bold text-blue-600">{formatSAR(row.customerValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Product Mix Widget (Moved from Employees) */}
          <div className="mt-6">
            <ChartCard title="تحليل المنتجات (نسبة المبيعات)" className="h-[400px]">
              {productMix.length === 0 ? (
                <div className="flex items-center justify-center h-full text-neutral-400">لا توجد بيانات</div>
              ) : (
                <div className="h-full flex flex-col">
                  <div className="h-[200px] flex-shrink-0">
                    <PieChart data={productMix.map(p => ({ name: p.name, value: p.value }))} />
                  </div>
                  <div className="flex-1 overflow-y-auto mt-4 custom-scrollbar">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-neutral-500 border-b border-neutral-100">
                          <th className="pb-2 text-right">المنتج</th>
                          <th className="pb-2 text-right">القيمة</th>
                          <th className="pb-2 text-right">النسبة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50">
                        {productMix.map((p) => (
                          <tr key={p.name}>
                            <td className="py-2 font-medium">{p.name}</td>
                            <td className="py-2 dir-ltr text-right">{formatSAR(p.value)}</td>
                            <td className="py-2 dir-ltr text-right font-bold text-neutral-900">{p.percentage.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </ChartCard>
          </div>
        </div>
      </div >
    </>
  );
}

export default function StoresPage() {
  const user = getCurrentUser();
  const [mgmtRaw, setMgmtRaw] = useState<any>(null);
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('mtd');
  const [standardYear, setStandardYear] = useState<number>(() => new Date().getFullYear());
  const [standardMonth, setStandardMonth] = useState<string>('all');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const [manager, setManager] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');

  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [showStoreCompare, setShowStoreCompare] = useState(false);
  const [prodRaw, setProdRaw] = useState<any>(null);
  const [storeSortKey, setStoreSortKey] = useState<StoreSortKey>('val');
  const [storeSortDir, setStoreSortDir] = useState<'asc' | 'desc'>('desc');
  const range = useMemo(() => getRange(mode, standardYear, standardMonth, customStart, customEnd), [customEnd, customStart, mode, standardMonth, standardYear]);

  const handleStoreSort = (key: StoreSortKey) => {
    if (storeSortKey === key) {
      setStoreSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setStoreSortKey(key);
      setStoreSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  useEffect(() => {
    Promise.all([loadManagementData(), loadEmployeesData(), loadProductAnalysisData()])
      .then(([m, e, p]) => {
        setMgmtRaw(m);
        setEmpRaw(e);
        setProdRaw(p);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (mode === 'custom' && !customStart && !customEnd) {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setCustomStart(toLocalYMD(startOfMonth));
      setCustomEnd(toLocalYMD(today));
    }
  }, [mode, customStart, customEnd]);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const derived = useMemo(() => {
    if (!mgmtRaw) return null;

    const raw = mgmtRaw;
    const stores: Record<string, string> = raw.stores || {};
    const meta: Record<string, any> = raw.store_meta || {};

    const managersSet = new Set<string>();
    const citiesSet = new Set<string>();
    Object.values(meta).forEach((m: any) => {
      if (m?.manager) managersSet.add(String(m.manager));

      // Filter cities based on selected manager
      if (effectiveManager === 'all' || String(m?.manager) === effectiveManager) {
        if (m?.city) citiesSet.add(String(m.city));
      }
    });

    const managersList = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const citiesList = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ar'));

    const inRange = (dStr: unknown) => {
      const d = normDate(dStr);
      return d >= range.startYMD && d <= range.endYMD;
    };
    const inPrev = (dStr: unknown) => {
      const d = normDate(dStr);
      return d >= range.prevStartYMD && d <= range.prevEndYMD;
    };

    const branchSales: Record<string, number> = {};
    const branchTrans: Record<string, number> = {};
    const branchTarget: Record<string, number> = {};
    const branchVisitors: Record<string, number> = {};
    const prevSales: Record<string, number> = {};
    const prevVisitors: Record<string, number> = {};
    const branchMonthSales: Record<string, number> = {};
    const branchMonthTarget: Record<string, number> = {};
    const todayNow = new Date();
    const curMonthStart = `${toLocalYMD(todayNow).substring(0, 8)}01`;

    (raw.sales || []).forEach((x: any[]) => {
      const [d, s, v] = x;
      const ds = normDate(d);
      if (inRange(d)) branchSales[s] = (branchSales[s] || 0) + safeNum(v);
      if (inPrev(d)) prevSales[s] = (prevSales[s] || 0) + safeNum(v);
      if (ds >= curMonthStart && ds <= toLocalYMD(todayNow)) {
        branchMonthSales[s] = (branchMonthSales[s] || 0) + safeNum(v);
      }
    });
    (raw.transactions || []).forEach((x: any[]) => {
      const [d, s, v] = x;
      if (inRange(d)) branchTrans[s] = (branchTrans[s] || 0) + safeNum(v);
    });
    (raw.targets || []).forEach((x: any[]) => {
      const [d, s, v] = x;
      const ds = normDate(d);
      if (inRange(d)) branchTarget[s] = (branchTarget[s] || 0) + safeNum(v);
      if (ds >= curMonthStart && ds <= toLocalYMD(new Date(todayNow.getFullYear(), todayNow.getMonth() + 1, 0))) {
        branchMonthTarget[s] = (branchMonthTarget[s] || 0) + safeNum(v);
      }
    });
    (raw.visitors || []).forEach((x: any[]) => {
      const [d, s, v] = x;
      if (inRange(d)) branchVisitors[s] = (branchVisitors[s] || 0) + safeNum(v);
      if (inPrev(d)) prevVisitors[s] = (prevVisitors[s] || 0) + safeNum(v);
    });

    const metaFilter = (sid: string) => {
      const m = meta[sid] || {};
      if (!isAdminOrAuditor(user?.role) && m?.manager !== user?.name) return false;
      if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
      if (city !== 'all' && String(m?.city || '') !== city) return false;
      if (type !== 'all' && String(m?.type || '') !== type) return false;
      if (branch !== 'all' && sid !== branch) return false;
      return true;
    };

    const allIds = new Set<string>([
      ...Object.keys(branchSales),
      ...Object.keys(prevSales),
      ...Object.keys(branchTarget),
      ...Object.keys(branchVisitors),
    ]);

    const list: StoreRow[] = [];
    allIds.forEach((sid) => {
      if (!metaFilter(sid)) return;
      const val = branchSales[sid] || 0;
      const prevValVal = prevSales[sid] || 0;
      const targetVal = branchTarget[sid] || 0;
      const transVal = branchTrans[sid] || 0;
      const visitorsVal = branchVisitors[sid] || 0;
      const prevVis = prevVisitors[sid] || 0;
      const growthVal = val - prevValVal;
      const growth = prevValVal > 0 ? (growthVal / prevValVal) * 100 : 0;
      const ach = targetVal > 0 ? (val / targetVal) * 100 : 0;
      const conversion = visitorsVal > 0 ? (transVal / visitorsVal) * 100 : 0;
      const customerValue = visitorsVal > 0 ? val / visitorsVal : 0;
      const avgInv = transVal > 0 ? val / transVal : 0;

      const daysInM = new Date(todayNow.getFullYear(), todayNow.getMonth() + 1, 0).getDate();
      const remDays = daysInM - todayNow.getDate() + 1;
      const mTarget = branchMonthTarget[sid] || targetVal || 0;
      const mSales = branchMonthSales[sid] || 0;
      const dailyReq = remDays > 0 && mTarget > mSales ? (mTarget - mSales) / remDays : 0;

      list.push({
        sid,
        name: stores[sid] || sid,
        manager: meta[sid]?.manager || '-',
        city: meta[sid]?.city || '-',
        type: meta[sid]?.type || '-',
        val,
        prevVal: prevValVal,
        target: targetVal,
        trans: transVal,
        visitors: visitorsVal,
        prevVisitors: prevVis,
        growth,
        growthVal,
        ach,
        avgInv,
        dailyReq,
        conversion,
        customerValue,
      });
    });

    list.sort((a, b) => (b.val || 0) - (a.val || 0));

    const totalsValues = {
      sales: list.reduce((acc, r) => acc + r.val, 0),
      trans: list.reduce((acc, r) => acc + r.trans, 0),
      visitors: list.reduce((acc, r) => acc + r.visitors, 0),
      target: list.reduce((acc, r) => acc + r.target, 0),
    };
    const achTotal = totalsValues.target > 0 ? (totalsValues.sales / totalsValues.target) * 100 : 0;

    const branchesList = Object.keys(stores)
      .filter((sid) => {
        const m = meta[sid] || {};
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && String(m?.city || '') !== city) return false;
        if (type !== 'all' && String(m?.type || '') !== type) return false;
        return true;
      })
      .sort((a, b) => (stores[a] || a).localeCompare(stores[b] || b, 'ar'));

    return { managers: managersList, cities: citiesList, branches: branchesList, list, totals: totalsValues, achTotal, rangeLabel: range.startYMD === range.endYMD ? range.startYMD : `${range.startYMD} → ${range.endYMD} ` };
  }, [branch, city, effectiveManager, manager, mgmtRaw, range, type, user?.name, user?.role]);

  useEffect(() => {
    const sid = searchParams.get('sid');
    if (sid && derived?.list.some(s => s.sid === sid)) {
      setSelectedSid(sid);
      // Optional: Clear param after opening? Usually better to keep for refresh.
    }
  }, [searchParams, derived?.list]);

  const selectedStore = useMemo(() => {
    if (!derived || !selectedSid) return null;
    return derived.list.find((s) => s.sid === selectedSid) || null;
  }, [derived, selectedSid]);

  const sortedList = useMemo(() => {
    if (!derived) return [];
    const l = [...derived.list];
    const k = storeSortKey;
    const d = storeSortDir;
    l.sort((a, b) => {
      const av = k === 'name' ? (a[k] as string) : (a[k] as number) ?? 0;
      const bv = k === 'name' ? (b[k] as string) : (b[k] as number) ?? 0;
      if (k === 'name') {
        const cmp = String(av).localeCompare(String(bv), 'ar');
        return d === 'asc' ? cmp : -cmp;
      }
      const cmp = (av as number) - (bv as number);
      return d === 'asc' ? cmp : -cmp;
    });
    return l;
  }, [derived, storeSortKey, storeSortDir]);

  if (err) {
    return <div className="p-6 bg-white rounded-xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  }
  if (!mgmtRaw || !empRaw || !prodRaw || !derived) {
    return <DashboardSkeleton />;
  }

  const monthsArNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  return (
    <div className="space-y-6 relative min-h-[400px]">
      <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-3">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">نوع التقرير</div>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="today">اليوم</option>
                <option value="yesterday">أمس</option>
                <option value="mtd">الشهر الحالي (MTD)</option>
                <option value="standard">شهر محدد</option>
                <option value="custom">فترة مخصصة</option>
              </select>
            </div>

            {mode === 'standard' && (
              <>
                <div>
                  <div className="text-xs font-semibold text-neutral-500 mb-1">الشهر</div>
                  <select className="input px-2" value={standardMonth} onChange={(e) => setStandardMonth(e.target.value)}>
                    <option value="all">كامل السنة</option>
                    {monthsArNames.map((m, i) => (<option key={m} value={String(i + 1)}>{m}</option>))}
                  </select>
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-500 mb-1">السنة</div>
                  <select className="input px-2" value={standardYear} onChange={(e) => setStandardYear(Number(e.target.value))}>
                    {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </>
            )}

            {mode === 'custom' && (
              <>
                <div>
                  <div className="text-xs font-semibold text-neutral-500 mb-1">من</div>
                  <input type="date" className="input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-500 mb-1">إلى</div>
                  <input type="date" className="input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {isAdminOrAuditor(user?.role) && (
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</div>
                <select className="input" value={manager} onChange={(e) => setManager(e.target.value)}>
                  <option value="all">الكل</option>
                  {derived.managers.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
              <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="all">الكل</option>
                {derived.cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">نوع الفرع</div>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">الكل</option>
                <option value="فرع">فرع</option>
                <option value="معرض">معرض</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">فرع محدد</div>
              <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="all">كافة الفروع</option>
                {derived.branches.map(sid => <option key={sid} value={sid}>{mgmtRaw?.stores?.[sid] || sid}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setShowStoreCompare(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl text-sm transition-colors"
        >
          <span>⚖️</span> مقارنة معارض
        </button>
      </div>

      {/* Top 4 Store-level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard title="المبيعات" value={derived.totals.sales} format={formatSAR} icon={<SalesIcon />} />
        <KPICard title="الفواتير" value={derived.totals.trans} format={(v) => Math.round(v).toLocaleString()} icon={<InvoicesIcon />} />
        <KPICard title="الزوار" value={derived.totals.visitors} format={(v) => Math.round(v).toLocaleString()} icon={<VisitorsIcon />} />
        <KPICard
          title="نسبة التحويل"
          value={derived.totals.visitors > 0 ? (derived.totals.trans / derived.totals.visitors) * 100 : 0}
          format={(v) => v.toFixed(1) + '%'}
          icon={<FireIcon />}
          showProgress
          progressValue={derived.totals.visitors > 0 ? (derived.totals.trans / derived.totals.visitors) * 100 : 0}
        />
      </div>

      <ChartCard title={`أداء الفروع(${derived.rangeLabel})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-neutral-500 uppercase text-[11px] tracking-wider">
                <th className="th text-right">#</th>
                <SortableTh label="الفرع" sortKey="name" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-right" />
                <SortableTh label="الهدف" sortKey="target" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="المبيعات" sortKey="val" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="العام الماضي" sortKey="prevVal" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="النمو %" sortKey="growth" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="اليومية المتبقية" sortKey="dailyReq" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="الفواتير" sortKey="trans" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="تحقيق %" sortKey="ach" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="متوسط الفاتورة" sortKey="avgInv" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="زوار" sortKey="visitors" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="زوار (LY)" sortKey="prevVisitors" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="تحويل %" sortKey="conversion" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="قيمة العميل" sortKey="customerValue" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sortedList.map((s, idx) => (
                <tr key={s.sid} className="hover:bg-orange-50 transition-colors">
                  <td className="td text-neutral-400 font-bold">{idx + 1}</td>
                  <td className="td font-bold">
                    <button
                      onClick={() => setSelectedSid(s.sid)}
                      className="text-neutral-900 hover:text-orange-600 hover:underline text-right w-full"
                    >
                      {s.name}
                    </button>
                  </td>
                  <td className="td text-center font-bold text-neutral-600 font-mono">{formatSAR(s.target)}</td>
                  <td className="td text-center font-bold text-green-700 font-mono">{formatSAR(s.val)}</td>
                  <td className="td text-center text-neutral-400 font-mono">{formatSAR(s.prevVal)}</td>
                  <td className={`td text-center font-bold font-mono ${s.growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {s.growth >= 0 ? '+' : ''}{s.growth.toFixed(1)}%
                  </td>
                  <td className="td text-center font-bold text-blue-600 font-mono">{formatSAR(s.dailyReq)}</td>
                  <td className="td text-center font-medium">{Math.round(s.trans).toLocaleString()}</td>
                  <td className="td text-center">
                    <div className="w-[85px] mx-auto flex flex-col items-center">
                      <div className="w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r transition-all duration-500 ${s.ach >= 100
                            ? 'from-emerald-500 to-emerald-400'
                            : s.ach >= 50
                              ? 'from-amber-500 to-amber-400'
                              : 'from-red-500 to-red-400'
                            }`}
                          style={{ width: `${Math.min(100, Math.max(0, s.ach))}%` }}
                        />
                      </div>
                      <div className="text-[10px] font-bold text-neutral-600 mt-1">{s.ach.toFixed(1)}%</div>
                    </div>
                  </td>
                  <td className="td text-center font-mono">{formatSAR(s.avgInv)}</td>
                  <td className="td text-center font-medium">{Math.round(s.visitors).toLocaleString()}</td>
                  <td className="td text-center text-neutral-400">{Math.round(s.prevVisitors).toLocaleString()}</td>
                  <td className="td text-center font-bold text-orange-600">{s.conversion.toFixed(1)}%</td>
                  <td className="td text-center font-bold text-blue-600">{formatSAR(s.customerValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {selectedSid && (
        <StoreDetailsModal
          open={!!selectedSid && !!mgmtRaw}
          onClose={() => setSelectedSid(null)}
          store={selectedStore}
          mgmtRaw={mgmtRaw}
          employeesJson={empRaw}
          mode={mode}
          startYMD={range.startYMD}
          endYMD={range.endYMD}
          prodRaw={prodRaw}
        />
      )}

      {/* Store Comparison Modal */}
      <StoreCompareModal
        open={showStoreCompare}
        onClose={() => setShowStoreCompare(false)}
        stores={derived.list}
      />
    </div>
  );
}
