import { useEffect, useMemo, useState } from 'react';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';
import { KPICard } from '../components/DashboardComponents';
import { SalesIcon, InvoicesIcon, ChevronDownIcon, VisitorsIcon } from '../components/Icons';
import { getCurrentUser } from '../auth/storage';

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

export default function LivePage() {
  const user = getCurrentUser();
  const [raw, setRaw] = useState<any>(null);
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manager, setManager] = useState<string>('all');
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [showRamadanShifts, setShowRamadanShifts] = useState(false);

  useEffect(() => {
    Promise.all([loadManagementData(), loadEmployeesData()])
      .then(([m, e]) => {
        setRaw(m);
        setEmpRaw(e);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  const today = useMemo(() => toYMD(new Date()), []);

  const managers = useMemo(() => {
    if (!raw?.store_meta) return [];
    const set = new Set<string>();
    Object.values(raw.store_meta).forEach((m: any) => {
      if (m?.manager && m.manager !== 'online') set.add(String(m.manager));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [raw]);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const isRamadan2026 = useMemo(() => {
    const now = new Date();
    return now.getFullYear() === 2026 && now.getMonth() === 2;
  }, []);

  const { todayTotals, daysInfo, shiftTotals } = useMemo(() => {
    if (!raw) return {
      todayTotals: { sales: 0, trans: 0, visitors: 0 },
      daysInfo: { total: 30, current: 1 },
      shiftTotals: { shift1: 0, shift2: 0, shift3: 0 }
    };
    const now = new Date();
    const isMarch2026 = now.getFullYear() === 2026 && now.getMonth() === 2;
    const total = isMarch2026 ? 19 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const current = isMarch2026 ? Math.min(now.getDate(), 19) : now.getDate();

    const meta = raw.store_meta || {};
    const inRange = (d: string) => String(d).startsWith(today);
    const okStore = (sid: string) =>
      effectiveManager === 'all' || (meta[sid] && String(meta[sid].manager) === effectiveManager);

    let sales = 0, trans = 0;
    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      if (inRange(d) && okStore(sid)) sales += v || 0;
    });
    (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
      if (inRange(d) && okStore(sid)) trans += v || 0;
    });

    // --- Ramadan Shift Totals (from sales_hourly) ---
    // Shift 1 (صباحي):  06:00 - 10:59 (Local AST) -> 03:00 - 07:59 (GMT)
    // Shift 2 (ظهري):   11:00 - 17:59 (Local AST) -> 08:00 - 14:59 (GMT)
    // Shift 3 (مسائي):  18:00 - 05:59 (Local AST) -> 15:00 - 02:59 (GMT)
    let shift1 = 0, shift2 = 0, shift3 = 0;
    if (isMarch2026) {
      (raw.sales_hourly || []).forEach(([dt, sid, h, v]: any[]) => {
        const dtStr = String(dt || '');
        if (!dtStr.startsWith(today)) return;
        if (!okStore(String(sid))) return;

        // The 'h' in raw data is GMT. Saudi is GMT+3.
        const localHour = (Number(h) + 3) % 24;
        const val = Number(v) || 0;

        if (localHour >= 6 && localHour < 11) {
          shift1 += val;
        } else if (localHour >= 11 && localHour < 18) {
          shift2 += val;
        } else {
          shift3 += val; // 18:00-05:59
        }
      });
    }

    return {
      todayTotals: { sales, trans },
      daysInfo: { total, current },
      shiftTotals: { shift1, shift2, shift3 }
    };
  }, [raw, today, effectiveManager]);

  const storeList = useMemo(() => {
    if (!raw?.sales || !raw?.stores) return [];
    const byStore: Record<string, { sales: number; trans: number; visitors: number; shift1: number; shift2: number; shift3: number; employees: Record<string, { sales: number; trans: number; name: string }> }> = {};
    const meta = raw.store_meta || {};
    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(today)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, shift1: 0, shift2: 0, shift3: 0, employees: {} };
        byStore[sid].sales += v || 0;
      }
    });
    (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(today)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, shift1: 0, shift2: 0, shift3: 0, employees: {} };
        byStore[sid].trans += v || 0;
      }
    });
    (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(today)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, shift1: 0, shift2: 0, shift3: 0, employees: {} };
        byStore[sid].visitors += v || 0;
      }
    });

    const isMarch2026 = new Date().getFullYear() === 2026 && new Date().getMonth() === 2;
    if (isMarch2026) {
      (raw.sales_hourly || []).forEach(([dt, sid, h, v]: any[]) => {
        const dtStr = String(dt || '');
        if (!dtStr.startsWith(today)) return;
        if (!byStore[sid]) return;

        const localHour = (Number(h) + 3) % 24;
        const val = Number(v) || 0;

        if (localHour >= 6 && localHour < 11) byStore[sid].shift1 += val;
        else if (localHour >= 11 && localHour < 18) byStore[sid].shift2 += val;
        else byStore[sid].shift3 += val;
      });
    }

    const historyData: Record<string, any[]> = empRaw?.history || {};
    const names: Record<string, string> = empRaw?.employee_names || {};
    const empTargets: Record<string, number> = empRaw?.targets || {};
    const storeTargets: Record<string, number> = {};

    // Extract store targets from management data
    (raw.targets || []).forEach(([d, sid, v]: any[]) => {
      // Assume targets are monthly, we take the one for current month if multiple, 
      // but usually there's one entry per month
      if (String(d).startsWith(today.substring(0, 7))) {
        storeTargets[sid] = (storeTargets[sid] || 0) + (v || 0);
      }
    });

    Object.entries(historyData).forEach(([storeCode, records]) => {
      if (!byStore[storeCode]) byStore[storeCode] = { sales: 0, trans: 0, visitors: 0, shift1: 0, shift2: 0, shift3: 0, employees: {} };
      for (const rec of records || []) {
        const date = rec?.[0];
        if (!String(date).startsWith(today)) continue;
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

    return Object.entries(byStore)
      .filter(([sid]) => {
        const m = meta[sid];
        if (effectiveManager !== 'all' && (!m || String(m.manager) !== effectiveManager)) return false;
        return (byStore[sid].sales > 0 || byStore[sid].trans > 0);
      })
      .map(([sid, v]) => {
        const sTarget = storeTargets[sid] || 0;
        const dailyTarget = sTarget / daysInfo.total;
        const achievement = dailyTarget > 0 ? (v.sales / dailyTarget) * 100 : 0;

        return {
          sid,
          name: raw.stores?.[sid] || sid,
          sales: v.sales,
          trans: v.trans,
          visitors: v.visitors,
          shift1: v.shift1,
          shift2: v.shift2,
          shift3: v.shift3,
          target: sTarget,
          achievement,
          employees: Object.entries(v.employees)
            .map(([id, e]) => {
              const eTarget = empTargets[id] || empTargets[id.padStart(4, '0')] || 0;
              const eDailyTarget = eTarget / daysInfo.total;
              const eAchievement = eDailyTarget > 0 ? (e.sales / eDailyTarget) * 100 : 0;
              return {
                id,
                name: e.name,
                sales: e.sales,
                trans: e.trans,
                avgInv: e.trans > 0 ? e.sales / e.trans : 0,
                achievement: eAchievement
              };
            })
            .sort((a, b) => b.sales - a.sales),
        };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [raw, empRaw, today, effectiveManager, daysInfo]);

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!raw) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
        <h3 className="text-lg font-bold text-neutral-900">متابعة مبيعات اليوم — لايف</h3>
        <p className="text-sm text-neutral-600 mt-1">تاريخ اليوم: {today}</p>
        <span className="hidden">v2.1-split-layout</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
        <KPICard title="المجموع (اليوم)" value={todayTotals.sales} format={formatSAR} icon={<SalesIcon />} />
        <div className="grid grid-cols-2 gap-4">
          <KPICard
            title="عدد الفواتير"
            value={todayTotals.trans}
            format={(v) => Math.round(v).toLocaleString()}
            icon={<InvoicesIcon />}
            trendValue={todayTotals.trans > 0 ? `معدل: ${formatSAR(todayTotals.sales / todayTotals.trans)}` : undefined}
          />
          <KPICard
            title="نسبة التحويل"
            value={(todayTotals.visitors || 0) > 0 ? ((todayTotals.trans / (todayTotals.visitors || 1)) * 100) : 0}
            format={(v) => `${v.toFixed(1)}%`}
            icon={<VisitorsIcon />}
            trendValue={`زوار: ${(todayTotals.visitors || 0).toLocaleString()}`}
          />
        </div>
      </div>

      {/* Ramadan Toggle Button */}
      {isRamadan2026 && (
        <div className="flex justify-start">
          <button
            onClick={() => setShowRamadanShifts(!showRamadanShifts)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border transition-all duration-300 ${showRamadanShifts
              ? 'bg-orange-500 text-white border-orange-500 shadow-md'
              : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'
              }`}
          >
            <span>🌙</span>
            {showRamadanShifts ? 'إخفاء مبيعات الشفتات' : 'إظهار مبيعات شفتات رمضان'}
          </button>
        </div>
      )}

      {/* Ramadan Shift Breakdown — Global */}
      {isRamadan2026 && showRamadanShifts && (
        <div className="bg-white rounded-2xl shadow-sm border border-orange-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🌙</span>
            <h4 className="text-sm font-bold text-orange-700">مبيعات الشفتات — رمضان</h4>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center bg-amber-50 rounded-xl p-3 border border-amber-200">
              <span className="text-xl mb-1">🌅</span>
              <span className="text-[11px] font-semibold text-amber-700 mb-1">الشفت الأول</span>
              <span className="text-[10px] text-amber-500 mb-2">٦ص – ١١:٣٠ص</span>
              <span className="text-base font-black text-amber-800" dir="ltr">{formatSAR(shiftTotals.shift1)}</span>
            </div>
            <div className="flex flex-col items-center bg-orange-50 rounded-xl p-3 border border-orange-200">
              <span className="text-xl mb-1">☀️</span>
              <span className="text-[11px] font-semibold text-orange-700 mb-1">الشفت الثاني</span>
              <span className="text-[10px] text-orange-500 mb-2">١١:٣٠ص – ٦م</span>
              <span className="text-base font-black text-orange-800" dir="ltr">{formatSAR(shiftTotals.shift2)}</span>
            </div>
            <div className="flex flex-col items-center bg-indigo-50 rounded-xl p-3 border border-indigo-200">
              <span className="text-xl mb-1">🌙</span>
              <span className="text-[11px] font-semibold text-indigo-700 mb-1">الشفت الثالث</span>
              <span className="text-[10px] text-indigo-500 mb-2">٦م – ٣ص</span>
              <span className="text-base font-black text-indigo-800" dir="ltr">{formatSAR(shiftTotals.shift3)}</span>
            </div>
          </div>
        </div>
      )}

      {managers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
          <label className="text-xs font-semibold text-neutral-500 mb-2 block">مدير المنطقة</label>
          <select className="input max-w-xs" value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="all">الكل</option>
            {managers.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {storeList.map((store) => (
          <div
            key={store.sid}
            className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden identity-card"
          >
            <button
              type="button"
              className="w-full p-4 text-right flex flex-col gap-3 hover:bg-neutral-50 transition-colors group relative"
              onClick={() => setExpandedStore(expandedStore === store.sid ? null : store.sid)}
            >
              {/* Header: Name & Total Sales */}
              <div className="flex items-center justify-between gap-2 w-full border-b border-neutral-100 pb-2 mb-1">
                <div className="flex items-center gap-2">
                  <div className={`transition-transform duration-200 text-neutral-400 ${expandedStore === store.sid ? 'rotate-180 text-orange-600' : ''}`}>
                    <ChevronDownIcon />
                  </div>
                  <span className="font-bold text-lg text-neutral-900 leading-tight whitespace-normal">{store.name}</span>
                </div>
                <span className="text-xl font-black text-orange-600" dir="ltr">{formatSAR(store.sales)}</span>
              </div>

              {/* Body: 50/50 Split */}
              <div className="flex flex-col sm:flex-row gap-4 w-full">

                {/* Right Side: Data Grid */}
                <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 rounded">
                    <span className="text-neutral-500 text-xs">زوار:</span>
                    <span className="font-bold text-neutral-700">{Math.round(store.visitors || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 rounded">
                    <span className="text-neutral-500 text-xs">تحويل:</span>
                    <span className="font-bold text-neutral-700">{(store.visitors || 0) > 0 ? ((store.trans / (store.visitors || 1)) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 rounded">
                    <span className="text-neutral-500 text-xs">فواتير:</span>
                    <span className="font-bold text-neutral-700">{store.trans}</span>
                  </div>
                  <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 rounded">
                    <span className="text-neutral-500 text-xs">معدل:</span>
                    <span className="font-bold text-neutral-700" dir="ltr">{formatSAR(store.trans > 0 ? store.sales / store.trans : 0)}</span>
                  </div>
                  <div className="col-span-2 flex justify-between items-center bg-orange-50 px-2 py-1 rounded mt-1">
                    <span className="text-orange-600 text-xs font-semibold">موظفين:</span>
                    <span className="font-bold text-orange-700">{store.employees.length}</span>
                  </div>
                </div>

                {/* Left Side: Targets & Progress */}
                <div className="flex-1 flex flex-col justify-center gap-3 border-r border-neutral-100 pr-4 mr-1">
                  {/* Daily Target */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-500">الهدف اليومي</span>
                      <span className="font-bold text-neutral-700">{Math.round(store.achievement)}%</span>
                    </div>
                    <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${store.achievement >= 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                        style={{ width: `${Math.min(100, store.achievement)}%` }}
                      />
                    </div>
                  </div>

                  {/* Monthly Target (Simulated or Real if available) */}
                  <div className="flex justify-between items-center text-xs text-neutral-400">
                    <span>الهدف: {formatSAR(store.target)}</span>
                    <span className="bg-neutral-100 px-1 rounded">شهري</span>
                  </div>
                </div>
              </div>

              {/* Store Level Shift Breakdown */}
              {isRamadan2026 && showRamadanShifts && (
                <div className="mt-3 pt-3 border-t border-orange-100 flex gap-2 justify-between items-center bg-orange-50/50 -mx-4 -mb-4 px-4 pb-4">
                  <div className="flex flex-col flex-1 items-center bg-amber-50 rounded p-1 border border-amber-100">
                    <span className="text-[10px] text-amber-700 font-bold">ش1 🌅</span>
                    <span className="text-xs font-black text-amber-900" dir="ltr">{formatSAR(store.shift1)}</span>
                  </div>
                  <div className="flex flex-col flex-1 items-center bg-orange-50 rounded p-1 border border-orange-100">
                    <span className="text-[10px] text-orange-700 font-bold">ش2 ☀️</span>
                    <span className="text-xs font-black text-orange-900" dir="ltr">{formatSAR(store.shift2)}</span>
                  </div>
                  <div className="flex flex-col flex-1 items-center bg-indigo-50 rounded p-1 border border-indigo-100">
                    <span className="text-[10px] text-indigo-700 font-bold">ش3 🌙</span>
                    <span className="text-xs font-black text-indigo-900" dir="ltr">{formatSAR(store.shift3)}</span>
                  </div>
                </div>
              )}
            </button>
            {expandedStore === store.sid && store.employees.length > 0 && (
              <div className="border-t border-neutral-100 bg-neutral-50 divide-y divide-neutral-100 transition-all duration-300 animate-in slide-in-from-top-2">
                {store.employees.map((emp) => (
                  <div key={emp.id} className="flex flex-col">
                    <button
                      onClick={() => setExpandedEmp(expandedEmp === emp.id ? null : emp.id)}
                      className="w-full flex flex-col p-3 hover:bg-white transition-colors group"
                    >
                      <div className="w-full flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-1 h-3 rounded-full bg-orange-400 group-hover:h-5 transition-all ${expandedEmp === emp.id ? 'h-5 bg-orange-600' : ''}`} />
                          <span className={`text-sm font-bold leading-tight whitespace-normal ${expandedEmp === emp.id ? 'text-orange-600' : 'text-neutral-700'}`}>
                            {emp.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-black text-neutral-400" dir="ltr">{formatSAR(emp.sales)}</span>
                          <div className={`transition-transform duration-200 text-neutral-300 ${expandedEmp === emp.id ? 'rotate-180 text-orange-500' : ''}`}>
                            <ChevronDownIcon />
                          </div>
                        </div>
                      </div>

                      {/* Achievement bar for employee - Smaller */}
                      {emp.achievement > 0 && (
                        <div className="w-full h-[2px] bg-neutral-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${emp.achievement >= 100 ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-orange-500'}`}
                            style={{ width: `${Math.min(100, emp.achievement)}%` }}
                          />
                        </div>
                      )}
                    </button>

                    {expandedEmp === emp.id && (
                      <div className="bg-white p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-tight mb-1">Visitors & Conv / زوار وتحويل</div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-base font-black text-neutral-900">{emp.trans > 0 && store.visitors > 0 ? ((emp.trans / (store.visitors / store.employees.length)) * 100).toFixed(1) : 0}%</span>
                              <span className="text-[10px] text-neutral-500">({Math.round(store.visitors / store.employees.length)} زوار)</span>
                            </div>
                          </div>
                          <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-tight mb-1">Bills & Avg / فواتير ومعدل</div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-base font-black text-neutral-900">{Math.round(emp.trans)}</span>
                              <span className="text-[10px] text-neutral-500">({formatSAR(emp.avgInv)})</span>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 bg-orange-50 rounded-2xl border border-orange-100 flex justify-between items-center">
                          <span className="text-xs font-black text-orange-700 uppercase">Total Sales / الإجمالي</span>
                          <span className="text-lg font-black text-orange-700" dir="ltr">{formatSAR(emp.sales)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
