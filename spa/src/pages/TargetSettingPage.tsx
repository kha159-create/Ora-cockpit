import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import * as XLSX from 'xlsx';

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

export default function TargetSettingPage() {
  const user = getCurrentUser();
  const [raw, setRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [targetMonth, setTargetMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [newTargets, setNewTargets] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const canAccess = user?.role === 'Admin' || user?.name === 'Sales Manager';

  useEffect(() => {
    loadManagementData()
      .then(setRaw)
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  const stores = useMemo(() => {
    if (!raw?.stores) return [];
    return Object.entries(raw.stores).map(([id, name]) => ({ id, name: (name as string) || id }));
  }, [raw]);

  const tableRows = useMemo(() => {
    const sales: Record<string, number> = {};
    const targets: Record<string, number> = {};
    const visitors: Record<string, number> = {};
    const lastYear = parseInt(targetMonth.slice(0, 4), 10) - 1;
    const month = targetMonth.slice(5, 7);
    const lastYearMonth = `${lastYear}-${month}`;
    (raw?.sales || []).forEach(([d, s, v]: any[]) => {
      const storeId = String(s);
      const dateStr = String(d).slice(0, 10);
      if (dateStr.startsWith(lastYearMonth)) sales[storeId] = (sales[storeId] || 0) + (v || 0);
    });
    (raw?.targets || []).forEach(([d, s, v]: any[]) => {
      const storeId = String(s);
      const dateStr = String(d).slice(0, 10);
      if (dateStr.startsWith(lastYearMonth)) targets[storeId] = (targets[storeId] || 0) + (v || 0);
    });
    (raw?.visitors || []).forEach(([d, s, v]: any[]) => {
      const storeId = String(s);
      const dateStr = String(d).slice(0, 10);
      if (dateStr.startsWith(lastYearMonth)) visitors[storeId] = (visitors[storeId] || 0) + (v || 0);
    });

    return stores.map((store) => {
      const prevSales = sales[store.id] || 0;
      const prevTarget = targets[store.id] || 0;
      const prevVisitors = visitors[store.id] || 0;
      const avgCustVal = prevVisitors > 0 ? prevSales / prevVisitors : 0;
      const newTarget = newTargets[store.id] ?? prevTarget;
      const growthPct = prevTarget > 0 ? ((newTarget - prevTarget) / prevTarget) * 100 : 0;
      return {
        id: store.id,
        name: store.name,
        prevSales,
        prevTarget,
        prevVisitors,
        avgCustVal,
        newTarget,
        growthPct,
      };
    });
  }, [raw, targetMonth, stores, newTargets]);

  const setTargetForStore = (storeId: string, value: number) => {
    setNewTargets((prev) => ({ ...prev, [storeId]: value }));
  };

  const handleSaveExcel = () => {
    setSaving(true);
    const headers = ['#', 'المعرض', 'المبيعات (السنة الماضية)', 'الهدف (السنة الماضية)', 'الزوار', 'قيمة العميل', 'الهدف الجديد', 'نسبة النمو %'];
    const rows = tableRows.map((r, i) => [
      i + 1,
      r.name,
      r.prevSales,
      r.prevTarget,
      r.prevVisitors,
      r.avgCustVal.toFixed(0),
      r.newTarget,
      r.growthPct.toFixed(1) + '%',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Targets');
    XLSX.writeFile(wb, `targets_${targetMonth}.xlsx`);
    setSaving(false);
  };

  if (!canAccess) return <Navigate to="/" replace />;
  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!raw) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-neutral-900">🎯 تحديد التارجت الشهري</h1>
        <p className="text-neutral-500 mt-1">تعيين أهداف المبيعات للمعارض حسب الشهر مع مقارنة السنة الماضية</p>
      </header>

      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-semibold text-neutral-600 mb-1">اختر الشهر للتارجت الجديد</label>
            <input
              type="month"
              className="input"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
            />
          </div>
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-2 text-sm text-neutral-700">
            يتم عرض بيانات نفس الشهر من السنة الماضية للمساعدة في اتخاذ القرار.
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-neutral-800 text-white">
                <th rowSpan={2} className="th text-center w-14">#</th>
                <th rowSpan={2} className="th">المعرض (Store)</th>
                <th colSpan={4} className="th text-center bg-neutral-700">أداء السنة الماضية (Last Year)</th>
                <th rowSpan={2} className="th text-center bg-orange-600">الهدف الجديد (New Target)</th>
                <th rowSpan={2} className="th text-center">نسبة النمو %</th>
              </tr>
              <tr className="bg-neutral-700 text-white">
                <th className="th text-center">المبيعات (Sales)</th>
                <th className="th text-center">التارجت (Target)</th>
                <th className="th text-center">الزوار (Visitors)</th>
                <th className="th text-center">قيمة العميل (Avg Cust Val)</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => (
                <tr key={r.id} className="hover:bg-orange-50 border-b border-neutral-100">
                  <td className="td text-center text-neutral-500">{i + 1}</td>
                  <td className="td font-semibold text-neutral-900">{r.name}</td>
                  <td className="td text-center">{formatSAR(r.prevSales)}</td>
                  <td className="td text-center">{formatSAR(r.prevTarget)}</td>
                  <td className="td text-center">{Math.round(r.prevVisitors).toLocaleString()}</td>
                  <td className="td text-center">{formatSAR(r.avgCustVal)}</td>
                  <td className="td text-center">
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      className="input w-28 text-center font-semibold"
                      value={r.newTarget || ''}
                      onChange={(e) => setTargetForStore(r.id, Number(e.target.value) || 0)}
                    />
                  </td>
                  <td className={`td text-center font-bold ${r.growthPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {r.growthPct >= 0 ? '+' : ''}{r.growthPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-neutral-200">
          <button
            type="button"
            onClick={handleSaveExcel}
            disabled={saving}
            className="btn-primary font-bold px-6 py-3 flex items-center gap-2"
          >
            {saving ? 'جاري الحفظ...' : '💾 حفظ التارجت (Save Excel)'}
          </button>
        </div>
      </div>
    </div>
  );
}
