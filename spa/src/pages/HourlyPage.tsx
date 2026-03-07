import React, { useMemo, useState } from 'react';
import { useLiveSalesData } from '../hooks/useLiveSalesData';
import { SalesIcon, InvoicesIcon, VisitorsIcon, ChevronDownIcon } from '../components/Icons';

const formatSAR = (val: number) => val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
const formatNum = (val: number) => Math.round(val).toLocaleString();

export default function HourlyPage() {
    const { raw, loading, error } = useLiveSalesData();
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedStore, setSelectedStore] = useState<string>('all');
    const [selectedManager, setSelectedManager] = useState<string>('all');
    const [fromHour, setFromHour] = useState<number>(0);
    const [toHour, setToHour] = useState<number>(23);

    const stores = useMemo(() => raw?.stores || {}, [raw]);
    const meta = useMemo(() => raw?.store_meta || {}, [raw]);
    const managers = useMemo(() => {
        const mSet = new Set<string>();
        Object.values(meta).forEach((m: any) => { if (m.manager) mSet.add(m.manager); });
        return Array.from(mSet).sort();
    }, [meta]);

    const prevDate = useMemo(() => {
        const d = new Date(selectedDate + 'T12:00:00');
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    }, [selectedDate]);

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

        const gmtToLocalHour = (date: string, hourGMT: number): number => {
            if (date === selectedDate) {
                if (hourGMT >= 0 && hourGMT <= 18) return hourGMT + 5;
                return -1;
            }
            if (date === prevDate && hourGMT >= 19 && hourGMT <= 23) return hourGMT + 5 - 24;
            return -1;
        };

        const processRow = (row: any[], type: 'sales' | 'visitors') => {
            const date = String(row[0] || '').trim();
            const sid = row[1];
            const h = Number(row[2]);
            if (!Number.isInteger(h) || h < 0 || h > 23) return;
            const val = Number(row[3]) || 0;
            const trans = type === 'sales' ? (Number(row[4]) || 0) : 0;

            let slotHour: number;
            if (type === 'sales') {
                slotHour = gmtToLocalHour(date, h);
            } else {
                if (date !== selectedDate || h < 0 || h > 23) return;
                slotHour = h;
            }
            if (slotHour < 0 || slotHour > 23) return;
            if (filteredSids.size > 0 && !filteredSids.has(String(sid))) return;

            if (type === 'sales') {
                hourly[slotHour].sales += val;
                hourly[slotHour].trans += trans;
            } else {
                hourly[slotHour].visitors += val;
            }
        };

        (raw.sales_hourly || []).forEach((r: any[]) => processRow(r, 'sales'));
        (raw.visitors_hourly || []).forEach((r: any[]) => processRow(r, 'visitors'));

        return hourly;
    }, [raw, selectedDate, prevDate, selectedStore, selectedManager, meta]);

    const totals = useMemo(() => {
        return hourlyData.reduce((acc, h) => ({
            sales: acc.sales + h.sales,
            trans: acc.trans + h.trans,
            visitors: acc.visitors + h.visitors
        }), { sales: 0, trans: 0, visitors: 0 });
    }, [hourlyData]);

    const rangeSummary = useMemo(() => {
        const start = Math.max(0, Math.min(23, fromHour));
        const end = Math.max(start, Math.min(23, toHour));
        let sales = 0, trans = 0, visitors = 0;
        hourlyData.forEach(h => {
            if (h.hour >= start && h.hour <= end) {
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

    if (loading && !raw) return <div className="p-8 text-center animate-pulse text-orange-500 font-bold">جاري تحميل البيانات الحيوية...</div>;
    if (error) return <div className="p-8 text-center text-red-500 font-bold">خطأ: {error}</div>;

    return (
        <div className="space-y-6 pb-20">
            {/* Header & Filters */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-neutral-900">المبيعات بالساعه</h1>
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
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-neutral-400 mr-2 uppercase">الفرع</label>
                            <select
                                value={selectedStore}
                                onChange={(e) => setSelectedStore(e.target.value)}
                                className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none min-w-[200px]"
                            >
                                <option value="all">كل الفروع</option>
                                {Object.entries(stores)
                                    .filter(([sid]) => selectedManager === 'all' || meta[sid]?.manager === selectedManager)
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
                                {Array.from({ length: 24 }, (_, i) => i).map(h => (
                                    <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-black text-neutral-800 mb-1">حساب المبيعات مخصص للفترة</h3>
                            <p className="text-[11px] text-neutral-500 font-bold leading-relaxed">
                                تحليل للفترة بين <span className="text-orange-600 font-black">{fromHour.toString().padStart(2, '0')}:00</span> و <span className="text-orange-600 font-black">{((toHour + 1) % 24).toString().padStart(2, '0')}:00</span>.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                            <div className="text-[9px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">مبيعات الفترة</div>
                            <div className="text-lg font-black text-orange-600">{formatSAR(rangeSummary.sales)}</div>
                        </div>
                        <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                            <div className="text-[9px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">فواتير الفترة</div>
                            <div className="text-lg font-black text-blue-600">{formatNum(rangeSummary.trans)}</div>
                        </div>
                        <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                            <div className="text-[9px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">زوار الفترة</div>
                            <div className="text-lg font-black text-emerald-600">{formatNum(rangeSummary.visitors)}</div>
                        </div>
                        <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                            <div className="text-[9px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">متوسط الفاتورة</div>
                            <div className="text-lg font-black text-neutral-700">{formatSAR(rangeSummary.atv)}</div>
                        </div>
                        <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                            <div className="text-[9px] font-black text-neutral-400 uppercase mb-0.5 tracking-wider">التحويل</div>
                            <div className="text-lg font-black text-purple-600">{rangeSummary.conversion.toFixed(1)}%</div>
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
                                            <div className="flex items-center gap-2 justify-center">
                                                <span className="w-10 h-10 rounded-xl bg-white border border-neutral-200 flex items-center justify-center text-[12px] font-black text-neutral-600 shadow-sm">
                                                    {h.hour.toString().padStart(2, '0')}:00
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
