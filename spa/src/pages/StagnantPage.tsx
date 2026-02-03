import React, { useEffect, useState } from 'react';
import { loadStagnantData } from '../services/upstreamData';

export default function StagnantPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadStagnantData()
      .then(setData)
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  // الريبو الأصلي: stagnant_data.json = { data: { "storeId": [ { id, name, qty, ... } ] } }
  const rawItems =
    data.data && typeof data.data === 'object'
      ? (Object.values(data.data) as any[]).flat()
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.products)
          ? data.products
          : [];
  const items = rawItems.map((i: any) => ({
    ...i,
    name: i.name || i.item_name || i.id || '-',
    qty: i.qty ?? i.count ?? 0,
  }));
  const filtered = search
    ? items.filter((i: any) => String(i.name || '').toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-neutral-600">المنتجات الراكدة</span>
          <input
            type="text"
            className="input flex-1 min-w-[200px] max-w-md"
            placeholder="بحث عن منتج..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
