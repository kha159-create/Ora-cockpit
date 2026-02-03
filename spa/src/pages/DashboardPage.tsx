import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';
import { KPICard, ChartCard, BarChart, RankCard } from '../components/DashboardComponents';
import { ChartPieIcon, CurrencyDollarIcon, ReceiptTaxIcon, UsersIcon, FireIcon, TagIcon, PauseIcon, OfficeBuildingIcon } from '../components/Icons';

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
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('mtd_yest');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const formatSAR = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });

  useEffect(() => {
    Promise.all([loadManagementData(), loadEmployeesData()])
      .then(([m, e]) => {
        setRaw(m);
        setEmpRaw(e);
      })
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

  const topStores = useMemo(() => {
    if (!raw?.sales || !raw?.store_meta) return [];
    const byStore: Record<string, number> = {};
    const inRange = (d: string) => String(d).substring(0, 10) >= range.start && String(d).substring(0, 10) <= range.end;
    (raw.sales || []).forEach(([d, s, v]: any[]) => { if (inRange(d)) byStore[s] = (byStore[s] || 0) + (v || 0); });
    return Object.entries(byStore)
      .map(([sid, sales]) => ({ name: raw.stores?.[sid] || sid, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);
  }, [raw, range.start, range.end]);

  const inRange = useMemo(
    () => (d: string) => {
      const x = String(d).substring(0, 10);
      return x >= range.start && x <= range.end;
    },
    [range.start, range.end],
  );
  const prevRange = useMemo(() => {
    const [y, m] = range.start.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    start.setMonth(start.getMonth() - 1);
    const end = new Date(y, m - 1, 0);
    return { start: toYMD(start), end: toYMD(end) };
  }, [range.start]);
  const inPrevRange = useMemo(
    () => (d: string) => {
      const x = String(d).substring(0, 10);
      return x >= prevRange.start && x <= prevRange.end;
    },
    [prevRange.start, prevRange.end],
  );

  const topStoresRank = useMemo(() => {
    if (!raw?.sales || !raw?.stores) return [];
    const byStore: Record<string, { sales: number; trans: number; visitors: number; target: number; prevSales: number; prevVisitors: number }> = {};
    (raw.sales || []).forEach(([d, s, v]: any[]) => {
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevSales: 0, prevVisitors: 0 };
      if (inRange(d)) byStore[s].sales += v || 0;
      if (inPrevRange(d)) byStore[s].prevSales += v || 0;
    });
    (raw.transactions || []).forEach(([d, s, v]: any[]) => {
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevSales: 0, prevVisitors: 0 };
      if (inRange(d)) byStore[s].trans += v || 0;
    });
    (raw.visitors || []).forEach(([d, s, v]: any[]) => {
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevSales: 0, prevVisitors: 0 };
      if (inRange(d)) byStore[s].visitors += v || 0;
      if (inPrevRange(d)) byStore[s].prevVisitors += v || 0;
    });
    (raw.targets || []).forEach(([d, s, v]: any[]) => {
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevSales: 0, prevVisitors: 0 };
      if (inRange(d)) byStore[s].target += v || 0;
    });
    return Object.entries(byStore).map(([sid, v]) => {
      const growth = v.prevSales > 0 ? ((v.sales - v.prevSales) / v.prevSales) * 100 : 0;
      const achievement = v.target > 0 ? (v.sales / v.target) * 100 : 0;
      const avgInv = v.trans > 0 ? v.sales / v.trans : 0;
      return {
        name: raw.stores?.[sid] || sid,
        sales: v.sales,
        visitors: v.visitors,
        growth,
        achievement,
        avg_inv: avgInv,
      };
    });
  }, [raw, inRange, inPrevRange]);

  const topEmployeesRank = useMemo(() => {
    if (!empRaw?.history || !empRaw?.employee_names) return [];
    const historyData: Record<string, any[]> = empRaw.history;
    const names: Record<string, string> = empRaw.employee_names;
    const targets: Record<string, number> = empRaw.targets || {};
    const norm = (s: unknown) => String(s || '').substring(0, 10);
    const agg: Record<string, { sales: number; trans: number; target: number }> = {};
    for (const records of Object.values(historyData)) {
      for (const rec of records || []) {
        const date = rec?.[0];
        const rawId = rec?.[1];
        const sales = Number(rec?.[2]) || 0;
        const trans = Number(rec?.[3]) || 0;
        if (!norm(date) || norm(date) < range.start || norm(date) > range.end) continue;
        let id = String(rawId || '').trim();
        let name = id;
        if (id.includes('-')) {
          const [a, b] = id.split('-');
          id = (a || '').trim();
          name = (b || id).trim();
        }
        if (!id || name === 'مرتجع') continue;
        name = names[id] || names[id.padStart(4, '0')] || name;
        if (!agg[id]) agg[id] = { sales: 0, trans: 0, target: targets[id] ?? targets[id.padStart(4, '0')] ?? 0 };
        agg[id].sales += sales;
        agg[id].trans += trans;
      }
    }
    return Object.entries(agg).map(([id, v]) => ({
      name: names[id] || names[id.padStart(4, '0')] || id,
      sales: v.sales,
      avg_inv: v.trans > 0 ? v.sales / v.trans : 0,
      achievement: v.target > 0 ? (v.sales / v.target) * 100 : 0,
    }));
  }, [empRaw, range.start, range.end]);

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

      {/* بطاقات الوصول السريع */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Link to="/live" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><FireIcon /></div>
          <div>
            <div className="font-bold text-neutral-900">لايف اليوم</div>
            <div className="text-xs text-neutral-500">متابعة مبيعات اليوم</div>
          </div>
        </Link>
        <Link to="/offers" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><TagIcon /></div>
          <div>
            <div className="font-bold text-neutral-900">تحليل العروض</div>
            <div className="text-xs text-neutral-500">عروض ومبيعات</div>
          </div>
        </Link>
        <Link to="/stagnant" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><PauseIcon /></div>
          <div>
            <div className="font-bold text-neutral-900">المنتجات الراكدة</div>
            <div className="text-xs text-neutral-500">أصناف راكدة</div>
          </div>
        </Link>
        <Link to="/stores" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><OfficeBuildingIcon /></div>
          <div>
            <div className="font-bold text-neutral-900">المعارض</div>
            <div className="text-xs text-neutral-500">تفاصيل الفروع</div>
          </div>
        </Link>
      </div>

      {/* أعلى الموظفين / أعلى الفروع — هوية برتقالي وأسود */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankCard
          title="أعلى الموظفين (Top Employees)"
          metrics={[
            { key: 'avg_inv', label: 'معدل فاتورة' },
            { key: 'sales', label: 'بيع' },
            { key: 'achievement', label: 'تحقيق' },
          ]}
          data={topEmployeesRank}
          format={(v, k) => (k === 'achievement' ? `${Number(v).toFixed(1)}%` : k === 'sales' ? formatSAR(v) : Number(v).toLocaleString())}
          maxItems={10}
        />
        <RankCard
          title="أعلى الفروع (Top Stores)"
          metrics={[
            { key: 'avg_inv', label: 'معدل فاتورة' },
            { key: 'visitors', label: 'زوار' },
            { key: 'growth', label: 'نمو' },
            { key: 'achievement', label: 'تحقيق' },
            { key: 'sales', label: 'بيع' },
          ]}
          data={topStoresRank}
          format={(v, k) => {
            if (k === 'achievement' || k === 'growth') return `${Number(v).toFixed(1)}%`;
            if (k === 'sales') return formatSAR(v);
            return Number(v).toLocaleString();
          }}
          maxItems={10}
        />
      </div>

      {/* أداء المعارض (توب حسب الفترة) */}
      {topStores.length > 0 && (
        <ChartCard title="أعلى المعارض حسب المبيعات (الفترة الحالية)">
          <BarChart data={topStores} dataKey="sales" nameKey="name" format={formatSAR} />
        </ChartCard>
      )}
    </div>
  );
}

