import { useState, useEffect, useMemo } from 'react';
import { loadManagementData } from '../services/upstreamData';
import { useComparison, ComparisonMetric } from '../hooks/useComparison';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { ChartBarIcon } from '../components/Icons';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getCurrentUser } from '../auth/storage';
import { getAvailableSeasonsList, getSeasonDateRange, formatHijriDate } from '../utils/seasons';
import * as XLSX from 'xlsx';
import CustomerValueSimulationPage from './CustomerValueSimulationPage';
import { DrillDownModal } from '../components/dashboard/DrillDownModal';
import { mtdRangeThroughYesterday } from '../utils/mtdDateRange';

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
        const r = mtdRangeThroughYesterday(today);
        return { start: r.start, end: r.end };
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
            const targetYear = stdYear && stdYear > 2000 ? stdYear : today.getFullYear();
            const range = getSeasonDateRange(selectedSeason, targetYear);
            if (range) {
                const yesterdayStr = toYMD(yesterday);
                // Cap to 'yesterday' if the season is currently ongoing or in the future
                if (range.start <= yesterdayStr && range.end > yesterdayStr) {
                    range.end = yesterdayStr;
                }
                // Also cap if the season hasn't started yet (prevent future dates)
                // Although rare, if the whole season is in the future, set both to yesterday
                if (range.start > yesterdayStr) {
                    range.start = yesterdayStr;
                    range.end = yesterdayStr;
                }
                return range;
            }
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
    const [drillDownDate, setDrillDownDate] = useState<string | null>(null);
    const [customerValueOpen, setCustomerValueOpen] = useState(false);

    // New filter states
    const [manager, setManager] = useState('all');
    const [city, setCity] = useState('all');
    const [storeType, setStoreType] = useState('all');
    const [branch, setBranch] = useState(user?.storeId || 'all');
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
                if (user?.role === 'BranchManager' && sid !== user?.storeId) return false;
                if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
                if (city !== 'all' && String(m?.city || '') !== city) return false;
                if (storeType !== 'all') {
                    const type = String(m?.type || '').toLowerCase();
                    const isOnline = type === 'online' || type === 'platform' || type === 'warehouse';
                    if (storeType === 'online' && !isOnline) return false;
                    if (storeType === 'store' && isOnline) return false;
                }
                return true;
            })
            .map(sid => ({ id: sid, name: stores[sid] || sid }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        return {
            managers: Array.from(mgrs).sort((a, b) => a.localeCompare(b, 'ar')),
            cities: Array.from(cts).sort((a, b) => a.localeCompare(b, 'ar')),
            branches: brList
        };
    }, [mgmtData, effectiveManager, city, storeType]);

    // Build filtered data (filter management data by store filters)
    const filteredMgmt = useMemo(() => {
        if (!mgmtData) return null;
        const meta: Record<string, any> = mgmtData.store_meta || {};
        const passFilter = (sid: string) => {
            const m = meta[sid] || {};
            if (user?.role === 'BranchManager' && sid !== user?.storeId) return false;
            if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
            if (city !== 'all' && String(m?.city || '') !== city) return false;
            if (storeType !== 'all') {
                const type = String(m?.type || '').toLowerCase();
                const isOnline = type === 'online' || type === 'platform' || type === 'warehouse';
                if (storeType === 'online' && !isOnline) return false;
                if (storeType === 'store' && isOnline) return false;
            }
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
    }, [mgmtData, effectiveManager, city, storeType, branch]);

    const dateRange = useMemo(() => getRange(rangeMode, stdYear, stdMonth, customStart, customEnd, selectedSeason), [rangeMode, stdYear, stdMonth, customStart, customEnd, selectedSeason]);

    const isHijriSeasonSelected = rangeMode === 'seasons' && selectedSeason.startsWith('hijri_');
    const isGregorianSeasonSelected = rangeMode === 'seasons' && !selectedSeason.startsWith('hijri_');
    const chartType = (activeMetric === 'atv' || activeMetric === 'conversion' || activeMetric === 'customer_value') ? 'sales' : activeMetric;
    const { metrics, chartData, prevDateRange } = useComparison(filteredMgmt, dateRange, chartType, {
        isHijriSeason: isHijriSeasonSelected,
        forceGregorian: isGregorianSeasonSelected
    });

    // Detailed Comparison Table data
    const detailedTable = useMemo(() => {
        if (!metrics.length) return [];
        // Extract specific metrics
        const getMetric = (key: string) => metrics.find(m => m.key === key) || { current: 0, previous: 0, growth: 0 };

        const salesM = getMetric('sales');
        const visitorsM = getMetric('visitors');
        const atvM = getMetric('atv');
        const transM = getMetric('transactions');
        const convM = getMetric('conversion');

        // Customer Value: Sales / Visitors
        const spv = (salesM.current > 0 && visitorsM.current > 0) ? salesM.current / visitorsM.current : 0;
        const spvPrev = (salesM.previous > 0 && visitorsM.previous > 0) ? salesM.previous / visitorsM.previous : 0;
        const spvGrowth = spvPrev > 0 ? ((spv - spvPrev) / spvPrev) * 100 : 0;

        return [
            { label: 'المبيعات (Sales)', ...salesM, format: 'sar' },
            { label: 'الزوار (Visitors)', ...visitorsM, format: 'number' },
            { label: 'قيمة العميل (Sales per Visitor)', current: spv, previous: spvPrev, growth: spvGrowth, format: 'sar' },
            { label: 'الاستحواذ (Acquisition / Conversion)', ...convM, format: 'pct' },
            { label: 'متوسط الفاتورة (Average Ticket)', ...atvM, format: 'sar' },
            { label: 'الفواتير (Transactions)', ...transM, format: 'number' },
        ];
    }, [metrics]);

    const formatVal = (val: number | undefined, fmt: string) => {
        const v = val || 0;
        if (fmt === 'sar') return `SAR ${Math.round(v).toLocaleString()}`;
        if (fmt === 'pct') return `${Math.round(v)}%`;
        return Math.round(v).toLocaleString();
    };

    const exportDetailedExcel = () => {
        const activeManagerName = effectiveManager !== 'all' ? effectiveManager : 'كافة المدراء';
        const activeBranchName = branch !== 'all' ?
            (branches.find(b => b.id === branch)?.name || branch) :
            (effectiveManager !== 'all' ? 'كافة المعارض التابعة للمدير' : 'كافة المعارض');

        let periodDisplay = '';
        if (rangeMode === 'seasons') {
            periodDisplay = `${availableSeasons.find(s => s.id === selectedSeason)?.nameAr || selectedSeason} ${stdYear}`;
        } else {
            periodDisplay = `${dateRange.start} إلى ${dateRange.end}`;
        }

        const rows: any[] = [
            { 'A': 'تقرير تفاصيل المقارنة' },
            { 'A': `التاريخ/الفترة: ${periodDisplay}` },
            { 'A': `مدير المنطقة: ${activeManagerName}` },
            { 'A': `المعرض: ${activeBranchName}` },
            {} // Spacing
        ];

        // Helper to calculate metrics for a specific subset of stores
        const calcSubsetMetrics = (storeIds: string[]) => {
            const sumRows = (data: any[], startStr: string, endStr: string) => {
                return (data || []).reduce((acc, row) => {
                    const sid = String(row[1]);
                    if (storeIds.includes(sid)) {
                        const d = String(row[0]).substring(0, 10);
                        if (d >= startStr && d <= endStr) return acc + (Number(row[2]) || 0);
                    }
                    return acc;
                }, 0);
            };

            const sCurr = sumRows(filteredMgmt?.sales, dateRange.start, dateRange.end);
            const sPrev = sumRows(filteredMgmt?.sales, prevDateRange?.start || '', prevDateRange?.end || '');

            const vCurr = sumRows(filteredMgmt?.visitors, dateRange.start, dateRange.end);
            const vPrev = sumRows(filteredMgmt?.visitors, prevDateRange?.start || '', prevDateRange?.end || '');

            const tCurr = sumRows(filteredMgmt?.transactions, dateRange.start, dateRange.end);
            const tPrev = sumRows(filteredMgmt?.transactions, prevDateRange?.start || '', prevDateRange?.end || '');

            const atvCurr = tCurr > 0 ? sCurr / tCurr : 0;
            const atvPrev = tPrev > 0 ? sPrev / tPrev : 0;

            const convCurr = vCurr > 0 ? (tCurr / vCurr) * 100 : 0;
            const convPrev = vPrev > 0 ? (tPrev / vPrev) * 100 : 0;

            const spvCurr = vCurr > 0 ? sCurr / vCurr : 0;
            const spvPrev = vPrev > 0 ? sPrev / vPrev : 0;

            const growth = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : 0;

            return [
                { label: 'المبيعات (Sales)', current: sCurr, previous: sPrev, diff: sCurr - sPrev, growth: growth(sCurr, sPrev) },
                { label: 'الزوار (Visitors)', current: vCurr, previous: vPrev, diff: vCurr - vPrev, growth: growth(vCurr, vPrev) },
                { label: 'قيمة العميل (Sales per Visitor)', current: spvCurr, previous: spvPrev, diff: spvCurr - spvPrev, growth: growth(spvCurr, spvPrev) },
                { label: 'الاستحواذ (Acquisition / Conversion)', current: convCurr, previous: convPrev, diff: convCurr - convPrev, growth: growth(convCurr, convPrev) },
                { label: 'متوسط الفاتورة (Average Ticket)', current: atvCurr, previous: atvPrev, diff: atvCurr - atvPrev, growth: growth(atvCurr, atvPrev) },
                { label: 'الفواتير (Transactions)', current: tCurr, previous: tPrev, diff: tCurr - tPrev, growth: growth(tCurr, tPrev) },
            ];
        };

        const generateSection = (title: string, storeIds: string[]) => {
            rows.push({ 'A': `--- ${title} ---` });
            rows.push({ 'A': 'المؤشر', 'B': 'الحالي', 'C': 'السابق', 'D': 'الفرق', 'E': 'التغير %' });
            const metricsGroup = calcSubsetMetrics(storeIds);
            metricsGroup.forEach(r => {
                rows.push({
                    'A': r.label,
                    'B': Math.round(r.current).toLocaleString(),
                    'C': Math.round(r.previous).toLocaleString(),
                    'D': Math.round(r.diff).toLocaleString(),
                    'E': `${Math.round(r.growth)}%`
                });
            });
            rows.push({}); // Spacing after section
        };

        const meta = filteredMgmt?.store_meta || {};

        if (effectiveManager === 'all') {
            // Group by Manager
            managers.forEach(mgr => {
                const mgrStores = Object.keys(meta).filter(sid => String(meta[sid].manager) === mgr);
                if (mgrStores.length > 0) {
                    generateSection(`مدير المنطقة: ${mgr}`, mgrStores);
                }
            });
        } else if (effectiveManager !== 'all' && branch === 'all') {
            // Group by Branch under the Manager
            branches.forEach(br => {
                generateSection(`المعرض: ${br.name}`, [br.id]);
            });
        } else {
            // Specific branch selected
            const brName = branches.find(b => b.id === branch)?.name || branch;
            generateSection(`المعرض: ${brName}`, [branch]);
        }

        const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: true });

        // Add custom widths
        ws['!cols'] = [
            { wch: 40 }, // Metric
            { wch: 20 }, // Current
            { wch: 20 }, // Previous
            { wch: 20 }, // Difference
            { wch: 20 }  // Change %
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Detailed Comparison');
        XLSX.writeFile(wb, `Comparison_Export_${toYMD(new Date())}.xlsx`);
    };

    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    if (loading) return <DashboardSkeleton />;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <DrillDownModal
                isOpen={!!drillDownDate}
                onClose={() => setDrillDownDate(null)}
                dateStr={drillDownDate}
                raw={mgmtData}
                allowedStoreIds={new Set(branches.map(b => b.id))}
                formatSAR={(val) => `SAR ${Math.round(val).toLocaleString()}`}
            />
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                        <ChartBarIcon />
                        المقارنة وق.ع
                    </h1>
                    <p className="text-neutral-500 text-sm mt-1">مقارنة الأداء مع الفترة المماثلة من العام السابق</p>
                <button
                    type="button"
                    onClick={() => setCustomerValueOpen(true)}
                    className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-orange-200 transition hover:bg-orange-600"
                >
                    قيمة العميل والمحاكاة
                </button>
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
                        <div className="text-xs text-neutral-500 mt-2 bg-neutral-50 p-2 rounded-lg border border-neutral-100 flex flex-col gap-1">
                            <div>
                                <strong>الفترة الحالية (ميلادي):</strong> {dateRange.start} إلى {dateRange.end}
                                {' | '}
                                <strong>(هجري):</strong> {formatHijriDate(dateRange.start)} إلى {formatHijriDate(dateRange.end)}
                            </div>
                            <div>
                                <strong>فترة المقارنة (ميلادي):</strong> {prevDateRange?.start || ''} إلى {prevDateRange?.end || ''}
                                {' | '}
                                <strong>(هجري):</strong> {formatHijriDate(prevDateRange?.start || '')} إلى {formatHijriDate(prevDateRange?.end || '')}
                            </div>
                            {isHijriSeasonSelected && (
                                <div className="text-primary-600 font-medium">✨ يتم استخدام المقارنة الهجرية لهذا الموسم</div>
                            )}
                        </div>
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
                        <div className={`${user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}`}>
                            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
                            <select className="input w-full" value={city} onChange={(e) => setCity(e.target.value)}>
                                <option value="all">الكل</option>
                                {cities.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-neutral-500 mb-1">نوع المعرض</div>
                            <select className="input w-full" value={storeType} onChange={(e) => setStoreType(e.target.value)}>
                                <option value="all">الكل</option>
                                <option value="store">المعارض فقط</option>
                                <option value="online">الأونلاين فقط</option>
                            </select>
                        </div>
                        <div className={`${user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}`}>
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
                        <AreaChart onClick={(e: any) => e?.activePayload?.[0]?.payload?.date && setDrillDownDate(e.activePayload[0].payload.date)} data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} style={{ cursor: 'pointer' }}>
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
                <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                    <div className="flex-1">
                        <h3 className="font-bold text-lg text-neutral-800">تفاصيل المقارنة (Detailed Comparison)</h3>
                    </div>
                    {/* Centered Orange Filters */}
                    <div className="flex-1 flex justify-center text-sm text-orange-600 font-bold gap-4 bg-orange-50 px-4 py-2 rounded-xl border border-orange-100">
                        {effectiveManager !== 'all' && <span>مدير المنطقة: {effectiveManager}</span>}
                        {branch !== 'all' ? (
                            <span>المعرض: {branches.find(b => b.id === branch)?.name || branch}</span>
                        ) : (
                            effectiveManager !== 'all' && <span>كافة الفروع التابعة للمدير</span>
                        )}
                    </div>
                    <div className="flex-1 flex justify-end">
                        <button
                            type="button"
                            onClick={exportDetailedExcel}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-xl text-sm transition-colors flex items-center gap-2 shadow-sm"
                        >
                            <span>📊</span> تصدير تفاصيل المقارنة
                        </button>
                    </div>
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
                                const curr = Math.round(row.current || 0);
                                const prev = Math.round(row.previous || 0);
                                const diff = curr - prev;
                                const change = Math.round(row.growth || 0);
                                const isNeg = change < 0;
                                return (
                                    <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                                        <td className="py-4 px-4 font-medium text-blue-600">{row.label}</td>
                                        <td className="py-4 px-4 text-center font-medium text-neutral-800">{formatVal(curr, row.format || 'number')}</td>
                                        <td className="py-4 px-4 text-center text-neutral-500">{formatVal(prev, row.format || 'number')}</td>
                                        <td className={`py-4 px-4 text-center font-medium ${isNeg ? 'text-red-600' : 'text-green-600'}`}>
                                            {isNeg ? '' : '+'}{row.format === 'sar' ? `SAR ${Math.round(diff).toLocaleString()}` : row.format === 'pct' ? `${Math.round(diff)}%` : Math.round(diff).toLocaleString()}
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <span className={`inline-flex items-center gap-1 font-bold ${isNeg ? 'text-red-600' : 'text-green-600'}`}>
                                                {isNeg ? '▼' : '▲'} {Math.abs(change)}%
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            {customerValueOpen && (
                <div className="fixed inset-0 z-[120] bg-black/60 p-3 sm:p-5" onClick={() => setCustomerValueOpen(false)}>
                    <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-neutral-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
                            <div className="font-black text-neutral-900">ق.ع والمحاكاة</div>
                            <button type="button" className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-bold hover:bg-neutral-50" onClick={() => setCustomerValueOpen(false)}>إغلاق</button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            <CustomerValueSimulationPage />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
