import React, { useMemo, useEffect, useState } from 'react';
import { useLiveSalesData } from '../hooks/useLiveSalesData';
import { formatSAR } from '../utils/formatting';

export default function WatchSalesPage() {
    const { calculateLiveData } = useLiveSalesData();
    const [selectedManager, setSelectedManager] = useState('all');

    // Auto-refresh every 60s
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 60000);
        return () => clearInterval(t);
    }, []);

    const { liveData, managersList } = useMemo(() => {
        return calculateLiveData(selectedManager);
    }, [calculateLiveData, selectedManager, tick]);

    const { sales, trans } = liveData.totals;
    // Calculate Average Basket Value (ABV)
    const avgBasket = trans > 0 ? sales / trans : 0;

    // Sort stores by Sales (descending)
    const sortedStores = useMemo(() => {
        return [...liveData.stores].sort((a, b) => b.sales - a.sales);
    }, [liveData.stores]);

    return (
        <div className="min-h-screen bg-black text-white p-3 flex flex-col font-sans max-w-md mx-auto">
            {/* Header & Filter */}
            <div className="flex justify-between items-center mb-4">
                <div className="text-orange-500 font-bold text-[10px] uppercase tracking-widest">
                    ORANGE SALES
                </div>
                <select
                    value={selectedManager}
                    onChange={(e) => setSelectedManager(e.target.value)}
                    className="bg-neutral-900 text-white text-[10px] rounded px-2 py-1 border-none outline-none focus:ring-1 focus:ring-orange-500 max-w-[120px]"
                >
                    <option value="all">All Managers</option>
                    {managersList.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            </div>

            {/* Main Metric: Sales */}
            <div className="flex flex-col items-center mb-4 w-full">
                <span className="text-neutral-400 text-[10px] mb-0.5">Total Sales</span>
                <span className="text-4xl font-black text-white tracking-tight">
                    {formatSAR(sales).replace('SAR', '')}
                </span>
                <span className="text-orange-500 text-[10px] font-bold">SAR</span>
            </div>

            {/* Secondary Metrics: Trans & Avg Basket */}
            <div className="grid grid-cols-2 gap-2 w-full mb-4">
                <div className="bg-neutral-900 rounded-lg p-2 flex flex-col items-center">
                    <span className="text-neutral-500 text-[9px]">Trans</span>
                    <span className="text-lg font-bold">{trans}</span>
                </div>
                <div className="bg-neutral-900 rounded-lg p-2 flex flex-col items-center">
                    <span className="text-neutral-500 text-[9px]">Avg Basket</span>
                    <span className="text-lg font-bold text-blue-400">
                        {avgBasket.toFixed(0)}
                    </span>
                </div>
            </div>

            {/* Store List */}
            <div className="flex-1 overflow-y-auto pb-4 space-y-2">
                <div className="text-[10px] text-neutral-500 font-semibold mb-1 px-1">STORES PERFORMANCE</div>
                {sortedStores.map(store => {
                    const sBasket = store.trans > 0 ? store.sales / store.trans : 0;
                    return (
                        <div key={store.id} className="bg-neutral-900/50 rounded-lg p-2 flex justify-between items-center border border-neutral-800">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white mb-0.5">{store.name}</span>
                                <span className="text-[9px] text-neutral-500">{store.trans} Trans</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-bold text-white">{formatSAR(store.sales).replace('SAR', '')}</span>
                                <span className="text-[9px] text-blue-400">Avg: {sBasket.toFixed(0)}</span>
                            </div>
                        </div>
                    );
                })}
                {sortedStores.length === 0 && (
                    <div className="text-center text-[10px] text-neutral-600 py-4">No stores found</div>
                )}
            </div>

            <div className="mt-2 text-[8px] text-neutral-600 text-center bg-black pt-2 sticky bottom-0">
                Updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    );
}
