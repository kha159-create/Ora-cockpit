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

const LightbulbIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-amber-500">
        <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 118.224-2.478.75.75 0 001.42-.444 6 6 0 10-10.288 0 .75.75 0 001.42.444A4.5 4.5 0 017.5 12zM12 20.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0v-2.25a.75.75 0 01.75-.75zM5.53 5.53a.75.75 0 011.06 0l1.59 1.59a.75.75 0 01-1.06 1.06l-1.59-1.59a.75.75 0 010-1.06zM18.47 18.47a.75.75 0 011.06 0l1.59 1.59a.75.75 0 01-1.06 1.06l-1.59-1.59a.75.75 0 010-1.06zM3 12a.75.75 0 01.75-.75h2.25a.75.75 0 010 1.5H3.75A.75.75 0 013 12zM21 12a.75.75 0 01.75-.75h2.25a.75.75 0 010 1.5h-2.25a.75.75 0 01-.75-.75zM5.53 18.47a.75.75 0 010 1.06l-1.59 1.59a.75.75 0 01-1.06-1.06l1.59-1.59a.75.75 0 011.06 0zM18.47 5.53a.75.75 0 010 1.06l-1.59 1.59a.75.75 0 01-1.06-1.06l1.59-1.59a.75.75 0 011.06 0z" />
    </svg>
)

interface StoreData {
    id: string;
    name: string;
    sales: number;
    target: number;
    visitors: number;
    trans: number;
    top_employee?: string;
}

interface AITargetInsightsProps {
    stores: StoreData[];
    formatSAR: (val: number) => string;
    mode: string;
}

