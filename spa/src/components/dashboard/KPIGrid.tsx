import React from 'react';
import { KPICard } from '../DashboardComponents';

// Premium KPI Icons - clean, modern line art
const SalesIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <path d="M2 20h20" />
        <path d="M5 20V10l4-6 4 4 4-7 4 3v16" />
        <circle cx="9" cy="4" r="0" />
    </svg>
);

const InvoicesIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M9 6h6" />
        <path d="M9 10h6" />
        <path d="M9 14h4" />
        <path d="M9 18h2" />
    </svg>
);

const VisitorsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

const CustomerValueIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v12" />
        <path d="M15 9.5c0-1.38-1.34-2.5-3-2.5s-3 1.12-3 2.5 1.34 2.5 3 2.5 3 1.12 3 2.5-1.34 2.5-3 2.5" />
    </svg>
);

interface KPIGridProps {
    totals: { sales: number; trans: number; visitors: number; target: number };
    prevYearTotals: { sales: number; trans: number; visitors: number };
    monthlyChartData: { Sales: number; Visitors: number }[];
    formatSAR: (val: number) => string;
}

export const KPIGrid: React.FC<KPIGridProps> = ({ totals, prevYearTotals, monthlyChartData, formatSAR }) => {
    const avgInvoice = totals.trans > 0 ? totals.sales / totals.trans : 0;
    const conversionRate = totals.visitors > 0 ? (totals.trans / totals.visitors) * 100 : 0;
    const achievementPct = totals.target > 0 ? (totals.sales / totals.target) * 100 : 0;
    const achievementCapped = Math.min(achievementPct, 100);
    const isTargetMet = achievementPct >= 100;

    // Remaining to target
    const remaining = Math.max(totals.target - totals.sales, 0);
    const today = new Date();
    const isMarch2026 = today.getFullYear() === 2026 && today.getMonth() === 2;
    const daysInMonth = isMarch2026 ? 19 : new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysPassed = isMarch2026 ? Math.min(today.getDate(), 19) : today.getDate();
    const daysRemaining = Math.max(0, daysInMonth - daysPassed);
    const dailyRequired = daysRemaining > 0 ? remaining / daysRemaining : 0;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 sm:gap-3">
            <KPICard
                title="المبيعات"
                value={totals.sales}
                format={formatSAR}
                comparisonValue={prevYearTotals.sales}
                comparisonLabel="السنة الماضية"
                icon={<SalesIcon />}
                trendData={monthlyChartData.map(d => d.Sales)}
            />
            <KPICard
                title="الفواتير"
                value={totals.trans}
                comparisonValue={prevYearTotals.trans}
                comparisonLabel="السنة الماضية"
                icon={<InvoicesIcon />}
                trendData={monthlyChartData.map(d => d.Sales)}
                subtitle={`معدل الفاتورة: ${formatSAR(avgInvoice)}`}
            />
            <KPICard
                title="الزوار"
                value={totals.visitors}
                comparisonValue={prevYearTotals.visitors}
                comparisonLabel="السنة الماضية"
                icon={<VisitorsIcon />}
                trendData={monthlyChartData.map(d => d.Visitors)}
                subtitle={`نسبة الاستحواذ: ${conversionRate.toFixed(1)}%`}
            />
            <KPICard
                title="قيمة العميل"
                value={totals.visitors > 0 ? totals.sales / totals.visitors : 0}
                format={formatSAR}
                comparisonValue={prevYearTotals.visitors > 0 ? prevYearTotals.sales / prevYearTotals.visitors : 0}
                comparisonLabel="السنة الماضية"
                icon={<CustomerValueIcon />}
            />

            {/* Premium Target Card */}
            <div className="modern-kpi-card group p-3 sm:p-4 flex flex-col w-full h-full relative overflow-hidden border border-neutral-100">
                {/* Subtle gradient */}
                <div className="absolute inset-0 bg-gradient-to-bl from-white via-white to-orange-50/40 pointer-events-none" />

                <div className="relative z-10 flex-1 flex flex-col">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                        <h3 className="text-[11px] sm:text-xs text-neutral-400 font-bold uppercase tracking-wider">الهدف</h3>
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-200/50">
                            <svg className="w-4 h-4 sm:w-[18px] sm:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="6" />
                                <circle cx="12" cy="12" r="2" />
                            </svg>
                        </div>
                    </div>

                    {/* Big percentage */}
                    <div className="mb-2">
                        <div className={`text-2xl sm:text-3xl font-extrabold leading-tight font-mono tracking-tight ${isTargetMet ? 'text-emerald-600' : 'text-neutral-900'}`}>
                            {achievementPct.toFixed(1)}%
                        </div>
                    </div>

                    {/* Progress bar - orange gradient */}
                    <div className="mb-3">
                        <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ease-out ${isTargetMet
                                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                    : 'bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600'
                                    }`}
                                style={{ width: `${achievementCapped}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[9px] text-neutral-400">{formatSAR(totals.sales)}</span>
                            <span className="text-[9px] text-neutral-400 dir-ltr">{formatSAR(totals.target)}</span>
                        </div>
                    </div>

                    {/* Bottom info */}
                    <div className="mt-auto border-t border-neutral-100/50 pt-2">
                        {remaining > 0 ? (
                            <div className="text-[10px] text-neutral-400">
                                <span>المتبقي: </span>
                                <span className="font-bold text-neutral-600 dir-ltr">{formatSAR(remaining)}</span>
                                {daysRemaining > 0 && (
                                    <span className="mr-1">({formatSAR(dailyRequired)}/يوم)</span>
                                )}
                            </div>
                        ) : (
                            <div className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                <span>تم تحقيق الهدف</span>
                                <span>&#10003;</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom progress indicator bar - orange */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-neutral-100 z-20">
                    <div
                        className={`h-full rounded-b-xl transition-all duration-700 ${isTargetMet
                            ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                            : 'bg-gradient-to-r from-orange-400 to-orange-600'
                            }`}
                        style={{ width: `${achievementCapped}%` }}
                    />
                </div>
            </div>
        </div>
    );
};
