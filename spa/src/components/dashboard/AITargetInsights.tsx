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

const TrendIcon = ({ isUp, isDown }: { isUp?: boolean; isDown?: boolean }) => {
    if (isUp) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-emerald-500">
                <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
            </svg>
        );
    }
    if (isDown) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-red-500">
                <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
            </svg>
        );
    }
    return null;
}

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
        const pdaysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const currentDayOfM = today.getDate();

        // If not looking at the current month/MTD, the insights are less actionable.
        // But let's fallback to assuming 1 day remaining to avoid div-by-zero if analyzing history.
        let remDays = pdaysInMonth - currentDayOfM + 1;

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

            // Daily Averages (Elapsed days)
            const elapsedDays = Math.max(1, currentDayOfM - 1);
            const avgDailySales = store.sales / elapsedDays;
            const avgDailyVisitors = store.visitors / elapsedDays;

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
                reqDailyVisitors = reqDailySales / (conversion * atv);
                reqDailyTrans = reqDailySales / atv;
            }

            // Generate an AI distance score to rank the most "actionable" branches.
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
                avgDailySales,
                avgDailyVisitors: Math.ceil(avgDailyVisitors),
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
        <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 p-5 mb-6 relative overflow-hidden">
            {/* ORA Branding Decorative Glow Overlay */}
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-orange-400 rounded-full blur-[80px] opacity-20 pointer-events-none" />

            <div className="relative z-10 w-full">

                <div className="flex items-center justify-between mb-4 pb-4 border-b border-neutral-100">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
                            <SparklesIcon />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                                توصيات الذكاء الاصطناعي
                                <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full border border-orange-200 font-bold uppercase tracking-widest animate-pulse">Live Insights</span>
                            </h2>
                            <p className="text-neutral-500 text-sm mt-0.5">فرص الفروع للوصول للأهداف وكيفية تحقيقها خلال الأيام المتبقية 🎯</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayInsights.map((store, idx) => (
                        <div key={store.id} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:shadow-md hover:border-orange-300 transition-all duration-300 relative group overflow-hidden flex flex-col">
                            {/* Decorative accent line */}
                            <div className={`absolute top-0 right-0 left-0 h-1 ${store.type === 'success' ? 'bg-emerald-500' : store.type === 'warning' ? 'bg-orange-500' : 'bg-red-500'}`} />

                            <div className="flex justify-between items-start mb-3 mt-1">
                                <div>
                                    <div className="text-neutral-900 font-bold text-lg truncate pr-1">{store.name}</div>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <TargetIcon />
                                        <span className="text-xs text-neutral-500 font-semibold">{`الهدف القادم التنفيذي للفرع: `}<span className="text-orange-600 font-bold bg-orange-100 px-1 py-0.5 rounded">{store.goalLabel}</span></span>
                                    </div>
                                </div>
                                <div className={`px-2 py-1.5 rounded-lg text-xs font-bold border ${store.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    store.type === 'warning' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                        'bg-red-50 text-red-700 border-red-200'
                                    }`}>
                                    {store.currentAch.toFixed(1)}%
                                </div>
                            </div>

                            <div className="mb-4">
                                <span className="text-neutral-900 text-2xl font-black font-mono tracking-tight">{formatSAR(store.remSales)}</span>
                                <span className="text-neutral-400 text-xs mr-1 font-bold">متبقي كهدف مبيعات</span>
                            </div>

                            {store.reqDailySales > 0 ? (
                                <div className="mt-auto bg-white rounded-lg p-3 border border-neutral-200 shadow-sm relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-50/50 to-white pointer-events-none" />

                                    <div className="text-xs text-neutral-600 mb-3 font-bold relative z-10 border-b border-neutral-100 pb-2">متطلبات يومية للوصول للهدف:</div>

                                    <div className="grid grid-cols-3 gap-2 relative z-10">
                                        <div className="flex flex-col mb-1 text-center">
                                            <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-t py-1">مبيعات</span>
                                            <span className="text-orange-600 font-black font-mono text-sm border-x border-b border-neutral-100 rounded-b py-1 object-center flex justify-center">{formatSAR(store.reqDailySales)}</span>
                                        </div>
                                        <div className="flex flex-col mb-1 text-center">
                                            <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-t py-1">زوار</span>
                                            <span className="text-emerald-600 font-black font-mono text-sm border-x border-b border-neutral-100 rounded-b py-1 object-center flex justify-center">{store.reqDailyVisitors}</span>
                                        </div>
                                        <div className="flex flex-col mb-1 text-center">
                                            <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-t py-1">متوسط السلة</span>
                                            <span className="text-blue-600 font-black font-mono text-sm border-x border-b border-neutral-100 rounded-b py-1 object-center flex justify-center">{formatSAR(store.atvFormatted)}</span>
                                        </div>

                                        {/* Averages Row */}
                                        <div className="flex flex-col text-center mt-1">
                                            <div className="flex items-center justify-center gap-1 text-[10px] text-neutral-400 font-bold mb-0.5">المتوسط الحالي</div>
                                            <div className="text-[11px] font-bold text-neutral-800 font-mono tracking-tighter flex justify-center items-center gap-1">
                                                {formatSAR(store.avgDailySales)}
                                                <TrendIcon isUp={store.avgDailySales >= store.reqDailySales} isDown={store.avgDailySales < store.reqDailySales} />
                                            </div>
                                        </div>
                                        <div className="flex flex-col text-center mt-1">
                                            <div className="flex items-center justify-center gap-1 text-[10px] text-neutral-400 font-bold mb-0.5">المتوسط الحالي</div>
                                            <div className="text-[11px] font-bold text-neutral-800 font-mono tracking-tighter flex justify-center items-center gap-1">
                                                {store.avgDailyVisitors}
                                                <TrendIcon isUp={store.avgDailyVisitors >= store.reqDailyVisitors} isDown={store.avgDailyVisitors < store.reqDailyVisitors} />
                                            </div>
                                        </div>
                                        <div className="flex flex-col text-center mt-1">
                                            <div className="flex items-center justify-center gap-1 text-[10px] text-neutral-400 font-bold mb-0.5">المتوسط الحالي</div>
                                            <div className="text-[11px] font-bold text-neutral-800 font-mono tracking-tighter flex justify-center items-center gap-1">
                                                {formatSAR(store.atvFormatted)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-auto bg-neutral-100 rounded-lg p-4 border border-neutral-200 flex items-center justify-center text-xs font-bold text-neutral-400">
                                    لا يتوفر متطلبات يومية دقيقة لهذه الفترة
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {insights.length > 3 && (
                    <div className="mt-5 flex justify-center">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="bg-white hover:bg-orange-50 text-orange-600 text-sm font-bold py-2 px-8 rounded-full border border-orange-200 transition-colors shadow-sm"
                        >
                            {expanded ? "عرض أقل" : `مشاهدة باقي الفروع (${insights.length - 3})`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
