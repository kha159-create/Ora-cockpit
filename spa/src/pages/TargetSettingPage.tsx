import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import * as XLSX from 'xlsx';

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

const GROWTH_PRESETS = [5, 10, 15, 20];

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
  const [growthRate, setGrowthRate] = useState<number>(10);
  const [customGrowth, setCustomGrowth] = useState<string>('');

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
    const actualSales: Record<string, number> = {}; // same month current year for achievement
    const lastYear = parseInt(targetMonth.slice(0, 4), 10) - 1;
    const month = targetMonth.slice(5, 7);
    const lastYearMonth = `${lastYear}-${month}`;
    const currentYearMonth = `${parseInt(targetMonth.slice(0, 4), 10)}-${month}`;

    (raw?.sales || []).forEach(([d, s, v]: any[]) => {
      const storeId = String(s);
      const dateStr = String(d).slice(0, 10);
      if (dateStr.startsWith(lastYearMonth)) sales[storeId] = (sales[storeId] || 0) + (v || 0);
      if (dateStr.startsWith(currentYearMonth)) actualSales[storeId] = (actualSales[storeId] || 0) + (v || 0);
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
      const suggestedTarget = Math.round(prevSales * (1 + growthRate / 100));
      const newTarget = newTargets[store.id] ?? prevTarget;
      const growthPct = prevSales > 0 ? ((newTarget - prevSales) / prevSales) * 100 : 0;
      const prevAchievement = prevTarget > 0 ? (prevSales / prevTarget) * 100 : 0;
      return {
        id: store.id,
        name: store.name,
        prevSales,
        prevTarget,
        prevVisitors,
        avgCustVal,
        suggestedTarget,
        newTarget,
        growthPct,
        prevAchievement,
      };
    });
  }, [raw, targetMonth, stores, newTargets, growthRate]);

  // Summary KPIs
  const summary = useMemo(() => {
    const totalPrevSales = tableRows.reduce((s, r) => s + r.prevSales, 0);
    const totalPrevTarget = tableRows.reduce((s, r) => s + r.prevTarget, 0);
    const totalNewTarget = tableRows.reduce((s, r) => s + r.newTarget, 0);
    const totalVisitors = tableRows.reduce((s, r) => s + r.prevVisitors, 0);
    const avgCustVal = totalVisitors > 0 ? totalPrevSales / totalVisitors : 0;
    const portfolioAch = totalPrevTarget > 0 ? (totalPrevSales / totalPrevTarget) * 100 : 0;
    const portfolioGrowth = totalPrevSales > 0 ? ((totalNewTarget - totalPrevSales) / totalPrevSales) * 100 : 0;
    const storesAboveTarget = tableRows.filter(r => r.prevAchievement >= 100).length;
    const storesBelowTarget = tableRows.filter(r => r.prevTarget > 0 && r.prevAchievement < 100).length;
    return { totalPrevSales, totalPrevTarget, totalNewTarget, totalVisitors, avgCustVal, portfolioAch, portfolioGrowth, storesAboveTarget, storesBelowTarget };
  }, [tableRows]);

  const setTargetForStore = (storeId: string, value: number) => {
    setNewTargets((prev) => ({ ...prev, [storeId]: value }));
  };

  const applySuggestedAll = () => {
    const updated: Record<string, number> = {};
    tableRows.forEach(r => { updated[r.id] = r.suggestedTarget; });
    setNewTargets(updated);
  };

  const handleSaveExcel = () => {
    setSaving(true);
    const headers = ['#', 'المعرض', 'المبيعات (السنة الماضية)', 'الهدف (السنة الماضية)', 'التحقيق %', 'الزوار', 'قيمة العميل', 'الهدف المقترح', 'الهدف الجديد', 'نسبة النمو %'];
    const rows = tableRows.map((r, i) => [
      i + 1,
      r.name,
      r.prevSales,
      r.prevTarget,
      r.prevAchievement.toFixed(1) + '%',
      r.prevVisitors,
      r.avgCustVal.toFixed(0),
      r.suggestedTarget,
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
        <h1 className="text-2xl font-bold text-neutral-900">تحديد التارجت الشهري</h1>
        <p className="text-neutral-500 mt-1">تعيين أهداف المبيعات للمعارض حسب الشهر مع مقارنة السنة الماضية</p>
      </header>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow border p-4">
          <div className="text-xs text-neutral-500 font-semibold">مبيعات السنة الماضية</div>
          <div className="text-xl font-bold text-neutral-900 mt-1" dir="ltr">{formatSAR(summary.totalPrevSales)}</div>
        </div>
        <div className="bg-white rounded-xl shadow border p-4">
          <div className="text-xs text-neutral-500 font-semibold">هدف السنة الماضية</div>
          <div className="text-xl font-bold text-neutral-900 mt-1" dir="ltr">{formatSAR(summary.totalPrevTarget)}</div>
        </div>
        <div className="bg-white rounded-xl shadow border p-4">
          <div className="text-xs text-neutral-500 font-semibold">تحقيق السنة الماضية</div>
          <div className={`text-xl font-bold mt-1 ${summary.portfolioAch >= 100 ? 'text-green-600' : 'text-red-600'}`}>{summary.portfolioAch.toFixed(1)}%</div>
        </div>
        <div className="bg-white rounded-xl shadow border p-4">
          <div className="text-xs text-neutral-500 font-semibold">الهدف الجديد (مجموع)</div>
          <div className="text-xl font-bold text-orange-600 mt-1" dir="ltr">{formatSAR(summary.totalNewTarget)}</div>
        </div>
        <div className="bg-white rounded-xl shadow border p-4">
          <div className="text-xs text-neutral-500 font-semibold">معارض حققت الهدف</div>
          <div className="text-xl font-bold text-green-600 mt-1">{summary.storesAboveTarget} <span className="text-sm font-normal text-neutral-400">/ {tableRows.length}</span></div>
        </div>
        <div className="bg-white rounded-xl shadow border p-4">
          <div className="text-xs text-neutral-500 font-semibold">نمو الهدف الجديد</div>
          <div className={`text-xl font-bold mt-1 ${summary.portfolioGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {summary.portfolioGrowth >= 0 ? '+' : ''}{summary.portfolioGrowth.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Controls */}
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

          <div>
            <label className="block text-sm font-semibold text-neutral-600 mb-1">نسبة النمو المقترحة</label>
            <div className="flex items-center gap-2">
              {GROWTH_PRESETS.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setGrowthRate(g); setCustomGrowth(''); }}
                  className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${growthRate === g && !customGrowth ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-neutral-700 border-neutral-200 hover:bg-orange-50'}`}
                >
                  +{g}%
                </button>
              ))}
              <input
                type="number"
                placeholder="مخصص %"
                className="input w-24 text-center text-sm"
                value={customGrowth}
                onChange={(e) => {
                  setCustomGrowth(e.target.value);
                  if (e.target.value) setGrowthRate(Number(e.target.value) || 0);
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={applySuggestedAll}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors"
          >
            تطبيق المقترح على الكل
          </button>

          <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-2 text-sm text-neutral-700">
            المقترح = مبيعات السنة الماضية x (1 + نسبة النمو)
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-neutral-800 text-white">
                <th rowSpan={2} className="th text-center w-14">#</th>
                <th rowSpan={2} className="th">المعرض</th>
                <th colSpan={5} className="th text-center bg-neutral-700">أداء السنة الماضية</th>
                <th rowSpan={2} className="th text-center bg-blue-600">المقترح</th>
                <th rowSpan={2} className="th text-center bg-orange-600">الهدف الجديد</th>
                <th rowSpan={2} className="th text-center">النمو %</th>
              </tr>
              <tr className="bg-neutral-700 text-white">
                <th className="th text-center">المبيعات</th>
                <th className="th text-center">التارجت</th>
                <th className="th text-center">التحقيق %</th>
                <th className="th text-center">الزوار</th>
                <th className="th text-center">ق. العميل</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => {
                const achColor = r.prevAchievement >= 100 ? 'text-green-600' : r.prevAchievement >= 80 ? 'text-yellow-600' : 'text-red-600';
                const targetDiff = r.newTarget - r.suggestedTarget;
                const targetBg = targetDiff > 0 ? 'bg-green-50' : targetDiff < 0 ? 'bg-red-50' : '';
                return (
                  <tr key={r.id} className={`hover:bg-orange-50 border-b border-neutral-100 ${targetBg}`}>
                    <td className="td text-center text-neutral-500">{i + 1}</td>
                    <td className="td font-semibold text-neutral-900">{r.name}</td>
                    <td className="td text-center">{formatSAR(r.prevSales)}</td>
                    <td className="td text-center">{formatSAR(r.prevTarget)}</td>
                    <td className={`td text-center font-bold ${achColor}`}>
                      {r.prevTarget > 0 ? `${r.prevAchievement.toFixed(0)}%` : '-'}
                    </td>
                    <td className="td text-center">{Math.round(r.prevVisitors).toLocaleString()}</td>
                    <td className="td text-center">{formatSAR(r.avgCustVal)}</td>
                    <td className="td text-center text-blue-600 font-bold cursor-pointer hover:underline" onClick={() => setTargetForStore(r.id, r.suggestedTarget)}>
                      {formatSAR(r.suggestedTarget)}
                    </td>
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
                );
              })}
              {/* Totals Row */}
              <tr className="bg-neutral-100 font-bold border-t-2 border-neutral-300">
                <td className="td text-center" colSpan={2}>الإجمالي</td>
                <td className="td text-center">{formatSAR(summary.totalPrevSales)}</td>
                <td className="td text-center">{formatSAR(summary.totalPrevTarget)}</td>
                <td className={`td text-center ${summary.portfolioAch >= 100 ? 'text-green-600' : 'text-red-600'}`}>{summary.portfolioAch.toFixed(0)}%</td>
                <td className="td text-center">{Math.round(summary.totalVisitors).toLocaleString()}</td>
                <td className="td text-center">{formatSAR(summary.avgCustVal)}</td>
                <td className="td text-center text-blue-600">{formatSAR(tableRows.reduce((s, r) => s + r.suggestedTarget, 0))}</td>
                <td className="td text-center text-orange-600">{formatSAR(summary.totalNewTarget)}</td>
                <td className={`td text-center ${summary.portfolioGrowth >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {summary.portfolioGrowth >= 0 ? '+' : ''}{summary.portfolioGrowth.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-neutral-200 flex gap-3">
          <button
            type="button"
            onClick={handleSaveExcel}
            disabled={saving}
            className="btn-primary font-bold px-6 py-3 flex items-center gap-2"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ التارجت (Save Excel)'}
          </button>
        </div>
      </div>
    </div>
  );
}
