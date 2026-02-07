import React, { useState, useMemo, useCallback } from 'react';

/* ─── types ─── */
export interface CompareEmployee {
  id: string;
  name: string;
  storeName: string;
  sales: number;
  transactions: number;
  avg_ticket: number;
  items_per_inv: number;
  target: number;
  achievement: number;
  max_ticket: number;
  dailyReq: number;
  prevSales: number;
}

interface EmployeeCompareModalProps {
  open: boolean;
  onClose: () => void;
  employees: CompareEmployee[];
}

/* ─── formatting helpers ─── */
const fmtSAR = (val: number) =>
  val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });

const fmtPct = (val: number) => `${val.toFixed(1)}%`;

const fmtNum = (val: number) => val.toLocaleString('en-US');

/* ─── metric row definition ─── */
interface MetricRow {
  label: string;
  valueA: number;
  valueB: number;
  format: (v: number) => string;
  /** true = higher is better (default), false = lower is better */
  higherIsBetter?: boolean;
}

/* ─── comparison bar ─── */
const ComparisonBar: React.FC<{ a: number; b: number; colorA: string; colorB: string }> = React.memo(
  ({ a, b, colorA, colorB }) => {
    const total = Math.abs(a) + Math.abs(b);
    const pctA = total === 0 ? 50 : (Math.abs(a) / total) * 100;
    const pctB = 100 - pctA;

    return (
      <div className="flex h-3 rounded-full overflow-hidden bg-neutral-100 w-full">
        <div
          className="transition-all duration-500 rounded-r-full"
          style={{ width: `${pctA}%`, backgroundColor: colorA }}
        />
        <div
          className="transition-all duration-500 rounded-l-full"
          style={{ width: `${pctB}%`, backgroundColor: colorB }}
        />
      </div>
    );
  },
);

/* ─── single metric row component ─── */
const MetricRowItem: React.FC<{ row: MetricRow }> = React.memo(({ row }) => {
  const { label, valueA, valueB, format, higherIsBetter = true } = row;

  const aWins = higherIsBetter ? valueA > valueB : valueA < valueB;
  const bWins = higherIsBetter ? valueB > valueA : valueB < valueA;
  const tie = valueA === valueB;

  const colorA = tie ? '#f97316' : aWins ? '#10b981' : '#ef4444';
  const colorB = tie ? '#f97316' : bWins ? '#10b981' : '#ef4444';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center py-3 border-b border-neutral-100 last:border-0">
      {/* Value A */}
      <div className="flex items-center justify-between sm:justify-end gap-2 order-2 sm:order-1">
        <span
          className="text-sm font-bold px-2 py-0.5 rounded-md"
          style={{ color: colorA, backgroundColor: `${colorA}15` }}
        >
          {format(valueA)}
        </span>
      </div>

      {/* Label */}
      <div className="text-center order-1 sm:order-2 px-3">
        <span className="text-xs font-semibold text-neutral-500 whitespace-nowrap">{label}</span>
      </div>

      {/* Value B */}
      <div className="flex items-center justify-between sm:justify-start gap-2 order-3">
        <span
          className="text-sm font-bold px-2 py-0.5 rounded-md"
          style={{ color: colorB, backgroundColor: `${colorB}15` }}
        >
          {format(valueB)}
        </span>
      </div>

      {/* Bar — full width */}
      <div className="col-span-1 sm:col-span-3 order-4 mt-1">
        <ComparisonBar a={valueA} b={valueB} colorA={colorA} colorB={colorB} />
      </div>
    </div>
  );
});

/* ─── main modal ─── */
const EmployeeCompareModal: React.FC<EmployeeCompareModalProps> = ({ open, onClose, employees }) => {
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');

  const empA = useMemo(() => employees.find((e) => e.id === idA), [employees, idA]);
  const empB = useMemo(() => employees.find((e) => e.id === idB), [employees, idB]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const growthA = empA && empA.prevSales > 0 ? ((empA.sales - empA.prevSales) / empA.prevSales) * 100 : 0;
  const growthB = empB && empB.prevSales > 0 ? ((empB.sales - empB.prevSales) / empB.prevSales) * 100 : 0;

  const metrics: MetricRow[] = useMemo(() => {
    if (!empA || !empB) return [];
    return [
      { label: 'المبيعات', valueA: empA.sales, valueB: empB.sales, format: fmtSAR },
      { label: 'الفواتير', valueA: empA.transactions, valueB: empB.transactions, format: fmtNum },
      { label: 'معدل الفاتورة', valueA: empA.avg_ticket, valueB: empB.avg_ticket, format: fmtSAR },
      { label: 'أعلى فاتورة', valueA: empA.max_ticket, valueB: empB.max_ticket, format: fmtSAR },
      { label: 'متوسط القطع', valueA: empA.items_per_inv, valueB: empB.items_per_inv, format: (v) => v.toFixed(1) },
      { label: 'التارجت', valueA: empA.target, valueB: empB.target, format: fmtSAR },
      { label: 'نسبة التحقيق', valueA: empA.achievement, valueB: empB.achievement, format: fmtPct },
      { label: 'المطلوب يومياً', valueA: empA.dailyReq, valueB: empB.dailyReq, format: fmtSAR, higherIsBetter: false },
      { label: 'النمو', valueA: growthA, valueB: growthB, format: fmtPct },
    ];
  }, [empA, empB, growthA, growthB]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4"
      onClick={handleBackdrop}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="bg-gradient-to-l from-orange-500 to-orange-600 text-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚖️</span>
              <div>
                <h2 className="text-lg font-bold">مقارنة الموظفين</h2>
                <p className="text-orange-100 text-xs">اختر موظفين للمقارنة بينهما</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="bg-white/20 hover:bg-white/30 transition p-2 rounded-lg text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Selects ── */}
        <div className="p-4 border-b border-neutral-100 bg-neutral-50/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Employee A */}
            <div>
              <label className="block text-xs font-semibold text-orange-600 mb-1">الموظف (أ)</label>
              <select
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none transition"
                value={idA}
                onChange={(e) => setIdA(e.target.value)}
              >
                <option value="">— اختر موظف —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id} disabled={emp.id === idB}>
                    {emp.name} — {emp.storeName}
                  </option>
                ))}
              </select>
            </div>

            {/* Employee B */}
            <div>
              <label className="block text-xs font-semibold text-orange-600 mb-1">الموظف (ب)</label>
              <select
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none transition"
                value={idB}
                onChange={(e) => setIdB(e.target.value)}
              >
                <option value="">— اختر موظف —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id} disabled={emp.id === idA}>
                    {emp.name} — {emp.storeName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-4">
          {empA && empB ? (
            <>
              {/* Names header */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center mb-4">
                <div className="text-center sm:text-right">
                  <span className="inline-block bg-orange-100 text-orange-700 font-bold text-sm px-3 py-1 rounded-full">
                    {empA.name}
                  </span>
                </div>
                <div className="hidden sm:block text-center text-neutral-300 text-lg font-bold">VS</div>
                <div className="text-center sm:text-left">
                  <span className="inline-block bg-orange-100 text-orange-700 font-bold text-sm px-3 py-1 rounded-full">
                    {empB.name}
                  </span>
                </div>
              </div>

              {/* Metrics */}
              <div className="space-y-0">
                {metrics.map((m) => (
                  <MetricRowItem key={m.label} row={m} />
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
              <span className="text-5xl mb-3">👥</span>
              <p className="text-sm">اختر موظفين من القوائم أعلاه لبدء المقارنة</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(EmployeeCompareModal);
