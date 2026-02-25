import { useState, useEffect, useMemo } from 'react';
import { loadManagementData } from '../services/upstreamData';
import { useComparison, ComparisonMetric } from '../hooks/useComparison';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { ChartBarIcon } from '../components/Icons';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getCurrentUser } from '../auth/storage';
import { getAvailableSeasonsList, getSeasonDateRange } from '../utils/seasons';
import * as XLSX from 'xlsx';

function isAdminOrAuditor(role?: string) { return role === 'Admin' || role === 'Auditor'; }

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

type RangeMode = 'today' | 'yesterday' | 'mtd' | 'last_month' | 'standard' | 'custom' | 'seasons';

const getRange = (mode: RangeMode, stdYear: number, stdMonth: string, customStart: string, customEnd: string, selectedSeason: string) => {
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

    if (mode === 'today') return { start: toYMD(today), end: toYMD(today) };
    if (mode === 'yesterday') return { start: toYMD(yesterday), end: toYMD(yesterday) };
    if (mode === 'mtd') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: toYMD(start), end: toYMD(yesterday) };
    }
    if (mode === 'last_month') {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: toYMD(start), end: toYMD(end) };
    }
    if (mode === 'standard') {
        const y = stdYear || today.getFullYear();
        if (stdMonth === 'all') {
            return { start: `${y}-01-01`, end: y === today.getFullYear() ? toYMD(today) : `${y}-12-31` };
        }
        const m = Math.max(1, Math.min(12, Number(stdMonth)));
        const start = new Date(y, m - 1, 1);
        let end = new Date(y, m, 0);
        if (end > today) end = new Date(today);
        return { start: toYMD(start), end: toYMD(end) };
    }
    if (mode === 'custom') {
        const start = customStart || toYMD(new Date(today.getFullYear(), today.getMonth(), 1));
        const end = customEnd || toYMD(yesterday);
        return { start, end };
    }
    if (mode === 'seasons') {
        if (selectedSeason) {
            const range = getSeasonDateRange(selectedSeason, stdYear || today.getFullYear());
            if (range) return range;
        }
        return { start: toYMD(today), end: toYMD(today) };
    }
    return { start: toYMD(today), end: toYMD(today) };
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
    const user = getCurrentUser();
    const [loading, setLoading] = useState(true);
    const [mgmtData, setMgmtData] = useState<any>(null);
    const [rangeMode, setRangeMode] = useState<RangeMode>('mtd');
    const [activeMetric, setActiveMetric] = useState<'sales' | 'visitors' | 'transactions' | 'atv' | 'conversion' | 'customer_value'>('sales');

    // New filter states
    const [manager, setManager] = useState('all');
    const [city, setCity] = useState('all');
    const [branch, setBranch] = useState('all');
    const [stdYear, setStdYear] = useState(() => new Date().getFullYear());
    const [stdMonth, setStdMonth] = useState('all');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedSeason, setSelectedSeason] = useState('');
    const availableSeasons = useMemo(() => getAvailableSeasonsList(), []);

    useEffect(() => {
        if (availableSeasons.length > 0 && !selectedSeason) {
            setSelectedSeason(availableSeasons[0].id);
        }
    }, [availableSeasons, selectedSeason]);

    useEffect(() => {
        loadManagementData()
            .then(setMgmtData)
            .finally(() => setLoading(false));
    }, []);

    const effectiveManager = useMemo(() => {
        if (isAdminOrAuditor(user?.role)) return manager;
        return user?.name || manager;
    }, [manager, user?.name, user?.role]);

    // Filter options
    const { managers, cities, branches } = useMemo(() => {
        const meta: Record<string, any> = mgmtData?.store_meta || {};
        const stores = mgmtData?.stores || {};
        const mgrs = new Set<string>();
        const cts = new Set<string>();
        Object.values(meta).forEach((m: any) => {
            if (m?.manager) mgrs.add(String(m.manager));
            if (effectiveManager === 'all' || String(m?.manager) === effectiveManager) {
                if (m?.city) cts.add(String(m.city));
            }
        });
        const brList = Object.keys(stores)
            .filter(sid => {
                const m = meta[sid];
                if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
                if (city !== 'all' && String(m?.city || '') !== city) return false;
                return true;
            })
            .map(sid => ({ id: sid, name: stores[sid] || sid }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        return {
            managers: Array.from(mgrs).sort((a, b) => a.localeCompare(b, 'ar')),
            cities: Array.from(cts).sort((a, b) => a.localeCompare(b, 'ar')),
            branches: brList
        };
    }, [mgmtData, effectiveManager, city]);

    // Build filtered data (filter management data by store filters)
    const filteredMgmt = useMemo(() => {
        if (!mgmtData) return null;
        const meta: Record<string, any> = mgmtData.store_meta || {};
        const passFilter = (sid: string) => {
            const m = meta[sid] || {};
            if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
            if (city !== 'all' && String(m?.city || '') !== city) return false;
            if (branch !== 'all' && sid !== branch) return false;
            return true;
        };
        return {
            ...mgmtData,
            sales: (mgmtData.sales || []).filter((r: any[]) => passFilter(r[1])),
            visitors: (mgmtData.visitors || []).filter((r: any[]) => passFilter(r[1])),
            transactions: (mgmtData.transactions || []).filter((r: any[]) => passFilter(r[1])),
            targets: (mgmtData.targets || []).filter((r: any[]) => passFilter(r[1])),
        };
    }, [mgmtData, effectiveManager, city, branch]);

    const dateRange = useMemo(() => getRange(rangeMode, stdYear, stdMonth, customStart, customEnd, selectedSeason), [rangeMode, stdYear, stdMonth, customStart, customEnd, selectedSeason]);

    const isHijriSeasonSelected = rangeMode === 'seasons' && selectedSeason.startsWith('hijri_');
    const chartType = (activeMetric === 'atv' || activeMetric === 'conversion' || activeMetric === 'customer_value') ? 'sales' : activeMetric;
    const { metrics, chartData } = useComparison(filteredMgmt, dateRange, chartType, { isHijriSeason: isHijriSeasonSelected });

    // Detailed Comparison Table data
    const detailedTable = useMemo(() => {
        if (!metrics.length) return [];
        // Add derived metrics: Sales per Visitor
        const salesM = metrics.find(m => m.key === 'sales');
        const visitorsM = metrics.find(m => m.key === 'visitors');
        const spv = (salesM && visitorsM && visitorsM.current > 0) ? salesM.current / visitorsM.current : 0;
        const spvPrev = (salesM && visitorsM && visitorsM.previous > 0) ? salesM.previous / visitorsM.previous : 0;

        return [
            { label: 'الزوار (Visitors)', ...visitorsM, format: 'number' },
            { label: 'معدل التحويل (Visitor Conversion Rate)', ...metrics.find(m => m.key === 'conversion'), format: 'pct' },
            { label: 'الفواتير (Transactions)', ...metrics.find(m => m.key === 'transactions'), format: 'number' },
            { label: 'قيمة العميل (Sales per Visitor)', current: spv, previous: spvPrev, growth: spvPrev > 0 ? ((spv - spvPrev) / spvPrev) * 100 : 0, format: 'sar' },
            { label: 'المبيعات (Sales)', ...salesM, format: 'sar' },
            { label: 'متوسط الفاتورة (ATV)', ...metrics.find(m => m.key === 'atv'), format: 'sar' },
        ];
    }, [metrics]);

    const formatVal = (val: number | undefined, fmt: string) => {
        const v = val || 0;
        if (fmt === 'sar') return `SAR ${Math.round(v).toLocaleString()}`;
        if (fmt === 'pct') return `${v.toFixed(2)}%`;
        return Math.round(v).toLocaleString();
    };

    const exportDetailedExcel = () => {
        const rows = detailedTable.map(r => ({
            'المؤشر': r.label,
            'الحالي': r.current || 0,
            'السابق': r.previous || 0,
            'الفرق': (r.current || 0) - (r.previous || 0),
            'التغير %': r.growth ? `${r.growth.toFixed(2)}%` : '0%',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Comparison');
        XLSX.writeFile(wb, `Comparison_${dateRange.start}_${dateRange.end}.xlsx`);
    };

    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

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
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Period Controls */}
                    <div className="space-y-3">
                        <div className="text-xs font-semibold text-neutral-500 mb-1">الفترة</div>
                        <div className="flex flex-wrap gap-1">
                            {[
                                { id: 'today', label: 'اليوم' },
                                { id: 'yesterday', label: 'أمس' },
                                { id: 'mtd', label: 'الشهر الحالي' },
                                { id: 'last_month', label: 'الشهر الماضي' },
                                { id: 'standard', label: 'شهر محدد' },
                                { id: 'custom', label: 'فترة مخصصة' },
                                { id: 'seasons', label: 'المواسم' },
                            ].map((mode) => (
                                <button
                                    key={mode.id}
                                    onClick={() => setRangeMode(mode.id as RangeMode)}
                                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${rangeMode === mode.id
                                        ? 'bg-neutral-900 text-white shadow-sm'
                                        : 'text-neutral-500 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100'
                                        }`}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                        {rangeMode === 'standard' && (
                            <div className="flex gap-2 flex-wrap">
                                <select className="input" value={stdMonth} onChange={(e) => setStdMonth(e.target.value)}>
                                    <option value="all">كامل السنة</option>
                                    {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                </select>
                                <select className="input" value={stdYear} onChange={(e) => setStdYear(Number(e.target.value))}>
                                    {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        )}
                        {rangeMode === 'custom' && (
                            <div className="flex gap-2 flex-wrap">
                                <input type="date" className="input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                                <input type="date" className="input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                            </div>
                        )}
                        {rangeMode === 'seasons' && (
                            <div className="flex gap-2 flex-wrap">
                                <select className="input" value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}>
                                    {availableSeasons.map(s => (
                                        <option key={s.id} value={s.id}>{s.icon} {s.nameAr}</option>
                                    ))}
                                </select>
                                <select className="input" value={stdYear} onChange={(e) => setStdYear(Number(e.target.value))}>
                                    {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Store Filters */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {isAdminOrAuditor(user?.role) && (
                            <div>
                                <div className="text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</div>
                                <select className="input w-full" value={manager} onChange={(e) => setManager(e.target.value)}>
                                    <option value="all">الكل</option>
                                    {managers.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        )}
                        <div>
                            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
                            <select className="input w-full" value={city} onChange={(e) => setCity(e.target.value)}>
                                <option value="all">الكل</option>
                                {cities.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-neutral-500 mb-1">المعرض</div>
                            <select className="input w-full" value={branch} onChange={(e) => setBranch(e.target.value)}>
                                <option value="all">كافة المعارض</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
                                width={50}
                                tickFormatter={(val) => {
                                    if (val >= 1000000) return `${Math.round(val / 1000000)}M`;
                                    if (val >= 1000) return `${Math.round(val / 1000)}k`;
                                    return Math.round(val).toLocaleString();
                                }}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                itemStyle={{ color: '#1f2937' }}
                                formatter={(value: any) => [Math.round(Number(value) || 0).toLocaleString(), '']}
                                labelFormatter={(label) => label}
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

            {/* Detailed Comparison Table */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg text-neutral-800">Detailed Comparison Table</h3>
                    <button
                        type="button"
                        onClick={exportDetailedExcel}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-xl text-sm transition-colors flex items-center gap-2"
                    >
                        <span>📊</span> Export to Excel
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-200 text-neutral-500 uppercase text-xs tracking-wider">
                                <th className="text-right py-3 px-4 font-medium">METRIC ▼</th>
                                <th className="text-center py-3 px-4 font-medium">CURRENT ↕</th>
                                <th className="text-center py-3 px-4 font-medium">PREVIOUS ↕</th>
                                <th className="text-center py-3 px-4 font-medium">DIFFERENCE ↕</th>
                                <th className="text-center py-3 px-4 font-medium">CHANGE % ↕</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detailedTable.map((row, i) => {
                                const curr = row.current || 0;
                                const prev = row.previous || 0;
                                const diff = curr - prev;
                                const change = row.growth || 0;
                                const isNeg = change < 0;
                                return (
                                    <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                                        <td className="py-4 px-4 font-medium text-blue-600">{row.label}</td>
                                        <td className="py-4 px-4 text-center font-medium text-neutral-800">{formatVal(curr, row.format || 'number')}</td>
                                        <td className="py-4 px-4 text-center text-neutral-500">{formatVal(prev, row.format || 'number')}</td>
                                        <td className={`py-4 px-4 text-center font-medium ${isNeg ? 'text-red-600' : 'text-green-600'}`}>
                                            {isNeg ? '' : '+'}{row.format === 'sar' ? `SAR ${Math.round(diff).toLocaleString()}` : row.format === 'pct' ? `${diff.toFixed(2)}%` : Math.round(diff).toLocaleString()}
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <span className={`inline-flex items-center gap-1 font-bold ${isNeg ? 'text-red-600' : 'text-green-600'}`}>
                                                {isNeg ? '▼' : '▲'} {Math.abs(change).toFixed(2)}%
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
