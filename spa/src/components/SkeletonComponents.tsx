import React from 'react';

export const SkeletonPulse = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <div className={`animate-pulse bg-neutral-200 rounded ${className}`} style={style} />
);

export const SkeletonCard = () => (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 flex flex-col gap-3 h-[120px]">
        <div className="flex items-center justify-between">
            <SkeletonPulse className="h-4 w-24" />
            <SkeletonPulse className="h-8 w-8 rounded-full" />
        </div>
        <SkeletonPulse className="h-8 w-32 mt-auto" />
        <SkeletonPulse className="h-4 w-16" />
    </div>
);

export const SkeletonChart = ({ height = 'h-[350px]' }: { height?: string }) => (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 ${height} flex flex-col gap-4`}>
        <div className="flex justify-between items-center">
            <SkeletonPulse className="h-6 w-48" />
            <SkeletonPulse className="h-8 w-24 rounded-lg" />
        </div>
        <div className="flex-1 flex items-end gap-2 px-2 pb-2">
            {[...Array(12)].map((_, i) => (
                <SkeletonPulse key={i} className={`flex-1 rounded-t-lg`} style={{ height: `${Math.random() * 60 + 20}%` }} />
            ))}
        </div>
    </div>
);

export const SkeletonTable = ({ rows = 5 }: { rows?: number }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex gap-4">
            <SkeletonPulse className="h-8 w-32" />
            <SkeletonPulse className="h-8 w-full max-w-xs ml-auto" />
        </div>
        <div className="p-4 space-y-4">
            <div className="flex gap-4 mb-4">
                <SkeletonPulse className="h-6 w-1/4" />
                <SkeletonPulse className="h-6 w-1/4" />
                <SkeletonPulse className="h-6 w-1/4" />
                <SkeletonPulse className="h-6 w-1/4" />
            </div>
            {[...Array(rows)].map((_, i) => (
                <div key={i} className="flex gap-4">
                    <SkeletonPulse className="h-12 w-full rounded-lg" />
                </div>
            ))}
        </div>
    </div>
);

export const DashboardSkeleton = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-2">
                <SkeletonPulse className="h-8 w-64" />
                <SkeletonPulse className="h-4 w-48" />
            </div>
            <div className="flex gap-2">
                <SkeletonPulse className="h-10 w-32 rounded-lg" />
                <SkeletonPulse className="h-10 w-32 rounded-lg" />
            </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[...Array(4)].map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SkeletonChart />
            <SkeletonChart />
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                <SkeletonTable rows={5} />
            </div>
            <div className="lg:col-span-1">
                <SkeletonChart height="h-[400px]" />
            </div>
        </div>
    </div>
);
