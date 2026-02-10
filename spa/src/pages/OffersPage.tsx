import React, { useEffect, useMemo, useState } from 'react';
import { loadOffersData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { DownloadIcon, XIcon, TagIcon, SalesIcon, InvoicesIcon, PremiumTargetIcon, CustomerValueIcon, FireIcon } from '../components/Icons';
import { KPICard } from '../components/DashboardComponents';
import * as XLSX from 'xlsx';

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

type PeriodKey = 'mtd' | '7d' | '14d' | '30d' | 'yest' | 'custom';

export default function OffersPage() {
  const user = getCurrentUser();
  const [data, setData] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodKey>('mtd');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  useEffect(() => {
    loadOffersData()
      .then(setData)
      .catch((e) => setErr(e?.message || String(e)));
    loadManagementData().then(setMgmt).catch(() => { });
  }, []);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const { managers, branches, cities, allowedStoreIds } = useMemo(() => {
    const meta: Record<string, { manager?: string; city?: string }> = mgmt?.store_meta || {};
    const stores = mgmt?.stores || {};
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
    return { managers, branches, cities, allowedStoreIds: allowed };
  }, [mgmt, branch, city, effectiveManager]);

  const rawOffers = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : (Array.isArray(data?.offers) ? data.offers : []);
  }, [data]);

  // Compute date range based on period
  const dateRange = useMemo(() => {
    const now = new Date();
    const todayYMD = toYMD(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayYMD = toYMD(yesterday);
    const ymd = (d: Date) => toYMD(d);

    if (period === 'yest') return { start: yesterdayYMD, end: yesterdayYMD, label: 'أمس' };
    if (period === '7d') {
      const s = new Date(now); s.setDate(now.getDate() - 7);
      return { start: ymd(s), end: yesterdayYMD, label: 'آخر 7 أيام' };
    }
    if (period === '14d') {
      const s = new Date(now); s.setDate(now.getDate() - 14);
      return { start: ymd(s), end: yesterdayYMD, label: 'آخر 14 يوم' };
    }
    if (period === '30d') {
      const s = new Date(now); s.setDate(now.getDate() - 30);
      return { start: ymd(s), end: yesterdayYMD, label: 'آخر 30 يوم' };
    }
    if (period === 'mtd') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: ymd(s), end: yesterdayYMD, label: 'من أول الشهر' };
    }
    if (period === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd, label: 'فترة مخصصة' };
    }
    return { start: todayYMD, end: todayYMD, label: 'اليوم' };
  }, [period, customStart, customEnd]);

  const offers = useMemo(() => {
    const { start, end } = dateRange;
    const now = new Date();
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayYMD = toYMD(yesterdayDate);
    const storesMap = mgmt?.stores || {};

    return rawOffers.map((o: any) => {
      let yestSales = 0, yestDisc = 0, yestOps = 0;
      let periodSales = 0, periodDisc = 0, periodOps = 0;

      const storeBreakdown: Record<string, { sales: number; disc: number; ops: number; name: string }> = {};

      // Aggregate from stats (daily per-store sale records)
      const statsArray = o.stats || [];
      statsArray.forEach((s: any) => {
        const d = s.d;
        const sid = String(s.s);
        if (!allowedStoreIds.has(sid)) return;

        if (d >= start && d <= end) {
          const sale = Number(s.bill ?? s.sale ?? 0);
          const disc = Number(s.disc ?? 0);
          const cnt = Number(s.cnt ?? 0);
          periodSales += sale;
          periodDisc += disc;
          periodOps += cnt;

          if (!storeBreakdown[sid]) storeBreakdown[sid] = { sales: 0, disc: 0, ops: 0, name: storesMap[sid] || sid };
          storeBreakdown[sid].sales += sale;
          storeBreakdown[sid].disc += disc;
          storeBreakdown[sid].ops += cnt;
        }
        if (d === yesterdayYMD) {
          yestSales += Number(s.bill ?? s.sale ?? 0);
          yestDisc += Number(s.disc ?? 0);
          yestOps += Number(s.cnt ?? 0);
        }
      });

      // Legacy fallback
      if (periodSales === 0 && periodOps === 0 && o.stores) {
        Object.keys(o.stores).forEach(sid => {
          if (allowedStoreIds.has(String(sid))) {
            const sObj = o.stores[sid] || {};
            const sale = Number(sObj.s_m ?? 0);
            const disc = Number(sObj.d_m ?? 0);
            const ops = Number(sObj.t_m ?? 0);
            periodSales += sale;
            periodDisc += disc;
            periodOps += ops;
            yestSales += Number(sObj.s_y ?? 0);
            yestDisc += Number(sObj.d_y ?? 0);
            yestOps += Number(sObj.t_y ?? 0);

            if (!storeBreakdown[sid]) storeBreakdown[sid] = { sales: 0, disc: 0, ops: 0, name: storesMap[sid] || sid };
            storeBreakdown[sid].sales += sale;
            storeBreakdown[sid].disc += disc;
            storeBreakdown[sid].ops += ops;
          }
        });
      }

      // Aggregate items within date range and allowed stores
      const itemsRaw = o.items || [];
      const itemAgg: Record<string, { id: string; name: string; qty: number }> = {};
      itemsRaw.forEach((it: any) => {
        const d = it.d;
        const sid = String(it.s || '');
        // Filter by date range and store
        if (d && d >= start && d <= end && (sid === '' || allowedStoreIds.has(sid))) {
          const itemId = String(it.i || it.id || it.item_id || '');
          const itemName = String(it.n || it.name || it.item_name || itemId);
          const qty = Math.abs(Number(it.q || it.qty || it.quantity || 0));
          if (!itemId) return;
          if (!itemAgg[itemId]) itemAgg[itemId] = { id: itemId, name: itemName, qty: 0 };
          itemAgg[itemId].qty += qty;
          // Use the longest/most descriptive name
          if (itemName.length > itemAgg[itemId].name.length) itemAgg[itemId].name = itemName;
        }
      });
      const aggregatedItems = Object.values(itemAgg).sort((a, b) => b.qty - a.qty);

      return {
        ...o,
        yestSales, yestDisc, yestOps,
        periodSales, periodDisc, periodOps,
        yestEff: yestSales > 0 ? (yestSales / (yestSales + yestDisc)) * 100 : 100,
        periodEff: periodSales > 0 ? (periodSales / (periodSales + periodDisc)) * 100 : 100,
        periodAvgBasket: periodOps > 0 ? periodSales / periodOps : 0,
        storeBreakdown,
        aggregatedItems,
      };
    }).filter((o: any) => {
      if (statusFilter === 'Enabled' && (o.status === 'Disabled' || o.enabled === false)) return false;
      if (statusFilter === 'Disabled' && (o.status !== 'Disabled' && o.enabled !== false)) return false;
      return o.periodSales > 0 || o.periodOps > 0 || o.yestSales > 0;
    });
  }, [rawOffers, allowedStoreIds, dateRange, statusFilter, mgmt]);

  const stats = useMemo(() => {
    const res = offers.reduce((acc: any, o: any) => {
      acc.totalYest += o.yestSales;
      acc.totalPeriod += o.periodSales;
      acc.totalYestOps += o.yestOps;
      acc.totalPeriodOps += o.periodOps;
      acc.totalPeriodDisc += o.periodDisc;
      return acc;
    }, { totalYest: 0, totalPeriod: 0, totalYestOps: 0, totalPeriodOps: 0, totalPeriodDisc: 0 });

    return {
      ...res,
      totalOffers: offers.length,
      periodEff: res.totalPeriod > 0 ? (res.totalPeriod / (res.totalPeriod + res.totalPeriodDisc)) * 100 : 0,
      periodAvgBasket: res.totalPeriodOps > 0 ? res.totalPeriod / res.totalPeriodOps : 0,
    };
  }, [offers]);

  // Top products across all offers (aggregated items)
  const topProducts = useMemo(() => {
    const prodMap = new Map<string, { id: string; name: string; qty: number; offerCount: number }>();
    offers.forEach((o: any) => {
      const items = o.aggregatedItems || [];
      items.forEach((it: any) => {
        const prev = prodMap.get(it.id) || { id: it.id, name: it.name, qty: 0, offerCount: 0 };
        prev.qty += it.qty;
        prev.offerCount += 1;
        if (it.name.length > prev.name.length) prev.name = it.name;
        prodMap.set(it.id, prev);
      });
    });
    return Array.from(prodMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [offers]);

  // Efficiency summary
  const efficiencySummary = useMemo(() => {
    return [...offers]
      .filter((o: any) => o.periodSales > 0)
      .sort((a: any, b: any) => b.periodEff - a.periodEff)
      .slice(0, 15)
      .map((o: any) => ({
        name: o.name || o.offer_name || o.id || '-',
        periodEff: o.periodEff,
        periodAvgBasket: o.periodAvgBasket,
        periodSales: o.periodSales,
        periodOps: o.periodOps,
      }));
  }, [offers]);

  const exportToExcel = () => {
    const rows = offers.map((o: any) => ({
      'كود العرض': o.id || o.code,
      'اسم العرض': o.name,
      'الحالة': o.status === 'Enabled' ? 'مفعل' : 'معطل',
      'مبيعات أمس': o.yestSales,
      [`مبيعات (${dateRange.label})`]: o.periodSales,
      'عمليات أمس': o.yestOps,
      [`عمليات (${dateRange.label})`]: o.periodOps,
      [`خصم (${dateRange.label})`]: o.periodDisc,
      'كفاءة %': o.periodEff.toFixed(1) + '%',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Offers Report');
    XLSX.writeFile(wb, `Offers_Report_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  const top5 = useMemo(() => {
    return [...offers].sort((a: any, b: any) => b.periodSales - a.periodSales).slice(0, 5);
  }, [offers]);

  const weakOffers = useMemo(() => {
    return [...offers]
      .filter((o: any) => o.periodEff > 0 && o.periodEff < 50)
      .sort((a: any, b: any) => a.periodEff - b.periodEff)
      .slice(0, 5);
  }, [offers]);

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">تحليل العروض</h1>
          <p className="text-neutral-500 mt-1">أداء العروض والخصومات حسب الفترة والمعرض</p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-bold shadow-md"
        >
          <DownloadIcon />
          تصدير Excel
        </button>
      </header>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-sm font-semibold text-neutral-600">الفترة:</span>
          <div className="flex flex-wrap gap-2">
            <PeriodButton active={period === 'yest'} label="أمس" onClick={() => setPeriod('yest')} />
            <PeriodButton active={period === 'mtd'} label="الشهر الحالي" onClick={() => setPeriod('mtd')} />
            <PeriodButton active={period === '7d'} label="7 أيام" onClick={() => setPeriod('7d')} />
            <PeriodButton active={period === '14d'} label="14 يوم" onClick={() => setPeriod('14d')} />
            <PeriodButton active={period === '30d'} label="30 يوم" onClick={() => setPeriod('30d')} />
            <PeriodButton active={period === 'custom'} label="مخصص" onClick={() => setPeriod('custom')} />
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" className="input text-sm" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span className="text-neutral-400">→</span>
              <input type="date" className="input text-sm" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          )}
          <span className="text-xs text-neutral-400 mr-auto">{dateRange.label} | {dateRange.start} → {dateRange.end}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {isAdminOrAuditor(user?.role) && (
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</label>
              <select className="input w-full" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="all">الكل</option>
                {managers.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">الفرع</label>
            <select className="input w-full" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {branches.map((code) => (
                <option key={code} value={code}>{mgmt?.stores?.[code] || code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">المدينة</label>
            <select className="input w-full" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {(cities || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">الحالة</label>
            <select className="input w-full" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">الكل</option>
              <option value="Enabled">فعال (Enabled)</option>
              <option value="Disabled">معطل (Disabled)</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
        <KPICard title="إجمالي العروض" value={stats.totalOffers} format={v => Math.round(v).toLocaleString()} icon={<TagIcon />} />
        <KPICard title="مبيعات أمس" value={stats.totalYest} format={formatSAR} icon={<SalesIcon />} />
        <KPICard title={`مبيعات (${period === 'mtd' ? 'الشهر' : 'الفترة'})`} value={stats.totalPeriod} format={formatSAR} icon={<SalesIcon />} />
        <KPICard title="عمليات الفترة" value={stats.totalPeriodOps} format={v => Math.round(v).toLocaleString()} icon={<InvoicesIcon />} />
        <KPICard title="كفاءة العروض" value={stats.periodEff} format={v => v.toFixed(1) + '%'} icon={<PremiumTargetIcon />} showProgress progressValue={stats.periodEff} />
        <KPICard title="متوسط السلة" value={stats.periodAvgBasket} format={formatSAR} icon={<CustomerValueIcon />} />
        <KPICard title="إجمالي الخصم" value={stats.totalPeriodDisc} format={formatSAR} icon={<FireIcon />} />
      </div>

      {/* Top 5 */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
        <h2 className="text-lg font-bold text-neutral-900 mb-4 border-r-4 border-orange-500 pr-2">أفضل 5 عروض</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {top5.length === 0 ? (
            <p className="text-neutral-500 col-span-full">لا توجد عروض لعرضها.</p>
          ) : (
            top5.map((o: any, i: number) => {
              const pct = stats.totalPeriod > 0 ? (o.periodSales / stats.totalPeriod) * 100 : 0;
              return (
                <div
                  key={i}
                  className="rounded-xl border border-neutral-200 p-4 border-r-4 border-r-orange-500 bg-neutral-50/50 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedOffer(o)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-orange-600">#{i + 1}</span>
                    <span className="text-sm font-bold text-neutral-700">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="font-semibold text-neutral-900 text-sm mb-3 line-clamp-2">{o.name || o.offer_name || o.id || '-'}</div>
                  <div className="text-xs space-y-1 text-neutral-600">
                    <div>المبيعات: {formatSAR(o.periodSales)}</div>
                    <div>أمس: {formatSAR(o.yestSales)}</div>
                    <div>العمليات: {o.periodOps.toLocaleString()}</div>
                    <div>المنتجات: {o.aggregatedItems?.length || 0}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Weak Offers */}
      {weakOffers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
          <h2 className="text-lg font-bold text-neutral-900 mb-4 border-r-4 border-red-500 pr-2">عروض ضعيفة الأداء</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {weakOffers.map((o: any, i: number) => (
              <div
                key={i}
                className="rounded-xl border border-red-200 p-4 bg-red-50/50 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedOffer(o)}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold text-red-600">#{i + 1}</span>
                  <span className="text-sm font-bold text-red-700">{o.periodEff.toFixed(1)}%</span>
                </div>
                <div className="font-semibold text-neutral-900 text-sm mb-3 line-clamp-2">{o.name || o.offer_name || o.id || '-'}</div>
                <div className="text-xs space-y-1 text-neutral-600">
                  <div>المبيعات: {formatSAR(o.periodSales)}</div>
                  <div>الخصم: {formatSAR(o.periodDisc)}</div>
                  <div>العمليات: {o.periodOps.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Efficiency Summary */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-purple-50 to-white">
          <h3 className="text-lg font-bold text-neutral-900">ملخص الكفاءة</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-800 text-white">
                <th className="py-3 px-4 text-right">#</th>
                <th className="py-3 px-4 text-right">اسم العرض</th>
                <th className="py-3 px-4 text-center">كفاءة %</th>
                <th className="py-3 px-4 text-center">متوسط السلة</th>
                <th className="py-3 px-4 text-center">المبيعات</th>
                <th className="py-3 px-4 text-center">العمليات</th>
              </tr>
            </thead>
            <tbody>
              {efficiencySummary.map((o, i) => (
                <tr key={i} className="border-b border-neutral-100 hover:bg-purple-50 transition-colors">
                  <td className="py-3 px-4 text-neutral-500">{i + 1}</td>
                  <td className="py-3 px-4 font-bold text-neutral-900">{o.name}</td>
                  <td className={`py-3 px-4 text-center font-bold ${o.periodEff >= 80 ? 'text-green-600' : o.periodEff >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{o.periodEff.toFixed(1)}%</td>
                  <td className="py-3 px-4 text-center font-semibold text-blue-700">{formatSAR(o.periodAvgBasket)}</td>
                  <td className="py-3 px-4 text-center">{formatSAR(o.periodSales)}</td>
                  <td className="py-3 px-4 text-center">{o.periodOps.toLocaleString()}</td>
                </tr>
              ))}
              {efficiencySummary.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-neutral-500">لا توجد بيانات كافية.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-green-50 to-white">
            <h3 className="text-lg font-bold text-neutral-900">أكثر المنتجات مبيعاً في العروض</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-800 text-white">
                  <th className="py-3 px-4 text-right">#</th>
                  <th className="py-3 px-4 text-right">المنتج</th>
                  <th className="py-3 px-4 text-center">الكمية</th>
                  <th className="py-3 px-4 text-center">عدد العروض</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={p.id} className="border-b border-neutral-100 hover:bg-green-50 transition-colors">
                    <td className="py-3 px-4 text-neutral-500">{i + 1}</td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs text-neutral-500">{p.id}</div>
                      <div className="font-semibold text-neutral-900">{p.name}</div>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-green-700">{Math.round(p.qty).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center font-bold text-orange-600">{p.offerCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offers List */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
          <h3 className="text-lg font-bold text-neutral-900">قائمة العروض ({offers.length})</h3>
        </div>
        <div className="overflow-x-auto">
          {offers.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">لا توجد عروض بعد تطبيق الفلاتر.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-800 text-white">
                  <th className="py-3 px-4 text-right">#</th>
                  <th className="py-3 px-4 text-right">اسم العرض</th>
                  <th className="py-3 px-4 text-center bg-neutral-700/50">أمس</th>
                  <th className="py-3 px-4 text-center bg-neutral-700/50">فواتير أمس</th>
                  <th className="py-3 px-4 text-center">المبيعات</th>
                  <th className="py-3 px-4 text-center">الفواتير</th>
                  <th className="py-3 px-4 text-center">الخصم</th>
                  <th className="py-3 px-4 text-center">كفاءة</th>
                  <th className="py-3 px-4 text-center">م. السلة</th>
                  <th className="py-3 px-4 text-center">منتجات</th>
                </tr>
              </thead>
              <tbody>
                {offers.slice(0, 100).map((o: any, i: number) => (
                  <tr
                    key={i}
                    className="border-b border-neutral-100 hover:bg-orange-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedOffer(o)}
                  >
                    <td className="py-3 px-4 text-neutral-500">{i + 1}</td>
                    <td className="py-3 px-4 font-bold text-neutral-900">{o.name || o.offer_name || o.id || '-'}</td>
                    <td className="py-3 px-4 text-center font-bold text-green-600 bg-green-50/30">{formatSAR(o.yestSales)}</td>
                    <td className="py-3 px-4 text-center text-neutral-600 bg-green-50/30">{o.yestOps.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center font-bold text-blue-700">{formatSAR(o.periodSales)}</td>
                    <td className="py-3 px-4 text-center font-medium">{o.periodOps.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center text-red-500 font-mono">{o.periodDisc.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center font-black text-orange-600">{o.periodEff.toFixed(1)}%</td>
                    <td className="py-3 px-4 text-center text-sky-700 font-semibold">{formatSAR(o.periodAvgBasket)}</td>
                    <td className="py-3 px-4 text-center text-neutral-600">{o.aggregatedItems?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Offer Detail Modal */}
      {selectedOffer && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelectedOffer(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-neutral-200 p-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">{selectedOffer.name || selectedOffer.offer_name || '-'}</h2>
                <div className="text-xs text-neutral-500 mt-1">{selectedOffer.id || ''} | {selectedOffer.status || ''} | {dateRange.label}</div>
              </div>
              <button onClick={() => setSelectedOffer(null)} className="p-2 hover:bg-neutral-100 rounded-lg"><XIcon /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Offer KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-neutral-500 font-semibold">المبيعات</div>
                  <div className="text-lg font-bold text-green-700">{formatSAR(selectedOffer.periodSales)}</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-neutral-500 font-semibold">الخصم</div>
                  <div className="text-lg font-bold text-red-600">{formatSAR(selectedOffer.periodDisc)}</div>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-neutral-500 font-semibold">كفاءة %</div>
                  <div className="text-lg font-bold text-orange-700">{selectedOffer.periodEff.toFixed(1)}%</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-neutral-500 font-semibold">متوسط السلة</div>
                  <div className="text-lg font-bold text-blue-700">{formatSAR(selectedOffer.periodAvgBasket)}</div>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-neutral-500 font-semibold">العمليات</div>
                  <div className="text-lg font-bold text-purple-700">{selectedOffer.periodOps.toLocaleString()}</div>
                </div>
              </div>

              {/* Products Breakdown */}
              {selectedOffer.aggregatedItems && selectedOffer.aggregatedItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-neutral-700 mb-2 border-r-4 border-orange-400 pr-2">منتجات العرض ({selectedOffer.aggregatedItems.length})</h3>
                  <div className="overflow-x-auto rounded-lg border border-neutral-200 max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-neutral-100">
                        <tr>
                          <th className="py-2 px-3 text-right">#</th>
                          <th className="py-2 px-3 text-right">كود</th>
                          <th className="py-2 px-3 text-right">المنتج</th>
                          <th className="py-2 px-3 text-center">الكمية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOffer.aggregatedItems.map((it: any, idx: number) => (
                          <tr key={idx} className="border-t border-neutral-100 hover:bg-orange-50">
                            <td className="py-2 px-3 text-neutral-400 text-xs">{idx + 1}</td>
                            <td className="py-2 px-3 font-mono text-xs text-neutral-500">{it.id}</td>
                            <td className="py-2 px-3 font-semibold text-neutral-900 text-sm">{it.name}</td>
                            <td className="py-2 px-3 text-center font-bold text-orange-700">{Math.round(it.qty).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* No items message */}
              {(!selectedOffer.aggregatedItems || selectedOffer.aggregatedItems.length === 0) && (
                <div className="text-center p-6 bg-neutral-50 rounded-xl text-neutral-500 text-sm">لا توجد بيانات منتجات لهذا العرض في الفترة المحددة.</div>
              )}

              {/* Per-Store Breakdown */}
              {selectedOffer.storeBreakdown && Object.keys(selectedOffer.storeBreakdown).length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-neutral-700 mb-2 border-r-4 border-blue-400 pr-2">أداء العرض حسب المعرض ({Object.keys(selectedOffer.storeBreakdown).length})</h3>
                  <div className="overflow-x-auto rounded-lg border border-neutral-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-neutral-100">
                          <th className="py-2 px-3 text-right">المعرض</th>
                          <th className="py-2 px-3 text-center">المبيعات</th>
                          <th className="py-2 px-3 text-center">الخصم</th>
                          <th className="py-2 px-3 text-center">العمليات</th>
                          <th className="py-2 px-3 text-center">كفاءة %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(selectedOffer.storeBreakdown)
                          .sort(([, a]: any, [, b]: any) => b.sales - a.sales)
                          .map(([sid, s]: [string, any]) => {
                            const eff = s.sales > 0 ? (s.sales / (s.sales + s.disc)) * 100 : 0;
                            return (
                              <tr key={sid} className="border-t border-neutral-100 hover:bg-blue-50">
                                <td className="py-2 px-3 font-semibold text-neutral-900">{s.name}</td>
                                <td className="py-2 px-3 text-center font-bold text-green-700">{formatSAR(s.sales)}</td>
                                <td className="py-2 px-3 text-center text-red-500">{formatSAR(s.disc)}</td>
                                <td className="py-2 px-3 text-center">{s.ops.toLocaleString()}</td>
                                <td className={`py-2 px-3 text-center font-bold ${eff >= 80 ? 'text-green-600' : eff >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{eff.toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPIBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: `4px solid ${color}` }}>
      <div className="text-xs font-semibold text-neutral-500">{label}</div>
      <div className="text-xl font-bold text-neutral-900 mt-1">{value}</div>
    </div>
  );
}

function PeriodButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${active ? 'bg-orange-600 text-white shadow-md' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
    >
      {label}
    </button>
  );
}
