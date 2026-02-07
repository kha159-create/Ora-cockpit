import React from 'react';
import { PrinterIcon, UsersIcon, XIcon } from '../Icons';

interface DailyReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    dailyReportData: any[]; // Type this accurately if possible
    yesterdayStr: string;
    lastYearYesterdayStr: string;
    formatSAR: (val: number) => string;
    onPrintDailyReport: () => void;
    onPrintEmployeeReport: () => void;
}

export const DailyReportModal: React.FC<DailyReportModalProps> = ({
    isOpen,
    onClose,
    dailyReportData,
    yesterdayStr,
    lastYearYesterdayStr,
    formatSAR,
    onPrintDailyReport,
    onPrintEmployeeReport,
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-center-screen" onClick={onClose}>
            <div className="modal-content max-w-6xl my-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <div className="text-base font-bold text-blue-600 flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-2xl sm:text-base">📄</span>
                            <div className="flex flex-col">
                                <span>التقرير اليومي</span>
                                <span className="text-[10px] sm:text-sm text-gray-500 font-normal mt-1">
                                    تقرير الأمس <span className="font-mono dir-ltr inline">({yesterdayStr})</span> مقارنة بـ <span className="font-mono dir-ltr inline">({lastYearYesterdayStr})</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="btn-primary py-1.5 px-3 text-sm flex items-center gap-2"
                            onClick={onPrintDailyReport}
                        >
                            <PrinterIcon className="w-4 h-4" /> طباعة التقرير
                        </button>
                        <button
                            type="button"
                            className="bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 py-1.5 px-3 rounded-lg text-sm flex items-center gap-2 transition-colors font-medium shadow-sm"
                            onClick={onPrintEmployeeReport}
                        >
                            <UsersIcon className="w-4 h-4 text-orange-500" /> تقرير الموظفين
                        </button>
                        <button
                            type="button"
                            className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-2"
                            onClick={onClose}
                        >
                            <XIcon /> إغلاق
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-orange-500 text-white">
                                <th className="text-right py-3 px-4 font-semibold">#</th>
                                <th className="text-right py-3 px-4 font-semibold">الفرع</th>
                                <th className="text-right py-3 px-4 font-semibold">مبيعات الأمس</th>
                                <th className="text-right py-3 px-4 font-semibold">العام الماضي</th>
                                <th className="text-right py-3 px-4 font-semibold">النمو %</th>
                                <th className="text-right py-3 px-4 font-semibold">اليومية المتبقية</th>
                                <th className="text-right py-3 px-4 font-semibold">عدد الفواتير</th>
                                <th className="text-right py-3 px-4 font-semibold">متوسط الفاتورة</th>
                                <th className="text-right py-3 px-4 font-semibold">زوار</th>
                                <th className="text-right py-3 px-4 font-semibold">زوار (LY)</th>
                                <th className="text-right py-3 px-4 font-semibold">تحويل %</th>
                                <th className="text-right py-3 px-4 font-semibold">قيمة العميل</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailyReportData.map((row: any, idx: number) => (
                                <tr key={row.sid} className={`border-b border-neutral-100 hover:bg-neutral-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}>
                                    <td className="py-3 px-4 text-neutral-500">{idx + 1}</td>
                                    <td className="py-3 px-4 font-medium text-blue-600">{row.name}</td>
                                    <td className="py-3 px-4" dir="ltr">{formatSAR(row.sales)}</td>
                                    <td className="py-3 px-4" dir="ltr">{formatSAR(row.prevSales)}</td>
                                    <td className={`py-3 px-4 font-semibold ${row.growth >= 0 ? 'text-green-600' : 'text-red-500'}`} dir="ltr">
                                        {row.growth >= 0 ? '+' : ''}{row.growth.toFixed(1)}%
                                    </td>
                                    <td className="py-3 px-4 text-red-500 font-semibold" dir="ltr">{formatSAR(row.dailyReq)}</td>
                                    <td className="py-3 px-4" dir="ltr">{row.trans.toLocaleString()}</td>
                                    <td className="py-3 px-4" dir="ltr">{Math.round(row.avgInv).toLocaleString()}</td>
                                    <td className="py-3 px-4" dir="ltr">{row.visitors.toLocaleString()}</td>
                                    <td className="py-3 px-4" dir="ltr">{row.prevVisitors.toLocaleString()}</td>
                                    <td className="py-3 px-4" dir="ltr">{row.conversion.toFixed(1)}%</td>
                                    <td className="py-3 px-4 font-bold" dir="ltr">{Math.round(row.customerValue).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