export const AITargetInsights: React.FC<AITargetInsightsProps> = ({ stores, formatSAR, mode }) => {
    const [expanded, setExpanded] = useState(false);

    // Calculate AI insights intelligently based on remaining days and performance bottlenecks
    const insights = useMemo(() => {
        if (!stores || stores.length === 0) return [];

        const today = new Date();
        const pdaysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const currentDayOfM = today.getDate();

        // If not looking at the current month/MTD, the insights are less actionable.
        // But let's fallback to assuming 1 day remaining to avoid div-by-zero if analyzing history.
        let remDays = pdaysInMonth - currentDayOfM + 1;

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

            // Forecast logic = avg daily * total days in month
            const forecastSales = avgDailySales * pdaysInMonth;
            const forecastAch = t100 > 0 ? (forecastSales / t100) * 100 : 0;

            // Skip stores that already hit 100% or have 0 target.
            if (t100 <= 0 || currentAch >= 100) return;

            // Which target is the primary AI goal?
            let goalValue = t90;
            let goalLabel = "90%";

            // Categorization / Matrix (Heat-Map Tier)
            let type: 'critical' | 'attention' | 'golden' | 'success' = 'attention';
            let priorityScore = 0;

            const remSales = Math.max(0, goalValue - store.sales);
            let reqDailySales = remDays > 0 ? remSales / remDays : 0;

            // AI Unachievable check: To consider a branch "realistic", they shouldn't need a massive surge 
            // compared to their current average unless they're already very close.
            // If they need to double their daily average (>200% surge) and have less than 15 days, it's impossible.
            const requiredSurge = avgDailySales > 0 ? (reqDailySales / avgDailySales) : 0;

            if (currentAch >= 90) {
                goalValue = t100;
                goalLabel = "100%";
                type = 'golden'; // It's above 90%, it's a golden opportunity to hit 100%.
                priorityScore = 1;
            } else if (currentAch >= 80) {
                type = 'golden'; // 80 to 90 is also an easy push to 90%.
                priorityScore = 2;
            } else if (remDays > 0 && (currentAch < 60 && (remDays < 15 || requiredSurge > 1.5))) {
                // Critical state: Mathematically very difficult to achieve.
                // Examples: <60% with less than 15 days left, OR requires >150% of their current daily average.
                type = 'critical';
                priorityScore = 10;
            } else {
                type = 'attention'; // Between 60 and 80 usually, achievable.
                priorityScore = 5;
            }

            let reqDailyVisitors = 0;
            let reqDailyTrans = 0;

            if (reqDailySales > 0) {
                // AI prediction: How many visitors are needed if maintaining current Conversion & ATV?
                reqDailyVisitors = reqDailySales / (conversion * atv);
                reqDailyTrans = reqDailySales / atv;
            }

            // FILTER: If it is completely unachievable (critical), do not even show it.
            // "اذا الفرع واصل لحد 50% وضايل للشهر يويمن هاذا مستحيل يجيب اعرض الباقي لاء"
            if (type === 'critical') return;

            let textAdvice = "";
            let empAdvice = "";
            let bestEmp = store.top_employee ? `(${store.top_employee})` : 'أقوى موظفي المبيعات';

            // Formulate Actionable AI Logic
            if (conversion < 0.10) {
                textAdvice = "معدل تحويل الزوار منخفض جداً (أقل من ١٠٪). مبيعات تضيع بعد دخول العميل للفرع.";
                empAdvice = `ينصح بجدولة ${bestEmp} للإغلاق (Closers) وتجنب المهام الجانبية للتركيز الكامل على الزبائن.`;
            } else if (conversion >= 0.15 && atv < 180) { // Assuming 180 is a generic threshold for "low basket"
                textAdvice = "الفرع يستقطب الزبائن بمعدل تحويل ممتاز، لكن متوسط الفاتورة قليل.";
                empAdvice = `وجّه ${bestEmp} وبقية الطاقم فوراً لتفعيل عروض البيع المتقاطع (Cross-Selling) عند الكاشير.`;
            } else if (avgDailyVisitors < 30) {
                textAdvice = "حركة الأقدام والزبائن (Footfall) ضعيفة جداً ولا تكفي لتحقيق الأهداف بالوتيرة الحالية.";
                empAdvice = `كلّف ${bestEmp} باستغلال وقت الهدوء للتواصل الهاتفي بمهارة مع العملاء السابقين (Clienteling).`;
            } else if (forecastAch >= 100) {
                textAdvice = "الفرع يسير بوتيرة ممتازة لتجاوز الهدف قبل نهاية الشهر.";
                empAdvice = `شجّع الطاقم بقيادة ${bestEmp} للحفاظ على نفس الوتيرة لضمان تحقيق عمولات فائقة.`;
            } else {
                textAdvice = "يحتاج الفرع لدفعة بسيطة ورفع المبيعات اليومية بحوالي " + ((reqDailySales - avgDailySales) / avgDailySales * 100).toFixed(0) + "% لتجنب فقدان الهدف.";
                empAdvice = `ركز المهام الإدارية خارج أوقات الذروة واجعل ${bestEmp} متاحاً للبيع 100%.`;
            }

            // Generate an AI distance score to rank the most "actionable" branches.
            let distanceToGoal = 100 - (store.sales / goalValue * 100);

            // Weight priority score against distance to goal to present the most urgent cards first
            let finalSortScore = (priorityScore * 100) + distanceToGoal;

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
                forecastAch,
                type,
                distanceToGoal,
                currentAch,
                finalSortScore,
                textAdvice,
                empAdvice
            });
        });

        // Top priorities (Critical) usually have higher finalSortScore because of priorityScore multplier.
        // We'll sort descending so highest priority items show first natively.
        actionable.sort((a, b) => b.finalSortScore - a.finalSortScore);

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
                                المساعد الإداري الذكي
                                <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full border border-orange-200 font-bold uppercase tracking-widest animate-pulse">AI Live Insights</span>
                            </h2>
                            <p className="text-neutral-500 text-sm mt-0.5">تشخيص فوري للفروع ومقترحات لرفع كفاءة المبيعات وتوجيه الموظفين 🧠</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {displayInsights.map((store, idx) => {
                        let borderColor = "border-neutral-200 hover:border-orange-300";
                        let badgeColor = "bg-neutral-100 text-neutral-600";
                        let badgeLabel = "";
                        let titleColor = "text-neutral-900";

                        if (store.type === 'golden') {
                            borderColor = "border-orange-200 hover:border-orange-400 shadow-[0_0_15px_rgba(251,146,60,0.15)]";
                            badgeColor = "bg-orange-100 text-orange-700 border-orange-200";
                            badgeLabel = "🔥 فرصة ذهبية";
                            titleColor = "text-orange-900";
                        } else if (store.type === 'critical') {
                            borderColor = "border-red-200 hover:border-red-400 bg-red-50/10";
                            badgeColor = "bg-red-100 text-red-700 border-red-200 animate-pulse";
                            badgeLabel = "🚨 تدخل سريع";
                            titleColor = "text-red-900";
                        } else {
                            badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                            badgeLabel = "⚠️ انتباه";
                        }

                        return (
                            <div key={store.id} className={`bg-white border rounded-2xl p-4 transition-all duration-300 relative group overflow-hidden flex flex-col shadow-sm hover:shadow-lg ${borderColor}`}>
                                {/* Head Section */}
                                <div className="flex justify-between items-start mb-2 mt-1">
                                    <div>
                                        <div className={`font-black text-lg truncate pr-1 ${titleColor}`}>{store.name}</div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <TargetIcon />
                                            <span className="text-xs text-neutral-500 font-semibold">{`الهدف القادم التنفيذي للفرع: `}<span className="text-orange-600 font-bold bg-orange-50 border border-orange-100 px-1 py-0.5 rounded shadow-sm">{store.goalLabel}</span></span>
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1.5 rounded-lg text-[10px] font-black border ${badgeColor}`}>
                                        {badgeLabel}
                                    </div>
                                </div>

                                <div className="flex gap-4 items-end mb-4 bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                                    {/* MTD Achievement */}
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-neutral-500 font-bold mb-1">المحقق حالياً</span>
                                        <div className="text-xl font-black font-mono tracking-tight text-neutral-800">{store.currentAch.toFixed(1)}%</div>
                                    </div>
                                    {/* End of Month Forecast */}
                                    <div className="w-[1px] h-8 bg-neutral-200"></div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-neutral-500 font-bold mb-1">توقع نهاية الشهر</span>
                                        <div className={`text-xl font-black font-mono tracking-tight ${store.forecastAch >= 90 ? 'text-emerald-600' : 'text-neutral-500'}`}>{store.forecastAch.toFixed(1)}%</div>
                                    </div>
                                </div>

                                {/* AI Smart Text Body */}
                                <div className="mb-4 bg-orange-50/50 rounded-xl p-3 border border-orange-100/50 relative">
                                    <div className="absolute top-0 right-0 p-3 opacity-20"><LightbulbIcon /></div>
                                    <p className="text-xs text-neutral-700 font-bold mb-2 leading-relaxed tracking-wide">
                                        <span className="text-orange-600 font-black mr-1">🔍 التشخيص:</span> {store.textAdvice}
                                    </p>
                                    <p className="text-xs text-neutral-600 font-semibold leading-relaxed border-t border-orange-100 pt-2">
                                        <span className="text-blue-600 font-black mr-1">💡 التوصية:</span> {store.empAdvice}
                                    </p>
                                </div>


                                {store.reqDailySales > 0 ? (
                                    <div className="mt-auto bg-white rounded-xl p-3 border border-neutral-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-br from-neutral-50 to-white pointer-events-none" />

                                        <div className="text-[10px] text-neutral-500 mb-2 font-black relative z-10 border-b border-neutral-100 pb-1 uppercase tracking-wider">متطلبات يومية للوصول للهدف:</div>

                                        <div className="grid grid-cols-3 gap-2 relative z-10 p-1">
                                            <div className="flex flex-col mb-1 text-center">
                                                <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-t py-1">مبيعات</span>
                                                <span className="text-neutral-800 font-black font-mono text-sm border-x border-b border-neutral-100 rounded-b py-1 object-center flex justify-center">{formatSAR(store.reqDailySales)}</span>
                                            </div>
                                            <div className="flex flex-col mb-1 text-center">
                                                <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-t py-1">زوار</span>
                                                <span className="text-neutral-800 font-black font-mono text-sm border-x border-b border-neutral-100 rounded-b py-1 object-center flex justify-center">{store.reqDailyVisitors}</span>
                                            </div>
                                            <div className="flex flex-col mb-1 text-center">
                                                <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-t py-1">متوسط السلة</span>
                                                <span className="text-neutral-800 font-black font-mono text-sm border-x border-b border-neutral-100 rounded-b py-1 object-center flex justify-center">{formatSAR(store.atvFormatted)}</span>
                                            </div>

                                            {/* Averages Row */}
                                            <div className="flex flex-col text-center mt-1">
                                                <div className="flex items-center justify-center gap-1 text-[9px] text-neutral-400 font-bold mb-0.5">المتوسط الحالي</div>
                                                <div className="text-[11px] font-bold text-neutral-800 font-mono tracking-tighter flex justify-center items-center gap-1">
                                                    {formatSAR(store.avgDailySales)}
                                                    <TrendIcon isUp={store.avgDailySales >= store.reqDailySales} isDown={store.avgDailySales < store.reqDailySales} />
                                                </div>
                                            </div>
                                            <div className="flex flex-col text-center mt-1">
                                                <div className="flex items-center justify-center gap-1 text-[9px] text-neutral-400 font-bold mb-0.5">المتوسط الحالي</div>
                                                <div className="text-[11px] font-bold text-neutral-800 font-mono tracking-tighter flex justify-center items-center gap-1">
                                                    {store.avgDailyVisitors}
                                                    <TrendIcon isUp={store.avgDailyVisitors >= store.reqDailyVisitors} isDown={store.avgDailyVisitors < store.reqDailyVisitors} />
                                                </div>
                                            </div>
                                            <div className="flex flex-col text-center mt-1">
                                                <div className="flex items-center justify-center gap-1 text-[9px] text-neutral-400 font-bold mb-0.5">المتوسط الحالي</div>
                                                <div className="text-[11px] font-bold text-neutral-800 font-mono tracking-tighter flex justify-center items-center gap-1">
                                                    {formatSAR(store.atvFormatted)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-auto bg-neutral-50 rounded-lg p-4 border border-neutral-200 flex items-center justify-center text-xs font-bold text-neutral-400">
                                        لا يتوفر متطلبات يومية دقيقة لهذه الفترة
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {insights.length > 3 && (
                    <div className="mt-6 flex justify-center">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-bold py-2.5 px-8 rounded-full shadow-lg transition-transform hover:scale-105"
                        >
                            {expanded ? "إغلاق عرض الفروع" : `تشخيص باقي الفروع (${insights.length - 3})`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
