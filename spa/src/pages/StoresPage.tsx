import React, { useEffect, useMemo, useState } from 'react';
import { loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { ChartCard, KPICard } from '../components/DashboardComponents';
import { CurrencyDollarIcon, ReceiptTaxIcon, UsersIcon } from '../components/Icons';

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
function normDate(s: unknown) {
  return String(s || '').substring(0, 10);
}

function getRange(mode: Mode, standardYear: number, standardMonth: string, customStart: string, customEnd: string) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let currStart: Date;
  let currEnd: Date;

  if (mode === 'mtd') {
    currStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
    currEnd = new Date(today);
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
    currEnd = customEnd ? new Date(customEnd) : yesterday;
    currStart.setHours(0, 0, 0, 0);
    currEnd.setHours(23, 59, 59, 999);
  } else {
    // standard: year + month (month may be 'all')
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

  const prevStart = new Date(currStart);
  prevStart.setFullYear(prevStart.getFullYear() - 1);
  const prevEnd = new Date(currEnd);
  prevEnd.setFullYear(prevEnd.getFullYear() - 1);

  const startYMD = toLocalYMD(currStart);
  const endYMD = toLocalYMD(currEnd);
  const prevStartYMD = toLocalYMD(prevStart);
  const prevEndYMD = toLocalYMD(prevEnd);

  return { currStart, currEnd, prevStart, prevEnd, startYMD, endYMD, prevStartYMD, prevEndYMD };
}

function StoreDetailsModal({
  open,
  onClose,
  store,
  employeesJson,
  mode,
  startYMD,
  endYMD,
}: {
  open: boolean;
  onClose: () => void;
  store: StoreRow | null;
  employeesJson: any;
  mode: Mode;
  startYMD: string;
  endYMD: string;
}) {
  const rangeLabel = useMemo(() => {
    if (!startYMD || !endYMD) return '-';
    if (startYMD === endYMD) return startYMD;
    return `${startYMD} → ${endYMD}`;
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

    // Build list of YYYY-MM month keys for the selected range
    const monthKeys: string[] = [];
    if (rangeStart && rangeEnd) {
      const s = new Date(rangeStart);
      const e = new Date(rangeEnd);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
        const cur = new Date(s.getFullYear(), s.getMonth(), 1);
        const endM = new Date(e.getFullYear(), e.getMonth(), 1);
        while (cur <= endM) {
          monthKeys.push(`${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`);
          cur.setMonth(cur.getMonth() + 1);
        }
      }
    }

    const resolveTargetForRange = (empId: string) => {
      if (!empId) return 0;
      const id = String(empId).trim();
      const cands = [id, id.padStart(4, '0')];

      // Prefer summing monthly targets when range spans months
      let sum = 0;
      if (monthKeys.length > 0) {
        for (const mk of monthKeys) {
          const tbm = targetsByMonth?.[mk];
          for (const c of cands) {
            const v = tbm?.[c];
            if (v != null) {
              sum += safeNum(v);
              break;
            }
          }
          // monthly_targets format: { empId: { 'YYYY-MM-01': val } }
          const mt = monthlyTargets?.[id] || monthlyTargets?.[id.padStart(4, '0')];
          if (mt && typeof mt === 'object') {
            const v = (mt as any)[`${mk}-01`];
            if (v != null) sum += safeNum(v);
          }
        }
        if (sum > 0) return sum;
      }

      // Fallback single target (current month style)
      for (const c of cands) {
        if (targets[c] != null) return safeNum(targets[c]);
      }
      return 0;
    };

    const resolveName = (raw: string) => {
      let empId = raw;
      let name = raw;
      if (raw.includes('-')) {
        const p = raw.split('-');
        empId = p[0].trim();
        name = (p[1] || '').trim() || empId;
      } else {
        empId = raw.trim();
      }
      const hit = employeeNames?.[empId] || employeeNames?.[empId.padStart(4, '0')];
      return { empId, name: hit || name || empId };
    };

    const rangeStats: Record<string, { s: number; t: number; target: number }> = {};

    for (const r of rec) {
      const d = normDate(r?.[0]);
      const rawName = String(r?.[1] || '');
      if (!rawName || rawName === 'None' || rawName === 'null') continue;
      const sales = safeNum(r?.[2]);
      const trans = safeNum(r?.[3]);

      const { empId, name } = resolveName(rawName);

      if (d && d >= rangeStart && d <= rangeEnd) {
        if (!rangeStats[name]) rangeStats[name] = { s: 0, t: 0, target: resolveTargetForRange(empId) };
        rangeStats[name].s += sales;
        rangeStats[name].t += trans;
      }
    }

    const toList = <T extends { s: number }>(obj: Record<string, T>) =>
      Object.entries(obj)
        .map(([name, st]) => ({ name, ...st }))
        .sort((a, b) => b.s - a.s);

    // Daily breakdown
    const dailyBreakdown: Record<string, { sales: number; trans: number; visitors: number; prevSales: number; prevVisitors: number }> = {};
    const mgmtRaw = (employeesJson as any)?.mgmt || {};
    const visitorsData = mgmtRaw?.visitors || [];
    
    // Get daily sales/trans from employee history
    for (const r of rec) {
      const d = normDate(r?.[0]);
      if (d && d >= rangeStart && d <= rangeEnd) {
        if (!dailyBreakdown[d]) dailyBreakdown[d] = { sales: 0, trans: 0, visitors: 0, prevSales: 0, prevVisitors: 0 };
        dailyBreakdown[d].sales += safeNum(r?.[2]);
        dailyBreakdown[d].trans += safeNum(r?.[3]);
      }
    }
    
    // Get visitors from management data
    visitorsData.forEach(([d, sid, v]: any[]) => {
      if (sid !== store?.sid) return;
      const dateStr = normDate(d);
      if (dateStr && dateStr >= rangeStart && dateStr <= rangeEnd) {
        if (!dailyBreakdown[dateStr]) dailyBreakdown[dateStr] = { sales: 0, trans: 0, visitors: 0, prevSales: 0, prevVisitors: 0 };
        dailyBreakdown[dateStr].visitors += safeNum(v);
      }
    });

    // Get previous year data
    const prevYearStart = rangeStart.split('-').map(Number);
    prevYearStart[0] -= 1;
    const prevYearEnd = rangeEnd.split('-').map(Number);
    prevYearEnd[0] -= 1;
    const prevYearStartStr = prevYearStart.map((n, i) => (i === 0 ? n : String(n).padStart(2, '0'))).join('-');
    const prevYearEndStr = prevYearEnd.map((n, i) => (i === 0 ? n : String(n).padStart(2, '0'))).join('-');
    
    for (const r of rec) {
      const d = normDate(r?.[0]);
      if (d && d >= prevYearStartStr && d <= prevYearEndStr) {
        const currentDate = d.split('-');
        currentDate[0] = String(Number(currentDate[0]) + 1);
        const currentDateStr = currentDate.join('-');
        if (currentDateStr >= rangeStart && currentDateStr <= rangeEnd) {
          if (!dailyBreakdown[currentDateStr]) dailyBreakdown[currentDateStr] = { sales: 0, trans: 0, visitors: 0, prevSales: 0, prevVisitors: 0 };
          dailyBreakdown[currentDateStr].prevSales += safeNum(r?.[2]);
        }
      }
    }
    
    visitorsData.forEach(([d, sid, v]: any[]) => {
      if (sid !== store?.sid) return;
      const dateStr = normDate(d);
      if (dateStr && dateStr >= prevYearStartStr && dateStr <= prevYearEndStr) {
        const currentDate = dateStr.split('-');
        currentDate[0] = String(Number(currentDate[0]) + 1);
        const currentDateStr = currentDate.join('-');
        if (currentDateStr >= rangeStart && currentDateStr <= rangeEnd) {
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
        customerValue: stats.trans > 0 ? stats.sales / stats.trans : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      rangeLabel,
      rangeList: toList(rangeStats),
      dailyList,
    };
  }, [employeesJson, endYMD, rangeLabel, startYMD, store]);

  if (!open || !store) return null;

  const showTarget = mode === 'mtd' || mode === 'standard' || mode === 'custom';

  const renderTable = (rows: any[], showTarget: boolean) => {
    const totalS = rows.reduce((s, r) => s + safeNum(r.s), 0);
    const totalT = rows.reduce((s, r) => s + safeNum(r.t), 0);
    const totalTarget = showTarget ? rows.reduce((s, r) => s + safeNum(r.target), 0) : 0;
    const totalAch = totalTarget > 0 ? (totalS / totalTarget) * 100 : 0;
    const colCount = showTarget ? 7 : 5;
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="th">الموظف</th>
              <th className="th text-center">المبيعات</th>
              {showTarget && <th className="th text-center">الهدف (Target)</th>}
              {showTarget && <th className="th text-center">نسبة التحقيق %</th>}
              <th className="th text-center">مساهمة %</th>
              <th className="th text-center">فواتير</th>
              <th className="th text-center">Avg Inv</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="td text-center text-neutral-500" colSpan={colCount}>
                  لا توجد مبيعات
                </td>
              </tr>
            ) : (
              rows.map((r: any) => {
                const avg = r.t > 0 ? r.s / r.t : 0;
                const ach = showTarget && r.target > 0 ? (r.s / r.target) * 100 : 0;
                const share = totalS > 0 ? (r.s / totalS) * 100 : 0;
                return (
                  <tr key={r.name} className="hover:bg-orange-50">
                    <td className="td font-semibold text-neutral-900">{r.name}</td>
                    <td className="td text-center font-bold text-green-700">{formatSAR(r.s)}</td>
                    {showTarget && <td className="td text-center">{formatSAR(r.target || 0)}</td>}
                    {showTarget && (
                      <td className={`td text-center font-bold ${ach >= 100 ? 'text-green-700' : ach >= 80 ? 'text-amber-700' : 'text-red-600'}`}>
                        {ach.toFixed(1)}%
                      </td>
                    )}
                    <td className="td text-center">{share.toFixed(1)}%</td>
                    <td className="td text-center">{Math.round(r.t).toLocaleString()}</td>
                    <td className="td text-center">{formatSAR(avg)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-neutral-50">
                <td className="td font-bold">الإجمالي</td>
                <td className="td text-center font-bold">{formatSAR(totalS)}</td>
                {showTarget && <td className="td text-center font-bold">{formatSAR(totalTarget)}</td>}
                {showTarget && <td className="td text-center font-bold">{totalAch.toFixed(1)}%</td>}
                <td className="td text-center font-bold">100%</td>
                <td className="td text-center font-bold">{Math.round(totalT).toLocaleString()}</td>
                <td className="td text-center font-bold">{formatSAR(totalT > 0 ? totalS / totalT : 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  return (
    <div className="modal-center-screen" onClick={onClose}>
      <div className="modal-content max-w-5xl my-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-lg font-bold text-neutral-900 truncate">{store.name}</div>
            <div className="text-xs text-neutral-500 mt-1">
              {store.manager || '-'} · {store.city || '-'} · {store.type || '-'}
            </div>
          </div>
          <button className="btn-secondary py-1.5 px-3 text-sm" onClick={onClose}>
            إغلاق
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <KPICard title="المبيعات" value={store.val} format={formatSAR} icon={<CurrencyDollarIcon />} />
          <KPICard title="الفواتير" value={store.trans} format={(v) => Math.round(v).toLocaleString()} icon={<ReceiptTaxIcon />} />
          <KPICard title="الزوار" value={store.visitors} format={(v) => Math.round(v).toLocaleString()} icon={<UsersIcon />} />
          <KPICard title="تحقيق الهدف" value={store.ach} format={(v) => `${v.toFixed(1)}%`} showProgress progressValue={store.ach} />
        </div>

        <div className="grid grid-cols-1 gap-4 mt-6">
          {/* Daily Details Table */}
          {details?.dailyList && details.dailyList.length > 0 && (
            <ChartCard title={`تفاصيل الأيام (${details?.rangeLabel || '-'})`}>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-orange-500 text-white">
                      <th className="th text-center">التاريخ</th>
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
                  <tbody>
                    {details.dailyList.map((day: any) => (
                      <tr key={day.date} className="hover:bg-orange-50">
                        <td className="td text-center">{day.date}</td>
                        <td className="td text-center" dir="ltr">{formatSAR(day.sales)}</td>
                        <td className="td text-center" dir="ltr">{formatSAR(day.prevSales)}</td>
                        <td className={`td text-center font-bold ${day.growth >= 0 ? 'text-green-600' : 'text-red-500'}`} dir="ltr">
                          {day.prevSales > 0 ? `${day.growth >= 0 ? '+' : ''}${day.growth.toFixed(1)}%` : '-'}
                        </td>
                        <td className={`td text-center font-bold ${day.growthVal >= 0 ? 'text-green-600' : 'text-red-500'}`} dir="ltr">
                          {formatSAR(Math.abs(day.growthVal))}
                        </td>
                        <td className="td text-center" dir="ltr">{Math.round(day.trans).toLocaleString()}</td>
                        <td className="td text-center" dir="ltr">{Math.round(day.avgInv).toLocaleString()}</td>
                        <td className="td text-center" dir="ltr">{Math.round(day.visitors).toLocaleString()}</td>
                        <td className="td text-center" dir="ltr">{Math.round(day.prevVisitors).toLocaleString()}</td>
                        <td className="td text-center" dir="ltr">{day.conversion.toFixed(1)}%</td>
                        <td className="td text-center font-bold" dir="ltr">{Math.round(day.customerValue).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
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

export default function StoresPage() {
  const user = getCurrentUser();
  const [mgmtRaw, setMgmtRaw] = useState<any>(null);
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('mtd');
  const [standardYear, setStandardYear] = useState<number>(() => new Date().getFullYear());
  const [standardMonth, setStandardMonth] = useState<string>('all'); // 'all' or '1'..'12'
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const [manager, setManager] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');

  const [selectedSid, setSelectedSid] = useState<string | null>(null);
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
    Promise.all([loadManagementData(), loadEmployeesData()])
      .then(([m, e]) => {
        setMgmtRaw(m);
        setEmpRaw(e);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  useEffect(() => {
    if (mode === 'custom' && !customStart && !customEnd) {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setCustomStart(toLocalYMD(startOfMonth));
      setCustomEnd(toLocalYMD(today));
    }
  }, [mode]);

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
      if (m?.city) citiesSet.add(String(m.city));
    });
    const managers = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const cities = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ar'));

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

    (raw.sales || []).forEach((x: any[]) => {
      const [d, s, v] = x;
      if (inRange(d)) branchSales[s] = (branchSales[s] || 0) + safeNum(v);
      if (inPrev(d)) prevSales[s] = (prevSales[s] || 0) + safeNum(v);
    });
    (raw.transactions || []).forEach((x: any[]) => {
      const [d, s, v] = x;
      if (inRange(d)) branchTrans[s] = (branchTrans[s] || 0) + safeNum(v);
    });
    (raw.targets || []).forEach((x: any[]) => {
      const [d, s, v] = x;
      if (inRange(d)) branchTarget[s] = (branchTarget[s] || 0) + safeNum(v);
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
      const prevVal = prevSales[sid] || 0;
      const targetVal = branchTarget[sid] || 0;
      const transVal = branchTrans[sid] || 0;
      const visitorsVal = branchVisitors[sid] || 0;
      const prevVis = prevVisitors[sid] || 0;
      const growth = prevVal > 0 ? ((val - prevVal) / prevVal) * 100 : 0;
      const growthVal = val - prevVal;
      const ach = targetVal > 0 ? (val / targetVal) * 100 : 0;
      const avgInv = transVal > 0 ? val / transVal : 0;
      const conversion = visitorsVal > 0 ? (transVal / visitorsVal) * 100 : 0;
      const customerValue = transVal > 0 ? val / transVal : 0;
      
      // Calculate daily requirement
      const today = new Date();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const remainingDays = daysInMonth - today.getDate() + 1;
      const dailyReq = remainingDays > 0 && targetVal > val ? (targetVal - val) / remainingDays : 0;
      
      const m = meta[sid] || {};
      list.push({
        sid,
        name: stores[sid] || sid,
        manager: String(m?.manager || ''),
        city: String(m?.city || ''),
        type: String(m?.type || ''),
        val,
        prevVal,
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

    const totals = {
      sales: list.reduce((s, r) => s + r.val, 0),
      trans: list.reduce((s, r) => s + r.trans, 0),
      visitors: list.reduce((s, r) => s + r.visitors, 0),
      target: list.reduce((s, r) => s + r.target, 0),
    };
    const achTotal = totals.target > 0 ? (totals.sales / totals.target) * 100 : 0;

    const branches = Object.keys(stores)
      .filter((sid) => {
        const m = meta[sid] || {};
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && String(m?.city || '') !== city) return false;
        if (type !== 'all' && String(m?.type || '') !== type) return false;
        return true;
      })
      .sort((a, b) => (stores[a] || a).localeCompare(stores[b] || b, 'ar'));

    return { managers, cities, branches, list, totals, achTotal, rangeLabel: range.startYMD === range.endYMD ? range.startYMD : `${range.startYMD} → ${range.endYMD}` };
  }, [branch, city, effectiveManager, manager, mgmtRaw, range, type, user?.name, user?.role]);

  const selectedStore = useMemo(() => {
    if (!derived || !selectedSid) return null;
    return derived.list.find((s) => s.sid === selectedSid) || null;
  }, [derived, selectedSid]);

  const sortedList = useMemo(() => {
    if (!derived) return [];
    const list = [...derived.list];
    const k = storeSortKey;
    const d = storeSortDir;
    list.sort((a, b) => {
      const av = k === 'name' ? (a[k] as string) : (a[k] as number) ?? 0;
      const bv = k === 'name' ? (b[k] as string) : (b[k] as number) ?? 0;
      if (k === 'name') {
        const cmp = String(av).localeCompare(String(bv), 'ar');
        return d === 'asc' ? cmp : -cmp;
      }
      const cmp = (av as number) - (bv as number);
      return d === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [derived, storeSortKey, storeSortDir]);

  if (err) {
    return <div className="p-6 bg-white rounded-xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  }
  if (!mgmtRaw || !empRaw || !derived) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

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
                  <div className="text-xs font-semibold text-neutral-500 mb-1">السنة</div>
                  <select className="input" value={standardYear} onChange={(e) => setStandardYear(Number(e.target.value))}>
                    {[2026, 2025, 2024].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-500 mb-1">الشهر</div>
                  <select className="input" value={standardMonth} onChange={(e) => setStandardMonth(e.target.value)}>
                    <option value="all">كل السنة</option>
                    {monthsAr.map((m, i) => (
                      <option key={m} value={String(i + 1)}>
                        {m}
                      </option>
                    ))}
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
          </div>

          <div className="flex flex-wrap items-end gap-3">
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
              <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
              <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="all">الكل</option>
                {derived.cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">نوع المعرض</div>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">الكل</option>
                <option value="Showroom">معارض</option>
                <option value="Online">أونلاين</option>
              </select>
            </div>

            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">الفرع</div>
              <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="all">كافة الفروع</option>
                {derived.branches.map((sid) => (
                  <option key={sid} value={sid}>
                    {mgmtRaw?.stores?.[sid] || sid}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard title="المبيعات" value={derived.totals.sales} format={formatSAR} icon={<CurrencyDollarIcon />} />
        <KPICard title="الفواتير" value={derived.totals.trans} format={(v) => Math.round(v).toLocaleString()} icon={<ReceiptTaxIcon />} />
        <KPICard title="الزوار" value={derived.totals.visitors} format={(v) => Math.round(v).toLocaleString()} icon={<UsersIcon />} />
        <KPICard title="تحقيق الهدف" value={derived.achTotal} format={(v) => `${v.toFixed(1)}%`} showProgress progressValue={derived.achTotal} trend="neutral" trendValue={`الهدف: ${formatSAR(derived.totals.target)}`} />
      </div>

      {/* Stores table */}
      <div className="bg-white rounded-xl shadow-md border border-neutral-200 overflow-hidden">
        <div className="p-3 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-base font-bold text-neutral-900">تفاصيل الفروع</div>
            <div className="text-xs text-neutral-600">
              عدد الفروع: <span className="font-bold text-neutral-900">{derived.list.length}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-orange-500 text-white">
                <th className="th text-center w-[60px]">#</th>
                <SortableTh label="الفرع" sortKey="name" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} />
                <SortableTh label="المبيعات" sortKey="val" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="مبيعات العام السابق" sortKey="prevVal" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="الهدف" sortKey="target" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="التحقيق (%)" sortKey="ach" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="النمو (%)" sortKey="growth" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="قيمة النمو" sortKey="growthVal" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="اليومية المتبقية" sortKey="dailyReq" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="الفواتير" sortKey="trans" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="متوسط الفاتورة" sortKey="avgInv" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="الزوار" sortKey="visitors" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="زوار العام السابق" sortKey="prevVisitors" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="قيمة العميل" sortKey="customerValue" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
                <SortableTh label="التحويل (Vis Rate)" sortKey="conversion" activeKey={storeSortKey} direction={storeSortDir} onClick={handleStoreSort} className="text-center" />
              </tr>
            </thead>
            <tbody>
              {sortedList.map((b, i) => (
                <tr key={b.sid} className={`hover:bg-orange-50 cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`} onClick={() => setSelectedSid(b.sid)}>
                  <td className="td text-center">
                    <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm mx-auto">
                      {i + 1}
                    </div>
                  </td>
                  <td className="td">
                    <div className="font-bold text-blue-600">{b.name}</div>
                  </td>
                  <td className="td text-center" dir="ltr">{formatSAR(b.val)}</td>
                  <td className="td text-center" dir="ltr">{formatSAR(b.prevVal)}</td>
                  <td className="td text-center" dir="ltr">{formatSAR(b.target)}</td>
                  <td className={`td text-center font-bold ${b.ach > 0 ? 'text-green-600' : 'text-neutral-500'}`}>
                    {b.target > 0 ? `${b.ach.toFixed(1)}%` : '0.0%'}
                  </td>
                  <td className={`td text-center font-bold ${b.growth >= 0 ? 'text-green-600' : 'text-red-500'}`} dir="ltr">
                    {b.prevVal > 0 ? `${b.growth >= 0 ? '+' : ''}${b.growth.toFixed(1)}%` : '-'}
                  </td>
                  <td className={`td text-center font-bold ${b.growthVal >= 0 ? 'text-green-600' : 'text-red-500'}`} dir="ltr">
                    {formatSAR(Math.abs(b.growthVal))}
                  </td>
                  <td className="td text-center text-red-500 font-semibold" dir="ltr">{formatSAR(b.dailyReq)}</td>
                  <td className="td text-center" dir="ltr">{Math.round(b.trans).toLocaleString()}</td>
                  <td className="td text-center" dir="ltr">{Math.round(b.avgInv).toLocaleString()}</td>
                  <td className="td text-center" dir="ltr">{Math.round(b.visitors).toLocaleString()}</td>
                  <td className="td text-center" dir="ltr">{Math.round(b.prevVisitors).toLocaleString()}</td>
                  <td className="td text-center font-bold" dir="ltr">{Math.round(b.customerValue).toLocaleString()}</td>
                  <td className="td text-center" dir="ltr">{b.conversion.toFixed(1)}%</td>
                </tr>
              ))}
              {sortedList.length === 0 && (
                <tr>
                  <td className="td text-center text-neutral-500" colSpan={14}>
                    لا توجد بيانات بعد تطبيق الفلاتر.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StoreDetailsModal
        open={!!selectedStore}
        onClose={() => setSelectedSid(null)}
        store={selectedStore}
        employeesJson={empRaw}
        mode={mode}
        startYMD={range.startYMD}
        endYMD={range.endYMD}
      />
    </div>
  );
}

