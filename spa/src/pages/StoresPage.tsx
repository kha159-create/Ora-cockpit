import React, { useEffect, useMemo, useState } from 'react';
import { loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { ChartCard, KPICard } from '../components/DashboardComponents';
import { CurrencyDollarIcon, ReceiptTaxIcon, UsersIcon } from '../components/Icons';

type Mode = 'mtd_yest' | 'yesterday' | 'today' | 'standard' | 'custom';

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
  ach: number;
  avgInv: number;
};

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

  if (mode === 'mtd_yest') {
    currStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1, 0, 0, 0);
    currEnd = new Date(yesterday);
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

    return {
      rangeLabel,
      rangeList: toList(rangeStats),
    };
  }, [employeesJson, endYMD, rangeLabel, startYMD, store]);

  if (!open || !store) return null;

  const showTarget = mode === 'mtd_yest' || mode === 'standard' || mode === 'custom';

  const renderTable = (rows: any[], showTarget: boolean) => {
    const totalS = rows.reduce((s, r) => s + safeNum(r.s), 0);
    const totalT = rows.reduce((s, r) => s + safeNum(r.t), 0);
    const totalTarget = showTarget ? rows.reduce((s, r) => s + safeNum(r.target), 0) : 0;
    const totalAch = totalTarget > 0 ? (totalS / totalTarget) * 100 : 0;
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="th">الموظف</th>
              <th className="th text-center">المبيعات</th>
              {showTarget && <th className="th text-center">الهدف</th>}
              {showTarget && <th className="th text-center">تحقيق%</th>}
              <th className="th text-center">فواتير</th>
              <th className="th text-center">Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="td text-center text-neutral-500" colSpan={showTarget ? 6 : 4}>
                  لا توجد مبيعات
                </td>
              </tr>
            ) : (
              rows.map((r: any) => {
                const avg = r.t > 0 ? r.s / r.t : 0;
                const ach = showTarget && r.target > 0 ? (r.s / r.target) * 100 : 0;
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
      <div className="modal-content max-w-6xl my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xl font-bold text-neutral-900 truncate">{store.name}</div>
            <div className="text-sm text-neutral-500 mt-1">
              {store.manager || '-'} · {store.city || '-'} · {store.type || '-'}
            </div>
          </div>
          <button className="btn-secondary py-2 px-3" onClick={onClose}>
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
          <ChartCard title={`مبيعات الفترة (${details?.rangeLabel || '-'})`}>{renderTable(details?.rangeList || [], showTarget)}</ChartCard>
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

  const [mode, setMode] = useState<Mode>('mtd_yest');
  const [standardYear, setStandardYear] = useState<number>(() => new Date().getFullYear());
  const [standardMonth, setStandardMonth] = useState<string>('all'); // 'all' or '1'..'12'
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const [manager, setManager] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');

  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const range = useMemo(() => getRange(mode, standardYear, standardMonth, customStart, customEnd), [customEnd, customStart, mode, standardMonth, standardYear]);

  useEffect(() => {
    Promise.all([loadManagementData(), loadEmployeesData()])
      .then(([m, e]) => {
        setMgmtRaw(m);
        setEmpRaw(e);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  useEffect(() => {
    // initialize custom range defaults for mtd_yest
    const today = new Date();
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    const startOfMonth = new Date(y.getFullYear(), y.getMonth(), 1);
    setCustomStart(toLocalYMD(startOfMonth));
    setCustomEnd(toLocalYMD(y));
  }, []);

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
      const ach = targetVal > 0 ? (val / targetVal) * 100 : 0;
      const avgInv = transVal > 0 ? val / transVal : 0;
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
        ach,
        avgInv,
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

    return { managers, cities, list, totals, achTotal, rangeLabel: range.startYMD === range.endYMD ? range.startYMD : `${range.startYMD} → ${range.endYMD}` };
  }, [branch, city, effectiveManager, manager, mgmtRaw, range, type, user?.name, user?.role]);

  const selectedStore = useMemo(() => {
    if (!derived || !selectedSid) return null;
    return derived.list.find((s) => s.sid === selectedSid) || null;
  }, [derived, selectedSid]);

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
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">نوع التقرير</div>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="mtd_yest">من بداية الشهر إلى أمس</option>
                <option value="yesterday">أمس فقط</option>
                <option value="today">اليوم</option>
                <option value="standard">سنوي / شهري</option>
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
                {Object.entries(mgmtRaw.stores || {})
                  .map(([id, name]: [string, string]) => ({ id, name: name || id }))
                  .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="المبيعات" value={derived.totals.sales} format={formatSAR} icon={<CurrencyDollarIcon />} />
        <KPICard title="الفواتير" value={derived.totals.trans} format={(v) => Math.round(v).toLocaleString()} icon={<ReceiptTaxIcon />} />
        <KPICard title="الزوار" value={derived.totals.visitors} format={(v) => Math.round(v).toLocaleString()} icon={<UsersIcon />} />
        <KPICard title="تحقيق الهدف" value={derived.achTotal} format={(v) => `${v.toFixed(1)}%`} showProgress progressValue={derived.achTotal} trend="neutral" trendValue={`الهدف: ${formatSAR(derived.totals.target)}`} />
      </div>

      {/* Stores table */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-lg font-bold text-neutral-900">تفاصيل الفروع</div>
            <div className="text-sm text-neutral-600">
              عدد الفروع: <span className="font-bold text-neutral-900">{derived.list.length}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th text-center w-[60px]">#</th>
                <th className="th">الفرع</th>
                <th className="th text-center">المبيعات</th>
                <th className="th text-center">العام السابق</th>
                <th className="th text-center">الهدف</th>
                <th className="th text-center">التحقيق %</th>
                <th className="th text-center">النمو %</th>
                <th className="th text-center">الفواتير</th>
                <th className="th text-center">متوسط الفاتورة</th>
                <th className="th text-center">الزوار</th>
              </tr>
            </thead>
            <tbody>
              {derived.list.map((b, i) => (
                <tr key={b.sid} className="hover:bg-orange-50 cursor-pointer" onClick={() => setSelectedSid(b.sid)}>
                  <td className="td text-center text-neutral-500">{i + 1}</td>
                  <td className="td">
                    <div className="font-bold text-neutral-900">{b.name}</div>
                    <div className="text-xs text-neutral-500 mt-1">
                      {b.manager || '-'} · {b.city || '-'} · {b.type || '-'}
                    </div>
                  </td>
                  <td className="td text-center font-bold text-green-700">{formatSAR(b.val)}</td>
                  <td className="td text-center text-neutral-500">{formatSAR(b.prevVal)}</td>
                  <td className="td text-center">{formatSAR(b.target)}</td>
                  <td className={`td text-center font-bold ${b.ach >= 100 ? 'text-green-700' : b.ach >= 80 ? 'text-amber-700' : 'text-red-600'}`}>
                    {b.target > 0 ? `${b.ach.toFixed(1)}%` : '-'}
                  </td>
                  <td className={`td text-center font-bold ${b.growth >= 0 ? 'text-green-700' : 'text-red-600'}`} dir="ltr">
                    {b.prevVal > 0 ? `${b.growth.toFixed(1)}%` : '-'}
                  </td>
                  <td className="td text-center">{Math.round(b.trans).toLocaleString()}</td>
                  <td className="td text-center">{formatSAR(b.avgInv)}</td>
                  <td className="td text-center">{Math.round(b.visitors).toLocaleString()}</td>
                </tr>
              ))}
              {derived.list.length === 0 && (
                <tr>
                  <td className="td text-center text-neutral-500" colSpan={10}>
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

