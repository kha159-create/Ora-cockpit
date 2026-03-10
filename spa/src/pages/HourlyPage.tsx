import React, { useEffect, useMemo, useState } from 'react';
import { useLiveSalesData } from '../hooks/useLiveSalesData';
import { SalesIcon, InvoicesIcon, VisitorsIcon, ChevronDownIcon } from '../components/Icons';
import { getCurrentUser } from '../auth/storage';
import * as XLSX from 'xlsx';
import { loadD365SalesRange } from '../services/d365Live';

const formatSAR = (val: number) => val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
const formatNum = (val: number) => Math.round(val).toLocaleString();

export default function HourlyPage() {
    const { raw, loading, error } = useLiveSalesData();
    const [d365Data, setD365Data] = useState<any>(null);
    const user = getCurrentUser();
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedStore, setSelectedStore] = useState<string>(user?.role === 'BranchManager' ? (user?.storeId || 'all') : 'all');
    const [selectedManager, setSelectedManager] = useState<string>(
        (user?.role !== 'Admin' && user?.role !== 'Auditor' && user?.role !== 'Accountant') ? (user?.name || 'all') : 'all'
    );
    const [fromHour, setFromHour] = useState<number>(0);
    const [toHour, setToHour] = useState<number>(24);
    // Fallback offset for raw data (management_data.json) which stores UTC hours.
    // D365 API already sends local hours (BeginDateTime + 3h), so no offset needed.
    const RAW_HOUR_OFFSET = 3;

    const stores = useMemo(() => raw?.stores || {}, [raw]);
    const meta = useMemo(() => raw?.store_meta || {}, [raw]);
    const managers = useMemo(() => {
        const mSet = new Set<string>();
        Object.values(meta).forEach((m: any) => { if (m.manager) mSet.add(m.manager); });
        return Array.from(mSet).sort();
    }, [meta]);

    useEffect(() => {
        let cancelled = false;
        loadD365SalesRange(selectedDate, selectedDate)
            .then((payload) => {
                if (!cancelled) setD365Data(payload);
            })
            .catch(() => {
                if (!cancelled) setD365Data(null);
            });
        return () => { cancelled = true; };
    }, [selectedDate]);

    const salesDailyRows = d365Data?.sales || raw?.sales || [];
    const transactionsRows = d365Data?.transactions || raw?.transactions || [];
    const salesHourlyRows = d365Data?.sales_hourly || raw?.sales_hourly || [];
    const visitorsDailyRows = raw?.visitors || [];
    const visitorsHourlyRows = raw?.visitors_hourly || [];

    const useD365 = !!d365Data?.sales_hourly;
    const getSalesLocalHour = (date: string, hourFromSource: number): number => {
        if (date !== selectedDate) return -1;
        return useD365 ? hourFromSource : (hourFromSource + RAW_HOUR_OFFSET) % 24;
    };

    const hourlyData = useMemo(() => {
        if (!raw) return Array.from({ length: 24 }, (_, i) => ({ hour: i, sales: 0, trans: 0, visitors: 0 }));

        const filteredSids = new Set<string>();
        Object.keys(meta).forEach(sid => {
            const m = meta[sid];
            if (selectedStore !== 'all' && sid !== selectedStore) return;
            if (selectedManager !== 'all' && m.manager !== selectedManager) return;
            filteredSids.add(sid);
        });

        const hourly = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            sales: 0,
            trans: 0,
            visitors: 0
        }));

        (salesHourlyRows || []).forEach((r: any[]) => {
            const date = String(r[0] || '').trim();
            const sid = r[1];
            const h = Number(r[2]);
            if (!Number.isInteger(h) || h < 0 || h > 23) return;
            const val = Number(r[3]) || 0;
            const trans = Number(r[4]) || 0;
            if (filteredSids.size > 0 && !filteredSids.has(String(sid))) return;
            const localHour = getSalesLocalHour(date, h);

            if (localHour < 0 || localHour > 23) return;
            hourly[localHour].sales += val;
            hourly[localHour].trans += trans;
        });

        (visitorsHourlyRows || []).forEach((r: any[]) => {
            const date = String(r[0] || '').trim();
            if (date !== selectedDate) return;
            const sid = r[1];
            const h = Number(r[2]);
            if (!Number.isInteger(h) || h < 0 || h > 23) return;
            const val = Number(r[3]) || 0;
            if (filteredSids.size > 0 && !filteredSids.has(String(sid))) return;
            hourly[h].visitors += val;
        });

        return hourly;
    }, [raw, selectedDate, selectedStore, selectedManager, meta, salesHourlyRows, visitorsHourlyRows, d365Data]);

    const totals = useMemo(() => {
        if (!raw) return { sales: 0, trans: 0, visitors: 0 };

        const filteredSids = new Set<string>();
        Object.keys(meta).forEach(sid => {
            const m = meta[sid];
            if (selectedStore !== 'all' && sid !== selectedStore) return;
            if (selectedManager !== 'all' && m.manager !== selectedManager) return;
            filteredSids.add(sid);
        });

        let sales = 0;
        let trans = 0;
        let visitors = 0;

        (salesDailyRows || []).forEach((r: any[]) => {
            const date = String(r[0] || '').substring(0, 10);
            const sid = String(r[1]);
            if (date !== selectedDate) return;
            if (filteredSids.size > 0 && !filteredSids.has(sid)) return;
            sales += Number(r[2]) || 0;
        });

        (transactionsRows || []).forEach((r: any[]) => {
            const date = String(r[0] || '').substring(0, 10);
            const sid = String(r[1]);
            if (date !== selectedDate) return;
            if (filteredSids.size > 0 && !filteredSids.has(sid)) return;
            trans += Number(r[2]) || 0;
        });

        (visitorsDailyRows || []).forEach((r: any[]) => {
            const date = String(r[0] || '').substring(0, 10);
            const sid = String(r[1]);
            if (date !== selectedDate) return;
            if (filteredSids.size > 0 && !filteredSids.has(sid)) return;
            visitors += Number(r[2]) || 0;
        });

        return { sales, trans, visitors };
    }, [raw, meta, selectedDate, selectedStore, selectedManager, salesDailyRows, transactionsRows, visitorsDailyRows]);

    const rangeSummary = useMemo(() => {
        const start = Math.max(0, Math.min(23, fromHour));
        const end = Math.max(start, Math.min(24, toHour));
        let sales = 0, trans = 0, visitors = 0;
        hourlyData.forEach(h => {
            if (h.hour >= start && h.hour <= Math.min(23, end)) {
                sales += h.sales;
                trans += h.trans;
                visitors += h.visitors;
            }
        });
        return {
            from: start,
            to: end,
            sales,
            trans,
            visitors,
            atv: trans > 0 ? sales / trans : 0,
            conversion: visitors > 0 ? (trans / visitors) * 100 : 0,
        };
    }, [hourlyData, fromHour, toHour]);

    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        const getHourlyForSids = (sids: Set<string>) => {
            const hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, sales: 0, trans: 0, visitors: 0 }));

            (salesHourlyRows || []).forEach((r: any[]) => {
                const date = String(r[0] || '').trim();
                const sid = String(r[1]);
                const h = Number(r[2]);
                if (!Number.isInteger(h) || h < 0 || h > 23) return;
                if (sids.size > 0 && !sids.has(sid)) return;
                const localHour = getSalesLocalHour(date, h);

                if (localHour < 0 || localHour > 23) return;
                hourly[localHour].sales += Number(r[3]) || 0;
                hourly[localHour].trans += Number(r[4]) || 0;
            });

            (visitorsHourlyRows || []).forEach((r: any[]) => {
                const date = String(r[0] || '').trim();
                if (date !== selectedDate) return;
                const sid = String(r[1]);
                const h = Number(r[2]);
                if (!Number.isInteger(h) || h < 0 || h > 23) return;
                if (sids.size > 0 && !sids.has(sid)) return;
                hourly[h].visitors += Number(r[3]) || 0;
            });

            return hourly;
        };

        const getExactTotalsForSids = (sids: Set<string>) => {
            let sales = 0;
            let trans = 0;
            let visitors = 0;

            (salesDailyRows || []).forEach((r: any[]) => {
                const date = String(r[0] || '').substring(0, 10);
                const sid = String(r[1]);
                if (date !== selectedDate) return;
                if (sids.size > 0 && !sids.has(sid)) return;
                sales += Number(r[2]) || 0;
            });

            (transactionsRows || []).forEach((r: any[]) => {
                const date = String(r[0] || '').substring(0, 10);
                const sid = String(r[1]);
                if (date !== selectedDate) return;
                if (sids.size > 0 && !sids.has(sid)) return;
                trans += Number(r[2]) || 0;
            });

            (visitorsDailyRows || []).forEach((r: any[]) => {
                const date = String(r[0] || '').substring(0, 10);
                const sid = String(r[1]);
                if (date !== selectedDate) return;
                if (sids.size > 0 && !sids.has(sid)) return;
                visitors += Number(r[2]) || 0;
            });

            return { sales, trans, visitors };
        };

        const addSheet = (sheetName: string, sids: Set<string>, titleSuffix: string) => {
            const data = getHourlyForSids(sids);
            const sheetTotals = getExactTotalsForSids(sids);

            const metadata = [
                ['تقرير المبيعات بالساعة'],
                ['التاريخ', selectedDate],
                ['الجهة', titleSuffix],
                [''],
                ['الساعة', 'المبيعات', 'الفواتير', 'متوسط الفاتورة (ATV)', 'الزوار', 'نسبة التحويل %']
            ];

            const dataRows = data.map(h => {
                const atv = h.trans > 0 ? Math.round(h.sales / h.trans) : 0;
                const conv = h.visitors > 0 ? (h.trans / h.visitors) * 100 : 0;
                return [
                    `${h.hour.toString().padStart(2, '0')}:00 ~ ${((h.hour + 1) % 24).toString().padStart(2, '0')}:00`,
                    h.sales,
                    h.trans,
                    atv,
                    h.visitors,
                    conv.toFixed(1) + '%'
                ];
            });

            const totalsRow = [
                'الإجمالي العام',
                sheetTotals.sales,
                sheetTotals.trans,
                sheetTotals.trans > 0 ? Math.round(sheetTotals.sales / sheetTotals.trans) : 0,
                sheetTotals.visitors,
                (sheetTotals.visitors > 0 ? (sheetTotals.trans / sheetTotals.visitors) * 100 : 0).toFixed(1) + '%'
            ];

            const ws = XLSX.utils.aoa_to_sheet([...metadata, ...dataRows, totalsRow]);

            // Formatting: Number formats for Sales (with commas) and ATV (no decimals)
            const range = XLSX.utils.decode_range(ws['!ref']!);
            for (let R = 5; R <= range.e.r; ++R) { // Rows start after headers
                const salesCell = ws[XLSX.utils.encode_cell({ r: R, c: 1 })];
                if (salesCell) salesCell.z = '#,##0';
                const atvCell = ws[XLSX.utils.encode_cell({ r: R, c: 3 })];
                if (atvCell) atvCell.z = '0';
            }

            ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // Sheet name limit
        };

        const currentFilterSids = new Set<string>();
        Object.keys(meta).forEach(sid => {
            const m = meta[sid];
            if (selectedStore !== 'all' && sid !== selectedStore) return;
            if (selectedManager !== 'all' && m.manager !== selectedManager) return;
            currentFilterSids.add(sid);
        });

        const mainTitle = selectedStore !== 'all' ? stores[selectedStore] : (selectedManager !== 'all' ? `مدير المنطقة: ${selectedManager}` : 'كل الفروع');
        addSheet(selectedStore !== 'all' ? stores[selectedStore] : "الملخص العام", currentFilterSids, mainTitle);

        // If Manager mode and All Stores selected, add each store as a separate sheet
        if (selectedStore === 'all' && selectedManager !== 'all') {
            Array.from(currentFilterSids).sort((a, b) => (stores[a] || '').localeCompare(stores[b] || '')).forEach(sid => {
                addSheet(stores[sid] || sid, new Set([sid]), stores[sid] || sid);
            });
        }

        const filename = `Hourly_Sales_${mainTitle}_${selectedDate}.xlsx`.replace(/\s+/g, '_');
        XLSX.writeFile(wb, filename);
    };

    if (loading && !raw) return <div className="p-8 text-center animate-pulse text-orange-500 font-bold">جاري تحميل البيانات الحيوية...</div>;
    if (error) return <div className="p-8 text-center text-red-500 font-bold">خطأ: {error}</div>;

    return (
        <div className="space-y-6 pb-20">
            {/* Header & Filters */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <h1 className="text-2xl font-black text-neutral-900">المبيعات بالساعه</h1>
                        <button
                            onClick={handleExportExcel}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-sm active:scale-95"
                        >
                            <span>📥</span> تصدير Excel
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-neutral-400 mr-2 uppercase">التاريخ</label>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                            />
                        </div>
                        {(user?.role === 'Admin' || user?.role === 'Auditor' || user?.role === 'Accountant') && (
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-black text-neutral-400 mr-2 uppercase">مدير المنطقة</label>
                                <select
                                    value={selectedManager}
                                    onChange={(e) => { setSelectedManager(e.target.value); setSelectedStore('all'); }}
                                    className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none min-w-[140px]"
                                >
                                    <option value="all">كل المدراء</option>
                                    {managers.map((m: string) => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-neutral-400 mr-2 uppercase">الفرع</label>
                            <select
                                value={selectedStore}
                                onChange={(e) => setSelectedStore(e.target.value)}
                                disabled={user?.role === 'BranchManager'}
                                className={`bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none min-w-[200px] ${user?.role === 'BranchManager' ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                {user?.role !== 'BranchManager' && <option value="all">كل الفروع</option>}
                                {Object.entries(stores)
                                    .filter(([sid]) => {
                                        if (user?.role === 'BranchManager' && sid !== user?.storeId) return false;
                                        const m = meta[sid] || {};
                                        if (selectedManager !== 'all' && m.manager !== selectedManager) return false;
                                        return true;
                                    })
                                    .map(([sid, name]: any) => (
                                        <option key={sid} value={sid}>{name}</option>
                                    ))
                                }
                            </select>
                        </div>
                    </div>
                </div>

                {/* Global Stats Bar - RESTORED as requested */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-dashed border-neutral-100">
                    <div className="p-3 bg-orange-50 rounded-2xl border border-orange-100">
                        <div className="text-[10px] font-black text-neutral-400 uppercase mb-1">إجمالي المبيعات</div>
                        <div className="text-lg font-black text-orange-600">{formatSAR(totals.sales)}</div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100">
                        <div className="text-[10px] font-black text-neutral-400 uppercase mb-1">إجمالي الفواتير</div>
                        <div className="text-lg font-black text-blue-600">{formatNum(totals.trans)}</div>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <div className="text-[10px] font-black text-neutral-400 uppercase mb-1">إجمالي الزوار</div>
                        <div className="text-lg font-black text-emerald-600">{formatNum(totals.visitors)}</div>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100">
                        <div className="text-[10px] font-black text-neutral-400 uppercase mb-1">معدل التحويل العام</div>
                        <div className="text-lg font-black text-purple-600">
                            {totals.visitors > 0 ? ((totals.trans / totals.visitors) * 100).toFixed(1) : 0}%
                        </div>
                    </div>
                </div>

                {/* Range Summary Card - Replaces Only the PeakHour/QuickInsight portion */}
                <div className="mt-6 bg-neutral-50 rounded-3xl border border-neutral-200 p-5 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-end gap-6 pb-2">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black text-neutral-500 uppercase mr-1">من الساعة</span>
                            <select
                                className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm font-black focus:ring-2 focus:ring-orange-500 outline-none min-w-[120px] shadow-sm"
                                value={fromHour}
                                onChange={(e) => setFromHour(Number(e.target.value))}
                            >
                                {Array.from({ length: 24 }, (_, i) => i).map(h => (
                                    <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black text-neutral-500 uppercase mr-1">إلى الساعة</span>
                            <select
                                className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm font-black focus:ring-2 focus:ring-orange-500 outline-none min-w-[120px] shadow-sm"
                                value={toHour}
                                onChange={(e) => setToHour(Number(e.target.value))}
                            >
                                {Array.from({ length: 25 }, (_, i) => i).map(h => (
                                    <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-black text-neutral-800 mb-1">
                                {selectedStore !== 'all' ? stores[selectedStore] : (selectedManager !== 'all' ? `مدير المنطقة: ${selectedManager}` : 'كل الفروع')}
                            </h3>
                            <p className="text-[11px] text-neutral-500 font-bold leading-relaxed">
                                تحليل من <span className="text-orange-600 font-black">{fromHour.toString().padStart(2, '0')}:00</span> إلى <span className="text-orange-600 font-black">{(toHour % 24).toString().padStart(2, '0')}:00</span>
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                        <div className="p-2.5 bg-white rounded-xl border border-neutral-100 shadow-sm">
                            <div className="text-[8px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">المبيعات</div>
                            <div className="text-sm font-black text-orange-600">{formatSAR(rangeSummary.sales)}</div>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-neutral-100 shadow-sm">
                            <div className="text-[8px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">الفواتير</div>
                            <div className="text-sm font-black text-blue-600">{formatNum(rangeSummary.trans)}</div>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-neutral-100 shadow-sm">
                            <div className="text-[8px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">الزوار</div>
                            <div className="text-sm font-black text-emerald-600">{formatNum(rangeSummary.visitors)}</div>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-neutral-100 shadow-sm">
                            <div className="text-[8px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">ATV</div>
                            <div className="text-sm font-black text-neutral-700">{formatSAR(rangeSummary.atv)}</div>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-neutral-100 shadow-sm">
                            <div className="text-[8px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">التحويل</div>
                            <div className="text-sm font-black text-purple-600">{rangeSummary.conversion.toFixed(1)}%</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hourly Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200">
                                <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider text-center">الساعة</th>
                                <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider border-r border-neutral-100">المبيعات</th>
                                <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider">الفواتير</th>
                                <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider font-mono">ATV</th>
                                <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider border-r border-neutral-100">الزوار</th>
                                <th className="p-4 text-xs font-black text-neutral-400 uppercase tracking-wider bg-emerald-50/50">التحويل %</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {hourlyData.map((h) => {
                                const atv = h.trans > 0 ? h.sales / h.trans : 0;
                                const conv = h.visitors > 0 ? (h.trans / h.visitors) * 100 : 0;
                                const isPeak = h.sales === Math.max(...hourlyData.map(x => x.sales)) && h.sales > 0;

                                return (
                                    <tr key={h.hour} className={`hover:bg-neutral-50/80 transition-colors ${isPeak ? 'bg-orange-50/30' : ''}`}>
                                        <td className="p-4 font-bold text-neutral-900 border-l border-neutral-100 bg-neutral-50/50">
                                            <div className="flex items-center gap-2">
                                                <span className="w-8 h-8 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-[11px] font-black text-neutral-500 shadow-sm">
                                                    {h.hour}
                                                </span>
                                                <span className="text-[11px] font-black whitespace-nowrap">
                                                    {`${h.hour.toString().padStart(2, '0')}:00 ~ ${((h.hour + 1) % 24).toString().padStart(2, '0')}:00`}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 border-r border-neutral-100">
                                            <span className={`font-black font-mono text-base ${h.sales > 0 ? 'text-orange-600' : 'text-neutral-300'}`}>
                                                {formatSAR(h.sales)}
                                            </span>
                                        </td>
                                        <td className="p-4 font-bold text-blue-600 font-mono text-base">
                                            {h.trans > 0 ? h.trans : <span className="text-neutral-200">0</span>}
                                        </td>
                                        <td className="p-4 text-sm font-bold text-neutral-400 font-mono">
                                            {atv > 0 ? formatSAR(atv) : '-'}
                                        </td>
                                        <td className="p-4 border-r border-neutral-100 font-bold text-emerald-600 font-mono text-base">
                                            {h.visitors > 0 ? h.visitors : <span className="text-neutral-200">0</span>}
                                        </td>
                                        <td className="p-4 bg-emerald-50/30">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden max-w-[80px]">
                                                    <div
                                                        className="h-full bg-emerald-500 rounded-full"
                                                        style={{ width: `${Math.min(100, conv * 2.5)}%` }}
                                                    />
                                                </div>
                                                <span className={`text-[12px] font-black ${conv > 0 ? 'text-emerald-700' : 'text-neutral-300'}`}>
                                                    {conv.toFixed(1)}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-neutral-100 border-t-4 border-neutral-200 font-black">
                                <td className="p-5 text-neutral-700 border-l border-neutral-200 text-base">الإجمالي العام</td>
                                <td className="p-5 text-orange-600 border-r border-neutral-100 text-xl">{formatSAR(totals.sales)}</td>
                                <td className="p-5 text-blue-600 text-xl">{formatNum(totals.trans)}</td>
                                <td className="p-5 text-neutral-600 text-sm">
                                    {totals.trans > 0 ? formatSAR(totals.sales / totals.trans) : '-'}
                                </td>
                                <td className="p-5 text-emerald-600 border-r border-neutral-100 text-xl">{formatNum(totals.visitors)}</td>
                                <td className="p-5 text-emerald-700 text-xl">
                                    {totals.visitors > 0 ? ((totals.trans / totals.visitors) * 100).toFixed(1) : '0'}%
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}
