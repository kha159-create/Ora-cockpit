import React, { useMemo, useState } from 'react';
import { isGeminiAvailable, getCustomerValueInsight } from '../../services/geminiService';

const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.522 2.522l2.846.813a.75.75 0 010 1.438l-2.846.813a3.75 3.75 0 00-2.522 2.522l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.522-2.522l-2.846-.813a.75.75 0 010-1.438l2.846-.813a3.75 3.75 0 002.522-2.522l.813-2.846A.75.75 0 019 4.5z" clipRule="evenodd" />
  </svg>
);

export interface StoreData {
  id: string;
  name: string;
  sales: number;
  target: number;
  visitors: number;
  trans: number;
  customerValue?: number;
  prevCustomerValue?: number;
  prevYearSales?: number;
  prevYearVisitors?: number;
  avg_inv?: number;
  growth?: number;
  achievement?: number;
}

interface CustomerValueInsightsProps {
  stores: StoreData[];
  formatSAR: (val: number) => string;
  mode: string;
  periodLabel?: string;
}

type TableSortKey = 'name' | 'sales' | 'growth' | 'cv' | 'changeCV' | 'loss';

export const CustomerValueInsights: React.FC<CustomerValueInsightsProps> = ({
  stores,
  formatSAR,
  mode,
  periodLabel = 'الفترة الحالية',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [simTargetCV, setSimTargetCV] = useState<number | ''>('');
  const [simTargetSales, setSimTargetSales] = useState<number | ''>('');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedStoreForSim, setSelectedStoreForSim] = useState<string>('');
  const [simBranchCV, setSimBranchCV] = useState<number | ''>('');
  const [simBranchSales, setSimBranchSales] = useState<number | ''>('');
  const [tableSort, setTableSort] = useState<TableSortKey>('loss');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');

  const metrics = useMemo(() => {
    if (!stores?.length) return null;
    const totalSales = stores.reduce((s, x) => s + x.sales, 0);
    const totalVisitors = stores.reduce((s, x) => s + x.visitors, 0);
    const totalTrans = stores.reduce((s, x) => s + x.trans, 0);
    const totalPrevSales = stores.reduce((s, x) => s + (x.prevYearSales ?? 0), 0);
    const totalPrevVisitors = stores.reduce((s, x) => s + (x.prevYearVisitors ?? 0), 0);

    const customerValue = totalVisitors > 0 ? totalSales / totalVisitors : 0;
    const prevCustomerValue = totalPrevVisitors > 0 ? totalPrevSales / totalPrevVisitors : 0;
    const changeCV = prevCustomerValue > 0 ? ((customerValue - prevCustomerValue) / prevCustomerValue) * 100 : 0;
    const avgInvoice = totalTrans > 0 ? totalSales / totalTrans : 0;

    const withCV = stores.map(s => ({
      ...s,
      cv: (s.customerValue ?? (s.visitors > 0 ? s.sales / s.visitors : 0)),
      prevCV: s.prevCustomerValue ?? (s.prevYearVisitors && s.prevYearVisitors > 0 ? (s.prevYearSales ?? 0) / s.prevYearVisitors : 0),
    }));
    const changePct = (s: typeof withCV[0]) => s.prevCV > 0 ? ((s.cv - s.prevCV) / s.prevCV) * 100 : 0;
    const lossFromCV = (s: typeof withCV[0]) => {
      if (s.prevCV <= 0 || s.cv >= s.prevCV) return 0;
      return (s.prevCV - s.cv) * s.visitors;
    };
    const gainFromCV = (s: typeof withCV[0]) => {
      if (s.prevCV <= 0 || s.cv <= s.prevCV) return 0;
      return (s.cv - s.prevCV) * s.visitors;
    };

    const sorted = [...withCV].sort((a, b) => changePct(b) - changePct(a));
    const best = sorted.filter(s => changePct(s) > 0).slice(0, 5);
    const worst = sorted.filter(s => changePct(s) < 0).slice(0, 5);

    return {
      customerValue,
      prevCustomerValue,
      changeCV,
      avgInvoice,
      totalSales,
      totalVisitors,
      totalPrevSales,
      totalPrevVisitors,
      best,
      worst,
      changePct,
      lossFromCV,
      gainFromCV,
      tableRows: withCV,
    };
  }, [stores]);

  const tableSorted = useMemo(() => {
    if (!metrics?.tableRows?.length) return [];
    const rows = metrics.tableRows.map(s => ({
      ...s,
      changePct: metrics.changePct(s),
      loss: metrics.lossFromCV(s),
      gain: metrics.gainFromCV(s),
    }));
    const mult = tableSortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (tableSort === 'name') { va = a.name; vb = b.name; return mult * String(va).localeCompare(String(vb), 'ar'); }
      if (tableSort === 'sales') { va = a.sales; vb = b.sales; }
      if (tableSort === 'growth') { va = a.growth ?? 0; vb = b.growth ?? 0; }
      if (tableSort === 'cv') { va = a.cv; vb = b.cv; }
      if (tableSort === 'changeCV') { va = a.changePct; vb = b.changePct; }
      if (tableSort === 'loss') { va = a.loss; vb = b.loss; }
      return mult * (Number(va) - Number(vb));
    });
    return rows;
  }, [metrics, tableSort, tableSortDir]);

  const simulation = useMemo(() => {
    if (!metrics || !stores?.length) return null;
    const totalVisitors = metrics.totalVisitors;
    const totalSales = metrics.totalSales;
    const cv = metrics.customerValue;
    const atv = metrics.avgInvoice;
    const totalTrans = stores.reduce((s, x) => s + x.trans, 0);
    const conversion = totalVisitors > 0 ? totalTrans / totalVisitors : 0;

    const out: { type: string; label: string; value: string }[] = [];

    if (typeof simTargetCV === 'number' && simTargetCV > 0 && cv > 0) {
      const impliedSales = simTargetCV * totalVisitors;
      const diff = impliedSales - totalSales;
      out.push({
        type: 'cv',
        label: `لو قيمة العميل أصبحت ${Math.round(simTargetCV)} ر.س (بدون تغيير عدد الزوار)`,
        value: `المبيعات المتوقعة: ${formatSAR(impliedSales)} (${diff >= 0 ? '+' : ''}${formatSAR(diff)} عن الحالي)`,
      });
    }
    if (typeof simTargetSales === 'number' && simTargetSales > 0) {
      const rem = simTargetSales - totalSales;
      if (rem > 0 && cv > 0) {
        const extraVisitors = Math.ceil(rem / cv);
        out.push({
          type: 'sales',
          label: `لتحقيق ${formatSAR(simTargetSales)} مبيعات`,
          value: `مطلوب تقريباً ${extraVisitors.toLocaleString()} زائر إضافي (بافتراض نفس قيمة العميل الحالية ${Math.round(cv)} ر.س)`,
        });
      }
      if (rem > 0 && atv > 0 && conversion > 0) {
        const extraTrans = rem / atv;
        const extraVisitorsByConv = Math.ceil(extraTrans / conversion);
        out.push({
          type: 'acq',
          label: 'الاستحواذ المطلوب (زوار جدد)',
          value: `≈ ${extraVisitorsByConv.toLocaleString()} زائر إضافي لو نفس معدل التحويل ومتوسط الفاتورة`,
        });
      }
    }
    return out;
  }, [metrics, stores, simTargetCV, simTargetSales, formatSAR]);

  const selectedStore = useMemo(() => metrics?.tableRows?.find(s => s.id === selectedStoreForSim), [metrics, selectedStoreForSim]);
  const branchSimulation = useMemo(() => {
    if (!selectedStore || !metrics) return null;
    const cv = selectedStore.cv;
    const atv = selectedStore.avg_inv ?? (selectedStore.trans > 0 ? selectedStore.sales / selectedStore.trans : 0);
    const conversion = selectedStore.visitors > 0 ? selectedStore.trans / selectedStore.visitors : 0;
    const out: { label: string; value: string }[] = [];

    if (typeof simBranchCV === 'number' && simBranchCV > 0 && cv > 0) {
      const implied = simBranchCV * selectedStore.visitors;
      const diff = implied - selectedStore.sales;
      out.push({
        label: `لو قيمة العميل أصبحت ${Math.round(simBranchCV)} ر.س`,
        value: `مبيعات متوقعة: ${formatSAR(implied)} (${diff >= 0 ? '+' : ''}${formatSAR(diff)})`,
      });
    }
    if (typeof simBranchSales === 'number' && simBranchSales > 0) {
      const rem = simBranchSales - selectedStore.sales;
      if (rem > 0 && cv > 0) {
        out.push({
          label: `لتحقيق ${formatSAR(simBranchSales)} في هذا الفرع`,
          value: `زوار إضافيين مطلوبين ≈ ${Math.ceil(rem / cv).toLocaleString()} (قيمة عميل ${Math.round(cv)} ر.س)`,
        });
      }
      if (rem > 0 && atv > 0 && conversion > 0) {
        out.push({
          label: 'استحواذ مطلوب (هذا الفرع)',
          value: `≈ ${Math.ceil((rem / atv) / conversion).toLocaleString()} زائر`,
        });
      }
    }
    return out.length ? out : null;
  }, [selectedStore, metrics, simBranchCV, simBranchSales, formatSAR]);

  const handleAskAI = async () => {
    if (!metrics) return;
    if (!isGeminiAvailable()) {
      setAiInsight('مفتاح Gemini غير متوفر في البيئة الحالية. تأكد من ضبط VITE_GEMINI_API_KEY في Vercel ثم أعد النشر.');
      return;
    }
    setAiLoading(true);
    setAiInsight(null);
    try {
      const summary = {
        bestStores: metrics.best.map(s => ({ name: s.name, customerValue: s.cv, changePct: metrics!.changePct(s) })),
        worstStores: metrics.worst.map(s => ({ name: s.name, customerValue: s.cv, changePct: metrics!.changePct(s), loss: metrics!.lossFromCV(s) })),
        avgInvoice: metrics.avgInvoice,
        periodLabel,
      };
      const text = await getCustomerValueInsight(summary);
      setAiInsight(text || 'تعذر الحصول على تحليل الآن. تحقق من الاتصال أو جرّب لاحقاً.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSort = (key: TableSortKey) => {
    if (tableSort === key) setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setTableSort(key); setTableSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  if (!metrics || !metrics.tableRows?.length) return null;

  const displayWorst = expanded ? metrics.worst : metrics.worst.slice(0, 3);
  const displayBest = expanded ? metrics.best : metrics.best.slice(0, 3);

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 p-5 mb-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-orange-400 rounded-full blur-[80px] opacity-20 pointer-events-none" />

      <div className="relative z-10 space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
              <SparklesIcon />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                قيمة العميل والمحاكاة
                <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full border border-orange-200 font-bold uppercase tracking-widest">Customer Value</span>
              </h2>
              <p className="text-neutral-500 text-sm mt-0.5">جدول شامل لجميع الفروع — قبل وبعد — مع محاكاة إجمالية وكل فرع 🎯</p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[11px] font-bold text-slate-500 mb-0.5">قيمة العميل (الإجمالي)</div>
            <div className="font-black text-lg text-orange-600" dir="ltr">{formatSAR(metrics.customerValue)}</div>
            {metrics.prevCustomerValue > 0 && (
              <div className={`text-[10px] font-bold mt-0.5 ${metrics.changeCV >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {metrics.changeCV >= 0 ? '+' : ''}{metrics.changeCV.toFixed(1)}% عن السنة الماضية
              </div>
            )}
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[11px] font-bold text-slate-500 mb-0.5">متوسط الفاتورة</div>
            <div className="font-black text-lg text-blue-600" dir="ltr">{formatSAR(metrics.avgInvoice)}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[11px] font-bold text-slate-500 mb-0.5">إجمالي الزوار</div>
            <div className="font-black text-lg text-indigo-600" dir="ltr">{metrics.totalVisitors.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[11px] font-bold text-slate-500 mb-0.5">إجمالي المبيعات</div>
            <div className="font-black text-lg text-emerald-600" dir="ltr">{formatSAR(metrics.totalSales)}</div>
          </div>
        </div>

        {/* جدول شامل — كل الفروع */}
        <div className="rounded-xl border border-neutral-200 overflow-hidden">
          <h3 className="text-sm font-bold text-neutral-800 bg-neutral-50 px-4 py-2 border-b border-neutral-200">جدول الفروع — قبل وبعد (مبيعات، زوار، قيمة العميل، الخسارة/الزيادة)</h3>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-right border-collapse min-w-[900px]">
              <thead className="sticky top-0 bg-orange-500 text-white z-10">
                <tr>
                  <th className="th-table cursor-pointer hover:bg-orange-600" onClick={() => handleSort('name')}>الفرع</th>
                  <th className="th-table">مبيعات (الحالي)</th>
                  <th className="th-table">مبيعات (السنة الماضية)</th>
                  <th className="th-table cursor-pointer hover:bg-orange-600" onClick={() => handleSort('growth')}>النمو %</th>
                  <th className="th-table">متوسط الفاتورة</th>
                  <th className="th-table">زوار (الحالي)</th>
                  <th className="th-table">زوار (السنة الماضية)</th>
                  <th className="th-table">قيمة عميل (الحالي)</th>
                  <th className="th-table">قيمة عميل (الماضي)</th>
                  <th className="th-table cursor-pointer hover:bg-orange-600" onClick={() => handleSort('changeCV')}>التغيير بقيمة العميل %</th>
                  <th className="th-table cursor-pointer hover:bg-orange-600" onClick={() => handleSort('loss')}>الخسارة / الزيادة (ر.س)</th>
                </tr>
              </thead>
              <tbody>
                {tableSorted.map(row => {
                  const changePct = row.changePct;
                  const loss = row.loss;
                  const gain = row.gain;
                  const isBest = metrics.best.some((b: any) => b.id === row.id);
                  const isWorst = metrics.worst.some((w: any) => w.id === row.id);
                  const rowTone = isWorst ? 'bg-red-50/60' : isBest ? 'bg-emerald-50/60' : '';
                  return (
                    <tr key={row.id} className={`border-b border-neutral-100 hover:bg-orange-50/70 ${rowTone}`}>
                      <td className="td-table font-semibold text-neutral-900" title={row.name}>{row.name}</td>
                      <td className="td-table" dir="ltr">{formatSAR(row.sales)}</td>
                      <td className="td-table text-neutral-600" dir="ltr">{formatSAR(row.prevYearSales ?? 0)}</td>
                      <td className={`td-table font-bold ${(row.growth ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`} dir="ltr">{(row.growth ?? 0) >= 0 ? '+' : ''}{(row.growth ?? 0).toFixed(1)}%</td>
                      <td className="td-table" dir="ltr">{formatSAR(row.avg_inv ?? 0)}</td>
                      <td className="td-table" dir="ltr">{row.visitors.toLocaleString()}</td>
                      <td className="td-table text-neutral-600" dir="ltr">{(row.prevYearVisitors ?? 0).toLocaleString()}</td>
                      <td className="td-table font-bold text-indigo-700" dir="ltr">{formatSAR(row.cv)}</td>
                      <td className="td-table text-neutral-600" dir="ltr">{formatSAR(row.prevCV)}</td>
                      <td className={`td-table font-bold ${changePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`} dir="ltr">{changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%</td>
                      <td className={`td-table font-bold ${gain > 0 ? 'text-emerald-600' : loss > 0 ? 'text-red-600' : 'text-neutral-500'}`} dir="ltr">
                        {gain > 0 ? `+${formatSAR(gain)}` : loss > 0 ? `-${formatSAR(loss)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* محاكاة لكل فرع */}
        <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-xl p-4 border border-indigo-100">
          <h3 className="text-sm font-bold text-indigo-800 mb-3">محاكاة لكل فرع</h3>
          <div className="flex flex-wrap gap-3 items-end mb-3">
            <div className="min-w-[200px]">
              <label className="block text-[10px] font-bold text-slate-600 mb-1">اختر الفرع</label>
              <select
                value={selectedStoreForSim}
                onChange={e => { setSelectedStoreForSim(e.target.value); setSimBranchCV(''); setSimBranchSales(''); }}
                className="input text-sm w-full"
              >
                <option value="">— اختر فرع —</option>
                {metrics?.tableRows?.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {selectedStore && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">قيمة عميل مستهدفة (ر.س)</label>
                  <input type="number" min="0" step="10" value={simBranchCV} onChange={e => setSimBranchCV(e.target.value === '' ? '' : Number(e.target.value))} className="input w-28 text-sm" placeholder="60" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">مبيعات مستهدفة (ر.س)</label>
                  <input type="number" min="0" step="1000" value={simBranchSales} onChange={e => setSimBranchSales(e.target.value === '' ? '' : Number(e.target.value))} className="input w-32 text-sm" placeholder="100000" />
                </div>
              </>
            )}
          </div>
          {selectedStore && (
            <div className="text-xs text-slate-600 mb-2">
              الفرع الحالي: مبيعات {formatSAR(selectedStore.sales)}، زوار {selectedStore.visitors.toLocaleString()}، قيمة عميل {formatSAR(selectedStore.cv)}، متوسط فاتورة {formatSAR(selectedStore.avg_inv ?? 0)}.
            </div>
          )}
          {branchSimulation && branchSimulation.map((s, i) => (
            <div key={i} className="text-xs bg-white/80 rounded-lg px-3 py-2 border border-indigo-100 mb-2">
              <span className="font-bold text-indigo-700">{s.label}</span>
              <span className="text-slate-700"> — {s.value}</span>
            </div>
          ))}
        </div>

        {/* محاكاة إجمالية */}
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-100">
          <h3 className="text-sm font-bold text-orange-800 mb-3">محاكاة إجمالية (كل الفروع)</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">قيمة عميل مستهدفة (ر.س)</label>
              <input type="number" min="0" step="10" value={simTargetCV} onChange={e => setSimTargetCV(e.target.value === '' ? '' : Number(e.target.value))} className="input w-32 text-sm" placeholder="60" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">مبيعات مستهدفة (ر.س)</label>
              <input type="number" min="0" step="1000" value={simTargetSales} onChange={e => setSimTargetSales(e.target.value === '' ? '' : Number(e.target.value))} className="input w-36 text-sm" placeholder="500000" />
            </div>
          </div>
          {simulation && simulation.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {simulation.map((s, i) => (
                <div key={i} className="text-xs bg-white/70 rounded-lg px-3 py-2 border border-orange-100">
                  <span className="font-bold text-orange-700">{s.label}</span>
                  <span className="text-slate-700"> — {s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* أفضل / أسوأ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
            <h4 className="text-sm font-bold text-emerald-800 mb-2">أفضل أداء (ارتفاع قيمة العميل)</h4>
            {displayBest.length === 0 ? <p className="text-xs text-slate-500">لا بيانات لهذه الفترة</p> : (
              <ul className="space-y-1.5 text-xs">
                {displayBest.map(s => (
                  <li key={s.id} className="flex justify-between items-center bg-white/80 rounded-lg px-2 py-1.5 border border-emerald-100">
                    <span className="font-semibold text-slate-800 truncate max-w-[140px]" title={s.name}>{s.name}</span>
                    <span className="text-emerald-700 font-bold">ق.عميل {Math.round(s.cv)} ر.س (+{metrics!.changePct(s).toFixed(0)}%)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-red-50/50 rounded-xl p-4 border border-red-100">
            <h4 className="text-sm font-bold text-red-800 mb-2">انخفاض قيمة العميل (خسارة محتملة)</h4>
            {displayWorst.length === 0 ? <p className="text-xs text-slate-500">لا انخفاض في قيمة العميل</p> : (
              <ul className="space-y-1.5 text-xs">
                {displayWorst.map(s => (
                  <li key={s.id} className="flex justify-between items-center bg-white/80 rounded-lg px-2 py-1.5 border border-red-100">
                    <span className="font-semibold text-slate-800 truncate max-w-[140px]" title={s.name}>{s.name}</span>
                    <span className="text-red-700 font-bold">{metrics!.changePct(s).toFixed(0)}% | خسارة ≈ {formatSAR(metrics!.lossFromCV(s))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {(metrics.worst.length > 3 || metrics.best.length > 3) && (
          <div className="flex justify-center">
            <button type="button" onClick={() => setExpanded(!expanded)} className="text-sm font-bold text-orange-600 hover:text-orange-700">
              {expanded ? 'عرض أقل' : `عرض المزيد (${metrics.worst.length + metrics.best.length} فرع)`}
            </button>
          </div>
        )}

        {isGeminiAvailable() && (
          <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-indigo-800">رأي الذكاء الاصطناعي</h4>
              <button type="button" onClick={handleAskAI} disabled={aiLoading} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                {aiLoading ? 'جاري التحليل...' : 'اطلب تحليلًا'}
              </button>
            </div>
            {aiInsight && <p className="text-xs text-slate-700 leading-relaxed">{aiInsight}</p>}
          </div>
        )}
      </div>

      <style>{`
        .th-table { padding: 10px 12px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .td-table { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
      `}</style>
    </div>
  );
};
