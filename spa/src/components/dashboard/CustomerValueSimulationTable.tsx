import React, { useMemo, useState } from 'react';
import type { StoreData } from './CustomerValueInsights';

type RowOverride = {
  visitors?: number;
  prevVisitors?: number;
  cv?: number;
  prevCv?: number;
};

const formatSAR = (val: number) =>
  val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });

type SortKey = 'name' | 'sales' | 'growth' | 'cv' | 'changeCV' | 'loss';

export const CustomerValueSimulationTable: React.FC<{
  stores: StoreData[];
}> = ({ stores }) => {
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});
  const [tableSort, setTableSort] = useState<SortKey>('loss');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');

  const baseRows = useMemo(() => {
    return stores.map((s) => {
      const cv = s.customerValue ?? (s.visitors > 0 ? s.sales / s.visitors : 0);
      const prevCV = s.prevCustomerValue ?? (s.prevYearVisitors && s.prevYearVisitors > 0 ? (s.prevYearSales ?? 0) / s.prevYearVisitors : 0);
      return { ...s, cv, prevCV };
    });
  }, [stores]);

  const computed = useMemo(() => {
    return baseRows.map((s) => {
      const o = overrides[s.id] || {};
      const v = o.visitors ?? s.visitors;
      const pv = o.prevVisitors ?? (s.prevYearVisitors ?? 0);
      const cv = o.cv ?? s.cv;
      const prevCv = o.prevCv ?? s.prevCV;
      const simSales = cv * v;
      const simPrevSales = prevCv * pv;
      const growth = simPrevSales > 0 ? ((simSales - simPrevSales) / simPrevSales) * 100 : 0;
      const changePct = prevCv > 0 ? ((cv - prevCv) / prevCv) * 100 : 0;
      const loss = prevCv > 0 && cv < prevCv ? (prevCv - cv) * v : 0;
      const gain = prevCv > 0 && cv > prevCv ? (cv - prevCv) * v : 0;
      const avgInv = s.trans > 0 ? simSales / s.trans : 0;
      return {
        ...s,
        v,
        pv,
        cv,
        prevCv,
        simSales,
        simPrevSales,
        growth,
        changePct,
        loss,
        gain,
        avgInv,
      };
    });
  }, [baseRows, overrides]);

  const sorted = useMemo(() => {
    const mult = tableSortDir === 'asc' ? 1 : -1;
    const rows = [...computed];
    rows.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      if (tableSort === 'name') {
        return mult * String(a.name).localeCompare(String(b.name), 'ar');
      }
      if (tableSort === 'sales') {
        va = a.simSales;
        vb = b.simSales;
      } else if (tableSort === 'growth') {
        va = a.growth;
        vb = b.growth;
      } else if (tableSort === 'cv') {
        va = a.cv;
        vb = b.cv;
      } else if (tableSort === 'changeCV') {
        va = a.changePct;
        vb = b.changePct;
      } else {
        va = a.loss;
        vb = b.loss;
      }
      return mult * (Number(va) - Number(vb));
    });
    return rows;
  }, [computed, tableSort, tableSortDir]);

  const setO = (id: string, patch: Partial<RowOverride>) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleSort = (key: SortKey) => {
    if (tableSort === key) setTableSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setTableSort(key);
      setTableSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const clearAll = () => setOverrides({});

  if (!stores.length) return null;

  return (
    <div className="rounded-xl border border-dashed border-orange-300 bg-orange-50/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-orange-200 bg-orange-50">
        <h3 className="text-sm font-bold text-orange-900">جدول المحاكاة (تعديل الزوار وقيمة العميل)</h3>
        <button type="button" onClick={clearAll} className="text-xs font-bold text-orange-700 hover:underline">
          إعادة ضبط الكل
        </button>
      </div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-right border-collapse min-w-[900px]">
          <thead className="sticky top-0 bg-orange-600 text-white z-10">
            <tr>
              <th className="th-table cursor-pointer hover:bg-orange-700" onClick={() => handleSort('name')}>الفرع</th>
              <th className="th-table cursor-pointer hover:bg-orange-700" onClick={() => handleSort('sales')}>مبيعات (محاكاة)</th>
              <th className="th-table">مبيعات (السنة الماضية محاكاة)</th>
              <th className="th-table cursor-pointer hover:bg-orange-700" onClick={() => handleSort('growth')}>النمو %</th>
              <th className="th-table">متوسط الفاتورة</th>
              <th className="th-table">زوار (حالي) ✎</th>
              <th className="th-table">زوار (الماضي) ✎</th>
              <th className="th-table">قيمة عميل (حالي) ✎</th>
              <th className="th-table">قيمة عميل (الماضي) ✎</th>
              <th className="th-table cursor-pointer hover:bg-orange-700" onClick={() => handleSort('changeCV')}>التغيير بقيمة العميل %</th>
              <th className="th-table cursor-pointer hover:bg-orange-700" onClick={() => handleSort('loss')}>الخسارة / الزيادة (ر.س)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="border-b border-neutral-100 hover:bg-white/80">
                <td className="td-table font-semibold text-neutral-900">{row.name}</td>
                <td className="td-table font-bold text-emerald-700" dir="ltr">{formatSAR(row.simSales)}</td>
                <td className="td-table text-neutral-600" dir="ltr">{formatSAR(row.simPrevSales)}</td>
                <td className={`td-table font-bold ${row.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`} dir="ltr">
                  {row.growth >= 0 ? '+' : ''}{row.growth.toFixed(1)}%
                </td>
                <td className="td-table" dir="ltr">{formatSAR(row.avgInv)}</td>
                <td className="td-table p-1">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="input w-full text-xs py-1 max-w-[100px] dir-ltr"
                    value={Math.round(row.v)}
                    onChange={(e) => setO(row.id, { visitors: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="td-table p-1">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="input w-full text-xs py-1 max-w-[100px] dir-ltr"
                    value={Math.round(row.pv)}
                    onChange={(e) => setO(row.id, { prevVisitors: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="td-table p-1">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="input w-full text-xs py-1 max-w-[90px] dir-ltr"
                    value={Math.round(row.cv)}
                    onChange={(e) => setO(row.id, { cv: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="td-table p-1">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="input w-full text-xs py-1 max-w-[90px] dir-ltr"
                    value={Math.round(row.prevCv)}
                    onChange={(e) => setO(row.id, { prevCv: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className={`td-table font-bold ${row.changePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`} dir="ltr">
                  {row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(1)}%
                </td>
                <td className={`td-table font-bold ${row.gain > 0 ? 'text-emerald-600' : row.loss > 0 ? 'text-red-600' : 'text-neutral-500'}`} dir="ltr">
                  {row.gain > 0 ? `+${formatSAR(row.gain)}` : row.loss > 0 ? `-${formatSAR(row.loss)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`
        .th-table { padding: 10px 12px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .td-table { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
      `}</style>
    </div>
  );
};
