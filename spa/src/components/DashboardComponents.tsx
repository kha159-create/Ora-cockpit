import React, { useEffect, useMemo, useRef, useState } from 'react';
import './DashboardComponents.css';

// --- Reusable UI Components ---
const Sparkline: React.FC<{ data: number[] }> = ({ data }) => {
  if (!data || data.length < 2) return null;
  const width = 100;
  const height = 30;
  const padding = 2;
  const maxVal = Math.max(...data);
  const minVal = Math.min(...data);
  const range = maxVal - minVal;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((d - minVal) / (range || 1)) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const isUpward = data.length > 1 && data[data.length - 1] > data[0];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8">
      <polyline fill="none" stroke={isUpward ? '#10b981' : '#ef4444'} strokeWidth="2" points={points} />
    </svg>
  );
};

// مكون شريط التقدم الدائري
export const CircularProgress: React.FC<{ percentage: number; size?: number }> = ({ percentage, size = 60 }) => {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="circular-progress" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} className="circular-progress-bg" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="circular-progress-fill"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          style={{
            strokeDasharray: `${strokeDasharray} ${strokeDasharray}`,
            strokeDashoffset: strokeDashoffset,
          }}
        />
      </svg>
      <div className="circular-progress-text text-neutral-900 font-bold">{Math.round(percentage)}%</div>
    </div>
  );
};

// مكون مؤشر الاتجاه
const TrendIndicator: React.FC<{ trend: 'up' | 'down' | 'neutral'; value?: string }> = ({ trend, value }) => {
  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return '↗';
      case 'down':
        return '↘';
      default:
        return '→';
    }
  };

  return (
    <div className={`flex items-center gap-1 text-xs font-semibold ${getTrendColor()}`}>
      <span className="text-lg">{getTrendIcon()}</span>
      {value && <span>{value}</span>}
    </div>
  );
};

