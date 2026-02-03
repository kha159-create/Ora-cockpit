import React, { useEffect, useMemo, useState } from 'react';
import { loadManagementData } from '../services/upstreamData';
import { KPICard } from '../components/DashboardComponents';
import { ChartPieIcon, CurrencyDollarIcon, ReceiptTaxIcon, UsersIcon } from '../components/Icons';

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

export default function LivePage() {
  const [raw, setRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadManagementData()
      .then(setRaw)
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  const today = useMemo(() => toYMD(new Date()), []);

  const todayTotals = useMemo(() => {
    if (!raw) return { sales: 0, trans: 0, visitors: 0, target: 0 };
    let sales = 0, trans = 0, visitors = 0, target = 0;
    (raw.sales || []).forEach(([d, _s, v]: any[]) => { if (String(d).startsWith(today)) sales += (v || 0); });
    (raw.transactions || []).forEach(([d, _s, v]: any[]) => { if (String(d).startsWith(today)) trans += (v || 0); });
    (raw.visitors || []).forEach(([d, _s, v]: any[]) => { if (String(d).startsWith(today)) visitors += (v || 0); });
    (raw.targets || []).forEach(([d, _s, v]: any[]) => { if (String(d).startsWith(today)) target += (v || 0); });
    return { sales, trans, visitors, target };
  }, [raw, today]);

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!raw) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  const ach = todayTotals.target > 0 ? (todayTotals.sales / todayTotals.target) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
        <h3 className="text-lg font-bold text-neutral-900">متابعة مبيعات اليوم — لايف</h3>
        <p className="text-sm text-neutral-600 mt-1">تاريخ اليوم: {today}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="المبيعات (اليوم)" value={todayTotals.sales} format={formatSAR} icon={<CurrencyDollarIcon />} />
        <KPICard title="الفواتير" value={todayTotals.trans} format={(v) => Math.round(v).toLocaleString()} icon={<ReceiptTaxIcon />} />
        <KPICard title="الزوار" value={todayTotals.visitors} format={(v) => Math.round(v).toLocaleString()} icon={<UsersIcon />} />
        <KPICard
          title="تحقيق الهدف"
          value={ach}
          format={(v) => `${v.toFixed(1)}%`}
          icon={<ChartPieIcon />}
          showProgress
          progressValue={ach}
          trend="neutral"
          trendValue={`الهدف: ${formatSAR(todayTotals.target)}`}
        />
      </div>
    </div>
  );
}
