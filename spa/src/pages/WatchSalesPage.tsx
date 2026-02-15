import React, { useMemo, useEffect } from 'react';
import { useLiveSalesData } from '../hooks/useLiveSalesData';
import { formatSAR } from '../utils/formatting';

export default function WatchSalesPage() {
    const { calculateLiveData } = useLiveSalesData();

    // Auto-refresh every 60s for watch
    const [tick, setTick] = React.useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 60000);
        return () => clearInterval(t);
    }, []);

    const { liveData } = useMemo(() => {
        return calculateLiveData('all');
    }, [calculateLiveData, tick]);

    const { sales, trans, target } = liveData.totals;
    const achievement = target > 0 ? (sales / target) * 100 : 0;
    const isTargetMet = achievement >= 100;

    return (
        <div className="min-h-screen bg-black text-white p-2 flex flex-col items-center justify-center font-sans">
            {/* Header */}
            <div className="text-orange-500 font-bold text-xs uppercase tracking-widest mb-2">
                ORANGE SALES
            </div>

            {/* Main Metric: Sales */}
            <div className="flex flex-col items-center mb-4 w-full">
                <span className="text-neutral-400 text-[10px] mb-0.5">Today's Sales</span>
                <span className="text-3xl font-black text-white tracking-tight">
                    {formatSAR(sales).replace('SAR', '')}
                </span>
                <span className="text-orange-500 text-[10px] font-bold">SAR</span>
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-[200px] mb-3">
                <div className="bg-neutral-900 rounded-lg p-2 flex flex-col items-center">
                    <span className="text-neutral-500 text-[9px]">Trans</span>
                    <span className="text-lg font-bold">{trans}</span>
                </div>
                <div className="bg-neutral-900 rounded-lg p-2 flex flex-col items-center">
                    <span className="text-neutral-500 text-[9px]">Achieved</span>
                    <span className={`text-lg font-bold ${isTargetMet ? 'text-green-500' : 'text-red-500'}`}>
                        {achievement.toFixed(1)}%
                    </span>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-[200px] h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                    className={`h-full ${isTargetMet ? 'bg-green-500' : 'bg-gradient-to-r from-orange-600 to-amber-500'}`}
                    style={{ width: `${Math.min(achievement, 100)}%` }}
                />
            </div>

            <div className="mt-4 text-[9px] text-neutral-600">
                Updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    );
}
