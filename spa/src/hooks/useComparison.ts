import { useMemo } from 'react';

export interface ComparisonMetric {
    key: string;
    title: string;
    current: number;
    previous: number;
    growth: number;
    isPercentage?: boolean;
    isCurrency?: boolean;
}

export interface DailyComparison {
    date: string;
    current: number;
    previous: number;
}

export function useComparison(
    rawMgmt: any,
    dateRange: { start: string; end: string }, // Current Year Range
    type: 'sales' | 'visitors' | 'transactions' = 'sales'
) {
    return useMemo(() => {
        if (!rawMgmt?.sales) return { metrics: [], chartData: [] };

        const { start, end } = dateRange;
        const startDate = new Date(start);
        const endDate = new Date(end);

        // Determine Previous Year Range
        const prevStart = new Date(startDate);
        prevStart.setFullYear(startDate.getFullYear() - 1);
        const prevEnd = new Date(endDate);
        prevEnd.setFullYear(endDate.getFullYear() - 1);

        // Auto-adjust leap year or slight shifts if needed, but simple FullYear-1 is usually fine for retail LFL unless day-of-week matching is strict.
        // For simplicity, we stick to date-matching (e.g. 1st Jan vs 1st Jan).

        const fmt = (d: Date) => d.toISOString().split('T')[0];
        const prevStartStr = fmt(prevStart);
        const prevEndStr = fmt(prevEnd);

        // Helpers
        const getVal = (row: any[], t: string) => {
            // raw structure:
            // sales: [date, storeId, value]
            // visitors: [date, storeId, value]
            // transactions: [date, storeId, value]
            return Number(row[2]) || 0;
        };

        const filterSum = (rows: any[], s: string, e: string) => {
            return rows.reduce((sum, row) => {
                const d = String(row[0]).substring(0, 10);
                if (d >= s && d <= e) return sum + getVal(row, type);
                return sum;
            }, 0);
        };

        const calcGrowth = (curr: number, prev: number) => {
            if (prev === 0) return 0; // or 100?
            return ((curr - prev) / prev) * 100;
        };

        // 1. Aggregates
        const currentSales = filterSum(rawMgmt.sales || [], start, end);
        const prevSales = filterSum(rawMgmt.sales || [], prevStartStr, prevEndStr);

        const currentVisitors = filterSum(rawMgmt.visitors || [], start, end);
        const prevVisitors = filterSum(rawMgmt.visitors || [], prevStartStr, prevEndStr);

        const currentTrans = filterSum(rawMgmt.transactions || [], start, end);
        const prevTrans = filterSum(rawMgmt.transactions || [], prevStartStr, prevEndStr);

        // Derived
        const currentATV = currentTrans > 0 ? currentSales / currentTrans : 0;
        const prevATV = prevTrans > 0 ? prevSales / prevTrans : 0;

        const currentConv = currentVisitors > 0 ? (currentTrans / currentVisitors) * 100 : 0;
        const prevConv = prevVisitors > 0 ? (prevTrans / prevVisitors) * 100 : 0;

        // 2. Metrics Object
        const metrics: ComparisonMetric[] = [
            {
                key: 'sales', title: 'إجمالي المبيعات',
                current: currentSales, previous: prevSales,
                growth: calcGrowth(currentSales, prevSales), isCurrency: true
            },
            {
                key: 'visitors', title: 'عدد الزوار',
                current: currentVisitors, previous: prevVisitors,
                growth: calcGrowth(currentVisitors, prevVisitors)
            },
            {
                key: 'transactions', title: 'عدد الفواتير',
                current: currentTrans, previous: prevTrans,
                growth: calcGrowth(currentTrans, prevTrans)
            },
            {
                key: 'atv', title: 'متوسط الفاتورة',
                current: currentATV, previous: prevATV,
                growth: calcGrowth(currentATV, prevATV), isCurrency: true
            },
            {
                key: 'conversion', title: 'معدل التحويل',
                current: currentConv, previous: prevConv,
                growth: calcGrowth(currentConv, prevConv), isPercentage: true
            },
        ];

        // 3. Daily Trend Data (for Chart)
        // We align by "Day Index" (0 to N days in range)
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const chartData: DailyComparison[] = [];

        const sourceRows = type === 'sales' ? rawMgmt.sales :
            type === 'visitors' ? rawMgmt.visitors :
                type === 'transactions' ? rawMgmt.transactions : rawMgmt.sales;

        // Pre-process for O(1) lookup
        const dailyMapCurr: Record<string, number> = {};
        const dailyMapPrev: Record<string, number> = {};

        (sourceRows || []).forEach((row: any[]) => {
            const d = String(row[0]).substring(0, 10);
            const val = Number(row[2]) || 0;

            if (d >= start && d <= end) {
                dailyMapCurr[d] = (dailyMapCurr[d] || 0) + val;
            }
            if (d >= prevStartStr && d <= prevEndStr) {
                dailyMapPrev[d] = (dailyMapPrev[d] || 0) + val;
            }
        });

        for (let i = 0; i < daysDiff; i++) {
            const dCurr = new Date(startDate); dCurr.setDate(dCurr.getDate() + i);
            const dPrev = new Date(prevStart); dPrev.setDate(dPrev.getDate() + i);

            const dCurrStr = fmt(dCurr);
            const dPrevStr = fmt(dPrev);

            chartData.push({
                date: dCurrStr,
                current: dailyMapCurr[dCurrStr] || 0,
                previous: dailyMapPrev[dPrevStr] || 0,
            });
        }

        return { metrics, chartData };

    }, [rawMgmt, dateRange, type]);
}
