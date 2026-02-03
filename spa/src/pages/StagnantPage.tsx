import React, { useEffect, useMemo, useState } from 'react';
import { loadStagnantData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

type Period = 'today' | 'yesterday' | 'mtd' | 'month';
const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export default function StagnantPage() {
  const user = getCurrentUser();
  const [data, setData] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [period, setPeriod] = useState<Period>('mtd');
  const [selYear, setSelYear] = useState<number>(() => new Date().getFullYear());
  const [selMonth, setSelMonth] = useState<number>(() => new Date().getMonth() + 1);

  useEffect(() => {
    loadStagnantData()
      .then(setData)
      .catch((e) => setErr(e?.message || String(e)));
    loadManagementData().then(setMgmt).catch(() => {});
  }, []);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const { allowedStoreIds, managers, branches, cities } = useMemo(() => {
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
      if (allowed.size === 0 && data?.data && typeof data.data === 'object') Object.keys(data.data).forEach((sid) => allowed.add(sid));
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
    return { allowedStoreIds: allowed, managers, branches, cities };
  }, [mgmt, branch, city, effectiveManager, data?.data]);

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  // الريبو الأصلي: stagnant_data.json = { data: { "storeId": [ { id, name, qty, ... } ] } }
  const storeData = data.data && typeof data.data === 'object' ? data.data as Record<string, any[]> : {};
  const rawItems = useMemo(() => {
    const out: any[] = [];
    Object.entries(storeData).forEach(([storeId, arr]) => {
      if (allowedStoreIds.size > 0 && !allowedStoreIds.has(storeId)) return;
      (Array.isArray(arr) ? arr : []).forEach((i) => out.push({ ...i, _storeId: storeId }));
    });
    if (out.length === 0) {
      Object.entries(storeData).forEach(([storeId, arr]) => {
        (Array.isArray(arr) ? arr : []).forEach((i) => out.push({ ...i, _storeId: storeId }));
      });
    }
    return out;
  }, [storeData, allowedStoreIds]);
  const items = rawItems.map((i: any) => ({
    ...i,
    name: i.name || i.item_name || i.id || '-',
    qty: i.qty ?? i.count ?? 0,
  }));
  const filtered = search
    ? items.filter((i: any) => String(i.name || '').toLowerCase().includes(search.toLowerCase()))
    : items;

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
            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {(cities || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفترة</div>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="mtd">الشهر الحالي (MTD)</option>
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
          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-neutral-500 mb-1">بحث</div>
            <input
              type="text"
              className="input w-full"
              placeholder="بحث عن منتج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {period !== 'month' && (
            <div className="text-sm font-semibold text-neutral-600 flex items-end">
              {periodLabel}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
          <div className="text-sm font-semibold text-neutral-500">عدد المنتجات الراكدة</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">{items.length}</div>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200">
          <h3 className="text-lg font-bold text-neutral-900">قائمة المنتجات الراكدة</h3>
        </div>
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">لا توجد منتجات راكدة أو لا تطابق البحث.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-100">
                <tr className="border-b border-neutral-200">
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">المنتج / الصنف</th>
                  <th className="text-right py-3 px-4 font-semibold text-neutral-700">الكمية / الفترة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((i: any, idx: number) => (
                  <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-3 px-4 text-neutral-900">{i.name || '-'}</td>
                    <td className="py-3 px-4">{Number(i.qty ?? i.count ?? 0).toLocaleString()}</td>
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
