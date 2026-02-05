import { useEffect, useMemo, useState } from 'react';
import { loadOffersData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { DownloadIcon } from '../components/Icons';
import * as XLSX from 'xlsx';

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

type PeriodKey = 'mtd' | '7d' | '14d' | '30d' | 'yest';

// Helper component for period buttons
const PeriodButton = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${active
      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
      : 'bg-white text-neutral-700 border-neutral-200 hover:bg-orange-50 hover:border-orange-200'
      }`}
  >
    {label}
  </button>
);

export default function OffersPage() {
  const user = getCurrentUser();
  const [data, setData] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodKey>('mtd');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all | Enabled | Disabled

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
    const base = Array.isArray(data) ? data : (data.offers || data.data || []);
    return Array.isArray(base) ? base : [];
  }, [data]);

  const today = useMemo(() => new Date('2026-02-04'), []); // Using metadata time

  const dateRange = useMemo(() => {
    const end = new Date(today);
    const start = new Date(today);
    if (period === 'mtd') start.setDate(1);
    else if (period === '7d') start.setDate(end.getDate() - 6);
    else if (period === '14d') start.setDate(end.getDate() - 13);
    else if (period === '30d') start.setDate(end.getDate() - 29);
    else if (period === 'yest') { start.setDate(end.getDate() - 1); end.setDate(end.getDate() - 1); }

    const toYMD = (d: Date) => d.toISOString().split('T')[0];
    return { start: toYMD(start), end: toYMD(end) };
  }, [period, today]);

  const periodSuf = useMemo(() => {
    if (period === 'mtd') return 'm';
    if (period === '7d') return '7d';
    if (period === '14d') return '14d';
    if (period === '30d') return '30d';
    if (period === 'yest') return 'y';
    return 'm'; // Default
  }, [period]);

  const offers = useMemo(() => {
    const { start: startYMD, end: endYMD } = dateRange;

    let list = rawOffers.map((o: any) => {
      let sales = 0;
      let discount = 0;
      let ops = 0;

      const statsArray = o.stats || [];
      statsArray.forEach((s: any) => {
        const d = s.d;
        const sid = String(s.s);
        if (d >= startYMD && d <= endYMD && allowedStoreIds.has(sid)) {
          sales += Number(s.bill ?? s.sale ?? 0);
          discount += Number(s.disc ?? 0);
          ops += Number(s.cnt ?? 0);
        }
      });

      // Legacy support check if stats were empty but stores existed
      if (sales === 0 && ops === 0 && o.stores) {
        const suf = periodSuf;
        const storeData = o.stores || {};
        Object.keys(storeData).forEach(sid => {
          if (allowedStoreIds.has(String(sid))) {
            const sObj = storeData[sid] || {};
            sales += Number(sObj[`s_${suf}`] ?? 0);
            discount += Number(sObj[`d_${suf}`] ?? 0);
            ops += Number(sObj[`t_${suf}`] ?? 0);
          }
        });
      }

      // Final fallbacks for variety of field names
      if (sales === 0 && ops === 0) {
        sales = safeNum(o[`s_${periodSuf}`] || o.filteredSales || o.sales || o.amount || o.totalSales || o.bill_total || 0);
        discount = safeNum(o[`d_${periodSuf}`] || o.discount || o.totalDiscount || o.disc_total || 0);
        ops = safeNum(o[`t_${periodSuf}`] || o.operations || o.transactions || o.ops || o.cnt || 0);
      }

      const eff = sales > 0 ? (sales / (sales + discount)) * 100 : 100;

      return {
        ...o,
        dispSales: sales,
        dispDiscount: discount,
        dispOps: ops,
        dispEff: eff
      };
    }).filter((o: any) => {
      if (statusFilter === 'Enabled' && (o.status === 'Disabled' || o.enabled === false)) return false;
      if (statusFilter === 'Disabled' && (o.status !== 'Disabled' && o.enabled !== false)) return false;
      return o.dispSales > 0 || o.dispOps > 0;
    });
    return list;
  }, [rawOffers, dateRange, allowedStoreIds, periodSuf, statusFilter]);

  const stats = useMemo(() => {
    const totalSales = offers.reduce((s: number, o: any) => s + o.dispSales, 0);
    const totalDiscount = offers.reduce((s: number, o: any) => s + o.dispDiscount, 0);
    const totalOps = offers.reduce((s: number, o: any) => s + o.dispOps, 0);
    const avgBasket = totalOps > 0 ? Math.round(totalSales / totalOps) : 0;
    const efficiency = totalSales > 0 ? (totalSales / (totalSales + totalDiscount)) * 100 : (offers.length ? 100 : 0);
    return { totalOffers: offers.length, totalSales, totalDiscount, totalOps, avgBasket, efficiency };
  }, [offers]);

  const exportToExcel = () => {
    const rows = offers.map(o => ({
      'اسم العرض': o.name,
      'النوع': o.type || 'خصم مباشر',
      'الحالة': o.status === 'Disabled' ? 'معطل' : 'نشط',
      'فترة العرض': `${o.start} إلى ${o.end}`,
      'المبيعات': o.dispSales,
      'الخصم': o.dispDiscount,
      'عدد العمليات': o.dispOps,
      'الفعالية %': o.dispEff.toFixed(1) + '%'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Offers Report');
    XLSX.writeFile(wb, `Offers_Report_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  const top5 = useMemo(() => {
    return [...offers]
      .sort((a: any, b: any) => b.dispSales - a.dispSales)
      .slice(0, 5);
  }, [offers]);

  const filteredOffers = useMemo(() => {
    return offers.filter((o: any) => o.dispEff > 0 && o.dispEff < 50);
  }, [offers]);

  const weakOffers = useMemo(() => {
    return [...filteredOffers]
      .sort((a: any, b: any) => a.dispEff - b.dispEff)
      .slice(0, 5);
  }, [filteredOffers]);

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
      <header>
        <h1 className="text-2xl font-bold text-neutral-900">تحليل العروض</h1>
        <p className="text-neutral-500 mt-1">أداء العروض والخصومات حسب الفترة والمعرض</p>
      </header>

      {/* شريط الفلاتر — هوية التطبيق */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-sm font-semibold text-neutral-600">الفترة:</span>
          <div className="flex flex-wrap gap-2">
            <PeriodButton active={period === 'yest'} label="أمس" onClick={() => setPeriod('yest')} />
            <PeriodButton active={period === 'mtd'} label="الشهر الحالي" onClick={() => setPeriod('mtd')} />
            <PeriodButton active={period === '7d'} label="آخر 7 أيام" onClick={() => setPeriod('7d')} />
            <PeriodButton active={period === '14d'} label="آخر 14 يوم" onClick={() => setPeriod('14d')} />
            <PeriodButton active={period === '30d'} label="آخر 30 يوم" onClick={() => setPeriod('30d')} />
          </div>
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* These period buttons are redundant with the ones above, removing them to avoid duplication */}
            </div>
            <div className="flex items-center gap-3">
              <select className="input text-xs" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
                <option value="all">جميع الحالات</option>
                <option value="Enabled">النشطة فقط</option>
                <option value="Disabled">المعطلة فقط</option>
              </select>
              <button className="btn-secondary py-2 px-4 flex items-center gap-2 bg-green-600 text-white border-green-600 hover:bg-green-700 hover:border-green-700" onClick={exportToExcel}>
                <DownloadIcon /> تصدير Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* بطاقات المؤشرات — 6 كروت مثل الريبو الأصلي */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center identity-card">
          <div className="text-xs font-semibold text-neutral-500">إجمالي العروض</div>
          <div className="text-xl font-bold text-orange-600 mt-1">{stats.totalOffers}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: '4px solid #10b981' }}>
          <div className="text-xs font-semibold text-neutral-500">إجمالي المبيعات</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{formatSAR(stats.totalSales)}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: '4px solid #ef4444' }}>
          <div className="text-xs font-semibold text-neutral-500">إجمالي الخصم</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{stats.totalDiscount.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: '4px solid #3b82f6' }}>
          <div className="text-xs font-semibold text-neutral-500">عدد العمليات</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{stats.totalOps.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: '4px solid #6366f1' }}>
          <div className="text-xs font-semibold text-neutral-500">متوسط السلة</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{stats.avgBasket}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: '4px solid #8b5cf6' }}>
          <div className="text-xs font-semibold text-neutral-500">نسبة الكفاءة</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{stats.efficiency.toFixed(1)}%</div>
        </div>
      </div>

      {/* أفضل 5 عروض */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
        <h2 className="text-lg font-bold text-neutral-900 mb-4 border-r-4 border-orange-500 pr-2">🏆 أفضل 5 عروض (Top 5 Offers)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {top5.length === 0 ? (
            <p className="text-neutral-500 col-span-full">لا توجد عروض لعرضها.</p>
          ) : (
            top5.map((o: any, i: number) => {
              const sales = o.dispSales;
              const discount = o.dispDiscount;
              const ops = o.dispOps;
              const pct = stats.totalSales > 0 ? (sales / stats.totalSales) * 100 : 0;
              return (
                <div key={i} className="rounded-xl border border-neutral-200 p-4 border-r-4 border-r-orange-500 bg-neutral-50/50 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-orange-600">#{i + 1}</span>
                    <span className="text-sm font-bold text-neutral-700">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="font-semibold text-neutral-900 text-sm mb-3 line-clamp-2">{o.name || o.offer_name || o.id || '-'}</div>
                  <div className="text-xs space-y-1 text-neutral-600">
                    <div>المبيعات: {formatSAR(sales)}</div>
                    <div>الخصم: {discount.toLocaleString()}</div>
                    <div>العمليات: {ops.toLocaleString()}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* عروض ضعيفة الأداء */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
        <h2 className="text-lg font-bold text-neutral-900 mb-4 border-r-4 border-red-500 pr-2">⚠️ عروض ضعيفة الأداء (Low Performance Offers)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {weakOffers.length === 0 ? (
            <p className="text-neutral-500 col-span-full">لا توجد عروض ضعيفة الأداء حسب معيار الكفاءة.</p>
          ) : (
            weakOffers.map((o: any, i: number) => {
              const sales = o.dispSales;
              const discount = o.dispDiscount;
              const ops = o.dispOps;
              const eff = o.dispEff;
              return (
                <div key={i} className="rounded-xl border border-red-200 p-4 bg-red-50/50 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-red-600">⚠️</span>
                    <span className="text-sm font-bold text-red-700">{eff.toFixed(1)}%</span>
                  </div>
                  <div className="font-semibold text-neutral-900 text-sm mb-3 line-clamp-2">{o.name || o.offer_name || o.id || '-'}</div>
                  <div className="text-xs space-y-1 text-neutral-600">
                    <div>المبيعات: {formatSAR(sales)}</div>
                    <div>الخصم: {discount.toLocaleString()}</div>
                    <div>العمليات: {ops.toLocaleString()}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* قائمة العروض */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
          <h3 className="text-lg font-bold text-neutral-900">📋 قائمة العروض (Offers List)</h3>
        </div>
        <div className="overflow-x-auto">
          {offers.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">لا توجد عروض بعد تطبيق الفلاتر.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-200">
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">#</th>
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">اسم العرض</th>
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">المبيعات</th>
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">الخصم</th>
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">العمليات</th>
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">الكفاءة %</th>
                </tr>
              </thead>
              <tbody>
                {offers.slice(0, 100).map((o: any, i: number) => (
                  <tr key={i} className="border-b border-neutral-100 hover:bg-orange-50">
                    <td className="py-3 px-4 text-neutral-500">{i + 1}</td>
                    <td className="py-3 px-4 font-medium text-neutral-900">{o.name || o.offer_name || o.id || '-'}</td>
                    <td className="py-3 px-4">{formatSAR(o.dispSales)}</td>
                    <td className="py-3 px-4">{(o.dispDiscount).toLocaleString()}</td>
                    <td className="py-3 px-4">{(o.dispOps).toLocaleString()}</td>
                    <td className="py-3 px-4">{o.dispEff.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
