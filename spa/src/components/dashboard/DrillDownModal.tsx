import React, { useMemo, useState } from 'react';
import { XIcon } from '../Icons';

export const DrillDownModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    dateStr: string | null;
    raw: any;
    allowedStoreIds: Set<string>;
    formatSAR: (val: number) => string;
}> = ({ isOpen, onClose, dateStr, raw, allowedStoreIds, formatSAR }) => {
    const [metric, setMetric] = useState<'SALES' | 'VISITORS'>('SALES');

    const branchesData = useMemo(() => {
        if (!raw || !dateStr) return [];

        const byStore: Record<string, { sales: number; visitors: number; name: string }> = {};

        // Initialize
        Object.keys(raw.stores || {}).forEach(sid => {
            if (!allowedStoreIds.has(sid)) return;
            byStore[sid] = { sales: 0, visitors: 0, name: raw.stores[sid] };
        });

        (raw.sales || []).forEach(([d, sid, v]: any[]) => {
            if (String(d).substring(0, 10) === dateStr && byStore[sid]) {
                byStore[sid].sales += v;
            }
        });

        (raw.visitors || []).forEach(([d, sid, v]: any[]) => {
            if (String(d).substring(0, 10) === dateStr && byStore[sid]) {
                byStore[sid].visitors += v;
            }
        });

        return Object.values(byStore)
            .filter(b => b.sales > 0 || b.visitors > 0)
            .sort((a, b) => metric === 'SALES' ? b.sales - a.sales : b.visitors - a.visitors);

    }, [raw, dateStr, allowedStoreIds, metric]);

    if (!isOpen || !dateStr) return null;

    const maxVal = Math.max(...branchesData.map(b => metric === 'SALES' ? b.sales : b.visitors), 1);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 text-right dir-rtl">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col relative z-10 overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="bg-gradient-to-l from-slate-900 to-slate-800 p-5 sm:p-6 text-white flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/20 blur-3xl rounded-full -mr-32 -mt-32 pointer-events-none" />
                    <div className="relative z-10">
                        <h2 className="text-xl sm:text-2xl font-black mb-1">تفاصيل أداء يوم {dateStr}</h2>
                        <div className="text-xs font-bold text-slate-300">نظرة أعمق على أداء الفروع</div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors shrink-0 relative z-10">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 sm:p-6 flex-1 overflow-auto bg-slate-50/50">
                    {/* Tabs */}
                    <div className="flex bg-neutral-100 p-1 rounded-xl mb-6">
                        <button
                            onClick={() => setMetric('SALES')}
                            className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${metric === 'SALES' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            المبيعات 💰
                        </button>
                        <button
                            onClick={() => setMetric('VISITORS')}
                            className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${metric === 'VISITORS' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            الزوار 👥
                        </button>
                    </div>

                    {/* List */}
                    <div className="space-y-3">
                        {branchesData.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 font-bold">لا تتوفر مبيعات أو حركات لهذا اليوم</div>
                        ) : (
                            branchesData.map((b, idx) => {
                                const val = metric === 'SALES' ? b.sales : b.visitors;
                                const pct = (val / maxVal) * 100;
                                return (
                                    <div key={b.name} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm relative overflow-hidden">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="font-bold text-slate-800 text-sm flex gap-2"><span className="text-slate-400 w-4">{idx + 1}.</span> {b.name}</div>
                                            <div className="font-black text-slate-900 dir-ltr">{metric === 'SALES' ? formatSAR(val) : val.toLocaleString()}</div>
                                        </div>
                                        <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-l from-orange-400 to-orange-500 rounded-full"
                                                style={{ width: `${Math.max(pct, 1)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
