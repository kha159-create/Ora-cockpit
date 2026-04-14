import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { CustomerValueInsights } from '../components/dashboard/CustomerValueInsights';
import { CustomerValueSimulationTable } from '../components/dashboard/CustomerValueSimulationTable';
import { buildTopStoresRankForPeriod, mapBranchesDataWithLocations } from '../utils/customerValueBranchRows';
import { getComparisonPrevRange, formatComparisonRangeForDisplay } from '../utils/seasons';
import { useComparisonCalendar } from '../context/ComparisonCalendarContext';

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
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (mode === 'today') return { start: toYMD(now), end: toYMD(now) };
  if (mode === 'yesterday') return { start: toYMD(yesterday), end: toYMD(yesterday) };
  if (mode === 'mtd') {
    const endMtd = yesterday.getMonth() !== now.getMonth() ? now : yesterday;
    return { start: toYMD(startOfCurrentMonth), end: toYMD(endMtd) };
  }
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

type AnomalyDailyRow = {
  date: string;
  sales: number;
  visitors: number;
  customerValue: number;
  sharePct: number;
  shareAnomaly: boolean;
  visitorsAnomaly: boolean;
  cvAnomaly: boolean;
};

type AnomalyStore = {
  id: string;
  name: string;
  normal: {
    shareMin: number;
    shareMax: number;
    visitorsMin: number;
    visitorsMax: number;
    cvMin: number;
    cvMax: number;
  };
  rows: AnomalyDailyRow[];
};

const percentile = (arr: number[], p: number): number => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

