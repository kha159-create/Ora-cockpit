import React from 'react';
import { ChartCard } from '../DashboardComponents';

interface TopSellingWidgetProps {
    catalogRows: any[];
    metric: 'qty' | 'val';
    onMetricChange: (m: 'qty' | 'val') => void;
    page: number;
    onPageChange: (p: number) => void;
    formatSAR: (val: number) => string;
}

export const TopSellingWidget: React.FC<TopSellingWidgetProps> = ({
    catalogRows,
    metric,
    onMetricChange,
    page,
    onPageChange,
    formatSAR
}) => {
    const TOP_SELLING_PER_PAGE = 10;
    const totalPages = Math.ceil(catalogRows.length / TOP_SELLING_PER_PAGE);
    const safePage = Math.min(page, Math.max(1, totalPages)); // Ensure page is valid
    const start = (safePage - 1) * TOP_SELLING_PER_PAGE;
    const visible = catalogRows.slice(start, start + TOP_SELLING_PER_PAGE);

    return (
        <ChartCard title="أكثر المنتجات مبيعاً (Top Selling Products)">
            <div className="flex items-center justify-end mb-3 gap-2">
                <div className="text-sm font-semibold text-neutral-500">الترتيب حسب:</div>
                <div className="flex bg-neutral-100 rounded-lg p-1">
                    <button
                        onClick={() => onMetricChange('qty')}
                        className={`px-3 py-1 rounded-md text-sm font-bold transition-all ${metric === 'qty' ? 'bg-white text-orange-600 shadow' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                        📦 الكمية
                    </button>
                    <button
                        onClick={() => onMetricChange('val')}
                        className={`px-3 py-1 rounded-md text-sm font-bold transition-all ${metric === 'val' ? 'bg-white text-green-600 shadow' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                        💰 القيمة
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                        <tr className="bg-orange-50/50">
                            <th className="th w-[60px] text-center">#</th>
                            <th className="th">المنتج</th>
                            <th className="th text-center">الكمية</th>
                            <th className="th text-center">سعر الوحدة</th>
                            <th className="th text-center">القيمة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((p, idx) => {
                            const unitPrice = p.qty > 0 ? p.amount / p.qty : 0;
                            return (
                                <tr key={p.id} className="hover:bg-orange-50 border-b border-neutral-100 last:border-0">
                                    <td className="td text-center text-neutral-500 font-mono">{start + idx + 1}</td>
                                    <td className="td">
                                        <div className="font-bold text-neutral-800">{p.name}</div>
                                        <div className="text-xs text-neutral-400 font-mono">{p.id}</div>
                                    </td>
                                    <td className={`td text-center font-semibold ${metric === 'qty' ? 'text-orange-700 bg-orange-50/50' : 'text-neutral-600'}`}>
                                        {Math.round(p.qty).toLocaleString()}
                                    </td>
                                    <td className="td text-center text-neutral-600 font-mono">
                                        {formatSAR(unitPrice)}
                                    </td>
                                    <td className={`td text-center font-semibold ${metric === 'val' ? 'text-green-700 bg-green-50/50' : 'text-neutral-600'}`} dir="ltr">
                                        {formatSAR(p.amount)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {catalogRows.length > TOP_SELLING_PER_PAGE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 mt-2">
                    <button
                        onClick={() => onPageChange(Math.max(1, safePage - 1))}
                        disabled={safePage === 1}
                        className="px-3 py-1 text-sm font-medium rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        السابق
                    </button>
                    <span className="text-sm text-neutral-600">
                        صفحة {safePage} من {totalPages}
                    </span>
                    <button
                        onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
                        disabled={safePage === totalPages}
                        className="px-3 py-1 text-sm font-medium rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        التالي
                    </button>
                </div>
            )}
        </ChartCard>
    );
};
