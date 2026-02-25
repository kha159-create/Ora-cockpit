import React from 'react';
import { GrowthTrajectoryChart } from '../DashboardComponents';

interface SalesChartProps {
    data: any[];
    mode: 'SALES' | 'VISITORS' | 'TARGET';
    onModeChange: (m: 'SALES' | 'VISITORS' | 'TARGET') => void;
    onBarClick?: (dateStr: string) => void;
}

export const SalesChart: React.FC<SalesChartProps> = ({ data, mode, onModeChange, onBarClick }) => {
    return (
        <GrowthTrajectoryChart
            data={data}
            mode={mode}
            onModeChange={onModeChange}
            format={mode === 'VISITORS' ? undefined : (v) => v.toLocaleString()}
            onBarClick={onBarClick}
        />
    );
};
