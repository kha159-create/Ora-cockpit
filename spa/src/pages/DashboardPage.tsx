import React, { useEffect, useMemo, useState } from 'react';
import { loadManagementData } from '../services/upstreamData';
import { KPICard } from '../components/DashboardComponents';
import { ChartPieIcon, CurrencyDollarIcon, ReceiptTaxIcon, UsersIcon } from '../components/Icons';

type Mode = 'mtd_yest' | 'yesterday' | 'today' | 'custom';

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDefaultRange(mode: Mode) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const startOfMonth = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
  if (mode === 'today') return { start: toYMD(today), end: toYMD(today) };
  if (mode === 'yesterday') return { start: toYMD(yesterday), end: toYMD(yesterday) };
  if (mode === 'mtd_yest') return { start: toYMD(startOfMonth), end: toYMD(yesterday) };
  return { start: toYMD(startOfMonth), end: toYMD(yesterday) };
}

export default function DashboardPage() {
  const [raw, setRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('mtd_yest');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const formatSAR = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });

  useEffect(() => {
    loadManagementData()
      .then(setRaw)
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  useEffect(() => {
    if (mode !== 'custom') {
      const r = getDefaultRange(mode);
      setCustomStart(r.start);
      setCustomEnd(r.end);
    } else if (!customStart || !customEnd) {
      const r = getDefaultRange('mtd_yest');
      setCustomStart(customStart || r.start);
      setCustomEnd(customEnd || r.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const range = useMemo(() => {
    if (mode === 'custom') return { start: customStart, end: customEnd };
    return getDefaultRange(mode);
  }, [mode, customStart, customEnd]);

  const totals = useMemo(() => {
    if (!raw) return { sales: 0, trans: 0, visitors: 0, target: 0 };
    const inRange = (d: string) => {
      const x = String(d).substring(0, 10);
      return x >= range.start && x <= range.end;
    };
    let sales = 0, trans = 0, visitors = 0, target = 0;
    (raw.sales || []).forEach(([d, _s, v]: any[]) => { if (inRange(d)) sales += (v || 0); });
    (raw.transactions || []).forEach(([d, _s, v]: any[]) => { if (inRange(d)) trans += (v || 0); });
    (raw.visitors || []).forEach(([d, _s, v]: any[]) => { if (inRange(d)) visitors += (v || 0); });
    (raw.targets || []).forEach(([d, _s, v]: any[]) => { if (inRange(d)) target += (v || 0); });
    return { sales, trans, visitors, target };
  }, [raw, range.start, range.end]);

  if (err) {
    return <div className="p-6 bg-white rounded-xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  }
  if (!raw) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  const ach = totals.target > 0 ? (totals.sales / totals.target) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفترة</div>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="mtd_yest">من بداية الشهر إلى أمس</option>
              <option value="yesterday">أمس فقط</option>
              <option value="today">اليوم</option>
              <option value="custom">فترة مخصصة</option>
            </select>
          </div>

          {mode === 'custom' && (
            <>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">من</div>
                <input className="input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">إلى</div>
                <input className="input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}

          <div className="text-sm font-semibold text-neutral-700 ms-auto">
            {range.start} → {range.end}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="المبيعات" value={totals.sales} format={formatSAR} icon={<CurrencyDollarIcon />} />
        <KPICard title="الفواتير" value={totals.trans} format={(v) => Math.round(v).toLocaleString()} icon={<ReceiptTaxIcon />} />
        <KPICard title="الزوار" value={totals.visitors} format={(v) => Math.round(v).toLocaleString()} icon={<UsersIcon />} />
        <KPICard
          title="تحقيق الهدف"
          value={ach}
          format={(v) => `${v.toFixed(1)}%`}
          icon={<ChartPieIcon />}
          showProgress
          progressValue={ach}
          trend="neutral"
          trendValue={`الهدف: ${formatSAR(totals.target)}`}
        />
      </div>
    </div>
  );
}

