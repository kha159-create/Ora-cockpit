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
  const [globalGrowth, setGlobalGrowth] = useState<string>('');
  const [managerFilter, setManagerFilter] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  const canAccess = user?.role === 'Admin' || user?.name === 'Sales Manager';

  useEffect(() => {
    loadManagementData()
      .then(setRaw)
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  const { stores, managers } = useMemo(() => {
    if (!raw?.stores) return { stores: [], managers: [] };
    const meta = raw?.store_meta || {};
    const managersSet = new Set<string>();
    Object.values(meta).forEach((m: any) => {
      if (m?.manager) managersSet.add(String(m.manager));
    });

    const sList = Object.entries(raw.stores).map(([id, name]) => {
      const m = meta[id]?.manager || '';
      return { id, name: (name as string) || id, manager: m };
    });

    return {
      stores: sList,
      managers: Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'))
    };
  }, [raw]);

  const tableRows = useMemo(() => {
    if (!raw) return [];
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

    const gPct = parseFloat(globalGrowth);
    const hasGlobalGrowth = !isNaN(gPct);

    return stores
      .filter((s) => managerFilter === 'all' || s.manager === managerFilter)
      .map((store) => {
        const prevSales = sales[store.id] || 0;
        const prevTarget = targets[store.id] || 0;
        const prevVisitors = visitors[store.id] || 0;
        const avgCustVal = prevVisitors > 0 ? prevSales / prevVisitors : 0;

        let val = newTargets[store.id];
        if (val === undefined) {
          if (hasGlobalGrowth) {
            val = Math.round(prevTarget * (1 + gPct / 100));
          } else {
            val = prevTarget;
          }
        }

        const growthPct = prevTarget > 0 ? ((val - prevTarget) / prevTarget) * 100 : 0;
        return {
          id: store.id,
          name: store.name,
          prevSales,
          prevTarget,
          prevVisitors,
          avgCustVal,
          newTarget: val,
          growthPct,
        };
      });
  }, [raw, targetMonth, stores, newTargets, globalGrowth, managerFilter]);

  const setTargetForStore = (storeId: string, value: number) => {
    setNewTargets((prev) => ({ ...prev, [storeId]: value }));
  };

  const handleClear = () => {
    if (window.confirm('هل أنت متأكد من مسح جميع التعديلات؟')) {
      setNewTargets({});
      setGlobalGrowth('');
    }
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
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">🎯 تحديد التارجت الشهري</h1>
          <p className="text-neutral-500 mt-1">تعيين أهداف المبيعات للمعارض حسب الشهر مع مقارنة السنة الماضية</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="btn-secondary font-bold px-6 py-2 transition-all hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          >
            🗑️ تفريغ البيانات
          </button>
          <button
            type="button"
            onClick={handleSaveExcel}
            disabled={saving}
            className="btn-primary font-bold px-6 py-2 flex items-center gap-2 shadow-lg shadow-orange-200 transition-all hover:scale-105 active:scale-95"
          >
            {saving ? 'جاري الحفظ...' : '💾 حفظ التارجت'}
          </button>
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-2">الشهر المستهدف</label>
            <input
              type="month"
              className="input w-52 h-11"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-2">تطبيق نسبة نمو (لجميع المعارض) %</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="input w-32 h-11 text-center font-bold text-orange-600"
                placeholder="نمو %"
                value={globalGrowth}
                onChange={(e) => setGlobalGrowth(e.target.value)}
              />
              <span className="text-neutral-400 font-black text-xl">%</span>
            </div>
          </div>
          <div className="flex-grow max-w-xs">
            <label className="block text-sm font-bold text-neutral-700 mb-2">تصفية حسب مدير المنطقة</label>
            <select
              className="input w-full h-11"
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
            >
              <option value="all">كافة مدراء المناطق</option>
              {managers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-neutral-800 text-white">
                <th rowSpan={2} className="th text-center w-14 border-l border-neutral-700">#</th>
                <th rowSpan={2} className="th border-l border-neutral-700">المعرض (Store)</th>
                <th colSpan={4} className="th text-center bg-neutral-700 border-l border-neutral-600">أداء السنة الماضية (لعرض المقارنة)</th>
                <th rowSpan={2} className="th text-center bg-orange-600 border-l border-orange-500">الهدف الجديد (New Target)</th>
                <th rowSpan={2} className="th text-center">نسبة النمو %</th>
              </tr>
              <tr className="bg-neutral-700 text-white">
                <th className="th text-center border-l border-neutral-600">المبيعات</th>
                <th className="th text-center border-l border-neutral-600">التارجت</th>
                <th className="th text-center border-l border-neutral-600">الزوار</th>
                <th className="th text-center border-l border-neutral-600">قيمة العميل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {tableRows.map((r, i) => (
                <tr key={r.id} className="hover:bg-orange-50 transition-colors">
                  <td className="td text-center text-neutral-400 font-mono">{i + 1}</td>
                  <td className="td font-bold text-neutral-900 border-r border-neutral-50">{r.name}</td>
                  <td className="td text-center text-neutral-600 font-medium">{formatSAR(r.prevSales)}</td>
                  <td className="td text-center text-neutral-600 font-medium">{formatSAR(r.prevTarget)}</td>
                  <td className="td text-center text-neutral-600 font-medium">{Math.round(r.prevVisitors).toLocaleString()}</td>
                  <td className="td text-center text-neutral-600 font-medium">{formatSAR(r.avgCustVal)}</td>
                  <td className="td text-center bg-orange-50/30">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      className="input w-32 text-center font-bold text-neutral-900 bg-white border-2 border-orange-100 focus:border-orange-400"
                      value={r.newTarget || ''}
                      onChange={(e) => setTargetForStore(r.id, Number(e.target.value) || 0)}
                    />
                  </td>
                  <td className={`td text-center font-black ${r.growthPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {r.growthPct >= 0 ? '+' : ''}{r.growthPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-20 text-center text-neutral-400 italic">لا توجد بيانات متاحة لهذا الفلتر</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center gap-3">
          <span className="text-orange-500 font-bold">💡 تلميح:</span>
          <p className="text-sm text-neutral-600 font-medium">يمكنك تحديد نسبة نمو عامة لتطبق على الجميع، أو تعديل هدف كل معرض بشكل يدوي في الجدول.</p>
        </div>
      </div>
    </div>
  );
}
