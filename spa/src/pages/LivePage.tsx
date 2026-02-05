import { useEffect, useMemo, useState } from 'react';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';
import { KPICard } from '../components/DashboardComponents';
import { CurrencyDollarIcon, ReceiptTaxIcon, ChevronDownIcon } from '../components/Icons';
import { getCurrentUser } from '../auth/storage';

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

export default function LivePage() {
  const user = getCurrentUser();
  const [raw, setRaw] = useState<any>(null);
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manager, setManager] = useState<string>('all');
  const [expandedStore, setExpandedStore] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadManagementData(), loadEmployeesData()])
      .then(([m, e]) => {
        setRaw(m);
        setEmpRaw(e);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  const today = useMemo(() => toYMD(new Date()), []);

  const managers = useMemo(() => {
    if (!raw?.store_meta) return [];
    const set = new Set<string>();
    Object.values(raw.store_meta).forEach((m: any) => {
      if (m?.manager && m.manager !== 'online') set.add(String(m.manager));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [raw]);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const todayTotals = useMemo(() => {
    if (!raw) return { sales: 0, trans: 0 };
    const meta = raw.store_meta || {};
    const inRange = (d: string) => String(d).startsWith(today);
    const okStore = (sid: string) =>
      effectiveManager === 'all' || (meta[sid] && String(meta[sid].manager) === effectiveManager);
    let sales = 0, trans = 0;
    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      if (inRange(d) && okStore(sid)) sales += v || 0;
    });
    (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
      if (inRange(d) && okStore(sid)) trans += v || 0;
    });
    return { sales, trans };
  }, [raw, today, effectiveManager]);

  const storeList = useMemo(() => {
    if (!raw?.sales || !raw?.stores) return [];
    const byStore: Record<string, { sales: number; trans: number; employees: Record<string, { sales: number; trans: number; name: string }> }> = {};
    const meta = raw.store_meta || {};
    (raw.sales || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(today)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, employees: {} };
        byStore[sid].sales += v || 0;
      }
    });
    (raw.transactions || []).forEach(([d, sid, v]: any[]) => {
      if (String(d).startsWith(today)) {
        if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, employees: {} };
        byStore[sid].trans += v || 0;
      }
    });

    const historyData: Record<string, any[]> = empRaw?.history || {};
    const names: Record<string, string> = empRaw?.employee_names || {};
    Object.entries(historyData).forEach(([storeCode, records]) => {
      if (!byStore[storeCode]) byStore[storeCode] = { sales: 0, trans: 0, employees: {} };
      for (const rec of records || []) {
        const date = rec?.[0];
        if (!String(date).startsWith(today)) continue;
        const rawId = rec?.[1];
        const sales = Number(rec?.[2]) || 0;
        const trans = Number(rec?.[3]) || 0;
        let id = String(rawId || '').trim();
        let name = id;
        if (id.includes('-')) {
          const [a, b] = id.split('-');
          id = (a || '').trim();
          name = (b || id).trim();
        }
        if (!id || name === 'مرتجع') continue;
        name = names[id] || names[id.padStart(4, '0')] || name;
        if (!byStore[storeCode].employees[id]) byStore[storeCode].employees[id] = { sales: 0, trans: 0, name };
        byStore[storeCode].employees[id].sales += sales;
        byStore[storeCode].employees[id].trans += trans;
      }
    });

    return Object.entries(byStore)
      .filter(([sid]) => {
        const m = meta[sid];
        if (effectiveManager !== 'all' && (!m || String(m.manager) !== effectiveManager)) return false;
        return (byStore[sid].sales > 0 || byStore[sid].trans > 0);
      })
      .map(([sid, v]) => ({
        sid,
        name: raw.stores?.[sid] || sid,
        sales: v.sales,
        trans: v.trans,
        employees: Object.entries(v.employees)
          .map(([id, e]) => ({
            id,
            name: e.name,
            sales: e.sales,
            trans: e.trans,
            avgInv: e.trans > 0 ? e.sales / e.trans : 0,
          }))
          .sort((a, b) => b.sales - a.sales),
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [raw, empRaw, today, effectiveManager]);

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!raw) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
        <h3 className="text-lg font-bold text-neutral-900">متابعة مبيعات اليوم — لايف</h3>
        <p className="text-sm text-neutral-600 mt-1">تاريخ اليوم: {today}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard title="المجموع (اليوم)" value={todayTotals.sales} format={formatSAR} icon={<CurrencyDollarIcon />} />
        <KPICard
          title="الفواتير"
          value={todayTotals.trans}
          format={(v) => Math.round(v).toLocaleString()}
          icon={<ReceiptTaxIcon />}
          trendValue={todayTotals.trans > 0 ? `معدل الفاتورة: ${formatSAR(todayTotals.sales / todayTotals.trans)}` : undefined}
        />
      </div>

      {managers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
          <label className="text-xs font-semibold text-neutral-500 mb-2 block">مدير المنطقة</label>
          <select className="input max-w-xs" value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="all">الكل</option>
            {managers.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {storeList.map((store) => (
          <div
            key={store.sid}
            className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden identity-card"
          >
            <button
              type="button"
              className="w-full p-4 text-right flex items-center justify-between gap-2 hover:bg-neutral-50 transition-colors group"
              onClick={() => setExpandedStore(expandedStore === store.sid ? null : store.sid)}
            >
              <div className="flex items-center gap-2 truncate">
                <div className={`transition-transform duration-200 text-neutral-400 ${expandedStore === store.sid ? 'rotate-180 text-orange-600' : ''}`}>
                  <ChevronDownIcon />
                </div>
                <span className="font-bold text-neutral-900 truncate">{store.name}</span>
              </div>
              <span className="text-orange-600 font-bold shrink-0" dir="ltr">{formatSAR(store.sales)}</span>
            </button>
            {expandedStore === store.sid && store.employees.length > 0 && (
              <div className="border-t border-neutral-200 bg-neutral-50 p-3 space-y-2 max-h-64 overflow-y-auto">
                <div className="text-xs font-semibold text-neutral-500 mb-2">الموظفون — معدل فاتورة / عدد الفواتير</div>
                {store.employees.map((emp) => (
                  <div key={emp.id} className="flex justify-between items-center text-sm py-1 border-b border-neutral-100 last:border-0">
                    <span className="text-neutral-800 truncate ml-2">{emp.name}</span>
                    <span className="shrink-0 text-neutral-600" dir="ltr">
                      {formatSAR(emp.avgInv)} / {Math.round(emp.trans)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
