
// analysisHelpers.ts

export const safeNum = (x: unknown) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
};

export const getSmartDuvetCategories = () => ({
    low: { min: 99, max: 300, label: 'Low Value (99-300)' },
    medium: { min: 301, max: 600, label: 'Medium Value (301-600)' },
    high: { min: 601, max: Infinity, label: 'High Value (600+)' }
});

export const getSmartDuvetFullCategories = () => ({
    low: { min: 99, max: 300, label: 'Low Value (99-300)' },
    medium: { min: 301, max: 499, label: 'Medium Value (301-499)' },
    high: { min: 500, max: Infinity, label: 'High Value (500+)' }
});

export const getSmartPillowCategories = () => ({
    low: { min: 39, max: 99, label: 'Low Value (39-99)' },
    medium: { min: 100, max: 189, label: 'Medium Value (100-189)' },
    high: { min: 190, max: Infinity, label: 'High Value (190+)' }
});

export type AnalysisBreakdown = {
    totalUnits: number;
    breakdown: { name: string; units: number; percentage: number }[];
};



export function runProductValueAnalysis(params: {
    catalog: Record<string, any[]>;
    storeId?: string; // If provided, filter by store
}) {
    const { catalog, storeId } = params;

    const resolveUnitPrice = (it: any) => {
        const stores = it?.stores || {};
        let qty = 0;
        let amt = 0;

        if (storeId) {
            const st = stores[storeId];
            if (st) {
                qty = safeNum(st.q);
                amt = safeNum(st.a);
            }
        } else {
            // Aggregate all stores
            for (const st of Object.values(stores)) {
                qty += safeNum((st as any).q);
                amt += safeNum((st as any).a);
            }
        }
        return qty > 0 ? amt / qty : 0;
    };

    /**
     * If employeeId is provided, we need to filter units sold by that employee.
     * catalog data in product_analysis_data.json only has store-level aggregates.
     * To get employee-level product sales, we might need to check other data or fallback.
     * Wait, the user wants "Inside each employee name... apply the correct filters".
     * If the data doesn't support item-level sales per employee, I'll have to use store-level or approximate.
     * Let's check employee_data.json structure. Usually it has [date, emp, sales, trans].
     * It might NOT have item-level details.
     */

    const analyzeCategory = (categoryName: string, getCats: () => any) => {
        const items = catalog[categoryName] || [];
        const cats = getCats();
        const labels = [cats.low.label, cats.medium.label, cats.high.label];
        const buckets: Record<string, number> = { [labels[0]]: 0, [labels[1]]: 0, [labels[2]]: 0 };
        let totalUnits = 0;

        items.forEach(it => {
            const up = resolveUnitPrice(it);
            if (up <= 0) return;
            let label = null;
            if (up >= cats.low.min && up <= cats.low.max) label = cats.low.label;
            else if (up >= cats.medium.min && up <= cats.medium.max) label = cats.medium.label;
            else if (up >= cats.high.min) label = cats.high.label;

            if (label) {
                let qty = 0;
                if (storeId) {
                    qty = safeNum(it.stores?.[storeId]?.q);
                } else {
                    qty = Object.values(it.stores || {}).reduce((s: number, st: any) => s + safeNum(st.q), 0);
                }

                buckets[label] += qty;
                totalUnits += qty;
            }
        });

        return {
            totalUnits,
            breakdown: labels.map(l => ({ name: l, units: buckets[l], percentage: totalUnits > 0 ? (buckets[l] / totalUnits) * 100 : 0 }))
        };
    };

    return {
        duvetKing: analyzeCategory('Duvet (King)', getSmartDuvetCategories),
        duvetFull: analyzeCategory('Duvet Full', getSmartDuvetFullCategories),
        pillow: analyzeCategory('Pillows', getSmartPillowCategories),
    };
}
