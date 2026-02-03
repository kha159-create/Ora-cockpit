import React, { useEffect, useState } from 'react';
import { loadOffersData } from '../services/upstreamData';

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

export default function OffersPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadOffersData()
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

  const offers = Array.isArray(data.offers) ? data.offers : [];
  const summary = data.summary || { totalSales: 0, totalFilteredSales: 0, count: 0 };

  return (
    <div className="space-y-6">
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
