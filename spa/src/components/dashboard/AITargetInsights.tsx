import React, { useMemo, useState } from 'react';

// Icons for the UI
const SparklesIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.522 2.522l2.846.813a.75.75 0 010 1.438l-2.846.813a3.75 3.75 0 00-2.522 2.522l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.522-2.522l-2.846-.813a.75.75 0 010-1.438l2.846-.813a3.75 3.75 0 002.522-2.522l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z" clipRule="evenodd" />
    </svg>
);

const TargetIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 15a5.25 5.25 0 100-10.5 5.25 5.25 0 000 10.5zm0-2.25a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
);

interface StoreData {
    id: string;
    name: string;
    sales: number;
    target: number;
    visitors: number;
    trans: number;
}

interface AITargetInsightsProps {
    stores: StoreData[];
    formatSAR: (val: number) => string;
    mode: string;
}

export const AITargetInsights: React.FC<AITargetInsightsProps> = ({ stores, formatSAR, mode }) => {
    const [expanded, setExpanded] = useState(false);

    // Calculate AI insights intelligently based on remaining days.
    const insights = useMemo(() => {
        if (!stores || stores.length === 0) return [];

        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        // If not looking at the current month/MTD, the insights are less actionable.
        // But let's fallback to assuming 1 day remaining to avoid div-by-zero if analyzing history.
        let remDays = daysInMonth - today.getDate() + 1;

        // If the user selects a historical month, remDays shouldn't really apply for forecasting,
        // so we disable the "Required Daily" logic by zeroing it if mode != 'mtd' and mode != 'custom'
        // For simplicity, let's just use it if remDays > 0.
        if (mode !== 'mtd' && mode !== 'today') {
            remDays = 0; // Means we are looking back, so predictions aren't "live".
        }

        const actionable: any[] = [];

        stores.forEach(store => {
            const t100 = store.target || 0;
            const t90 = t100 * 0.9;

            // Current performance stats
            const currentAch = t100 > 0 ? (store.sales / t100) * 100 : 0;
            const conversion = store.visitors > 0 ? store.trans / store.visitors : 0.15; // fallback 15%
            const atv = store.trans > 0 ? store.sales / store.trans : 200; // fallback

            // Skip stores that already hit 100% or have 0 target.
            if (t100 <= 0 || currentAch >= 100) return;

            // Which target is the primary AI goal?
            let goalValue = t90;
            let goalLabel = "90%";
            let type = "warning"; // default target style

            // If they already hit 90% but not 100%, the AI goal switches to 100%
            if (currentAch >= 90) {
                goalValue = t100;
                goalLabel = "100%";
                type = "success";
            } else if (currentAch < 50 && remDays < 10 && remDays > 0) {
                // Critical state: Far behind and month ending. Focus on realistic intermediate step or just 90% survival.
                type = "critical";
            }

            const remSales = Math.max(0, goalValue - store.sales);
            let reqDailySales = remDays > 0 ? remSales / remDays : 0;
            let reqDailyVisitors = 0;
            let reqDailyTrans = 0;

            if (reqDailySales > 0) {
                // AI prediction: How many visitors are needed if maintaining current Conversion & ATV?
                // sales = visitors * conv * atv 
                reqDailyVisitors = reqDailySales / (conversion * atv);
                reqDailyTrans = reqDailySales / atv;
            }

            // Generate an AI sentence score to rank the most "actionable" branches.
            // A branch very close to 90% or 100% is a "High Opportunity".
            let distanceToGoal = 100 - (store.sales / goalValue * 100);

            actionable.push({
                ...store,
                goalLabel,
                goalValue,
                remSales,
                reqDailySales,
                reqDailyVisitors: Math.ceil(reqDailyVisitors),
                reqDailyTrans: Math.ceil(reqDailyTrans),
                conversionPct: (conversion * 100).toFixed(1),
                atvFormatted: atv,
                type,
                distanceToGoal,
                currentAch
            });
        });

        // Sort by how close they are to the next actionable goal (opportunity branches first).
        actionable.sort((a, b) => a.distanceToGoal - b.distanceToGoal);

        // Return top options
        return actionable;
    }, [stores, mode]);

    if (!insights || insights.length === 0) return null;

    // By default show top 3, expand to show more.
    const displayInsights = expanded ? insights.slice(0, 10) : insights.slice(0, 3);

    return (
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 rounded-2xl shadow-xl border border-indigo-700 p-1 mb-6 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-purple-500 rounded-full blur-3xl opacity-20 pointer-events-none" />
            <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-blue-500 rounded-full blur-3xl opacity-20 pointer-events-none" />

            <div className="bg-[#111827]/40 backdrop-blur-sm rounded-[14px] p-4 relative z-10 w-full">

                <div className="flex items-center justify-between mb-4 border-b border-indigo-500/30 pb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30 animate-pulse">
                            <SparklesIcon />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                توصيات الذكاء الاصطناعي
                                <span className="bg-indigo-500/30 text-indigo-200 text-[10px] px-2 py-0.5 rounded-full border border-indigo-400/30 font-bold uppercase tracking-widest">Live</span>
                            </h2>
                            <p className="text-indigo-200 text-xs mt-0.5">فرص تحقيق الأهداف وبناء التوقعات الذكية للفروع</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {displayInsights.map((store, idx) => (
                        <div key={store.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors duration-300 relative group overflow-hidden flex flex-col">
                            {/* Decorative accent line */}
                            <div className={`absolute top-0 right-0 left-0 h-1 ${store.type === 'success' ? 'bg-emerald-400' : store.type === 'warning' ? 'bg-amber-400' : 'bg-red-400'}`} />

                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <div className="text-white font-bold text-base truncate pr-1">{store.name}</div>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <TargetIcon />
                                        <span className="text-xs text-indigo-200 font-semibold">{`الهدف القادم التنفيذي للفرع: ${store.goalLabel}`}</span>
                                    </div>
                                </div>
                                <div className={`px-2 py-1 rounded-lg text-xs font-bold border ${store.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                                        store.type === 'warning' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                            'bg-red-500/20 text-red-300 border-red-500/30'
                                    }`}>
                                    {store.currentAch.toFixed(1)}%
                                </div>
                            </div>

                            <div className="mb-2">
                                <span className="text-white text-xl font-bold font-mono tracking-tight">{formatSAR(store.remSales)}</span>
                                <span className="text-indigo-300 text-xs mr-1">متبقي</span>
                            </div>

                            {store.reqDailySales > 0 ? (
                                <div className="mt-auto bg-black/20 rounded-lg p-3 border border-white/5">
                                    <div className="text-xs text-indigo-200 mb-2 font-medium">لكي يحقق الهدف، يحتاج الفرع يومياً إلى:</div>

                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="flex flex-col text-center">
                                            <span className="text-[10px] text-indigo-400">مبيعات</span>
                                            <span className="text-amber-300 font-bold font-mono text-xs">{formatSAR(store.reqDailySales)}</span>
                                        </div>
                                        <div className="flex flex-col text-center border-r border-l border-white/5 mx-1 px-1">
                                            <span className="text-[10px] text-indigo-400">زوار</span>
                                            <span className="text-emerald-300 font-bold font-mono text-xs">{store.reqDailyVisitors}</span>
                                        </div>
                                        <div className="flex flex-col text-center">
                                            <span className="text-[10px] text-indigo-400">متوسط فاتورة</span>
                                            <span className="text-blue-300 font-bold font-mono text-xs">{Math.round(store.atvFormatted)}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-auto bg-black/20 rounded-lg p-3 border border-white/5 flex items-center justify-center text-xs text-indigo-300">
                                    لا يتوفر بيانات يومية لهذه الفترة
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {insights.length > 3 && (
                    <div className="mt-4 flex justify-center">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="bg-white/5 hover:bg-white/10 text-indigo-200 text-xs font-bold py-1.5 px-6 rounded-full border border-white/10 transition-colors"
                        >
                            {expanded ? "عرض أقل" : `عرض المزيد من الفرص (${insights.length - 3})`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
