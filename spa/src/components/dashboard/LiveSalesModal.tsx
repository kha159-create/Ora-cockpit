import React, { useState, useMemo } from 'react';
import { SalesIcon, InvoicesIcon, ChevronDownIcon, VisitorsIcon } from '../Icons';
import { useLiveSalesData } from '../../hooks/useLiveSalesData';

function KPICard({ title, value, format, icon, trendValue, className }: any) {
    return (
        <div className={`bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 flex flex-col justify-between h-full ${className}`}>
            <div className="flex justify-between items-start mb-2">
                <div className="text-neutral-500 text-sm font-medium">{title}</div>
                <div className="text-orange-100 p-1.5 bg-orange-50 rounded-lg">
                    {icon}
                </div>
            </div>
            <div>
                <div className="text-2xl font-black text-neutral-900 tracking-tight">
                    {format ? format(value) : value}
                </div>
                {trendValue && (
                    <div className="text-xs font-semibold text-neutral-400 mt-1">
                        {trendValue}
                    </div>
                )}
            </div>
        </div>
    );
}

interface LiveSalesModalProps {
    isOpen: boolean;
    onClose: () => void;
    formatSAR: (val: number) => string;
}

export const LiveSalesModal: React.FC<LiveSalesModalProps> = ({
    isOpen,
    onClose,
    formatSAR,
}) => {
    const { calculateLiveData, isAdminOrAuditor: checkAdmin, raw } = useLiveSalesData();
    const [manager, setManager] = useState('all');
    const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
    const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
    const [dateMode, setDateMode] = useState<'today' | 'yesterday'>('today');
    const [showRamadanShifts, setShowRamadanShifts] = useState(false);

    const isAdminOrAuditor = checkAdmin;

    const isRamadan2026 = useMemo(() => {
        const now = new Date();
        return now.getFullYear() === 2026 && now.getMonth() === 2;
    }, []);

    // Memoize the calculated data internally
    const { liveData, managersList: managers } = React.useMemo(() => {
        const targetDateStr = dateMode === 'yesterday'
            ? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()
            : undefined;
        return calculateLiveData(manager, 'all', 'all', targetDateStr);
    }, [calculateLiveData, manager, dateMode]);

    // Calculate totals on the fly if needed, or use passed totals
    // The passed totals might not exactly match the sum of displayed stores if filtering is complex upstream
    // But we'll use passed totals for KPIs as they are usually "Global" for the view.

    // HOWEVER, LivePage logic calculated totals from the *filtered* list. 
    // Let's stick to the props provided by DashboardPage for consistency with the backend data structure,
    // BUT we need to format the UI as requested.

    // Map liveData.stores to match the structure expected by the new UI
    // The liveData.stores already has most fields. 
    // We need to ensure 'visitors' is handled (it's in the interface).

    const todayTotals = {
        sales: liveData.totals.sales,
        trans: liveData.totals.trans,
        visitors: liveData.stores.reduce((acc: number, s: any) => acc + (s.visitors || 0), 0)
    };

    // --- Ramadan Shift Totals (global + per-store) ---
    const { globalShifts, storeShifts } = useMemo(() => {
        const gs = { shift1: 0, shift2: 0, shift3: 0 };
        const ss: Record<string, { shift1: number; shift2: number; shift3: number }> = {};
        if (!isRamadan2026 || !raw?.sales_hourly) return { globalShifts: gs, storeShifts: ss };

        const targetDate = dateMode === 'yesterday'
            ? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()
            : (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

        const meta = raw.store_meta || {};
        const okStore = (sid: string) =>
            manager === 'all' || (meta[sid] && String(meta[sid].manager) === manager);

        // Shift calculations using hour (integer 0-23)
        // Shift 1 (6:00 - 11:59), Shift 2 (12:00 - 17:59), Shift 3 (18:00 - 5:59)
        (raw.sales_hourly || []).forEach(([dt, sid, h, v]: any[]) => {
            const dtStr = String(dt || '').trim();
            if (dtStr !== targetDate) return;
            if (!okStore(String(sid))) return;

            const hour = Number(h);
            const bucket = (hour >= 6 && hour <= 11) ? 'shift1'
                : (hour >= 12 && hour < 18) ? 'shift2' : 'shift3';

            gs[bucket] += v || 0;
            if (!ss[sid]) ss[sid] = { shift1: 0, shift2: 0, shift3: 0 };
            ss[sid][bucket] += v || 0;
        });

        return { globalShifts: gs, storeShifts: ss };
    }, [raw, isRamadan2026, manager, dateMode]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-neutral-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 border-b border-orange-600 p-4 shrink-0 z-10 text-white">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <span className="bg-white/20 text-white p-1.5 rounded-lg backdrop-blur-sm"><SalesIcon /></span>
                                <span>{dateMode === 'today' ? 'مبيعات اليوم' : 'مبيعات الأمس'} — لايف</span>
                            </h2>
                            <div className="flex items-center gap-3 mt-2">
                                <div className="flex bg-white/10 rounded-lg p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => { setDateMode('today'); }}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${dateMode === 'today' ? 'bg-white text-orange-600 shadow-sm' : 'text-orange-100 hover:text-white'}`}
                                    >
                                        اليوم
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setDateMode('yesterday'); }}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${dateMode === 'yesterday' ? 'bg-white text-orange-600 shadow-sm' : 'text-orange-100 hover:text-white'}`}
                                    >
                                        الأمس
                                    </button>
                                </div>

                                <p className="text-orange-100 text-xs hidden sm:block">
                                    🕒 آخر تحديث: {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl transition-colors self-start"
                            onClick={onClose}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Manager Filter */}
                    {isAdminOrAuditor && (
                        <div className="flex items-center gap-2 bg-neutral-50 p-2 rounded-xl border border-neutral-100 w-fit">
                            <span className="text-xs font-bold text-neutral-400">مدير المنطقة</span>
                            <select
                                className="bg-transparent text-neutral-900 font-bold text-sm focus:outline-none cursor-pointer"
                                value={manager}
                                onChange={(e) => setManager(e.target.value)}
                            >
                                <option value="all">الكل</option>
                                {managers.map((m: string) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* KPIs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                        <KPICard title="المبيعات" value={todayTotals.sales} format={formatSAR} icon={<SalesIcon className="text-orange-600" />} />
                        <div className="grid grid-cols-2 gap-4">
                            <KPICard
                                title="عدد الفواتير"
                                value={todayTotals.trans}
                                format={(v: number) => Math.round(v).toLocaleString()}
                                icon={<InvoicesIcon className="text-orange-600" />}
                                trendValue={todayTotals.trans > 0 ? `معدل: ${formatSAR(todayTotals.sales / todayTotals.trans)}` : undefined}
                            />
                            <KPICard
                                title="نسبة التحويل"
                                value={(todayTotals.visitors || 0) > 0 ? ((todayTotals.trans / (todayTotals.visitors || 1)) * 100) : 0}
                                format={(v: number) => `${v.toFixed(1)}%`}
                                icon={<VisitorsIcon className="text-orange-600" />}
                                trendValue={`زوار: ${(todayTotals.visitors || 0).toLocaleString()}`}
                            />
                        </div>
                    </div>

                    {/* Ramadan Toggle Button */}
                    {isRamadan2026 && (
                        <div className="flex justify-start">
                            <button
                                onClick={() => setShowRamadanShifts(!showRamadanShifts)}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border transition-all duration-300 shadow-sm ${showRamadanShifts
                                    ? 'bg-orange-500 text-white border-orange-500'
                                    : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'
                                    }`}
                            >
                                <span>🌙</span>
                                {showRamadanShifts ? 'إخفاء مبيعات الشفتات' : 'إظهار مبيعات شفتات رمضان'}
                            </button>
                        </div>
                    )}

                    {/* Ramadan Global Shift Cards */}
                    {isRamadan2026 && showRamadanShifts && (
                        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-base">🌙</span>
                                <h4 className="text-sm font-bold text-orange-700">مبيعات الشفتات — رمضان</h4>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="flex flex-col items-center bg-amber-50 rounded-xl p-3 border border-amber-100">
                                    <span className="text-lg mb-1">🌅</span>
                                    <span className="text-[11px] font-bold text-amber-700 mb-0.5">الشفت الأول</span>
                                    <span className="text-[10px] text-amber-500 mb-2">6ص – 11:30ص</span>
                                    <span className="text-sm font-black text-amber-900" dir="ltr">{formatSAR(globalShifts.shift1)}</span>
                                </div>
                                <div className="flex flex-col items-center bg-orange-50 rounded-xl p-3 border border-orange-100">
                                    <span className="text-lg mb-1">☀️</span>
                                    <span className="text-[11px] font-bold text-orange-700 mb-0.5">الشفت الثاني</span>
                                    <span className="text-[10px] text-orange-500 mb-2">11:30ص – 6م</span>
                                    <span className="text-sm font-black text-orange-900" dir="ltr">{formatSAR(globalShifts.shift2)}</span>
                                </div>
                                <div className="flex flex-col items-center bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                                    <span className="text-lg mb-1">🌙</span>
                                    <span className="text-[11px] font-bold text-indigo-700 mb-0.5">الشفت الثالث</span>
                                    <span className="text-[10px] text-indigo-500 mb-2">6م – 3ص</span>
                                    <span className="text-sm font-black text-indigo-900" dir="ltr">{formatSAR(globalShifts.shift3)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Store List */}
                    <div className="grid grid-cols-1 gap-4">
                        {liveData.stores.map((store: any) => {
                            const isExpanded = expandedStoreId === store.sid;
                            // Calculate achievement if not provided directly (fallback)
                            const dailyAchievement = store.achievement || 0; // Passed from parent logic

                            return (
                                <div
                                    key={store.sid}
                                    className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden identity-card"
                                >
                                    <button
                                        type="button"
                                        className="w-full p-4 text-right flex flex-col gap-3 hover:bg-neutral-50 transition-colors group relative"
                                        onClick={() => setExpandedStoreId(isExpanded ? null : store.sid)}
                                    >
                                        {/* Header: Name & Total Sales */}
                                        <div className="flex items-center justify-between gap-2 w-full border-b border-neutral-100 pb-2 mb-1">
                                            <div className="flex items-center gap-2">
                                                <div className={`transition-transform duration-200 text-neutral-400 ${isExpanded ? 'rotate-180 text-orange-600' : ''}`}>
                                                    <ChevronDownIcon />
                                                </div>
                                                <span className="font-bold text-lg text-neutral-900 leading-tight whitespace-normal">{store.name}</span>
                                            </div>
                                            <span className="text-xl font-black text-orange-600" dir="ltr">{formatSAR(store.sales)}</span>
                                        </div>

                                        {/* Body: 50/50 Split */}
                                        <div className="flex flex-col sm:flex-row gap-4 w-full">

                                            <div className="flex-1 flex flex-col gap-2">
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                    <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 rounded">
                                                        <span className="text-neutral-500 text-xs">زوار:</span>
                                                        <span className="font-bold text-neutral-700">{Math.round(store.visitors || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 rounded">
                                                        <span className="text-neutral-500 text-xs">تحويل:</span>
                                                        <span className="font-bold text-neutral-700">{(store.visitors || 0) > 0 ? ((store.trans / (store.visitors || 1)) * 100).toFixed(1) : 0}%</span>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 rounded">
                                                        <span className="text-neutral-500 text-xs">فواتير:</span>
                                                        <span className="font-bold text-neutral-700">{store.trans}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 rounded">
                                                        <span className="text-neutral-500 text-xs">معدل الفاتورة:</span>
                                                        <span className="font-bold text-neutral-700">{store.trans > 0 ? formatSAR(store.sales / store.trans) : '0'}</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center bg-orange-50 px-2 py-1 rounded mt-auto">
                                                    <span className="text-orange-600 text-xs font-semibold">موظفين:</span>
                                                    <span className="font-bold text-orange-700">{Object.keys(store.employees).length}</span>
                                                </div>

                                                {/* Store Ramadan Shift Row */}
                                                {isRamadan2026 && showRamadanShifts && (() => {
                                                    const sh = storeShifts[store.sid] || { shift1: 0, shift2: 0, shift3: 0 };
                                                    return (
                                                        <div className="flex gap-1.5 pt-1 border-t border-orange-100 mt-1">
                                                            <div className="flex flex-col flex-1 items-center bg-amber-50 rounded py-1 border border-amber-100">
                                                                <span className="text-[9px] text-amber-700 font-bold">ش1 🌅</span>
                                                                <span className="text-[10px] font-black text-amber-900" dir="ltr">{formatSAR(sh.shift1)}</span>
                                                            </div>
                                                            <div className="flex flex-col flex-1 items-center bg-orange-50 rounded py-1 border border-orange-100">
                                                                <span className="text-[9px] text-orange-700 font-bold">ش2 ☀️</span>
                                                                <span className="text-[10px] font-black text-orange-900" dir="ltr">{formatSAR(sh.shift2)}</span>
                                                            </div>
                                                            <div className="flex flex-col flex-1 items-center bg-indigo-50 rounded py-1 border border-indigo-100">
                                                                <span className="text-[9px] text-indigo-700 font-bold">ش3 🌙</span>
                                                                <span className="text-[10px] font-black text-indigo-900" dir="ltr">{formatSAR(sh.shift3)}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* Left Side: Targets & Progress */}
                                            <div className="flex-1 flex flex-col justify-center gap-3 border-r border-neutral-100 pr-4 mr-1">
                                                {/* Daily Target */}
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-500">الهدف اليومي <span className="text-[10px] opacity-70">({store.remainingDays} يوم متبقي)</span></span>
                                                        <span className="font-bold text-neutral-700">{Math.round(dailyAchievement)}%</span>
                                                    </div>
                                                    <div className="w-full h-[2px] bg-neutral-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full transition-all duration-500 rounded-full ${dailyAchievement >= 100 ? 'bg-green-500' : 'bg-red-500'}`}
                                                            style={{ width: `${Math.min(100, dailyAchievement)}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between text-[10px] mt-0.5 text-neutral-400">
                                                        <span>{formatSAR(store.sales)}</span>
                                                        <span>{formatSAR(store.dailyReq)}</span>
                                                    </div>
                                                </div>

                                                {/* Monthly Target */}
                                                <div className="flex justify-between items-center text-xs text-neutral-500 mt-1">
                                                    <span>الهدف الشهري: {formatSAR(store.monthTarget)}</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${store.monthSales >= store.monthTarget ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                        {store.monthTarget > 0 ? ((store.monthSales / store.monthTarget) * 100).toFixed(1) : 0}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Employees Section */}
                                    {isExpanded && store.employees.length > 0 && (
                                        <div className="border-t border-neutral-100 bg-neutral-50 divide-y divide-neutral-100 transition-all duration-300 animate-in slide-in-from-top-2">
                                            {store.employees.sort((a: any, b: any) => b.sales - a.sales).map((emp: any) => (
                                                <div key={emp.id} className="flex flex-col">
                                                    <button
                                                        onClick={() => setExpandedEmpId(expandedEmpId === emp.id ? null : emp.id)}
                                                        className="w-full flex p-3 hover:bg-white transition-colors group text-right"
                                                    >
                                                        {/* Rank Indicator */}
                                                        <div className={`absolute right-0 top-0 bottom-0 w-1 bg-orange-200 group-hover:bg-orange-400 transition-all ${expandedEmpId === emp.id ? 'bg-orange-600 w-1.5' : ''}`} />

                                                        {/* Identity & In-line Stats */}
                                                        <div className="flex-1 pr-3 flex flex-col justify-center">
                                                            <div className={`text-sm font-bold leading-tight mb-1 ${expandedEmpId === emp.id ? 'text-orange-600' : 'text-neutral-800'}`}>
                                                                {emp.name}
                                                            </div>

                                                            {/* Compact Metrics Row */}
                                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-500">
                                                                <div className="flex items-center gap-1 bg-orange-50 px-1.5 py-0.5 rounded text-orange-700 font-medium">
                                                                    <span>تارجت:</span>
                                                                    <span dir="ltr">{formatSAR(emp.dailyTarget || 0)}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="opacity-70">مساهمة:</span>
                                                                    <span className="font-bold text-neutral-700">{store.sales > 0 ? ((emp.sales / store.sales) * 100).toFixed(1) : '0'}%</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 border-r border-neutral-200 pr-2 mr-[-1px]">
                                                                    <span className="opacity-70">معدل:</span>
                                                                    <span className="font-bold text-neutral-700" dir="ltr">{formatSAR(emp.avgInv)}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Sales & Achievement */}
                                                        <div className="flex flex-col items-end gap-1 w-24 shrink-0 pl-1">
                                                            <span className="text-sm font-black text-neutral-900" dir="ltr">{formatSAR(emp.sales)}</span>
                                                            <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden flex justify-end">
                                                                <div
                                                                    className={`h-full rounded-full ${emp.achievement >= 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                                                                    style={{ width: `${Math.min(100, emp.achievement)}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] text-neutral-400 font-medium">{Math.round(emp.achievement)}%</span>
                                                        </div>
                                                    </button>

                                                    {expandedEmpId === emp.id && (
                                                        <div className="bg-white p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200 border-t border-dashed border-neutral-100">
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                                                                    <div className="text-[10px] font-black text-neutral-400 uppercase tracking-tight mb-1">Contribution / المساهمة</div>
                                                                    <div className="flex items-baseline gap-2">
                                                                        <span className="text-base font-black text-neutral-900">{store.sales > 0 ? ((emp.sales / store.sales) * 100).toFixed(1) : 0}%</span>
                                                                        <span className="text-[10px] text-neutral-500">({formatSAR(emp.sales)} من {formatSAR(store.sales)})</span>
                                                                    </div>
                                                                </div>
                                                                <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                                                                    <div className="text-[10px] font-black text-neutral-400 uppercase tracking-tight mb-1">Bills & Avg / فواتير ومعدل</div>
                                                                    <div className="flex items-baseline gap-2">
                                                                        <span className="text-base font-black text-neutral-900">{Math.round(emp.trans)}</span>
                                                                        <span className="text-[10px] text-neutral-500">({formatSAR(emp.avgInv)} / فاتورة)</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div >
        </div >
    );
};
