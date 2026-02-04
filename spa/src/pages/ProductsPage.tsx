import React, { useEffect, useMemo, useState } from 'react';
import { loadManagementData, loadProductAnalysisData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { BarChart, ChartCard, KPICard, LineChart } from '../components/DashboardComponents';
import { CubeIcon, CurrencyDollarIcon, ReceiptTaxIcon, UsersIcon, XIcon } from '../components/Icons';

type PeriodMode = 'mtd' | '7d' | '14d' | '30d' | 'yest';
type Metric = 'qty' | 'val';

function safeNum(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

type CategoryRow = {
  category: string;
  qty: number;
  amount: number;
  sharePercent: number;
  topItemId: string;
  topItemName: string;
  topItemQty: number;
  topItemAmount: number;
};

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  qty: number;
  amount: number;
  trend?: string;
  trendReason?: string;
};

function PeriodButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${active
        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white border-orange-500 shadow'
        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-orange-50'
        }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-5xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  if (!open) return null;
  return (
    <div className="modal-center-screen" onClick={onClose}>
      <div className={`modal-content ${maxWidthClass} my-4`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xl font-bold text-neutral-900 truncate">{title}</div>
          </div>
          <button className="btn-secondary py-2 px-3 flex items-center gap-2" onClick={onClose}>
            <XIcon /> إغلاق
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const user = getCurrentUser();
  const [raw, setRaw] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<PeriodMode>('mtd');
  const [metric, setMetric] = useState<Metric>('qty');

  const [manager, setManager] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [store, setStore] = useState<string>('all');

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);

  const [missedOpen, setMissedOpen] = useState(false);
  const [missedRow, setMissedRow] = useState<any>(null);

  useEffect(() => {
    Promise.all([loadProductAnalysisData(), loadManagementData()])
      .then(([p, m]) => {
        setRaw(p);
        setMgmt(m);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  // --- Helpers for price categorization ---
  const getSmartDuvetCategories = () => ({
    low: { min: 99, max: 400, label: 'Standard (99-400)' },
    medium: { min: 401, max: 700, label: 'Premium (401-700)' },
    high: { min: 701, max: Infinity, label: 'Luxury (700+)' }
  });

  const getSmartDuvetFullCategories = () => ({
    low: { min: 99, max: 350, label: 'Standard (99-350)' },
    medium: { min: 351, max: 550, label: 'Premium (351-550)' },
    high: { min: 551, max: Infinity, label: 'Luxury (550+)' }
  });

  const getSmartPillowCategories = () => ({
    low: { min: 39, max: 120, label: 'Economy (39-120)' },
    medium: { min: 121, max: 250, label: 'Comfort (121-250)' },
    high: { min: 251, max: Infinity, label: 'Premium (250+)' }
  });

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const derived = useMemo(() => {
    if (!raw || !mgmt) return null;

    const storeMeta: Record<string, any> = mgmt.store_meta || {};
    const storesMap: Record<string, string> = mgmt.stores || {};

    const pData = raw.periods?.[mode] || null;
    const analysis: Record<string, any> = (pData?.analysis || {}) as any;
    const catalog: Record<string, any[]> = (pData?.catalog || {}) as any;
    const missedByStore: Record<string, any[]> = (pData?.missed_opportunities || {}) as any;
    const marketBasketAll: Record<string, any[]> = raw.market_basket || {};
    const dailyHistory: Record<string, any[]> = raw.product_daily_history || {};

    const isStoreAccessible = (sid: string) => {
      if (isAdminOrAuditor(user?.role)) return true;
      const meta = storeMeta[sid];
      return meta && meta.manager === user?.name;
    };

    const accessibleStoreIds = new Set<string>(
      Object.keys(analysis).filter((sid) => isStoreAccessible(sid)),
    );

    // Build manager + city + store options from the data we actually have for this period
    const managersSet = new Set<string>();
    const citiesSet = new Set<string>();
    const storeOptions: { id: string; name: string; manager: string; city: string }[] = [];
    for (const sid of Object.keys(analysis)) {
      if (!accessibleStoreIds.has(sid)) continue;
      const meta = storeMeta[sid] || {};
      const mgr = String(meta.manager || '');
      const cityVal = String(meta.city || '');
      if (mgr) managersSet.add(mgr);
      if (cityVal) citiesSet.add(cityVal);
      storeOptions.push({
        id: sid,
        name: analysis[sid]?.store_name || storesMap[sid] || meta.name || sid,
        manager: mgr,
        city: cityVal,
      });
    }
    storeOptions.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const managers = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const cities = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ar'));

    // Filter store options by manager and city (admin) or lock to manager (non-admin)
    const allowedStoreIds = new Set<string>();
    for (const s of storeOptions) {
      if (!accessibleStoreIds.has(s.id)) continue;
      if (effectiveManager !== 'all' && s.manager !== effectiveManager) continue;
      if (city !== 'all' && s.city !== city) continue;
      allowedStoreIds.add(s.id);
    }

    const activeStore = store !== 'all' ? store : 'all';
    const storeInScope = (sid: string) => {
      if (!allowedStoreIds.has(sid)) return false;
      if (activeStore !== 'all') return String(sid) === String(activeStore);
      return true;
    };

    // ===== Aggregate categories from analysis =====
    const catMap = new Map<string, { qty: number; amount: number; top: any }>();
    let totalQty = 0;
    let totalAmt = 0;
    let totalStores = 0;

    Object.entries(analysis).forEach(([sid, storeObj]) => {
      if (!storeInScope(sid)) return;
      totalStores += 1;
      const categories: any[] = storeObj?.categories || [];
      categories.forEach((c) => {
        const catName = String(c.category || 'Uncategorized');
        const qty = safeNum(c.qty);
        const amount = safeNum(c.amount);
        totalQty += qty;
        totalAmt += amount;

        const prev = catMap.get(catName) || { qty: 0, amount: 0, top: null as any };
        prev.qty += qty;
        prev.amount += amount;

        // Merge "top item" by chosen metric (qty or amount)
        const topCandidate = {
          top_item_id: String(c.top_item_id || ''),
          top_item_name: String(c.top_item_name || ''),
          top_item_qty: safeNum(c.top_item_qty),
          top_item_amount: safeNum(c.top_item_amount),
        };

        const prevTop = prev.top;
        const candidateScore = metric === 'qty' ? topCandidate.top_item_qty : topCandidate.top_item_amount;
        const prevScore = prevTop ? (metric === 'qty' ? safeNum(prevTop.top_item_qty) : safeNum(prevTop.top_item_amount)) : -1;
        if (!prevTop || candidateScore > prevScore) prev.top = topCandidate;

        catMap.set(catName, prev);
      });
    });

    const denom = metric === 'qty' ? Math.max(1, totalQty) : Math.max(1, totalAmt);
    const categoriesAgg: CategoryRow[] = Array.from(catMap.entries()).map(([category, data]) => {
      const sharePercent = ((metric === 'qty' ? data.qty : data.amount) / denom) * 100;
      return {
        category,
        qty: data.qty,
        amount: data.amount,
        sharePercent,
        topItemId: data.top?.top_item_id || '',
        topItemName: data.top?.top_item_name || '',
        topItemQty: safeNum(data.top?.top_item_qty),
        topItemAmount: safeNum(data.top?.top_item_amount),
      };
    });

    categoriesAgg.sort((a, b) => (metric === 'qty' ? b.qty - a.qty : b.amount - a.amount));

    // ===== Catalog (products list) =====
    const catalogRows: CatalogItem[] = [];
    Object.entries(catalog).forEach(([catName, items]) => {
      if (!Array.isArray(items)) return;
      for (const it of items) {
        const id = String(it?.id || '');
        const name = String(it?.name || id);
        const stores = it?.stores || {};

        let qty = 0;
        let amount = 0;
        if (activeStore === 'all') {
          for (const [sid, st] of Object.entries(stores)) {
            if (!storeInScope(String(sid))) continue;
            qty += safeNum((st as any)?.q);
            amount += safeNum((st as any)?.a);
          }
        } else {
          const st = stores?.[activeStore];
          qty = safeNum(st?.q);
          amount = safeNum(st?.a);
        }

        if (qty === 0 && amount === 0) continue;
        catalogRows.push({
          id,
          name,
          category: String(catName),
          qty,
          amount,
          trend: it?.trend,
          trendReason: it?.trend_reason,
        });
      }
    });

    const q = search.trim().toLowerCase();
    const catFilter = selectedCategory;
    let filteredCatalog = catalogRows;
    if (catFilter !== 'all') filteredCatalog = filteredCatalog.filter((r) => r.category === catFilter);
    if (q) filteredCatalog = filteredCatalog.filter((r) => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    filteredCatalog.sort((a, b) => (metric === 'qty' ? b.qty - a.qty : b.amount - a.amount));

    // ===== Market basket =====
    const basket = activeStore === 'all' ? (marketBasketAll['all'] || []) : (marketBasketAll[activeStore] || []);

    // ===== Product details =====
    const selectedHistory = productId ? (dailyHistory[productId] || []) : [];
    const selectedPairs = (() => {
      if (!productId) return [];
      const pairs = basket.filter((p) => String(p.item_a_id) === productId || String(p.item_b_id) === productId);
      pairs.sort((a, b) => safeNum(b.frequency) - safeNum(a.frequency));
      return pairs.slice(0, 10);
    })();

    // ===== Product Analysis (Duvet, Pillow) =====
    const resolveUnitPrice = (it: any) => {
      let qty = 0;
      let amount = 0;
      const stores = it?.stores || {};
      for (const [sid, st] of Object.entries(stores)) {
        if (!storeInScope(String(sid))) continue;
        qty += safeNum((st as any)?.q);
        amount += safeNum((st as any)?.a);
      }
      return qty > 0 ? amount / qty : 0;
    };

    const analyzeCategory = (items: any[], getCats: () => any) => {
      const cats = getCats();
      const labels = [cats.low.label, cats.medium.label, cats.high.label];
      const buckets: Record<string, number> = { [labels[0]]: 0, [labels[1]]: 0, [labels[2]]: 0 };
      let totalUnits = 0;

      items.forEach(it => {
        const p = resolveUnitPrice(it);
        if (p <= 0) return;
        let label = null;
        if (p >= cats.low.min && p <= cats.low.max) label = cats.low.label;
        else if (p >= cats.medium.min && p <= cats.medium.max) label = cats.medium.label;
        else if (p >= cats.high.min) label = cats.high.label;

        if (label) {
          const qty = Object.entries(it.stores || {}).reduce((s, [sid, st]: any) => storeInScope(sid) ? s + safeNum(st.q) : s, 0);
          buckets[label] += qty;
          totalUnits += qty;
        }
      });

      return {
        totalUnits,
        breakdown: labels.map(l => ({ name: l, units: buckets[l], percentage: totalUnits > 0 ? (buckets[l] / totalUnits) * 100 : 0 }))
      };
    };

    const duvetKingAnalysis = analyzeCategory(catalog['Duvet (King)'] || catalog['Duvets'] || [], getSmartDuvetCategories);
    const duvetFullAnalysis = analyzeCategory(catalog['Duvet Full'] || catalog['Duvets Full'] || [], getSmartDuvetFullCategories);
    const pillowAnalysis = analyzeCategory(catalog['Pillows'] || [], getSmartPillowCategories);

    return {
      dateRangeLabel: pData?.date_range || '-',
      managers,
      cities,
      storeOptions,
      allowedStoreIds,
      categoriesAgg,
      totals: { totalQty, totalAmt, totalStores, productsCount: filteredCatalog.length },
      catalogCategories: Object.keys(catalog).sort((a, b) => a.localeCompare(b, 'ar')),
      filteredCatalog,
      basket,
      selectedHistory,
      selectedPairs,
      storesMap,
      duvetKingAnalysis,
      duvetFullAnalysis,
      pillowAnalysis,
    };
  }, [city, effectiveManager, mgmt, mode, productId, raw, search, selectedCategory, store, metric, user?.name, user?.role]);

  const productKpis = useMemo(() => {
    if (!derived || !productId) return null;
    const hist = [...derived.selectedHistory].map((h: any) => ({
      date: String(h.date || ''),
      qty: safeNum(h.qty),
      amount: safeNum(h.amount),
    }));
    hist.sort((a, b) => a.date.localeCompare(b.date));
    const best = [...hist].sort((a, b) => b.amount - a.amount)[0] || null;
    const worst = [...hist].sort((a, b) => a.amount - b.amount)[0] || null;
    const zeroDays = hist.filter((h) => h.qty === 0).length;
    const totalQty = hist.reduce((s, h) => s + h.qty, 0);
    const totalAmt = hist.reduce((s, h) => s + h.amount, 0);
    const avgAmt = hist.length ? totalAmt / hist.length : 0;
    const chart = hist.map((h) => ({ name: h.date.substring(5), Qty: h.qty, Amount: h.amount }));
    return { best, worst, zeroDays, totalQty, totalAmt, avgAmt, chart };
  }, [derived, productId]);

  if (err) {
    return <div className="p-6 bg-white rounded-xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  }
  if (!derived) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  const metricLabel = metric === 'qty' ? '📦 الكمية' : '💰 القيمة';

  return (
    <div className="space-y-6 relative min-h-[400px]">
      {/* Controls */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <PeriodButton active={mode === 'mtd'} label="📅 الشهر الحالي" onClick={() => setMode('mtd')} />
            <PeriodButton active={mode === '7d'} label="7 أيام" onClick={() => setMode('7d')} />
            <PeriodButton active={mode === '14d'} label="14 يوم" onClick={() => setMode('14d')} />
            <PeriodButton active={mode === '30d'} label="30 يوم" onClick={() => setMode('30d')} />
            <PeriodButton active={mode === 'yest'} label="⏳ أمس" onClick={() => setMode('yest')} />
          </div>

          <div className="text-sm font-semibold text-neutral-700">{derived.dateRangeLabel}</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
          <div className={`${isAdminOrAuditor(user?.role) ? '' : 'hidden'}`}>
            <div className="text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</div>
            <select className="input" value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value="all">الكل</option>
              {derived.managers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {(derived.cities || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">المعرض</div>
            <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="all">🏪 كل المعارض</option>
              {derived.storeOptions
                .filter((s) => (effectiveManager === 'all' ? true : s.manager === effectiveManager) && (city === 'all' ? true : s.city === city))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">العرض</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`btn-secondary py-2 px-3 ${metric === 'qty' ? 'ring-2 ring-orange-200' : ''}`}
                onClick={() => setMetric('qty')}
              >
                📦 الكمية
              </button>
              <button
                type="button"
                className={`btn-secondary py-2 px-3 ${metric === 'val' ? 'ring-2 ring-orange-200' : ''}`}
                onClick={() => setMetric('val')}
              >
                💰 القيمة
              </button>
              <button type="button" className="btn-primary py-2 px-3 ms-auto" onClick={() => setCatalogOpen(true)}>
                📂 تصفح الأقسام
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-neutral-500 mb-1">بحث عن منتج</div>
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم المنتج أو Item ID..." />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="عدد المعارض في النطاق" value={derived.totals.totalStores} format={(v) => Math.round(v).toLocaleString()} icon={<UsersIcon />} />
        <KPICard title="إجمالي الكمية" value={derived.totals.totalQty} format={(v) => Math.round(v).toLocaleString()} icon={<CubeIcon />} />
        <KPICard title="إجمالي القيمة" value={derived.totals.totalAmt} format={formatSAR} icon={<CurrencyDollarIcon />} />
        <KPICard title="عدد المنتجات (بعد الفلترة)" value={derived.totals.productsCount} format={(v) => Math.round(v).toLocaleString()} icon={<ReceiptTaxIcon />} />
      </div>

      {/* Category performance */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard title={`أداء الفئات (مرتبة حسب ${metricLabel})`}>
          <div className="h-[360px]">
            <BarChart
              data={derived.categoriesAgg.slice(0, 12).map((c) => ({
                name: c.category,
                value: metric === 'qty' ? c.qty : c.amount,
              }))}
              dataKey="value"
              nameKey="name"
              format={(v) => (metric === 'qty' ? `${Math.round(v).toLocaleString()} وحدة` : formatSAR(v))}
            />
          </div>
        </ChartCard>

        <ChartCard title="تحليل المبيعات حسب السعر (Sales Analysis by Value)">
          <div className="space-y-6">
            {/* Duvet King */}
            <div>
              <h4 className="text-sm font-bold text-neutral-800 mb-3 pb-1 border-b">ألحفة (King)</h4>
              <div className="space-y-2">
                {derived.duvetKingAnalysis.breakdown.map((it) => (
                  <div key={it.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{it.name}</span>
                      <span>{it.units} وحدة ({it.percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2">
                      <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${it.percentage}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Duvet Full */}
            <div>
              <h4 className="text-sm font-bold text-neutral-800 mb-3 pb-1 border-b">ألحفة (Full)</h4>
              <div className="space-y-2">
                {derived.duvetFullAnalysis.breakdown.map((it) => (
                  <div key={it.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{it.name}</span>
                      <span>{it.units} وحدة ({it.percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${it.percentage}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Pillows */}
            <div>
              <h4 className="text-sm font-bold text-neutral-800 mb-3 pb-1 border-b">وسائد (Pillows)</h4>
              <div className="space-y-2">
                {derived.pillowAnalysis.breakdown.map((it) => (
                  <div key={it.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{it.name}</span>
                      <span>{it.units} وحدة ({it.percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full" style={{ width: `${it.percentage}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ChartCard>

        <ChartCard title={`أفضل المنتجات مبيعاً (${metricLabel})`}>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="th">التصنيف</th>
                  <th className="th">المنتج</th>
                  <th className="th text-center">الكمية</th>
                  <th className="th text-center">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {derived.categoriesAgg.slice(0, 10).map((c) => (
                  <tr key={c.category} className="hover:bg-orange-50 cursor-pointer" onClick={() => setSelectedCategory(c.category)}>
                    <td className="td font-semibold text-neutral-900">{c.category}</td>
                    <td className="td text-neutral-700">
                      <div className="font-semibold text-xs">{c.topItemName || '-'}</div>
                    </td>
                    <td className="td text-center">{Math.round(c.qty).toLocaleString()}</td>
                    <td className="td text-center font-bold text-green-700">{formatSAR(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* Catalog list */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-bold text-neutral-900">📦 قائمة المنتجات</div>
            <div className="flex items-center gap-2">
              <select className="input" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                <option value="all">كل الأقسام</option>
                {derived.catalogCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="text-sm text-neutral-600">مرتبة حسب: {metricLabel}</div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th">المنتج</th>
                <th className="th">القسم</th>
                <th className="th text-center">الكمية</th>
                <th className="th text-center">القيمة</th>
                <th className="th">Trend</th>
              </tr>
            </thead>
            <tbody>
              {derived.filteredCatalog.slice(0, 200).map((p) => (
                <tr
                  key={`${p.category}-${p.id}`}
                  className="hover:bg-orange-50 cursor-pointer"
                  onClick={() => {
                    setProductId(p.id);
                    setProductOpen(true);
                  }}
                >
                  <td className="td">
                    <div className="font-mono text-xs text-neutral-500">{p.id}</div>
                    <div className="font-semibold text-neutral-900">{p.name}</div>
                  </td>
                  <td className="td text-neutral-700">{p.category}</td>
                  <td className="td text-center">{Math.round(p.qty).toLocaleString()}</td>
                  <td className="td text-center font-bold text-green-700">{formatSAR(p.amount)}</td>
                  <td className="td text-neutral-600">
                    <div className={`inline-flex items-center gap-2 font-semibold ${p.trend === 'UP' ? 'text-green-700' : p.trend === 'DOWN' ? 'text-red-600' : 'text-neutral-600'}`}>
                      {p.trend || '-'}
                      <span className="text-xs font-normal text-neutral-500">{p.trendReason || ''}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {derived.filteredCatalog.length === 0 && (
                <tr>
                  <td className="td text-center text-neutral-500" colSpan={5}>
                    لا توجد منتجات مطابقة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {derived.filteredCatalog.length > 200 && (
            <div className="p-3 text-xs text-neutral-500 bg-neutral-50 border-t border-neutral-200">
              عرضنا أول 200 منتج فقط لتسريع الصفحة. استخدم البحث لتضييق النتائج.
            </div>
          )}
        </div>
      </div>

      {/* Market basket */}
      <ChartCard title="🧺 الأنماط الشرائية (Market Basket)">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th text-center w-[60px]">#</th>
                <th className="th">Item A</th>
                <th className="th">Item B</th>
                <th className="th text-center">Frequency</th>
              </tr>
            </thead>
            <tbody>
              {derived.basket.slice(0, 20).map((p: any, i: number) => (
                <tr key={`${p.item_a_id}-${p.item_b_id}-${i}`} className="hover:bg-orange-50">
                  <td className="td text-center text-neutral-500">{i + 1}</td>
                  <td className="td">
                    <div className="font-semibold text-neutral-900">{p.item_a_name}</div>
                    <div className="font-mono text-xs text-neutral-500">{p.item_a_id}</div>
                  </td>
                  <td className="td">
                    <div className="font-semibold text-neutral-900">{p.item_b_name}</div>
                    <div className="font-mono text-xs text-neutral-500">{p.item_b_id}</div>
                  </td>
                  <td className="td text-center font-extrabold text-orange-700">{Math.round(safeNum(p.frequency)).toLocaleString()}</td>
                </tr>
              ))}
              {derived.basket.length === 0 && (
                <tr>
                  <td className="td text-center text-neutral-500" colSpan={4}>
                    لا توجد بيانات كافية للتحليل.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Catalog modal */}
      <Modal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        title="📂 تصفح الأقسام"
        maxWidthClass="max-w-6xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <div className="text-sm font-semibold text-neutral-700 mb-2">الأقسام</div>
            <div className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50">
              <div className="max-h-[420px] overflow-auto">
                {derived.catalogCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-full text-right px-4 py-2 text-sm font-semibold border-b border-neutral-200 hover:bg-orange-50 ${selectedCategory === c ? 'bg-orange-100 text-orange-800' : 'bg-white text-neutral-700'
                      }`}
                    onClick={() => setSelectedCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm font-semibold text-neutral-700 mb-2">المنتجات</div>
            <div className="text-xs text-neutral-500 mb-3">اضغط على أي منتج لفتح التفاصيل.</div>
            <div className="overflow-x-auto border border-neutral-200 rounded-xl">
              <table className="min-w-full bg-white">
                <thead>
                  <tr>
                    <th className="th">المنتج</th>
                    <th className="th text-center">الكمية</th>
                    <th className="th text-center">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.filteredCatalog.slice(0, 100).map((p) => (
                    <tr
                      key={`${p.category}-${p.id}-modal`}
                      className="hover:bg-orange-50 cursor-pointer"
                      onClick={() => {
                        setProductId(p.id);
                        setProductOpen(true);
                      }}
                    >
                      <td className="td">
                        <div className="font-mono text-xs text-neutral-500">{p.id}</div>
                        <div className="font-semibold text-neutral-900">{p.name}</div>
                      </td>
                      <td className="td text-center">{Math.round(p.qty).toLocaleString()}</td>
                      <td className="td text-center font-bold text-green-700">{formatSAR(p.amount)}</td>
                    </tr>
                  ))}
                  {derived.filteredCatalog.length === 0 && (
                    <tr>
                      <td className="td text-center text-neutral-500" colSpan={3}>
                        لا توجد منتجات.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {derived.filteredCatalog.length > 100 && (
              <div className="text-xs text-neutral-500 mt-2">عرضنا أول 100 منتج فقط داخل نافذة التصفح.</div>
            )}
          </div>
        </div >
      </Modal >

      {/* Product details modal */}
      < Modal
        open={productOpen && !!productId}
        onClose={() => setProductOpen(false)}
        title={productId ? `تفاصيل المنتج: ${productId}` : 'تفاصيل المنتج'}
        maxWidthClass="max-w-6xl"
      >
        {!productKpis ? (
          <div className="text-sm text-neutral-500">لا توجد بيانات تاريخية لهذا المنتج.</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard title="Total Qty" value={productKpis.totalQty} format={(v) => Math.round(v).toLocaleString()} icon={<CubeIcon />} />
              <KPICard title="Total Amount" value={productKpis.totalAmt} format={formatSAR} icon={<CurrencyDollarIcon />} />
              <KPICard title="Avg / Day" value={productKpis.avgAmt} format={formatSAR} icon={<ReceiptTaxIcon />} />
              <KPICard title="Zero Days" value={productKpis.zeroDays} format={(v) => Math.round(v).toLocaleString()} icon={<UsersIcon />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartCard title="📈 التاريخ اليومي">
                <div className="h-[320px]">
                  <LineChart data={productKpis.chart} />
                </div>
              </ChartCard>
              <ChartCard title="أفضل/أسوأ يوم">
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50">
                    <div className="text-xs text-neutral-500 mb-1">أفضل يوم</div>
                    <div className="font-bold text-neutral-900">{productKpis.best?.date || '-'}</div>
                    <div className="font-extrabold text-green-700">{formatSAR(productKpis.best?.amount || 0)}</div>
                  </div>
                  <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50">
                    <div className="text-xs text-neutral-500 mb-1">أسوأ يوم</div>
                    <div className="font-bold text-neutral-900">{productKpis.worst?.date || '-'}</div>
                    <div className="font-extrabold text-red-600">{formatSAR(productKpis.worst?.amount || 0)}</div>
                  </div>
                </div>
              </ChartCard>
              <ChartCard title="🧺 منتجات مرتبطة (Market Basket)">
                <div className="space-y-2">
                  {derived.selectedPairs.length === 0 ? (
                    <div className="text-sm text-neutral-500 text-center py-6">لا توجد بيانات ربط لهذا المنتج.</div>
                  ) : (
                    derived.selectedPairs.map((p: any, i: number) => {
                      const isA = String(p.item_a_id) === String(productId);
                      const otherId = isA ? p.item_b_id : p.item_a_id;
                      const otherName = isA ? p.item_b_name : p.item_a_name;
                      return (
                        <div key={`${otherId}-${i}`} className="p-3 rounded-xl border border-neutral-200 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-neutral-900 truncate">{otherName}</div>
                              <div className="font-mono text-xs text-neutral-500">{otherId}</div>
                            </div>
                            <div className="font-extrabold text-orange-700">{Math.round(safeNum(p.frequency)).toLocaleString()}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ChartCard>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

