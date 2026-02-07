import React from 'react';
import { CurrencyDollarIcon, ReceiptTaxIcon, UsersIcon, UserGroupIcon } from '../Icons';
import { KPICard } from '../DashboardComponents';

interface KPIGridProps {
    totals: { sales: number; trans: number; visitors: number; target: number };
    prevYearTotals: { sales: number; trans: number; visitors: number };
    monthlyChartData: { Sales: number; Visitors: number }[];
    formatSAR: (val: number) => string;
}

export const KPIGrid: React.FC<KPIGridProps> = ({ totals, prevYearTotals, monthlyChartData, formatSAR }) => {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 sm:gap-3">
            <KPICard
                title="المبيعات"
                value={totals.sales}
                format={formatSAR}
                comparisonValue={prevYearTotals.sales}
                comparisonLabel="السنة الماضية"
                icon={<CurrencyDollarIcon />}
                trendData={monthlyChartData.map(d => d.Sales)}
            />
            <KPICard
                title="الفواتير"
                value={totals.trans}
                comparisonValue={prevYearTotals.trans}
                comparisonLabel="السنة الماضية"
                icon={<ReceiptTaxIcon />}
                trendData={monthlyChartData.map(d => d.Sales)}
            />
            <KPICard
                title="الزوار"
                value={totals.visitors}
                comparisonValue={prevYearTotals.visitors}
                comparisonLabel="السنة الماضية"
                icon={<UsersIcon />}
                trendData={monthlyChartData.map(d => d.Visitors)}
            />
            <KPICard
                title="قيمة العميل"
                value={totals.visitors > 0 ? totals.sales / totals.visitors : 0}
                format={formatSAR}
                comparisonValue={prevYearTotals.visitors > 0 ? prevYearTotals.sales / prevYearTotals.visitors : 0}
                comparisonLabel="السنة الماضية"
                icon={<UserGroupIcon />}
            />

            {/* Target Card */}
            <div className="modern-kpi-card group p-2 sm:p-3 flex flex-col w-full h-full relative overflow-hidden text-center sm:text-right">
                <div className="kpi-card-background" />

                <div className="relative z-10 flex-1 flex flex-col justify-between">
                    <div className="flex justify-center sm:justify-end mb-2">
                        <h3 className="kpi-title text-xs sm:text-sm truncate">تحقيق الهدف (Target)</h3>
                    </div>

                    <div className="flex items-center justify-between px-1 flex-1">
                        {/* Donut Chart */}
                        <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0">
                            <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                <path
                                    className="text-gray-100/50"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3.5"
                                />
                                <path
                                    className={totals.target > 0 && (totals.sales / totals.target) >= 1 ? "text-green-500" : "text-orange-500"}
                                    strokeDasharray={`${Math.min((totals.sales / (totals.target || 1)) * 100, 100)}, 100`}
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3.5"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </div>

                        {/* Percentage */}
                        <div className="flex flex-col items-end justify-center">
                            <div className="text-2xl sm:text-3xl font-bold text-neutral-900 leading-tight">
                                {totals.target > 0 ? (totals.sales / totals.target * 100).toFixed(1) : '0.0'}%
                            </div>
                        </div>
                    </div>

                    {/* Target Value */}
                    <div className="mt-2 text-center sm:text-right border-t border-neutral-100/50 pt-2">
                        <span className="text-[10px] text-neutral-500">Target: </span>
                        <span className="text-xs font-semibold text-neutral-700 dir-ltr inline-block">{formatSAR(totals.target)}</span>
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-600 rounded-b-xl z-20" />
            </div>
        </div>
    );
};
