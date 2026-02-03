import React, { useEffect, useMemo, useState } from 'react';
import { loadOffersData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

type Period = 'today' | 'yesterday' | 'mtd_yest' | 'mtd' | 'month';
const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export default function OffersPage() {
  const user = getCurrentUser();
  const [data, setData] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');
  const [period, setPeriod] = useState<Period>('mtd_yest');
  const [selYear, setSelYear] = useState<number>(() => new Date().getFullYear());
  const [selMonth, setSelMonth] = useState<number>(() => new Date().getMonth() + 1);

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

  const { managers, branches, allowedStoreIds } = useMemo(() => {
    const meta: Record<string, { manager?: string }> = mgmt?.store_meta || {};
    const stores = mgmt?.stores || {};
    const managersSet = new Set<string>();
    Object.values(meta).forEach((m: any) => { if (m?.manager) managersSet.add(String(m.manager)); });
    const managers = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const branches = Object.keys(stores).sort((a, b) => (stores[a] || a).localeCompare(stores[b] || b, 'ar'));
    const allowed = new Set<string>();
    if (branch === 'all' && effectiveManager === 'all') {
      Object.keys(stores).forEach((sid) => allowed.add(sid));
    } else {
      Object.keys(meta).forEach((sid) => {
        const m = meta[sid];
        if (branch !== 'all' && sid !== branch) return;
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return;
        allowed.add(sid);
      });
      if (allowed.size === 0) Object.keys(stores).forEach((sid) => allowed.add(sid));
    }
    return { managers, branches, allowedStoreIds: allowed };
  }, [mgmt, branch, effectiveManager]);

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  // الريبو الأصلي: قد يكون الملف مصفوفة مباشرة أو { offers, summary }
  const rawOffers = Array.isArray(data) ? data : (Array.isArray(data?.offers) ? data.offers : []);
  const offers = useMemo(() => {
    if (allowedStoreIds.size === 0) return rawOffers;
    return rawOffers.filter((o: any) => {
      const sid = o.store_id ?? o.storeId ?? o.store;
      if (sid == null || sid === '') return true;
      return allowedStoreIds.has(String(sid));
    });
  }, [rawOffers, allowedStoreIds]);
  const summaryFromApi = !Array.isArray(data) && data?.summary ? data.summary : null;
  const totalFilteredSales =
    summaryFromApi != null && Number(summaryFromApi.totalFilteredSales) > 0 && allowedStoreIds.size === 0
      ? Number(summaryFromApi.totalFilteredSales)
      : offers.reduce((sum: number, o: any) => sum + (Number(o.filteredSales ?? o.sales ?? o.total_sales ?? 0) || 0), 0);
  const summary = summaryFromApi ?? {
    totalSales: totalFilteredSales,
    totalFilteredSales,
    count: offers.length,
  };

  const periodLabel = period === 'today' ? 'اليوم' : period === 'yesterday' ? 'أمس' : period === 'mtd' ? 'الشهر الحالي (MTD)' : period === 'mtd_yest' ? 'من بداية الشهر إلى أمس' : `شهر محدد: ${monthsAr[selMonth - 1] || selMonth} ${selYear}`;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
          {isAdminOrAuditor(user?.role) && (
            <div>
              <div className="text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</div>
              <select className="input" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="all">الكل</option>
                {managers.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفرع</div>
            <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {branches.map((code) => (
                <option key={code} value={code}>{mgmt?.stores?.[code] || code}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفترة</div>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="mtd">الشهر الحالي (MTD)</option>
              <option value="mtd_yest">من بداية الشهر إلى أمس</option>
              <option value="month">شهر محدد</option>
            </select>
          </div>
          {period === 'month' && (
            <>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">الشهر</div>
                <select className="input" value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}>
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
          {period !== 'month' && (
            <div className="flex items-end text-sm font-semibold text-neutral-600">
              {periodLabel}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
          <div className="text-sm font-semibold text-neutral-500">عدد العروض</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">{offers.length}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
          <div className="text-sm font-semibold text-neutral-500">إجمالي المبيعات (عروض)</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">{formatSAR(Number(summary.totalFilteredSales) || 0)}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
          <div className="text-sm font-semibold text-neutral-500">ملخص</div>
          <div className="text-lg font-bold text-neutral-900 mt-1">بيانات من الريبو الأصلي</div>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200">
          <h3 className="text-lg font-bold text-neutral-900">قائمة العروض</h3>
        </div>
        <div className="overflow-x-auto">
          {offers.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">لا توجد عروض في البيانات الحالية.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-200">
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">العرض / المنتج</th>
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">المبيعات</th>
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">التحقيق %</th>
                </tr>
              </thead>
              <tbody>
                {offers.slice(0, 50).map((o: any, i: number) => (
                  <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-3 px-4 text-neutral-900">{o.name || o.offer_name || o.id || '-'}</td>
                    <td className="py-3 px-4 font-medium">{formatSAR(Number(o.filteredSales || o.sales || 0))}</td>
                    <td className="py-3 px-4">{Number(o.efficiency || 0).toFixed(1)}%</td>
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
