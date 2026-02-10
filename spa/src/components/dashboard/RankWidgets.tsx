import React from 'react';
import { RankCard } from '../DashboardComponents';
import { UsersIcon, OfficeBuildingIcon } from '../Icons';

interface RankWidgetsProps {
    topEmployees: any[];
    topStores: any[];
    formatSAR: (val: number) => string;
}

export const RankWidgets: React.FC<RankWidgetsProps> = ({ topEmployees, topStores, formatSAR }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RankCard
                title="أعلى الموظفين (Top Employees)"
                icon={<UsersIcon />}
                metrics={[
                    { key: 'avg_inv', label: 'معدل فاتورة' },
                    { key: 'sales', label: 'بيع' },
                    { key: 'achievement', label: 'تحقيق' },
                ]}
                data={topEmployees}
                format={(v, k) => (k === 'achievement' ? `${Number(v).toFixed(1)}%` : k === 'sales' ? formatSAR(v) : Number(v).toLocaleString())}
                maxItems={10}
            />
            <RankCard
                title="أعلى الفروع (Top Stores)"
                icon={<OfficeBuildingIcon />}
                metrics={[
                    { key: 'avg_inv', label: 'معدل فاتورة' },
                    { key: 'visitors', label: 'زوار' },
                    { key: 'growth', label: 'نمو' },
                    { key: 'achievement', label: 'تحقيق' },
                    { key: 'sales', label: 'بيع' },
                ]}
                data={topStores}
                format={(v, k) => {
                    if (k === 'achievement' || k === 'growth') return `${Number(v).toFixed(1)}%`;
                    if (k === 'sales') return formatSAR(v);
                    return Number(v).toLocaleString();
                }}
                maxItems={10}
            />
        </div>
    );
};
