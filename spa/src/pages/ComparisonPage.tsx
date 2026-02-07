import React, { useState, useEffect } from 'react';
import { loadManagementData } from '../services/upstreamData';
import { useComparison, ComparisonMetric } from '../hooks/useComparison';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { CalendarIcon, ChartBarIcon, UsersIcon, CurrencyDollarIcon, ReceiptTaxIcon, ArrowLeftIcon } from '../components/Icons';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Helper to get ranges
const getRange = (mode: 'today' | 'yesterday' | 'mtd' | 'last_month') => {
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    if (mode === 'today') return { start: fmt(today), end: fmt(today) };
    if (mode === 'yesterday') return { start: fmt(yesterday), end: fmt(yesterday) };
    if (mode === 'mtd') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: fmt(start), end: fmt(today) }; // MTD until today
    }
    if (mode === 'last_month') {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: fmt(start), end: fmt(end) };
    }
    return { start: fmt(today), end: fmt(today) };
};

const ComparisonCard = ({ metric, isActive, onClick }: { metric: ComparisonMetric, isActive: boolean, onClick: () => void }) => {
    const isPos = metric.growth >= 0;
    return (
        <div
            onClick={onClick}
            className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${isActive
                    ? 'bg-orange-50 border-orange-200 ring-1 ring-orange-300 shadow-sm'
                    : 'bg-white border-neutral-200 hover:border-orange-200 hover:shadow-sm'
                }`}
        >
            <div className="flex justify-between items-start mb-2">
                <span className="text-neutral-500 text-sm font-medium">{metric.title}</span>
                <div className={`text-xs px-2 py-0.5 rounded-full font-bold ${isPos ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {isPos ? '+' : ''}{metric.growth.toFixed(1)}%
                </div>
            </div>
            <div className="text-2xl font-bold text-neutral-900 mb-1">
                {metric.isCurrency ? Math.round(metric.current).toLocaleString() :
                    metric.isPercentage ? metric.current.toFixed(1) + '%' :
                        Math.round(metric.current).toLocaleString()}
                {metric.isCurrency && <span className="text-xs text-neutral-400 font-normal mr-1">SAR</span>}
            </div>
            <div className="text-xs text-neutral-400 flex justify-between items-center">
                <span>السابق:</span>
                <span className="font-mono">
                    {metric.isCurrency ? Math.round(metric.previous).toLocaleString() :
                        metric.isPercentage ? metric.previous.toFixed(1) + '%' :
                            Math.round(metric.previous).toLocaleString()}
                </span>
            </div>
        </div>
    );
};

export default function ComparisonPage() {
    const [loading, setLoading] = useState(true);
    const [mgmtData, setMgmtData] = useState<any>(null);
    const [rangeMode, setRangeMode] = useState<'today' | 'yesterday' | 'mtd' | 'last_month'>('mtd');
    const [activeMetric, setActiveMetric] = useState<'sales' | 'visitors' | 'transactions' | 'atv' | 'conversion'>('sales');

    useEffect(() => {
        loadManagementData()
            .then(setMgmtData)
            .finally(() => setLoading(false));
    }, []);

    const dateRange = React.useMemo(() => getRange(rangeMode), [rangeMode]);

    // We pass 'activeMetric' to the hook, but 'atv' and 'conversion' are derived.
    // The hook returns ALL metrics, but the ChartData depends on the 'type' arg.
    // Valid types for the hook chart data are 'sales', 'visitors', 'transactions'.
    // If user selects 'atv' or 'conversion', we might want to stick to 'sales' or show N/A for chart, 
    // OR update hook to support them. For now, let's map atv->sales, conversion->visitors for chart trend?
    // Let's assume we mainly chart Sales/Visitors/Transactions.
    const chartType = (activeMetric === 'atv' || activeMetric === 'conversion') ? 'sales' : activeMetric;

    const { metrics, chartData } = useComparison(mgmtData, dateRange, chartType);

    if (loading) return <DashboardSkeleton />;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                        <ChartBarIcon />
                        المقارنة (LFL Comparison)
                    </h1>
                    <p className="text-neutral-500 text-sm mt-1">مقارنة الأداء مع الفترة المماثلة من العام السابق</p>
                </div>

                <div className="bg-white p-1 rounded-xl border border-neutral-200 shadow-sm flex">
                    {[
                        { id: 'today', label: 'اليوم' },
                        { id: 'yesterday', label: 'أمس' },
                        { id: 'mtd', label: 'الشهر الحالي' },
                        { id: 'last_month', label: 'الشهر الماضي' },
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => setRangeMode(mode.id as any)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${rangeMode === mode.id
                                    ? 'bg-neutral-900 text-white shadow-sm'
                                    : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                                }`}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {metrics.map((m) => (
                    <ComparisonCard
                        key={m.key}
                        metric={m}
                        isActive={activeMetric === m.key}
                        onClick={() => setActiveMetric(m.key as any)}
                    />
                ))}
            </div>

            {/* Main Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-neutral-800">
                        اتجاه النمو ({metrics.find(m => m.key === activeMetric)?.title})
                    </h3>
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                            <span className="text-neutral-600">العام الحالي</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-neutral-300"></span>
                            <span className="text-neutral-600">العام السابق</span>
                        </div>
                    </div>
                </div>

                <div className="h-[300px] w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorCurr" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9ca3af', fontSize: 12 }}
                                tickFormatter={(val) => val.split('-').slice(1).join('/')}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9ca3af', fontSize: 12 }}
                                width={40}
                                tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                itemStyle={{ color: '#1f2937' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="current"
                                stroke="#f97316"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorCurr)"
                                name="العام الحالي"
                                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="previous"
                                stroke="#d1d5db"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                fill="transparent"
                                name="العام السابق"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
