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
      prevCV: s.prevCustomerValue ?? (s.prevYearVisitors && s.prevYearVisitors > 0 ? s.prevYearSales! / s.prevYearVisitors : 0),
    }));
    const changePct = (s: typeof withCV[0]) => s.prevCV > 0 ? ((s.cv - s.prevCV) / s.prevCV) * 100 : 0;
    const lossFromCV = (s: typeof withCV[0]) => {
      if (s.prevCV <= 0 || s.cv >= s.prevCV) return 0;
      return (s.prevCV - s.cv) * s.visitors;
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
      best,
      worst,
      changePct,
      lossFromCV,
    };
  }, [stores]);

  const simulation = useMemo(() => {
    if (!metrics || !stores?.length) return null;
    const totalVisitors = metrics.totalVisitors;
    const totalSales = metrics.totalSales;
    const cv = metrics.customerValue;
    const atv = metrics.avgInvoice;
    const conversion = totalVisitors > 0 ? metrics.totalVisitors > 0 ? (stores.reduce((s, x) => s + x.trans, 0) / totalVisitors) : 0 : 0;

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

  const handleAskAI = async () => {
    if (!metrics || !isGeminiAvailable()) return;
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

  if (!metrics || (metrics.best.length === 0 && metrics.worst.length === 0 && metrics.totalVisitors === 0)) return null;

  const displayWorst = expanded ? metrics.worst : metrics.worst.slice(0, 3);
  const displayBest = expanded ? metrics.best : metrics.best.slice(0, 3);

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 p-5 mb-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-orange-400 rounded-full blur-[80px] opacity-20 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
              <SparklesIcon />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                قيمة العميل والمحاكاة
                <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full border border-orange-200 font-bold uppercase tracking-widest">Customer Value</span>
              </h2>
              <p className="text-neutral-500 text-sm mt-0.5">أداء المعارض بناءً على قيمة العميل، معدل الفاتورة، والاستحواذ المطلوب 🎯</p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[11px] font-bold text-slate-500 mb-0.5">قيمة العميل (الإجمالي)</div>
            <div className="font-black text-lg text-orange-600" dir="ltr">{formatSAR(metrics.customerValue)}</div>
            {metrics.prevCustomerValue > 0 && (
              <div className={`text-[10px] font-bold mt-0.5 ${metrics.changeCV >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {metrics.changeCV >= 0 ? '+' : ''}{metrics.changeCV.toFixed(1)}% عن نفس الفترة السنة الماضية
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

        {/* محاكاة */}
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-100 mb-5">
          <h3 className="text-sm font-bold text-orange-800 mb-3">محاكاة سريعة</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">قيمة عميل مستهدفة (ر.س)</label>
              <input
                type="number"
                min="0"
                step="10"
                value={simTargetCV}
                onChange={e => setSimTargetCV(e.target.value === '' ? '' : Number(e.target.value))}
                className="input w-32 text-sm"
                placeholder="مثال: 60"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">مبيعات مستهدفة (ر.س)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={simTargetSales}
                onChange={e => setSimTargetSales(e.target.value === '' ? '' : Number(e.target.value))}
                className="input w-36 text-sm"
                placeholder="مثال: 500000"
              />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
            <h4 className="text-sm font-bold text-emerald-800 mb-2">أفضل أداء (ارتفاع قيمة العميل)</h4>
            {displayBest.length === 0 ? <p className="text-xs text-slate-500">لا بيانات لهذه الفترة</p> : (
              <ul className="space-y-1.5 text-xs">
                {displayBest.map(s => (
                  <li key={s.id} className="flex justify-between items-center bg-white/80 rounded-lg px-2 py-1.5 border border-emerald-100">
                    <span className="font-semibold text-slate-800 truncate max-w-[140px]" title={s.name}>{s.name}</span>
                    <span className="text-emerald-700 font-bold">ق.عميل {Math.round(s.cv)} ر.س (+{metrics.changePct(s).toFixed(0)}%)</span>
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
                    <span className="text-red-700 font-bold">{metrics.changePct(s).toFixed(0)}% | خسارة ≈ {formatSAR(metrics.lossFromCV(s))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {(metrics.worst.length > 3 || metrics.best.length > 3) && (
          <div className="flex justify-center mb-4">
            <button type="button" onClick={() => setExpanded(!expanded)} className="text-sm font-bold text-orange-600 hover:text-orange-700">
              {expanded ? 'عرض أقل' : `عرض المزيد (${metrics.worst.length + metrics.best.length} فرع)`}
            </button>
          </div>
        )}

        {/* رأي الذكاء الاصطناعي */}
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
    </div>
  );
};