export default function CustomerValueSimulationPage() {
  const [raw, setRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const user = getCurrentUser();
  const { calendar } = useComparisonCalendar();

  const [mode, setMode] = useState<Mode>('mtd');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>(user?.storeId || 'all');
  const [city, setCity] = useState<string>('all');
  const [selectedStoreType, setSelectedStoreType] = useState<string>('all');
  const [selYear, setSelYear] = useState<number>(() => new Date().getFullYear());
  const [selMonth, setSelMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [marchMtdPhase, setMarchMtdPhase] = useState<'1' | '2'>('1');
  const [openAnomalyStoreId, setOpenAnomalyStoreId] = useState<string | null>(null);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const loadData = useCallback(() => {
    loadManagementData()
      .then((m) => {
        setRaw(m);
        setErr(null);
      })
      .catch((e) => setErr(e?.message || String(e)));
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
  }, [mode]);

  const range = useMemo(() => {
    let start: string;
    let end: string;
    if (mode === 'custom') {
      start = customStart;
      end = customEnd;
    } else {
      const r = getDefaultRange(mode, selYear, selMonth);
      start = r.start;
      end = r.end;
    }
    const now = new Date();
    if (mode === 'mtd' && now.getFullYear() === 2026 && now.getMonth() === 2) {
      const maxDateStr = (a: string, b: string) => (a >= b ? a : b);
      const minDateStr = (a: string, b: string) => (a <= b ? a : b);
      const endMtd = end;
      if (marchMtdPhase === '1') {
        start = maxDateStr('2026-03-01', start);
        end = minDateStr('2026-03-19', endMtd);
      } else {
        start = maxDateStr('2026-03-20', start);
        end = minDateStr('2026-03-31', endMtd);
      }
    }
    return { start, end };
  }, [mode, customStart, customEnd, selYear, selMonth, marchMtdPhase]);

  const prevYearRange = useMemo(
    () => getComparisonPrevRange(range.start, range.end, calendar),
    [range.start, range.end, calendar],
  );

  const rangeDisplayText = useMemo(
    () => formatComparisonRangeForDisplay(range.start, range.end, calendar),
    [range.start, range.end, calendar],
  );

  const { allowedStoreIds, managers, branches, cities } = useMemo(() => {
    const meta: Record<string, { manager?: string; city?: string; type?: string }> = raw?.store_meta || {};
    const stores = raw?.stores || {};
    const managersSet = new Set<string>();
    const citiesSet = new Set<string>();
    Object.values(meta).forEach((m: any) => {
      if (m?.manager) managersSet.add(String(m.manager));
      if (effectiveManager === 'all' || String(m?.manager) === effectiveManager) {
        if (m?.city) citiesSet.add(String(m.city));
      }
    });
    const managersList = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const citiesList = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const isBranchManager = user?.role === 'BranchManager';
    const branchesList = Object.keys(stores)
      .filter((sid) => {
        const m = meta[sid];
        if (isBranchManager && sid !== user?.storeId) return false;
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && String(m?.city || '') !== city) return false;
        if (selectedStoreType !== 'all') {
          const type = String(m?.type || '').toLowerCase();
          const isOnline = type === 'online' || type === 'platform' || type === 'warehouse';
          if (selectedStoreType === 'online' && !isOnline) return false;
          if (selectedStoreType === 'store' && isOnline) return false;
        }
        return true;
      })
      .sort((a, b) => (stores[a] || a).localeCompare(stores[b] || b, 'ar'));

    const allowed = new Set<string>();
    if (isBranchManager && user?.storeId) {
      allowed.add(user.storeId);
    } else if (branch === 'all' && effectiveManager === 'all' && city === 'all' && selectedStoreType === 'all') {
      Object.keys(stores).forEach((sid) => allowed.add(sid));
    } else {
      Object.keys(meta).forEach((sid) => {
        const m = meta[sid];
        if (branch !== 'all' && sid !== branch) return;
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return;
        if (city !== 'all' && String(m?.city || '') !== city) return;
        if (selectedStoreType !== 'all') {
          const type = String(m?.type || '').toLowerCase();
          const isOnline = type === 'online' || type === 'platform' || type === 'warehouse';
          if (selectedStoreType === 'online' && !isOnline) return;
          if (selectedStoreType === 'store' && isOnline) return;
        }
        allowed.add(sid);
      });
      if (allowed.size === 0 && branch === 'all' && effectiveManager === 'all' && city === 'all' && selectedStoreType === 'all') {
        Object.keys(stores).forEach((sid) => allowed.add(sid));
      }
    }
    return { allowedStoreIds: allowed, managers: managersList, branches: branchesList, cities: citiesList };
  }, [raw, branch, effectiveManager, city, selectedStoreType, user?.role, user?.storeId]);

  const mapBranchesData = useMemo(() => {
    if (!raw) return [];
    const rows = buildTopStoresRankForPeriod(raw, {
      allowedStoreIds,
      range: { start: range.start, end: range.end },
      prevYearRange,
      mode,
    });
    return mapBranchesDataWithLocations(rows, raw?.store_meta);
  }, [raw, allowedStoreIds, range.start, range.end, prevYearRange, mode]);

  const anomalyStores = useMemo<AnomalyStore[]>(() => {
    if (!raw) return [];
    const storeNames: Record<string, string> = raw?.stores || {};
    const perStoreDate: Record<string, Record<string, { sales: number; visitors: number }>> = {};
    const totalSalesByDate: Record<string, number> = {};
    const storeMeta: Record<string, { type?: string }> = raw?.store_meta || {};
    const isOnlineStore = (sid: string) => {
      const type = String(storeMeta?.[sid]?.type || '').toLowerCase();
      return type === 'online' || type === 'platform' || type === 'warehouse';
    };

    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      const ds = String(d).substring(0, 10);
      const storeId = String(sid);
      const val = Number(v) || 0;
      if (!allowedStoreIds.has(storeId) || isOnlineStore(storeId)) return;
      if (ds < range.start || ds > range.end) return;
      if (!perStoreDate[storeId]) perStoreDate[storeId] = {};
      if (!perStoreDate[storeId][ds]) perStoreDate[storeId][ds] = { sales: 0, visitors: 0 };
      perStoreDate[storeId][ds].sales += val;
      totalSalesByDate[ds] = (totalSalesByDate[ds] || 0) + val;
    });
    (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
      const ds = String(d).substring(0, 10);
      const storeId = String(sid);
      const val = Number(v) || 0;
      if (!allowedStoreIds.has(storeId) || isOnlineStore(storeId)) return;
      if (ds < range.start || ds > range.end) return;
      if (!perStoreDate[storeId]) perStoreDate[storeId] = {};
      if (!perStoreDate[storeId][ds]) perStoreDate[storeId][ds] = { sales: 0, visitors: 0 };
      perStoreDate[storeId][ds].visitors += val;
    });

    const storesOut: AnomalyStore[] = [];
    Object.entries(perStoreDate).forEach(([sid, byDate]) => {
      const daily = Object.entries(byDate)
        .map(([date, x]) => {
          const visitors = x.visitors;
          const sales = x.sales;
          const customerValue = visitors > 0 ? sales / visitors : 0;
          const sharePct = (totalSalesByDate[date] || 0) > 0 ? (sales / totalSalesByDate[date]) * 100 : 0;
          return { date, sales, visitors, customerValue, sharePct };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      if (daily.length < 6) return;

      const shares = daily.map((d) => d.sharePct);
      const visitors = daily.map((d) => d.visitors);
      const cvs = daily.map((d) => d.customerValue);

      const normal = {
        shareMin: percentile(shares, 0.2),
        shareMax: percentile(shares, 0.8),
        visitorsMin: percentile(visitors, 0.2),
        visitorsMax: percentile(visitors, 0.8),
        cvMin: percentile(cvs, 0.2),
        cvMax: percentile(cvs, 0.8),
      };

      const rows: AnomalyDailyRow[] = daily
        .map((d) => {
          const shareAnomaly = d.sharePct < normal.shareMin || d.sharePct > normal.shareMax;
          const visitorsAnomaly = d.visitors < normal.visitorsMin || d.visitors > normal.visitorsMax;
          const cvAnomaly = d.customerValue < normal.cvMin || d.customerValue > normal.cvMax;
          return { ...d, shareAnomaly, visitorsAnomaly, cvAnomaly };
        })
        .filter((d) => d.shareAnomaly || d.visitorsAnomaly || d.cvAnomaly);

      if (!rows.length) return;

      storesOut.push({
        id: sid,
        name: storeNames[sid] || sid,
        normal,
        rows: rows.sort((a, b) => b.date.localeCompare(a.date)),
      });
    });

    return storesOut.sort((a, b) => b.rows.length - a.rows.length);
  }, [raw, allowedStoreIds, range.start, range.end]);

  const formatSAR = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });

  if (err) {
    return <div className="p-6 bg-white rounded-xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  }
  if (!raw) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-4">
        <h1 className="text-xl font-black text-neutral-900 mb-1">ق.ع والمحاكاة</h1>
        <p className="text-sm text-neutral-500 mb-4">قيمة العميل، جدول الفروع، والمحاكاة — مع جدول تفاعلي للزوار وقيمة العميل (الحالي والماضي).</p>
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
          <div className={`${user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}`}>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفرع</div>
            <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {branches.map((code) => (
                <option key={code} value={code}>{raw?.stores?.[code] || code}</option>
              ))}
            </select>
          </div>
          <div className={`${user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}`}>
            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {cities.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">نوع المعرض</div>
            <select className="input" value={selectedStoreType} onChange={(e) => setSelectedStoreType(e.target.value)}>
              <option value="all">الكل</option>
              <option value="store">المعارض فقط</option>
              <option value="online">الأونلاين فقط</option>
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
          {mode === 'mtd' && new Date().getFullYear() === 2026 && new Date().getMonth() === 2 && (
            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-neutral-500 mb-1">فترة آذار</div>
              <select className="input" value={marchMtdPhase} onChange={(e) => setMarchMtdPhase(e.target.value as '1' | '2')}>
                <option value="1">الفترة الأولى (1–19 آذار)</option>
                <option value="2">الفترة الثانية (20–31 آذار)</option>
              </select>
            </div>
          )}
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
          <div className="text-sm font-semibold text-neutral-700 flex flex-col items-end gap-0.5">
            <span>{rangeDisplayText}</span>
            <span className="text-xs text-neutral-400">({calendar === 'hijri' ? 'مقارنة هجرية' : 'مقارنة ميلادية'})</span>
          </div>
        </div>
      </div>

      <CustomerValueInsights
        stores={mapBranchesData}
        formatSAR={formatSAR}
        mode={mode}
        periodLabel={rangeDisplayText}
      />

      <CustomerValueSimulationTable stores={mapBranchesData} />

      <div className="bg-white rounded-xl shadow-md border border-neutral-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h3 className="text-sm font-black text-neutral-900">الأرقام الشاذة</h3>
          <p className="text-xs text-neutral-500 mt-1">
            نرصد الأيام التي خرجت عن الوضع الطبيعي لكل فرع في: الاستحواذ، عدد الزوار، وقيمة العميل.
          </p>
        </div>
        {!anomalyStores.length ? (
          <div className="p-5 text-sm text-neutral-500">لا توجد أيام شاذة واضحة ضمن الفلاتر الحالية.</div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {anomalyStores.map((store) => {
              const isOpen = openAnomalyStoreId === store.id;
              return (
                <div key={store.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-right hover:bg-neutral-50 flex items-center justify-between"
                    onClick={() => setOpenAnomalyStoreId((prev) => (prev === store.id ? null : store.id))}
                  >
                    <span className="font-semibold text-neutral-900">{store.name}</span>
                    <span className="text-xs text-neutral-500">
                      {store.rows.length} يوم شاذ {isOpen ? '▲' : '▼'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3 bg-neutral-50/60">
                      <div className="rounded-lg border border-orange-200 bg-orange-50/70 p-3 text-xs text-neutral-700 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <b>الوضع الطبيعي للاستحواذ:</b>{' '}
                          <span className="dir-ltr inline-block">{store.normal.shareMin.toFixed(1)}% - {store.normal.shareMax.toFixed(1)}%</span>
                        </div>
                        <div>
                          <b>الوضع الطبيعي للزوار:</b>{' '}
                          <span className="dir-ltr inline-block">{Math.round(store.normal.visitorsMin).toLocaleString()} - {Math.round(store.normal.visitorsMax).toLocaleString()}</span>
                        </div>
                        <div>
                          <b>الوضع الطبيعي لقيمة العميل:</b>{' '}
                          <span className="dir-ltr inline-block">{formatSAR(store.normal.cvMin)} - {formatSAR(store.normal.cvMax)}</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="bg-neutral-100 text-neutral-700">
                              <th className="p-2 text-right">اليوم</th>
                              <th className="p-2 text-center">المبيعات</th>
                              <th className="p-2 text-center">الاستحواذ</th>
                              <th className="p-2 text-center">الزوار</th>
                              <th className="p-2 text-center">قيمة عميل</th>
                            </tr>
                          </thead>
                          <tbody>
                            {store.rows.map((r) => (
                              <tr key={`${store.id}-${r.date}`} className="border-t border-neutral-100">
                                <td className="p-2 font-mono">{r.date}</td>
                                <td className="p-2 text-center dir-ltr">{formatSAR(r.sales)}</td>
                                <td className={`p-2 text-center dir-ltr font-bold ${r.shareAnomaly ? 'text-red-700' : 'text-neutral-700'}`}>
                                  {r.sharePct.toFixed(1)}%
                                </td>
                                <td className={`p-2 text-center dir-ltr font-bold ${r.visitorsAnomaly ? 'text-red-700' : 'text-neutral-700'}`}>
                                  {Math.round(r.visitors).toLocaleString()}
                                </td>
                                <td className={`p-2 text-center dir-ltr font-bold ${r.cvAnomaly ? 'text-red-700' : 'text-neutral-700'}`}>
                                  {formatSAR(r.customerValue)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
