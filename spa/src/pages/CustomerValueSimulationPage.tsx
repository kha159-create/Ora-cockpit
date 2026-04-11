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
        <h1 className="text-xl font-black text-neutral-900 mb-1">ق.م والمحاكاة</h1>
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
    </div>
  );
}
