import React, { useState, useMemo, useRef } from 'react';
import { toPng } from 'html-to-image';
import { SalesIcon, InvoicesIcon, ChevronDownIcon, VisitorsIcon } from '../Icons';
import { useLiveSalesData } from '../../hooks/useLiveSalesData';
import { loadD365SalesRange } from '../../services/d365Live';
import { getCurrentUser } from '../../auth/storage';

const waitForCardRender = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

function sanitizeFilePart(value: string) {
    return String(value || 'store')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90) || 'store';
}

function dataUrlToBlob(dataUrl: string) {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
}

function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function KPICard({ title, value, format, icon, trendValue, className, onClick }: any) {
    return (
        <div
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={
                onClick
                    ? (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onClick();
                        }
                    }
                    : undefined
            }
            className={`bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 flex flex-col justify-between h-full ${onClick ? 'cursor-pointer hover:border-orange-300 hover:shadow-md transition-all' : ''} ${className || ''}`}
        >
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
    const { calculateLiveData, isAdminOrAuditor: checkAdmin, raw, refresh } = useLiveSalesData();
    const [manager, setManager] = useState('all');
    const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
    const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
    const [dateMode, setDateMode] = useState<'today' | 'yesterday'>('today');
    const [showRamadanShifts, setShowRamadanShifts] = useState(false);
    const [d365Daily, setD365Daily] = useState<{
        salesByStore: Record<string, number>;
        transByStore: Record<string, number>;
        salesHourlyRows: any[];
    } | null>(null);
    const [liveRefreshing, setLiveRefreshing] = useState(false);
    const [liveRefreshTick, setLiveRefreshTick] = useState(0);
    const [visitorsHourlyOpen, setVisitorsHourlyOpen] = useState(false);
    const [visitorsHourlyContext, setVisitorsHourlyContext] = useState<{ sid: string; name: string } | null>(null);
    const [captureBusy, setCaptureBusy] = useState<string | null>(null);
    const storeCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const isAdminOrAuditor = checkAdmin;

    const targetDateStr = React.useMemo(() => {
        if (dateMode === 'yesterday') {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, [dateMode]);

    React.useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        // لا نستخدم D365 ليوم الأمس حتى لا نكرر التحميل؛ نعتمد فقط على البيانات المحفوظة.
        if (dateMode === 'yesterday') {
            setD365Daily(null);
            setLiveRefreshing(false);
            return;
        }

        const prevDateStr = (() => {
            const d = new Date(`${targetDateStr}T12:00:00`);
            d.setDate(d.getDate() - 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();

        const fetchLiveData = () => {
            setLiveRefreshing(true);
            loadD365SalesRange(prevDateStr, targetDateStr)
                .then((payload) => {
                    if (cancelled) return;
                    const salesByStore: Record<string, number> = {};
                    const transByStore: Record<string, number> = {};
                    (payload.sales || []).forEach((r: any[]) => {
                        const dt = String(r[0] || '').substring(0, 10);
                        const sid = String(r[1] || '');
                        if (!sid || dt !== targetDateStr) return;
                        salesByStore[sid] = (salesByStore[sid] || 0) + (Number(r[2]) || 0);
                    });
                    (payload.transactions || []).forEach((r: any[]) => {
                        const dt = String(r[0] || '').substring(0, 10);
                        const sid = String(r[1] || '');
                        if (!sid || dt !== targetDateStr) return;
                        transByStore[sid] = (transByStore[sid] || 0) + (Number(r[2]) || 0);
                    });
                    setD365Daily({ salesByStore, transByStore, salesHourlyRows: payload.sales_hourly || [] });
                })
                .catch(() => {
                    if (!cancelled) setD365Daily(null);
                })
                .finally(() => {
                    if (!cancelled) setLiveRefreshing(false);
                });
        };

        fetchLiveData();
        const timer = window.setInterval(fetchLiveData, 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [isOpen, targetDateStr, liveRefreshTick, dateMode]);

    // Memoize the calculated data internally
    const { liveData, managersList: managers } = React.useMemo(() => {
        return calculateLiveData(manager, 'all', 'all', targetDateStr);
    }, [calculateLiveData, manager, targetDateStr]);

    // Calculate totals on the fly if needed, or use passed totals
    // The passed totals might not exactly match the sum of displayed stores if filtering is complex upstream
    // But we'll use passed totals for KPIs as they are usually "Global" for the view.

    // HOWEVER, LivePage logic calculated totals from the *filtered* list. 
    // Let's stick to the props provided by DashboardPage for consistency with the backend data structure,
    // BUT we need to format the UI as requested.

    // Map liveData.stores to match the structure expected by the new UI
    // The liveData.stores already has most fields. 
    // We need to ensure 'visitors' is handled (it's in the interface).

    // عندما لا تُحدَّث مبيعات اليوم في JSON بعد، liveData.stores تكون فارغة رغم نجاح D365.
    // ندمج صفوف D365 حتى تظهر المبيعات كما في صفحة الساعة.
    const enhancedStores = useMemo(() => {
        const storesMap = raw?.stores || {};
        const meta = raw?.store_meta || {};
        const user = getCurrentUser();
        const effectiveManager = isAdminOrAuditor ? manager : (user?.name || manager);

        const passesStoreFilter = (sid: string) => {
            const m = meta[sid];
            if (effectiveManager !== 'all') {
                if (!m || String(m?.manager || '') !== effectiveManager) return false;
            }
            return true;
        };

        const baseList = liveData.stores || [];
        const bySid = new Map<string, any>();
        baseList.forEach((s: any) => bySid.set(String(s.sid), { ...s }));

        if (!d365Daily) {
            return baseList;
        }

        const mergeD365Row = (sid: string) => {
            sid = String(sid);
            if (!passesStoreFilter(sid)) return;
            const hasSales = Object.prototype.hasOwnProperty.call(d365Daily.salesByStore, sid);
            const hasTrans = Object.prototype.hasOwnProperty.call(d365Daily.transByStore, sid);
            const sales = hasSales ? Number(d365Daily.salesByStore[sid]) : undefined;
            const trans = hasTrans ? Number(d365Daily.transByStore[sid]) : undefined;
            const existing = bySid.get(sid);
            if (existing) {
                bySid.set(sid, {
                    ...existing,
                    ...(sales !== undefined ? { sales } : {}),
                    ...(trans !== undefined ? { trans } : {}),
                });
            } else {
                const sVal = sales ?? 0;
                const tVal = trans ?? 0;
                if (sVal > 0 || tVal > 0) {
                    bySid.set(sid, {
                        sid,
                        name: storesMap[sid] || sid,
                        sales: sVal,
                        trans: tVal,
                        visitors: 0,
                        target: 0,
                        monthSales: 0,
                        monthTarget: 0,
                        dailyReq: 0,
                        remainingDays: baseList[0]?.remainingDays ?? 0,
                        achievement: 0,
                        employees: [],
                    });
                }
            }
        };

        Object.keys(d365Daily.salesByStore || {}).forEach(mergeD365Row);
        Object.keys(d365Daily.transByStore || {}).forEach(mergeD365Row);

        return Array.from(bySid.values()).sort((a, b) => (b.sales || 0) - (a.sales || 0));
    }, [liveData.stores, d365Daily, raw, manager, isAdminOrAuditor]);

    const todayTotals = useMemo(() => ({
        sales: enhancedStores.reduce((acc: number, s: any) => acc + (s.sales || 0), 0),
        trans: enhancedStores.reduce((acc: number, s: any) => acc + (s.trans || 0), 0),
        visitors: enhancedStores.reduce((acc: number, s: any) => acc + (s.visitors || 0), 0),
    }), [enhancedStores]);

    /** زوار حسب الساعة لفرع واحد (عند الضغط على عدد الزوار في بطاقة الفرع) */
    const visitorsByHourForStore = useMemo(() => {
        const sidFilter = visitorsHourlyContext?.sid;
        if (!sidFilter) return [];
        const rows = raw?.visitors_hourly || [];
        const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
        (rows as any[]).forEach((r: any[]) => {
            const dt = String(r[0] || '').trim().substring(0, 10);
            if (dt !== targetDateStr) return;
            if (String(r[1] || '') !== String(sidFilter)) return;
            const h = Number(r[2]);
            if (!Number.isInteger(h) || h < 0 || h > 23) return;
            hours[h].count += Number(r[3]) || 0;
        });
        return hours;
    }, [raw, targetDateStr, visitorsHourlyContext?.sid]);

    // --- Normal Shift Totals (global + per-store) ---
    // ش1: 09:30 - 15:30
    // ش2: 15:30 - 24:00
    const { globalShifts, storeShifts } = useMemo(() => {
        const makeShift = () => ({ sales: 0, trans: 0, visitors: 0 });
        const gs = { shift1: makeShift(), shift2: makeShift() };
        const ss: Record<string, { shift1: { sales: number; trans: number; visitors: number }; shift2: { sales: number; trans: number; visitors: number } }> = {};
        const salesHourlyRows = d365Daily?.salesHourlyRows || raw?.sales_hourly || [];
        const visitorsHourlyRows = raw?.visitors_hourly || [];
        if (!salesHourlyRows.length && !visitorsHourlyRows.length) return { globalShifts: gs, storeShifts: ss };

        // Target Date
        const targetDateObj = dateMode === 'yesterday'
            ? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })()
            : new Date();

        const targetDate = `${targetDateObj.getFullYear()}-${String(targetDateObj.getMonth() + 1).padStart(2, '0')}-${String(targetDateObj.getDate()).padStart(2, '0')}`;

        const meta = raw.store_meta || {};
        const okStore = (sid: string) =>
            manager === 'all' || (meta[sid] && String(meta[sid].manager) === manager);

        const useD365 = !!d365Daily?.salesHourlyRows?.length;
        const D365_HOUR_BACK = 5;
        const allocByHour = (hour: number) => {
            // Half-hour boundaries:
            // 09:00-10:00 => half to shift1 (09:30-10:00)
            // 15:00-16:00 => half to shift1 (15:00-15:30), half to shift2 (15:30-16:00)
            if (hour < 9 || hour >= 24) return { shift1: 0, shift2: 0 };
            if (hour === 9) return { shift1: 0.5, shift2: 0 };
            if (hour >= 10 && hour <= 14) return { shift1: 1, shift2: 0 };
            if (hour === 15) return { shift1: 0.5, shift2: 0.5 };
            return { shift1: 0, shift2: 1 };
        };

        const ensureStore = (sid: string) => {
            if (!ss[sid]) ss[sid] = { shift1: makeShift(), shift2: makeShift() };
        };

        salesHourlyRows.forEach(([dt, sid, h, v, t]: any[]) => {
            const dtStr = String(dt || '').trim();
            if (!okStore(String(sid))) return;

            let sourceHour = Number(h);
            if (!Number.isInteger(sourceHour) || sourceHour < 0 || sourceHour > 23) return;
            if (useD365) sourceHour = (sourceHour - D365_HOUR_BACK + 24) % 24;
            const salesVal = Number(v) || 0;
            const transVal = Number(t) || 0;

            if (dtStr !== targetDate) return;
            ensureStore(String(sid));
            const alloc = allocByHour(sourceHour);

            gs.shift1.sales += salesVal * alloc.shift1;
            gs.shift1.trans += transVal * alloc.shift1;
            gs.shift2.sales += salesVal * alloc.shift2;
            gs.shift2.trans += transVal * alloc.shift2;

            ss[sid].shift1.sales += salesVal * alloc.shift1;
            ss[sid].shift1.trans += transVal * alloc.shift1;
            ss[sid].shift2.sales += salesVal * alloc.shift2;
            ss[sid].shift2.trans += transVal * alloc.shift2;
        });

        visitorsHourlyRows.forEach(([dt, sid, h, v]: any[]) => {
            const dtStr = String(dt || '').trim();
            if (dtStr !== targetDate) return;
            if (!okStore(String(sid))) return;
            const sourceHour = Number(h);
            if (!Number.isInteger(sourceHour) || sourceHour < 0 || sourceHour > 23) return;
            const visitorsVal = Number(v) || 0;
            ensureStore(String(sid));
            const alloc = allocByHour(sourceHour);

            gs.shift1.visitors += visitorsVal * alloc.shift1;
            gs.shift2.visitors += visitorsVal * alloc.shift2;
            ss[sid].shift1.visitors += visitorsVal * alloc.shift1;
            ss[sid].shift2.visitors += visitorsVal * alloc.shift2;
        });

        return { globalShifts: gs, storeShifts: ss };
    }, [raw, manager, dateMode, d365Daily]);

    React.useEffect(() => {
        if (!isOpen) {
            setVisitorsHourlyOpen(false);
            setVisitorsHourlyContext(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const hourlyRows = visitorsByHourForStore.filter((h) => h.count > 0);
    const captureStoreImage = async (store: any) => {
        const sid = String(store.sid);
        const wasExpanded = expandedStoreId;
        setExpandedEmpId(null);
        setExpandedStoreId(sid);
        try {
            await waitForCardRender();

            const node = storeCardRefs.current[sid];
            if (!node) throw new Error('Store card is not ready for export');

            return await toPng(node, {
                cacheBust: true,
                pixelRatio: Math.min(3, window.devicePixelRatio || 2),
                backgroundColor: '#ffffff',
                filter: (domNode) => {
                    if (!(domNode instanceof HTMLElement)) return true;
                    return domNode.dataset.exportHidden !== 'true';
                },
                style: {
                    margin: '0',
                    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.10)',
                },
            });
        } finally {
            if (wasExpanded !== sid) setExpandedStoreId(wasExpanded);
        }
    };

    const handleDownloadStoreImage = async (store: any) => {
        try {
            setCaptureBusy(String(store.sid));
            const dataUrl = await captureStoreImage(store);
            downloadBlob(dataUrlToBlob(dataUrl), `${sanitizeFilePart(store.name)}-${targetDateStr}.png`);
        } finally {
            setCaptureBusy(null);
        }
    };

    return (
        <>
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
                                <button
                                    type="button"
                                    onClick={() => { setLiveRefreshTick((v) => v + 1); refresh(); }}
                                    className="px-3 py-1 text-xs font-bold rounded-md bg-white/15 hover:bg-white/25 text-white transition-colors"
                                    disabled={liveRefreshing}
                                >
                                    {liveRefreshing ? '...جاري التحديث' : 'تحديث مباشر'}
                                </button>

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

                    {/* Shift Toggle Button */}
                    <div className="flex flex-wrap justify-start gap-2">
                        <button
                            onClick={() => setShowRamadanShifts(!showRamadanShifts)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border transition-all duration-300 shadow-sm ${showRamadanShifts
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'
                                }`}
                        >
                            <span>🕒</span>
                            {showRamadanShifts ? 'إخفاء مبيعات الشفتات' : 'إظهار مبيعات الشفتات'}
                        </button>
                    </div>

                    {/* Global Shift Cards */}
                    {showRamadanShifts && (
                        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-base">🕒</span>
                                <h4 className="text-sm font-bold text-orange-700">مبيعات الشفتات — الدوام الطبيعي</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="flex flex-col items-center bg-amber-50 rounded-xl p-3 border border-amber-100">
                                    <span className="text-lg mb-1">🌅</span>
                                    <span className="text-[11px] font-bold text-amber-700 mb-0.5">الشفت الأول</span>
                                    <span className="text-[10px] text-amber-500 mb-2">9:30ص – 3:30م</span>
                                    <span className="text-sm font-black text-amber-900" dir="ltr">{formatSAR(globalShifts.shift1.sales)}</span>
                                    <span className="text-[10px] text-amber-700 mt-1">زوار: {Math.round(globalShifts.shift1.visitors).toLocaleString()}</span>
                                    <span className="text-[10px] text-amber-700">ATV: {globalShifts.shift1.trans > 0 ? formatSAR(globalShifts.shift1.sales / globalShifts.shift1.trans) : formatSAR(0)}</span>
                                    <span className="text-[10px] text-amber-700">استحواذ: {globalShifts.shift1.visitors > 0 ? ((globalShifts.shift1.trans / globalShifts.shift1.visitors) * 100).toFixed(1) : '0.0'}%</span>
                                </div>
                                <div className="flex flex-col items-center bg-orange-50 rounded-xl p-3 border border-orange-100">
                                    <span className="text-lg mb-1">☀️</span>
                                    <span className="text-[11px] font-bold text-orange-700 mb-0.5">الشفت الثاني</span>
                                    <span className="text-[10px] text-orange-500 mb-2">3:30م – 12ص</span>
                                    <span className="text-sm font-black text-orange-900" dir="ltr">{formatSAR(globalShifts.shift2.sales)}</span>
                                    <span className="text-[10px] text-orange-700 mt-1">زوار: {Math.round(globalShifts.shift2.visitors).toLocaleString()}</span>
                                    <span className="text-[10px] text-orange-700">ATV: {globalShifts.shift2.trans > 0 ? formatSAR(globalShifts.shift2.sales / globalShifts.shift2.trans) : formatSAR(0)}</span>
                                    <span className="text-[10px] text-orange-700">استحواذ: {globalShifts.shift2.visitors > 0 ? ((globalShifts.shift2.trans / globalShifts.shift2.visitors) * 100).toFixed(1) : '0.0'}%</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Store List */}
                    <div className="grid grid-cols-1 gap-4">
                        {enhancedStores.map((store: any) => {
                            const isExpanded = expandedStoreId === store.sid;
                            // Calculate achievement if not provided directly (fallback)
                            const dailyAchievement = store.achievement || 0; // Passed from parent logic

                            return (
                                <div
                                    key={store.sid}
                                    ref={(node) => {
                                        storeCardRefs.current[String(store.sid)] = node;
                                    }}
                                    className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden identity-card"
                                >
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className="w-full p-4 text-right flex flex-col gap-3 hover:bg-neutral-50 transition-colors group relative cursor-pointer"
                                        onClick={() => setExpandedStoreId(isExpanded ? null : store.sid)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setExpandedStoreId(isExpanded ? null : store.sid);
                                            }
                                        }}
                                    >
                                        {/* Header: Name & Total Sales */}
                                        <div className="flex items-center justify-between gap-2 w-full border-b border-neutral-100 pb-2 mb-1">
                                            <div className="flex items-center gap-2">
                                                <div className={`transition-transform duration-200 text-neutral-400 ${isExpanded ? 'rotate-180 text-orange-600' : ''}`}>
                                                    <ChevronDownIcon />
                                                </div>
                                                <span className="font-bold text-lg text-neutral-900 leading-tight whitespace-normal">{store.name}</span>
                                                <button
                                                    type="button"
                                                    data-export-hidden="true"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDownloadStoreImage(store);
                                                    }}
                                                    disabled={captureBusy !== null}
                                                    className="inline-flex items-center justify-center rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    title="Download this store as PNG"
                                                >
                                                    {captureBusy === String(store.sid) ? '...' : 'PNG'}
                                                </button>
                                            </div>
                                            <span className="text-xl font-black text-orange-600" dir="ltr">{formatSAR(store.sales)}</span>
                                        </div>

                                        {/* Body: 50/50 Split */}
                                        <div className="flex flex-col sm:flex-row gap-4 w-full">

                                            <div className="flex-1 flex flex-col gap-2">
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                    <div
                                                        className="flex justify-between items-center bg-neutral-50 px-2 py-1 rounded cursor-pointer hover:bg-orange-50 hover:ring-1 hover:ring-orange-200 transition-all"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setVisitorsHourlyContext({ sid: String(store.sid), name: String(store.name || store.sid) });
                                                            setVisitorsHourlyOpen(true);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setVisitorsHourlyContext({ sid: String(store.sid), name: String(store.name || store.sid) });
                                                                setVisitorsHourlyOpen(true);
                                                            }
                                                        }}
                                                        role="button"
                                                        tabIndex={0}
                                                        title="عرض الزوار بالساعة لهذا الفرع"
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            <span className="text-neutral-500 text-xs">زوار:</span>
                                                            <span className="font-bold text-orange-700 underline-offset-2 group-hover:underline">{Math.round(store.visitors || 0).toLocaleString()}</span>
                                                        </span>
                                                        <span className="flex items-center gap-1 border-r border-neutral-200 pr-2 mr-1">
                                                            <span className="text-neutral-500 text-xs">ق.ع:</span>
                                                            <span className="font-bold text-neutral-700" dir="ltr">{(store.visitors || 0) > 0 ? formatSAR(store.sales / store.visitors) : formatSAR(0)}</span>
                                                        </span>
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
                                                    <span className="font-bold text-orange-700">{Array.isArray(store.employees) ? store.employees.length : 0}</span>
                                                </div>

                                                {/* Store Shift Row */}
                                                {showRamadanShifts && (() => {
                                                    const sh = storeShifts[store.sid] || {
                                                        shift1: { sales: 0, trans: 0, visitors: 0 },
                                                        shift2: { sales: 0, trans: 0, visitors: 0 }
                                                    };
                                                    return (
                                                        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-orange-100 mt-1">
                                                            <div className="flex flex-col items-center bg-amber-50 rounded py-1 border border-amber-100 px-1">
                                                                <span className="text-[9px] text-amber-700 font-bold">ش1 🌅</span>
                                                                <span className="text-[8px] text-amber-500">9:30ص – 3:30م</span>
                                                                <span className="text-[10px] font-black text-amber-900" dir="ltr">{formatSAR(sh.shift1.sales)}</span>
                                                                <span className="text-[8px] text-amber-700">زوار: {Math.round(sh.shift1.visitors)}</span>
                                                                <span className="text-[8px] text-amber-700">ATV: {sh.shift1.trans > 0 ? formatSAR(sh.shift1.sales / sh.shift1.trans) : formatSAR(0)}</span>
                                                                <span className="text-[8px] text-amber-700">استحواذ: {sh.shift1.visitors > 0 ? ((sh.shift1.trans / sh.shift1.visitors) * 100).toFixed(1) : '0.0'}%</span>
                                                            </div>
                                                            <div className="flex flex-col items-center bg-orange-50 rounded py-1 border border-orange-100 px-1">
                                                                <span className="text-[9px] text-orange-700 font-bold">ش2 ☀️</span>
                                                                <span className="text-[8px] text-orange-500">3:30م – 12ص</span>
                                                                <span className="text-[10px] font-black text-orange-900" dir="ltr">{formatSAR(sh.shift2.sales)}</span>
                                                                <span className="text-[8px] text-orange-700">زوار: {Math.round(sh.shift2.visitors)}</span>
                                                                <span className="text-[8px] text-orange-700">ATV: {sh.shift2.trans > 0 ? formatSAR(sh.shift2.sales / sh.shift2.trans) : formatSAR(0)}</span>
                                                                <span className="text-[8px] text-orange-700">استحواذ: {sh.shift2.visitors > 0 ? ((sh.shift2.trans / sh.shift2.visitors) * 100).toFixed(1) : '0.0'}%</span>
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

                                                {/* Monthly Target: هدف + مبيعات شهرية + نسبة */}
                                                <div className="flex flex-col gap-1 text-xs text-neutral-500 mt-1">
                                                    <div className="flex justify-between items-center gap-2 flex-wrap">
                                                        <span className="text-neutral-600">
                                                            الهدف الشهري: <span className="font-semibold text-neutral-800" dir="ltr">{formatSAR(store.monthTarget || 0)}</span>
                                                        </span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${(store.monthSales || 0) >= (store.monthTarget || 0) && (store.monthTarget || 0) > 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                            {store.monthTarget > 0 ? ((store.monthSales / store.monthTarget) * 100).toFixed(1) : 0}%
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-neutral-400">
                                                        <span>مبيعات الشهر (تراكمي)</span>
                                                        <span className="font-bold text-neutral-700" dir="ltr">{formatSAR(store.monthSales || 0)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Employees Section — يظهر لكل من باع اليوم حتى بعد إكمال التارجت */}
                                    {isExpanded && Array.isArray(store.employees) && store.employees.length > 0 && (
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
                                                                    <span>يومي:</span>
                                                                    <span dir="ltr">{formatSAR(emp.dailyTarget || 0)}</span>
                                                                    {(emp.monthTarget || 0) > 0 && (emp.monthSales || 0) >= (emp.monthTarget || 0) && (
                                                                        <span className="text-[9px] text-green-600 font-bold mr-0.5">محقق الشهري</span>
                                                                    )}
                                                                </div>
                                                                {(emp.monthTarget || 0) > 0 && (
                                                                    <div className="flex items-center gap-1 bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700 font-medium">
                                                                        <span>شهري:</span>
                                                                        <span dir="ltr">{formatSAR(emp.monthSales || 0)} / {formatSAR(emp.monthTarget || 0)}</span>
                                                                        <span className="text-[9px] text-orange-600">
                                                                            ({(emp.monthTarget || 0) > 0 ? (((emp.monthSales || 0) / (emp.monthTarget || 1)) * 100).toFixed(1) : '0'}%)
                                                                        </span>
                                                                    </div>
                                                                )}
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

        {visitorsHourlyOpen && visitorsHourlyContext && (
            <div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
                onClick={() => { setVisitorsHourlyOpen(false); setVisitorsHourlyContext(null); }}
                role="presentation"
            >
                <div
                    className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4 border border-neutral-200"
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-label="زوار بالساعة"
                >
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <h3 className="font-bold text-neutral-900 text-sm">
                            {dateMode === 'today' ? 'زوار اليوم' : 'زوار الأمس'} — {visitorsHourlyContext.name}
                        </h3>
                        <button
                            type="button"
                            className="text-neutral-500 hover:text-neutral-800 text-lg leading-none px-2"
                            onClick={() => { setVisitorsHourlyOpen(false); setVisitorsHourlyContext(null); }}
                            aria-label="إغلاق"
                        >
                            ✕
                        </button>
                    </div>
                    <p className="text-xs text-neutral-500 mb-3 font-mono dir-ltr">{targetDateStr}</p>
                    <div className="max-h-64 overflow-y-auto space-y-1 text-sm">
                        {hourlyRows.length === 0 ? (
                            <p className="text-center text-neutral-500 text-xs py-6">لا توجد بيانات بالساعة</p>
                        ) : (
                            hourlyRows.map(({ hour, count }) => (
                                <div key={hour} className="flex justify-between gap-2 border-b border-neutral-100 py-1.5">
                                    <span className="text-neutral-600 tabular-nums">
                                        الساعة {String(hour).padStart(2, '0')}
                                    </span>
                                    <span className="font-bold text-neutral-900 dir-ltr tabular-nums">
                                        {Math.round(count).toLocaleString()}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};