export const KPICard: React.FC<{
  title: string;
  value: number;
  format?: (val: number) => string;
  comparisonValue?: number;
  comparisonLabel?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  trendData?: number[];
  showProgress?: boolean;
  progressValue?: number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  subtitle?: string; // New prop for secondary metric
  compactTarget?: boolean;
}> = ({
  title,
  value,
  format,
  comparisonValue,
  comparisonLabel,
  icon,
  onClick,
  trendData,
  showProgress = false,
  progressValue = 0,
  trend = 'neutral',
  trendValue,
  subtitle,
  compactTarget = false,
}) => {
    const isPositive = comparisonValue !== undefined && value >= comparisonValue;
    const formattedValue =
      format && typeof value === 'number' ? format(value) : (value?.toLocaleString() || 0);

    return (
      <button
        onClick={onClick}
        disabled={!onClick}
        className="modern-kpi-card group p-2 sm:p-3 flex flex-col w-full h-full disabled:cursor-default text-right relative overflow-hidden"
      >
        {/* تأثير الخلفية المتحرك */}
        <div className="kpi-card-background" />

        {/* المحتوى الرئيسي */}
        <div className="relative z-10 flex-1 flex flex-col justify-between">
          {/* الرأس - العنوان */}
          <div className="flex justify-between items-start mb-2">
            <h3 className="kpi-title text-xs sm:text-sm text-neutral-500 font-semibold">{title}</h3>
            {showProgress && trendValue && <TrendIndicator trend={trend} value={trendValue} />}
          </div>

          {/* الجسم - تقسيم: أيقونة يمين، قيمة يسار */}
          <div className="flex items-center justify-between px-1">
            {/* اليمين: الأيقونة */}
            {icon && (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-orange-50 border border-orange-100/50 text-orange-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                <div className="w-5 h-5 sm:w-6 sm:h-6">{icon}</div>
              </div>
            )}

            {/* اليسار: القيمة */}
            <div className="flex flex-col items-end justify-center flex-1 pl-3">
              <div className="text-xl sm:text-3xl font-bold text-neutral-900 leading-tight dir-ltr font-mono tracking-tight">
                {formattedValue}
              </div>
              {subtitle && <div className="text-[10px] text-neutral-400 font-medium">{subtitle}</div>}
            </div>
          </div>

          {/* التذييل comparison */}
          <div className="mt-3 border-t border-neutral-100/50 pt-2 flex flex-col gap-1">
            {comparisonValue !== undefined && !showProgress && (
              <>
                <div className={`text-xs font-bold flex items-center justify-end gap-1 dir-ltr ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                  <span>{isPositive ? '▲' : '▼'}</span>
                  <span>
                    {(() => {
                      const diff = value - comparisonValue;
                      const pct = comparisonValue > 0 ? ((diff / comparisonValue) * 100) : 0;
                      const diffFormatted = format ? format(Math.abs(diff)) : Math.abs(diff).toLocaleString();
                      return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% (${diffFormatted})`;
                    })()}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 truncate mt-1">
                  {comparisonLabel || 'السنة الماضية'}: <span className="dir-ltr inline-block font-bold text-neutral-700">{format ? format(comparisonValue) : comparisonValue.toLocaleString()}</span>
                </div>
              </>
            )}

            {showProgress && !compactTarget && (
              <div className="flex items-center gap-3 justify-end">
                <CircularProgress percentage={progressValue} size={40} />
                <div className="text-xs font-bold text-neutral-900">
                  {comparisonValue !== undefined && (
                    <span className="dir-ltr">{format ? format(value) : value.toLocaleString()} / {format ? format(comparisonValue) : comparisonValue.toLocaleString()}</span>
                  )}
                </div>
              </div>
            )}

            {showProgress && compactTarget && (
              <div className="flex flex-col items-center justify-center">
                <CircularProgress percentage={progressValue} size={50} />
              </div>
            )}
            {trendData && trendData.length > 1 && !showProgress && comparisonValue === undefined && (
              <div className="mt-auto">
                <Sparkline data={trendData} />
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

export const ChartCard: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  watermark?: string;
  watermarkOpacity?: number;
  icon?: React.ReactNode;
}> = ({ title, children, className = '', watermark, watermarkOpacity = 0.1, icon }) => (
  <div
    className={`bg-white p-3 md:p-4 rounded-xl shadow-md border border-neutral-200 h-full flex flex-col transition-all duration-300 hover:shadow-lg hover:border-orange-200 ${className}`}
  >
    <div className="text-sm md:text-base font-bold text-neutral-800 mb-2 border-b border-neutral-100 pb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span>{title}</span>
      </div>
      {watermark && watermarkOpacity > 0.1 && <span className="text-xs font-normal text-orange-500 ml-2">{watermark}</span>}
    </div>
    <div className="flex-grow relative">{children}</div>
  </div>
);

/** بطاقة أعلى N مع تبديل المقاييس — هوية برتقالي/أسود */
export type RankMetric = { key: string; label: string };
export const RankCard: React.FC<{
  title: string;
  metrics: RankMetric[];
  data: { name: string;[key: string]: string | number }[];
  format?: (val: number, metricKey?: string) => string;
  maxItems?: number;
}> = ({ title, metrics, data, format = (v) => v.toLocaleString(), maxItems = 10 }) => {
  const [metric, setMetric] = useState(metrics[0]?.key ?? '');
  const key = metric || metrics[0]?.key;
  const list = useMemo(() => {
    if (!key || !data.length) return [];
    const sorted = [...data].sort((a, b) => (Number(b[key] || 0)) - (Number(a[key] || 0)));
    return sorted.slice(0, maxItems);
  }, [data, key, maxItems]);
  const maxVal = useMemo(() => (list.length ? Math.max(...list.map((i) => Number(i[key] || 0)), 1) : 1), [list, key]);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-5 h-full flex flex-col identity-card">
      <h3 className="text-lg font-bold text-neutral-800 mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2 mb-4">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${metric === m.key
              ? 'bg-orange-500 text-white shadow-md'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {/* توب 10: الرقم على اليسار، الاسم على اليمين، الشريط والأرقام متناسقين مع حجم البطاقة */}
      <div className="flex-grow space-y-4 overflow-auto min-h-0">
        {list.map((item, idx) => {
          const value = Number(item[key] || 0);
          const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
          return (
            <div key={`${item.name}-${idx}`} className="flex items-center gap-2 sm:gap-4 flex-row-reverse">
              <span className="text-sm sm:text-base font-bold text-neutral-800 w-20 sm:w-24 shrink-0 text-right tabular-nums" dir="ltr">
                {format(value, key)}
              </span>
              <div className="flex-1 min-w-0 h-4 sm:h-5 bg-neutral-200 rounded-full overflow-hidden hidden xs:block">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-300"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="text-xs sm:text-base font-medium text-neutral-700 truncate min-w-0 flex-1 text-right" title={item.name}>
                {idx + 1}- {item.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Tooltip: React.FC<{ content: string; x: number; y: number }> = ({ content, x, y }) => (
  <div
    className="absolute p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg pointer-events-none z-50"
    style={{ left: x, top: y, transform: 'translate(-50%, -110%)' }}
    dangerouslySetInnerHTML={{ __html: content }}
  />
);

export const VerticalBarChart: React.FC<{
  data: any[];
  dataKey: string;
  nameKey: string;
  targetKey?: string;
  format?: (val: number) => string;
}> = ({ data, dataKey, nameKey, targetKey, format }) => {
  if (!data || data.length === 0) return <div className="flex items-center justify-center h-full text-neutral-500">No data</div>;

  const allVals = data.flatMap(d => [Number(d[dataKey] || 0), targetKey ? Number(d[targetKey] || 0) : 0]);
  const maxVal = Math.max(...allVals, 1);

  return (
    <div className="w-full h-full flex items-end justify-between gap-2 px-2 pb-8 pt-4">
      {data.map((item, idx) => {
        const val = Number(item[dataKey] || 0);
        const target = targetKey ? Number(item[targetKey] || 0) : 0;
        const valPct = (val / maxVal) * 100;
        const targetPct = targetKey ? (target / maxVal) * 100 : 0;

        return (
          <div key={idx} className="flex-1 flex flex-col items-center group relative h-full">
            <div className="flex-1 w-full bg-neutral-50 rounded-lg relative flex items-end justify-center overflow-hidden">
              {/* Target line if exists */}
              {targetKey && (
                <div
                  className="absolute w-full border-t-2 border-dashed border-neutral-400 z-10"
                  style={{ bottom: `${targetPct}%` }}
                />
              )}
              {/* Main Bar */}
              <div
                className="w-4/5 bg-gradient-to-t from-orange-600 to-orange-400 rounded-t-md transition-all duration-500 relative group-hover:from-orange-700 group-hover:to-orange-500 shadow-sm"
                style={{ height: `${Math.max(valPct, 2)}%` }}
              >
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-neutral-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-20 transition-opacity">
                  {format ? format(val) : val.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 w-full text-center">
              <span className="text-[10px] font-bold text-neutral-500 truncate block px-1">
                {item[nameKey]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const GrowthTrajectoryChart: React.FC<{
  data: { name: string; Current: number; Previous: number }[];
  mode: 'SALES' | 'VISITORS' | 'TARGET';
  onModeChange: (m: 'SALES' | 'VISITORS' | 'TARGET') => void;
  format?: (val: number) => string;
}> = ({ data, mode, onModeChange, format }) => {
  const maxVal = Math.max(...data.flatMap(d => [d.Current, d.Previous]), 1);
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  // Dynamic labels based on mode
  const getLabels = () => {
    if (mode === 'TARGET') {
      return {
        currentLabel: 'المبيعات',
        currentSubLabel: 'Sales',
        prevLabel: 'الهدف',
        prevSubLabel: 'Target',
        tooltipCompare: 'vs Target'
      };
    } else if (mode === 'VISITORS') {
      return {
        currentLabel: `زوار ${currentYear}`,
        currentSubLabel: 'Current Visitors',
        prevLabel: `زوار ${prevYear}`,
        prevSubLabel: 'Previous Visitors',
        tooltipCompare: `vs ${prevYear}`
      };
    } else {
      return {
        currentLabel: `${currentYear} الحالي`,
        currentSubLabel: 'Current Year',
        prevLabel: `${prevYear} السابق`,
        prevSubLabel: 'Previous Year',
        tooltipCompare: `vs ${prevYear}`
      };
    }
  };

  const labels = getLabels();

  const formatY = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
    return v.toString();
  };

  const ySteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="growth-chart-container bg-white rounded-3xl md:rounded-[2.5rem] shadow-2xl border border-neutral-100 p-4 md:p-8 w-full relative group/chart mt-6 overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-slate-50 rounded-full -ml-32 -mb-32 blur-3xl opacity-50 pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-10 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-6 w-1.5 bg-gradient-to-b from-orange-400 to-orange-600 rounded-full shadow-sm shadow-orange-200" />
            <span className="text-[11px] font-black text-neutral-400 tracking-[0.25em] uppercase">
              {mode === 'TARGET' ? 'Target Achievement' : mode === 'VISITORS' ? 'Visitors Trend' : 'Growth Trajectory'}
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex flex-wrap items-baseline gap-2">
            {mode === 'TARGET' ? 'تحقيق الهدف الشهري' : mode === 'VISITORS' ? 'مؤشر الزوار الشهري' : ''}
            <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-100 whitespace-nowrap">Live Analytics</span>
          </h2>
        </div>

        <div className="flex flex-col items-end gap-5 w-full md:w-auto">
          <div className="flex bg-neutral-100/80 backdrop-blur-sm p-1.5 rounded-2xl border border-neutral-200/50 shadow-inner w-full md:w-auto overflow-x-auto touch-pan-x">
            {(['SALES', 'VISITORS', 'TARGET'] as const).map(m => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`flex-1 px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all duration-300 whitespace-nowrap ${mode === m
                  ? 'bg-white text-orange-600 shadow-lg shadow-orange-100 scale-[1.02]'
                  : 'text-neutral-400 hover:text-neutral-600 hover:bg-white/50'
                  }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex gap-8 px-2 text-right hidden md:flex">
            <div className="flex items-center gap-3 group/legend flex-row-reverse">
              <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 shadow-sm shadow-orange-200 group-hover/legend:scale-125 transition-transform" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-900 tracking-tight uppercase leading-none">{labels.currentLabel}</span>
                <span className="text-sm font-bold text-neutral-400 uppercase tracking-tighter">{labels.currentSubLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 group/legend flex-row-reverse">
              <div className={`w-3.5 h-3.5 rounded-full shadow-sm group-hover/legend:scale-125 transition-transform ${mode === 'TARGET' ? 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-200' : 'bg-gradient-to-br from-slate-700 to-slate-900 shadow-slate-200'}`} />
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-900 tracking-tight uppercase leading-none">{labels.prevLabel}</span>
                <span className="text-sm font-bold text-neutral-400 uppercase tracking-tighter">{labels.prevSubLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative h-96 flex gap-2 md:gap-4 mt-4">
        {/* Y Axis - Fixed */}
        <div className="flex flex-col justify-between text-[10px] font-black text-neutral-400 z-10 py-2 pb-14 h-full shrink-0">
          {ySteps.slice().reverse().map(s => (
            <div key={s} className="flex items-center gap-2 group/y">
              <span className="bg-white/80 backdrop-blur-xs pr-2 min-w-[30px] text-right group-hover/y:text-orange-500 transition-colors uppercase tracking-tighter">
                {formatY(maxVal * s)}
              </span>
              <div className="w-1 h-px bg-neutral-200 group-hover/y:w-2 group-hover/y:bg-orange-300 transition-all hidden md:block" />
            </div>
          ))}
        </div>

        {/* Scrollable Chart Area - Added pt-14 for tooltip space */}
        <div className="flex-1 overflow-x-auto pb-2 pt-14 scrollbar-hide touch-pan-x">
          <div className="flex flex-col h-full min-w-[600px] md:min-w-0 relative">
            <div className="flex-1 relative border-b-2 border-slate-100">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none py-2">
                {ySteps.map(s => (
                  <div key={s} className="w-full border-t border-dashed border-neutral-100 group-hover/chart:border-neutral-200/50 transition-colors" />
                ))}
              </div>

              <div className="absolute inset-0 flex items-end justify-around px-2 md:px-8">
                {data.map((d, i) => {
                  const curPct = (d.Current / maxVal) * 100;
                  const prevPct = (d.Previous / maxVal) * 100;
                  const growth = mode === 'TARGET'
                    ? (d.Previous > 0 ? (d.Current / d.Previous) * 100 : 0)
                    : (d.Previous > 0 ? ((d.Current - d.Previous) / d.Previous) * 100 : 0);

                  return (
                    <div key={i} className="flex items-end gap-1.5 group/bar relative h-full w-full justify-center max-w-[80px]">
                      {/* Current Bar (Orange) */}
                      <div
                        className="w-3 md:w-4 bg-gradient-to-t from-orange-600 to-orange-400 rounded-t-lg transition-all duration-700 ease-out hover:brightness-110 cursor-pointer relative z-10 shadow-[0_-4px_12px_rgba(249,115,22,0.1)] group-hover/bar:scale-x-110"
                        style={{ height: `${Math.max(curPct, 2)}%` }}
                      >
                        <div className="absolute inset-0 bg-white/20 opacity-0 hover:opacity-100 transition-opacity rounded-t-lg" />
                      </div>

                      {/* Tooltip */}
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md text-white p-2 md:p-3 rounded-xl md:rounded-2xl opacity-0 hover:opacity-100 group-hover/bar:opacity-100 transition-all duration-300 pointer-events-none z-50 whitespace-nowrap shadow-2xl border border-white/10 min-w-[120px] md:min-w-[160px] text-right">
                        <div className="text-[9px] md:text-[10px] font-black text-orange-400 mb-1 tracking-widest uppercase border-b border-white/10 pb-1">{d.name}</div>
                        {/* Tooltip content */}
                        <div className="flex justify-between items-center mb-0.5 md:mb-1">
                          <span className="text-[8px] md:text-[9px] text-neutral-400">{labels.currentLabel}:</span>
                          <span className="text-sm md:text-base font-black">{format ? format(d.Current) : d.Current.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center mb-0.5 md:mb-1">
                          <span className="text-[8px] md:text-[9px] text-neutral-400">{labels.prevLabel}:</span>
                          <span className="text-sm md:text-base font-bold text-slate-400">{format ? format(d.Previous) : d.Previous.toLocaleString()}</span>
                        </div>
                        <div className={`text-[9px] md:text-[10px] font-bold mt-1 md:mt-2 pt-1 border-t border-white/10 flex items-center justify-end gap-1 ${mode === 'TARGET' ? (growth >= 100 ? 'text-green-400' : 'text-red-400') : (growth >= 0 ? 'text-green-400' : 'text-red-400')}`}>
                          {mode === 'TARGET' ? (
                            <span>{growth.toFixed(1)}% تحقيق</span>
                          ) : (
                            <span>{growth >= 0 ? '+' : ''}{growth.toFixed(1)}% {growth >= 0 ? '↗' : '↘'}</span>
                          )}
                        </div>
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-slate-900/95"></div>
                      </div>

                      {/* Previous/Target Bar (Dark or Blue) */}
                      <div
                        className={`w-3 md:w-4 rounded-t-lg transition-all duration-700 ease-out hover:brightness-125 cursor-pointer relative z-10 ${mode === 'TARGET'
                          ? 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-[0_-4px_12px_rgba(59,130,246,0.1)]'
                          : 'bg-gradient-to-t from-slate-900 to-slate-700 shadow-[0_-4px_12px_rgba(15,23,42,0.1)]'
                          } group-hover/bar:scale-x-110`}
                        style={{ height: `${Math.max(prevPct, 2)}%` }}
                      >
                        <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity rounded-t-lg" />
                      </div>

                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 md:w-1.5 h-1 md:h-1.5 bg-slate-200 rounded-full group-hover/bar:bg-orange-400 group-hover/bar:scale-150 transition-all opacity-0 md:opacity-100" />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-around pt-6 px-2 md:px-8">
              {data.map((d, i) => (
                <span key={i} className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-tighter w-full text-center hover:text-slate-900 transition-colors cursor-default">{d.name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


export const BarChart: React.FC<{ data: any[]; dataKey: string; nameKey: string; format?: (val: number) => string }> = ({
  data,
  dataKey,
  nameKey,
  format,
}) => {
  if (!data || data.length === 0) return <div className="flex items-center justify-center h-full text-neutral-500">No data to display</div>;
  const maxValue = Math.max(...data.map((item) => item[dataKey] || 0));
  if (maxValue === 0) return <div className="flex items-center justify-center h-full text-neutral-500">No data to display</div>;

  return (
    <div className="w-full h-full flex flex-col space-y-3">
      {data.map((item, index) => {
        const value = item[dataKey] || 0;
        const percentage = (value / maxValue) * 100;

        return (
          <div
            key={`${item[nameKey]}-${index}`}
            className="group relative"
            title={`${item[nameKey]}: ${format ? format(value) : value}`}
          >
            {/* التسمية */}
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-neutral-700 truncate pr-2">{item[nameKey]}</span>
              <span className="text-sm font-bold text-neutral-900 whitespace-nowrap">
                {format ? format(value) : value.toLocaleString()}
              </span>
            </div>

            {/* شريط التقدم */}
            <div className="relative h-4 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-500 ease-out relative group-hover:from-orange-500 group-hover:to-orange-700"
                style={{ width: `${Math.max(percentage, 2)}%` }}
              >
                {/* تأثير اللمعان */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const PieChart: React.FC<{
  data: { name: string; value: number; count?: number }[];
  onSliceClick?: (name: string) => void;
  vertical?: boolean;
}> = ({ data, onSliceClick, vertical = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null);
  if (!data || data.length === 0) return <div className="flex items-center justify-center h-full text-zinc-500">No data to display</div>;

  const total = data.reduce((acc, item) => acc + item.value, 0);
  if (total === 0) return <div className="flex items-center justify-center h-full text-zinc-500">No data to display</div>;

  const colors = ['#f97316', '#3b82f6', '#6366f1', '#14b8a6', '#f59e0b', '#84cc16', '#ef4444', '#8b5cf6', '#ec4899', '#22d3ee'];
  let cumulativeAngle = 0;

  const getCoords = (angle: number, radius: number = 50) => [50 + radius * Math.cos(angle), 50 + radius * Math.sin(angle)];

  if (vertical) {
    return (
      <div className="w-full h-full flex flex-col items-center gap-6" ref={containerRef}>
        {/* الرسم البياني في الأعلى */}
        <div className="w-64 h-64 relative flex-shrink-0">
          {tooltip && <Tooltip {...tooltip} />}
          <svg viewBox="0 0 100 100" className="w-full h-full" onMouseLeave={() => setTooltip(null)}>
            {data.map((item, index) => {
              const angle = (item.value / total) * 2 * Math.PI;
              const startAngle = cumulativeAngle;
              cumulativeAngle += angle;
              const endAngle = cumulativeAngle;

              const [startX, startY] = getCoords(startAngle, 40);
              const [endX, endY] = getCoords(endAngle, 40);
              const largeArcFlag = angle > Math.PI ? 1 : 0;

              const pathData = `M 50,50 L ${startX},${startY} A 40,40 0 ${largeArcFlag},1 ${endX},${endY} z`;

              return (
                <path
                  key={item.name}
                  d={pathData}
                  fill={colors[index % colors.length]}
                  className={onSliceClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                  onClick={() => onSliceClick && onSliceClick(item.name)}
                  onMouseMove={(e) => {
                    if (!containerRef.current) return;
                    const containerRect = containerRef.current.getBoundingClientRect();
                    const x = e.clientX - containerRect.left;
                    const y = e.clientY - containerRect.top;
                    setTooltip({ content: `${item.name}: ${((item.value / total) * 100).toFixed(1)}%`, x, y });
                  }}
                />
              );
            })}
          </svg>
        </div>
        {/* الأرقام والنسب في الأسفل */}
        <div className="w-full flex-grow overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.slice(0, 10).map((item, index) => (
              <div
                key={item.name}
                className="bg-neutral-50 p-3 rounded-lg border border-neutral-200 hover:bg-neutral-100 transition-all duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 rounded-full shadow-sm flex-shrink-0" style={{ backgroundColor: colors[index % colors.length] }}></div>
                  <span className="text-sm font-semibold text-neutral-800 truncate" title={item.name}>
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-neutral-600">Value:</span>
                  <span className="text-sm font-bold text-neutral-900">
                    {item.value.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-xs text-neutral-600">Share:</span>
                  <span className="text-sm font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">
                    {((item.value / total) * 100).toFixed(1)}%
                  </span>
                </div>
                {item.count !== undefined && (
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-xs text-neutral-600">Count:</span>
                    <span className="text-sm font-bold text-neutral-900">{item.count.toLocaleString('en-US')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {data.length > 10 && (
            <div className="text-xs text-neutral-400 mt-3 p-2 bg-neutral-50 rounded-lg text-center">
              ... و {data.length - 10} عناصر أخرى
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col md:flex-row items-center justify-between gap-4" ref={containerRef}>
      <div className="w-48 h-48 relative flex-shrink-0">
        {tooltip && <Tooltip {...tooltip} />}
        <svg viewBox="0 0 100 100" onMouseLeave={() => setTooltip(null)}>
          {data.map((item, index) => {
            const angle = (item.value / total) * 2 * Math.PI;
            const startAngle = cumulativeAngle;
            cumulativeAngle += angle;
            const endAngle = cumulativeAngle;

            const [startX, startY] = getCoords(startAngle, 40);
            const [endX, endY] = getCoords(endAngle, 40);
            const largeArcFlag = angle > Math.PI ? 1 : 0;

            const pathData = `M 50,50 L ${startX},${startY} A 40,40 0 ${largeArcFlag},1 ${endX},${endY} z`;

            return (
              <path
                key={item.name}
                d={pathData}
                fill={colors[index % colors.length]}
                className={onSliceClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                onClick={() => onSliceClick && onSliceClick(item.name)}
                onMouseMove={(e) => {
                  if (!containerRef.current) return;
                  const containerRect = containerRef.current.getBoundingClientRect();
                  const x = e.clientX - containerRect.left;
                  const y = e.clientY - containerRect.top;
                  setTooltip({ content: `${item.name}: ${((item.value / total) * 100).toFixed(1)}%`, x, y });
                }}
              />
            );
          })}
        </svg>
      </div>
      <div className="flex-grow overflow-y-auto h-full w-full">
        <ul className="space-y-2">
          {data.slice(0, 10).map((item, index) => (
            <li key={item.name} className="flex items-center text-sm group hover:bg-neutral-50 p-2 rounded-lg transition-all duration-200">
              <div className="w-4 h-4 rounded-full mr-3 shadow-sm" style={{ backgroundColor: colors[index % colors.length] }}></div>
              <span className="text-neutral-700 flex-grow font-medium whitespace-nowrap" title={item.name}>
                {item.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">{item.value.toLocaleString()}</span>
                <span className="font-bold text-neutral-900 bg-neutral-100 px-2 py-1 rounded-md text-xs">
                  {((item.value / total) * 100).toFixed(1)}%
                </span>
              </div>
            </li>
          ))}
          {data.length > 10 && (
            <li className="text-xs text-neutral-400 mt-3 p-2 bg-neutral-50 rounded-lg text-center">
              ... و {data.length - 10} عناصر أخرى
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export const LineChart: React.FC<{ data: { name: string;[key: string]: any }[] }> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null);

  const keys = useMemo(() => {
    if (!data || data.length === 0) return [];
    return Object.keys(data[0]).filter((k) => typeof data[0][k] === 'number' && k !== 'monthIndex');
  }, [data]);

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => new Set(keys));

  useEffect(() => {
    setVisibleKeys(new Set(keys));
  }, [keys]);

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-neutral-500">No data available</div>;
  }

  const colors: { [key: string]: string } = {
    Sales: '#10b981',
    Target: '#a78bfa',
    totalSales: '#f97316',
    effectiveTarget: '#3b82f6',
    targetAchievement: '#8b5cf6',
    Current: '#f97316', // Orange for current
    Previous: '#3b82f6', // Blue for previous
    CurrentVisitors: '#10b981', // Green for current visitors
    PreviousVisitors: '#6366f1', // Indigo for previous visitors
    'المبيعات': '#ea580c', // Orange for Sales (Arabic)
  };

  const width = 800;
  const height = 300;
  const padding = { top: 30, right: 30, bottom: 40, left: 50 };

  const allValues = data.flatMap((d) => keys.filter((k) => visibleKeys.has(k)).map((k) => d[k] as number));
  const maxVal = allValues.length > 0 ? Math.max(...allValues, 1) : 1;
  const yTicks = 5;

  const getPathData = (key: string) => {
    if (data.length < 2) return '';
    const points = data.map((item, i) => {
      const x = padding.left + i * ((width - padding.left - padding.right) / (data.length - 1));
      const y = height - padding.bottom - ((item[key] as number) / maxVal) * (height - padding.top - padding.bottom);
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGElement>) => {
    if (!containerRef.current) return;
    const svg = e.currentTarget;
    const point = new DOMPoint(e.clientX, e.clientY);
    const transformedPoint = point.matrixTransform((svg.getScreenCTM() as DOMMatrix).inverse());

    const index = Math.min(
      data.length - 1,
      Math.max(0, Math.round(((transformedPoint.x - padding.left) / (width - padding.left - padding.right)) * (data.length - 1))),
    );

    if (index >= 0 && index < data.length) {
      const item = data[index];
      const tooltipContent = `<div class="font-bold mb-1">${item.name}</div>${keys
        .filter((k) => visibleKeys.has(k))
        .map(
          (key) => `
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center">
                       <span class="w-2 h-2 rounded-full mr-1.5" style="background-color: ${colors[key]}"></span>
                       <span>${key}:</span>
                    </div>
                    <span class="font-semibold">${(item[key] as number).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
            `,
        )
        .join('')}`;

      const containerRect = containerRef.current.getBoundingClientRect();
      setTooltip({ content: tooltipContent, x: e.clientX - containerRect.left, y: e.clientY - containerRect.top });
    }
  };

  const toggleKey = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="w-full h-full flex flex-col" ref={containerRef}>
      <div className="flex flex-wrap items-center gap-2 mb-4 px-2">
        {keys.map((key) => (
          <button
            key={key}
            onClick={() => toggleKey(key)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${visibleKeys.has(key)
              ? 'bg-neutral-100 text-neutral-800 ring-1 ring-neutral-200'
              : 'bg-transparent text-neutral-400 hover:bg-neutral-50'
              }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: visibleKeys.has(key) ? colors[key] : '#e5e7eb' }}
            />
            {key}
          </button>
        ))}
      </div>

      <div className="relative flex-grow w-full overflow-x-auto overflow-y-hidden">
        {/* Using a fixed minimum width to ensure chart readability on small screens */}
        <div className="min-w-[600px] h-full">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>
            {/* Grid Lines and Y-Axis */}
            {Array.from({ length: yTicks }).map((_, i) => {
              const y = height - padding.bottom - (i * (height - padding.top - padding.bottom)) / (yTicks - 1);
              const val = (maxVal / (yTicks - 1)) * i;
              return (
                <g key={i} className="text-gray-400">
                  <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="currentColor">
                    {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
                  </text>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity="0.2"
                    strokeDasharray="2 2"
                  />
                </g>
              );
            })}

            {/* X-Axis */}
            {data.map((item, i) => (
              <text
                key={item.name}
                x={padding.left + (i * (width - padding.left - padding.right)) / Math.max(1, data.length - 1)}
                y={height - padding.bottom + 15}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {item.name}
              </text>
            ))}

            {/* Lines */}
            {keys.filter((k) => visibleKeys.has(k)).map((key) => (
              <path
                key={key}
                d={getPathData(key)}
                fill="none"
                stroke={colors[key] || '#000'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={key.toLowerCase() === 'target' ? '6 6' : 'none'}
                className="transition-all duration-300"
              />
            ))}

            <rect x={padding.left} y={padding.top} width={width - padding.left - padding.right} height={height - padding.top - padding.bottom} fill="transparent" onMouseMove={handleMouseMove} />
          </svg>
        </div>
        {tooltip && <Tooltip {...tooltip} />}
      </div>
    </div>
  );
};

export const DetailedComparisonCard: React.FC<{
  title: string;
  current: number;
  previous: number;
  isPercentage?: boolean;
  watermark?: string;
  watermarkOpacity?: number;
}> = ({ title, current, previous, isPercentage, watermark, watermarkOpacity = 0.1 }) => {
  const format = (val: number) => {
    if (isPercentage) return `${val.toFixed(1)}%`;
    if (val >= 1000) {
      return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
    }
    return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const difference = current - previous;
  const percentageChange = previous !== 0 ? (difference / Math.abs(previous)) * 100 : current > 0 ? 100 : 0;
  const isPositive = difference >= 0;

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-zinc-500">{title}</p>
        {watermark && watermarkOpacity > 0.1 && <span className="text-xs font-normal text-orange-500">{watermark}</span>}
      </div>
      <p className="text-2xl font-bold text-zinc-900 mt-1">{format(current)}</p>
      <div className="text-xs text-zinc-400">vs {format(previous)} last year</div>
      <div className={`mt-2 flex items-center text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '▲' : '▼'}
        <span className="ml-1">{format(Math.abs(difference))}</span>
        <span className="ml-2">({Math.abs(percentageChange).toFixed(1)}%)</span>
      </div>
    </div>
  );
};

export const AchievementBar: React.FC<{ percentage: number }> = ({ percentage }) => {
  const cappedPercentage = Math.min(Math.max(percentage, 0), 100);

  const getBarColor = () => {
    if (cappedPercentage < 60) return 'from-orange-300 to-orange-400';
    if (cappedPercentage < 80) return 'from-orange-400 to-orange-500';
    if (cappedPercentage < 95) return 'from-orange-500 to-orange-600';
    return 'from-orange-600 to-orange-700';
  };

  const getTextColor = () => {
    if (cappedPercentage < 60) return 'text-red-600';
    if (cappedPercentage < 80) return 'text-yellow-600';
    if (cappedPercentage < 95) return 'text-blue-600';
    return 'text-green-600';
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 relative">
        {/* خلفية الشريط */}
        <div className="w-full bg-neutral-200 rounded-full h-4 overflow-hidden">
          {/* شريط التقدم */}
          <div
            className={`h-full bg-gradient-to-r ${getBarColor()} rounded-full transition-all duration-700 ease-out relative`}
            style={{ width: `${Math.max(cappedPercentage, 2)}%` }}
          >
            {/* تأثير اللمعان */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
          </div>
        </div>

        {/* مؤشر النسبة */}
        <div className="absolute top-0 h-3 w-0.5 bg-white shadow-sm" style={{ left: `${cappedPercentage}%` }} />
      </div>

      {/* النسبة المئوية */}
      <div className={`text-sm font-bold ${getTextColor()} min-w-[2.5rem] text-right`}>{percentage.toFixed(1)}%</div>
    </div>
  );
};

export const ProductValueAnalysis: React.FC<{
  duvetKing?: { breakdown: any[] };
  duvetFull?: { breakdown: any[] };
  pillow?: { breakdown: any[] };
  title?: string;
}> = ({ duvetKing, duvetFull, pillow, title = 'تحليل مبيعات الأصناف (Product Analysis)' }) => (
  <div className="space-y-6">
    <h3 className="text-lg font-bold text-neutral-800 border-b pb-2 mb-4">{title}</h3>

    {duvetKing && duvetKing.breakdown.length > 0 && (
      <div>
        <h4 className="text-sm font-bold text-neutral-800 mb-2 pb-1 border-b">لحافات كينج</h4>
        <div className="space-y-2">
          {duvetKing.breakdown.map((it) => (
            <div key={it.name}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-neutral-600">{it.name}</span>
                <span className="font-bold text-neutral-900">{it.units.toLocaleString()} وحدة ({it.percentage.toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-2">
                <div className="bg-orange-500 h-full rounded-full" style={{ width: `${it.percentage}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {duvetFull && duvetFull.breakdown.length > 0 && (
      <div className="pt-2">
        <h4 className="text-sm font-bold text-neutral-800 mb-2 pb-1 border-b">لحافات فل</h4>
        <div className="space-y-2">
          {duvetFull.breakdown.map((it) => (
            <div key={it.name}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-neutral-600">{it.name}</span>
                <span className="font-bold text-neutral-900">{it.units.toLocaleString()} وحدة ({it.percentage.toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-2">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${it.percentage}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {pillow && pillow.breakdown.length > 0 && (
      <div className="pt-2">
        <h4 className="text-sm font-bold text-neutral-800 mb-2 pb-1 border-b">مخدات</h4>
        <div className="space-y-2">
          {pillow.breakdown.map((it) => (
            <div key={it.name}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-neutral-600">{it.name}</span>
                <span className="font-bold text-neutral-900">{it.units.toLocaleString()} وحدة ({it.percentage.toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-2">
                <div className="bg-green-600 h-full rounded-full" style={{ width: `${it.percentage}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export const MissedOpportunities: React.FC<{
  data: any[];
  title?: string;
  onRowClick?: (row: any) => void;
}> = ({ data, title = 'الفرص الضائعة (Missed Opportunities)', onRowClick }) => (
  <div className="flex flex-col h-full">
    <h3 className="text-lg font-bold text-neutral-800 border-b pb-2 mb-4">{title}</h3>
    <div className="overflow-y-auto flex-grow pr-1 custom-scrollbar">
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-neutral-400 italic">لا توجد بيانات متاحة</div>
      ) : (
        <div className="space-y-3">
          {data.slice(0, 50).map((row, idx) => (
            <div
              key={idx}
              onClick={() => onRowClick && onRowClick(row)}
              className={`p-3 rounded-xl border border-neutral-100 hover:border-orange-300 hover:bg-orange-50 transition-all cursor-pointer ${onRowClick ? 'group' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-bold text-neutral-900 group-hover:text-orange-700">{row.name || row.item_name || row.id}</span>
                <span className="text-xs font-bold px-2 py-0.5 bg-orange-100 text-orange-700 rounded-lg">{row.total_count || row.count}</span>
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500 font-medium">
                <span>{row.category || 'صنف غير محدد'}</span>
                {row.reason && <span className="text-red-500">{row.reason}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

