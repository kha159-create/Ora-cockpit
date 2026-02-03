import React, { useEffect, useMemo, useState } from 'react';
import { loadOffersData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

type PeriodKey = 'mtd' | '7d' | '14d' | '30d' | 'yest';

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
    loadManagementData().then(setMgmt).catch(() => {});
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

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  const rawOffers = Array.isArray(data) ? data : (Array.isArray(data?.offers) ? data.offers : []);
  const offers = useMemo(() => {
    let list = rawOffers.filter((o: any) => {
      const sid = o.store_id ?? o.storeId ?? o.store;
      if (allowedStoreIds.size > 0 && sid != null && sid !== '' && !allowedStoreIds.has(String(sid))) return false;
      if (statusFilter === 'Enabled' && (o.status === 'Disabled' || o.enabled === false)) return false;
      if (statusFilter === 'Disabled' && (o.status !== 'Disabled' && o.enabled !== false)) return false;
      return true;
    });
    return list;
  }, [rawOffers, allowedStoreIds, statusFilter]);

  const stats = useMemo(() => {
    const totalSales = offers.reduce((s: number, o: any) => s + (Number(o.filteredSales ?? o.sales ?? o.total_sales ?? 0) || 0), 0);
    const totalDiscount = offers.reduce((s: number, o: any) => s + (Number(o.discount ?? o.total_discount ?? o.خصم ?? 0) || 0), 0);
    const totalOps = offers.reduce((s: number, o: any) => s + (Number(o.operations ?? o.transactions ?? o.عدد_العمليات ?? o.count ?? 0) || 0), 0);
    const avgBasket = totalOps > 0 ? Math.round(totalSales / totalOps) : 0;
    const efficiency = totalSales > 0 && totalDiscount > 0 ? (totalSales / (totalSales + totalDiscount)) * 100 : (offers.length ? 100 : 0);
    return { totalOffers: offers.length, totalSales, totalDiscount, totalOps, avgBasket, efficiency };
  }, [offers]);

  const top5 = useMemo(() => {
    return [...offers]
      .sort((a: any, b: any) => (Number(b.filteredSales ?? b.sales ?? 0) || 0) - (Number(a.filteredSales ?? a.sales ?? 0) || 0))
      .slice(0, 5);
  }, [offers]);

  const weakOffers = useMemo(() => {
    return [...offers]
      .filter((o: any) => {
        const eff = Number(o.efficiency ?? o.efficiency_ratio ?? 0);
        return eff > 0 && eff < 50;
      })
      .sort((a: any, b: any) => (Number(a.efficiency ?? 0) || 0) - (Number(b.efficiency ?? 0) || 0))
      .slice(0, 5);
  }, [offers]);

  const periodLabels: Record<PeriodKey, string> = { mtd: 'الشهر الحالي', '7d': '7 أيام', '14d': '14 يوم', '30d': '30 يوم', yest: 'أمس' };

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
            {(['mtd', '7d', '14d', '30d', 'yest'] as PeriodKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  period === key
                    ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-orange-50 hover:border-orange-200'
                }`}
              >
                {key === 'mtd' && '📅 '}
                {key === 'yest' && '⏳ '}
                {periodLabels[key]}
              </button>
            ))}
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
              const sales = Number(o.filteredSales ?? o.sales ?? 0) || 0;
              const discount = Number(o.discount ?? 0) || 0;
              const ops = Number(o.operations ?? o.transactions ?? 0) || 0;
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
              const sales = Number(o.filteredSales ?? o.sales ?? 0) || 0;
              const discount = Number(o.discount ?? 0) || 0;
              const ops = Number(o.operations ?? 0) || 0;
              const eff = Number(o.efficiency ?? 0) || 0;
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
                    <td className="py-3 px-4">{formatSAR(Number(o.filteredSales ?? o.sales ?? 0))}</td>
                    <td className="py-3 px-4">{(Number(o.discount ?? 0) || 0).toLocaleString()}</td>
                    <td className="py-3 px-4">{(Number(o.operations ?? o.transactions ?? 0) || 0).toLocaleString()}</td>
                    <td className="py-3 px-4">{Number(o.efficiency ?? 0).toFixed(1)}%</td>
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
