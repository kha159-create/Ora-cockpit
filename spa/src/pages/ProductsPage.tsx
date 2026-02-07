import React, { useEffect, useMemo, useState } from 'react';
import { loadManagementData, loadProductAnalysisData, loadStagnantData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { ChartCard, KPICard, LineChart } from '../components/DashboardComponents';
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


  // Stagnant Data State
  const [stagnantRaw, setStagnantRaw] = useState<any>(null);
  const [stagnantRaw, setStagnantRaw] = useState<any>(null);
  const [stagnantPage, setStagnantPage] = useState(1);
  const STAGNANT_PER_PAGE = 10;
  // Category Share Pagination
  const [catSharePage, setCatSharePage] = useState(1);
  const CAT_SHARE_PER_PAGE = 10;
  const [productOpen, setProductOpen] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [missedOpen, setMissedOpen] = useState(false);
  const [missedRow, setMissedRow] = useState<any>(null);

  // Pagination for new sections
  const [basketPage, setBasketPage] = useState(1);
  const [missedPage, setMissedPage] = useState(1);
  const BASKET_PER_PAGE = 10;
  const MISSED_PER_PAGE = 10;

  useEffect(() => {
    Promise.all([
      loadProductAnalysisData(),
      loadManagementData(),
      loadStagnantData(),
    ])
      .then(([p, m, s]) => {
        setRaw(p);
        setMgmt(m);
        setStagnantRaw(s);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  // Reset page to 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [mode, manager, city, store, search, selectedCategory, metric]);

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

    // ===== Missed opportunities =====
    let missedList: any[] = [];
    if (activeStore === 'all') {
      Object.entries(missedByStore).forEach(([sid, rows]) => {
        if (!storeInScope(sid)) return;
        missedList = missedList.concat(rows || []);
      });
      missedList.sort((a, b) => safeNum(b.total_count) - safeNum(a.total_count));
      missedList = missedList.slice(0, 100);
    } else {
      missedList = missedByStore[activeStore] || [];
    }

    // ===== Product details =====
    const selectedHistory = productId ? (dailyHistory[productId] || []) : [];
    const selectedPairs = (() => {
      if (!productId) return [];
      const pairs = basket.filter((p) => String(p.item_a_id) === productId || String(p.item_b_id) === productId);
      pairs.sort((a, b) => safeNum(b.frequency) - safeNum(a.frequency));
      return pairs.slice(0, 10);
    })();

    // ===== Sales Analysis by Value (Duvet King, Duvet Full, Pillows) =====
    const valueAnalysis = (() => {
      // Classify catalog items by category keywords and price range
      type ValueBucket = { low: { qty: number; amount: number; count: number }; medium: { qty: number; amount: number; count: number }; high: { qty: number; amount: number; count: number }; total: { qty: number; amount: number; count: number } };
      const makeBucket = (): ValueBucket => ({
        low: { qty: 0, amount: 0, count: 0 },
        medium: { qty: 0, amount: 0, count: 0 },
        high: { qty: 0, amount: 0, count: 0 },
        total: { qty: 0, amount: 0, count: 0 },
      });

      const duvetKing = makeBucket();
      const duvetFull = makeBucket();
      const pillows = makeBucket();
      const others = makeBucket();

      catalogRows.forEach(item => {
        const avgPrice = item.qty > 0 ? item.amount / item.qty : 0;
        const catLower = (item.category || '').toLowerCase();
        const nameLower = (item.name || '').toLowerCase();
        const combined = catLower + ' ' + nameLower;

        let bucket: ValueBucket;
        let ranges: [number, number, number]; // low max, medium max

        if (combined.includes('pillow') || combined.includes('مخد') || combined.includes('وساد')) {
          bucket = pillows;
          ranges = [99, 189, 999999]; // Low <=99, Med 100-189, High 190+
        } else if (combined.includes('duvet') || combined.includes('لحاف') || combined.includes('مفرش')) {
          // Check if King or Full
          if (combined.includes('king') || combined.includes('كنج') || combined.includes('كبير') || combined.includes('240') || combined.includes('260')) {
            bucket = duvetKing;
            ranges = [300, 600, 999999]; // Low <=300, Med 301-600, High 600+
          } else {
            bucket = duvetFull;
            ranges = [300, 499, 999999]; // Low <=300, Med 301-499, High 500+
          }
        } else {
          bucket = others;
          ranges = [200, 500, 999999];
        }

        bucket.total.qty += item.qty;
        bucket.total.amount += item.amount;
        bucket.total.count += 1;

        if (avgPrice <= ranges[0]) {
          bucket.low.qty += item.qty;
          bucket.low.amount += item.amount;
          bucket.low.count += 1;
        } else if (avgPrice <= ranges[1]) {
          bucket.medium.qty += item.qty;
          bucket.medium.amount += item.amount;
          bucket.medium.count += 1;
        } else {
          bucket.high.qty += item.qty;
          bucket.high.amount += item.amount;
          bucket.high.count += 1;
        }
      });

      return { duvetKing, duvetFull, pillows, others };
    })();

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
      missedList,
      selectedHistory,
      selectedPairs,
      storesMap,
      valueAnalysis,
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {/* Bar Chart Card */}
        {/* Stagnant Products Widget (Replaces Bar Chart) */}
        {/* Stagnant Products Widget (Replaces Bar Chart) */}
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden h-[500px] flex flex-col">
          <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
            <h3 className="font-bold text-neutral-800">⚠️ المنتجات الراكدة (Stagnant)</h3>
            <span className="text-xs text-neutral-500 bg-white border border-neutral-200 px-2 py-1 rounded-lg">
              {(() => {
                if (!stagnantRaw?.data) return 0;
                const list = (stagnantRaw.data[store] || []); // If specific store selected
                // This logic is tentative, real logic is below in variable definition
                return '...';
              })() && ''}
              نظرة عامة
            </span>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white sticky top-0 z-10">
                <tr className="border-b border-neutral-100 text-neutral-500">
                  <th className="py-2 px-3 text-right font-semibold">المنتج</th>
                  <th className="py-2 px-3 text-center font-semibold">الكمية</th>
                  <th className="py-2 px-3 text-left font-semibold">المعرض</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {(() => {
                  // Calculate Stagnant List on the fly or use memo below
                  // Getting allowedStoreIds from derived
                  const allowed = derived?.allowedStoreIds;
                  if (!stagnantRaw?.data || !allowed) {
                    return <tr><td colSpan={3} className="p-4 text-center text-neutral-400">جاري التحميل...</td></tr>;
                  }

                  let allItems: any[] = [];
                  const dataMap = stagnantRaw.data as Record<string, any[]>;

                  // Filter by derived allowed stores
                  Object.entries(dataMap).forEach(([sid, arr]) => {
                    if (allowed.has(sid)) {
                      (Array.isArray(arr) ? arr : []).forEach(i => allItems.push({ ...i, _storeName: derived.storesMap[sid] || sid }));
                    }
                  });

                  if (allItems.length === 0) {
                    return <tr><td colSpan={3} className="p-4 text-center text-neutral-400">لا توجد منتجات راكدة.</td></tr>;
                  }

                  // Sorting (High qty first?)
                  allItems.sort((a, b) => safeNum(b.qty ?? b.count) - safeNum(a.qty ?? a.count));

                  const totalPages = Math.ceil(allItems.length / STAGNANT_PER_PAGE);
                  const safePage = Math.min(stagnantPage, totalPages);
                  const start = (safePage - 1) * STAGNANT_PER_PAGE;
                  const visible = allItems.slice(start, start + STAGNANT_PER_PAGE);

                  return (
                    <>
                      {visible.map((it, idx) => (
                        <tr key={idx} className="hover:bg-red-50/10">
                          <td className="py-2 px-3 font-medium text-neutral-800">
                            <div className="truncate max-w-[120px] sm:max-w-[180px]" title={it.name || it.item_name}>
                              {it.name || it.item_name || '-'}
                            </div>
                            <div className="text-[10px] text-neutral-400 font-mono">{it.id}</div>
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-red-600 dir-ltr">{Number(it.qty ?? it.count).toLocaleString()}</td>
                          <td className="py-2 px-3 text-left text-xs text-neutral-500 truncate max-w-[100px]">{it._storeName}</td>
                        </tr>
                      ))}
                      {/* Pagination internal logic to update outer state? No, render controls below table */}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {(() => {
            const allowed = derived?.allowedStoreIds;
            if (!stagnantRaw?.data || !allowed) return null;
            let count = 0;
            Object.entries(stagnantRaw.data).forEach(([sid, arr]) => {
              if (allowed.has(sid)) count += (arr as any[]).length;
            });
            if (count <= STAGNANT_PER_PAGE) return null;

            const totalPages = Math.ceil(count / STAGNANT_PER_PAGE);
            const safePage = Math.min(stagnantPage, totalPages);

            return (
              <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-100 bg-neutral-50 text-xs">
                <button
                  onClick={() => setStagnantPage(Math.max(1, safePage - 1))}
                  disabled={safePage <= 1}
                  className="px-2 py-1 border rounded bg-white disabled:opacity-50 hover:bg-neutral-100"
                >
                  السابق
                </button>
                <span className="text-neutral-500">{safePage} / {totalPages}</span>
                <button
                  onClick={() => setStagnantPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage >= totalPages}
                  className="px-2 py-1 border rounded bg-white disabled:opacity-50 hover:bg-neutral-100"
                >
                  التالي
                </button>
              </div>
            );
          })()}
        </div>

        {/* Categories Share List (Replaces Overlapping Pie/Stats) */}
        <ChartCard title="نسبة الفئات (Category Share)" className="h-[500px] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-x-auto custom-scrollbar pr-1 relative">
            <table className="w-full">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-xs text-neutral-500 border-b border-neutral-100">
                  <th className="font-medium text-right pb-2">الفئة</th>
                  <th className="font-medium text-center pb-2">النسبة</th>
                  <th className="font-medium text-left pb-2 w-1/3">المساهمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {(() => {
                  const page = catSharePage;
                  const perPage = CAT_SHARE_PER_PAGE;
                  const start = (page - 1) * perPage;
                  const visible = derived.categoriesAgg.slice(start, start + perPage);

                  return visible.map((c, idx) => (
                    <tr key={c.category} className="group hover:bg-orange-50/50 transition-colors">
                      <td className="py-2.5 text-xs sm:text-sm font-bold text-neutral-700">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${['bg-blue-500', 'bg-orange-500', 'bg-emerald-500', 'bg-purple-500'][idx % 4]}`} />
                          <span className="truncate max-w-[150px]" title={c.category}>{c.category}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="inline-block bg-neutral-100 text-neutral-700 text-[10px] font-bold px-1.5 py-0.5 rounded dir-ltr">
                          {c.sharePercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 text-left dir-ltr">
                        <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${c.sharePercent}%` }} />
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
          {/* Pagination for Category Share */}
          {(() => {
            const total = derived.categoriesAgg.length;
            if (total <= CAT_SHARE_PER_PAGE) return null;
            const totalPages = Math.ceil(total / CAT_SHARE_PER_PAGE);
            return (
              <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-100 bg-neutral-50 text-xs mt-auto">
                <button
                  onClick={() => setCatSharePage(Math.max(1, catSharePage - 1))}
                  disabled={catSharePage <= 1}
                  className="px-2 py-1 border rounded bg-white disabled:opacity-50 hover:bg-neutral-100"
                >
                  السابق
                </button>
                <span className="text-neutral-500">{catSharePage} / {totalPages}</span>
                <button
                  onClick={() => setCatSharePage(Math.min(totalPages, catSharePage + 1))}
                  disabled={catSharePage >= totalPages}
                  className="px-2 py-1 border rounded bg-white disabled:opacity-50 hover:bg-neutral-100"
                >
                  التالي
                </button>
              </div>
            );
          })()}
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
        {/* Summary badges */}
        <div className="px-6 py-3 flex flex-wrap gap-4 border-b border-neutral-100">
          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-bold">عدد المنتجات: {derived.filteredCatalog.length.toLocaleString()}</span>
          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-bold">إجمالي الكمية: {Math.round(derived.filteredCatalog.reduce((s: number, p: any) => s + (p.qty || 0), 0)).toLocaleString()}</span>
          <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">إجمالي القيمة: {formatSAR(derived.filteredCatalog.reduce((s: number, p: any) => s + (p.amount || 0), 0))}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th">المنتج</th>
                <th className="th">القسم</th>
                <th className="th text-center">الكمية</th>
                <th className="th text-center">القيمة</th>
                <th className="th text-center">سعر الوحدة</th>
                <th className="th">Trend</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const totalPages = Math.max(1, Math.ceil(derived.filteredCatalog.length / ITEMS_PER_PAGE));
                const safePage = Math.min(currentPage, totalPages);
                const start = (safePage - 1) * ITEMS_PER_PAGE;
                const pageItems = derived.filteredCatalog.slice(start, start + ITEMS_PER_PAGE);
                return pageItems.map((p: any) => (
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
                    <td className="td text-center font-medium text-neutral-600 dir-ltr">{p.qty > 0 ? formatSAR(p.amount / p.qty) : '-'}</td>
                    <td className="td text-neutral-600">
                      <div className={`inline-flex items-center gap-2 font-semibold ${p.trend === 'UP' ? 'text-green-700' : p.trend === 'DOWN' ? 'text-red-600' : 'text-neutral-600'}`}>
                        {p.trend || '-'}
                        <span className="text-xs font-normal text-neutral-500">{p.trendReason || ''}</span>
                      </div>
                    </td>
                  </tr>
                ));
              })()}
              {derived.filteredCatalog.length === 0 && (
                <tr>
                  <td className="td text-center text-neutral-500" colSpan={5}>
                    لا توجد منتجات مطابقة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {/* Pagination Controls */}
          {derived.filteredCatalog.length > ITEMS_PER_PAGE && (() => {
            const totalPages = Math.ceil(derived.filteredCatalog.length / ITEMS_PER_PAGE);
            const safePage = Math.min(currentPage, totalPages);
            const maxVisible = 5;
            let startPage = Math.max(1, safePage - Math.floor(maxVisible / 2));
            let endPage = Math.min(totalPages, startPage + maxVisible - 1);
            if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
            const pages: number[] = [];
            for (let p = startPage; p <= endPage; p++) pages.push(p);

            return (
              <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
                <div className="text-sm text-neutral-500">
                  صفحة {safePage} من {totalPages} ({derived.filteredCatalog.length} منتج)
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage(safePage - 1)}
                    className="px-3 py-1 rounded-lg border text-sm font-semibold disabled:opacity-40 hover:bg-orange-50"
                  >
                    السابق
                  </button>
                  {startPage > 1 && <span className="px-2 text-neutral-400">...</span>}
                  {pages.map(p => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${p === safePage ? 'bg-orange-500 text-white shadow' : 'border border-neutral-200 hover:bg-orange-50 text-neutral-700'}`}
                    >
                      {p}
                    </button>
                  ))}
                  {endPage < totalPages && <span className="px-2 text-neutral-400">...</span>}
                  <button
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage(safePage + 1)}
                    className="px-3 py-1 rounded-lg border text-sm font-semibold disabled:opacity-40 hover:bg-orange-50"
                  >
                    التالي
                  </button>
                </div>
              </div>
            );
          })()}
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
              {(() => {
                const list = derived.basket;
                const pageCount = Math.ceil(list.length / BASKET_PER_PAGE);
                const start = (basketPage - 1) * BASKET_PER_PAGE;
                const visibleItems = list.slice(start, start + BASKET_PER_PAGE);

                return visibleItems.map((p: any, i: number) => (
                  <tr key={`${p.item_a_id}-${p.item_b_id}-${i}`} className="hover:bg-orange-50">
                    <td className="td text-center text-neutral-500">{start + i + 1}</td>
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
                ));
              })()}
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
        {/* Pagination Controls for Market Basket */}
        {derived.basket.length > BASKET_PER_PAGE && (() => {
          const totalPages = Math.ceil(derived.basket.length / BASKET_PER_PAGE);
          const safePage = Math.min(basketPage, totalPages);
          const maxVisible = 5;
          let startPage = Math.max(1, safePage - Math.floor(maxVisible / 2));
          let endPage = Math.min(totalPages, startPage + maxVisible - 1);
          if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
          const pages: number[] = [];
          for (let p = startPage; p <= endPage; p++) pages.push(p);

          return (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50 mt-2">
              <div className="text-sm text-neutral-500">
                صفحة {safePage} من {totalPages}
              </div>
              <div className="flex items-center gap-1">
                <button
                  disabled={safePage <= 1}
                  onClick={() => setBasketPage(safePage - 1)}
                  className="px-3 py-1 rounded-lg border text-sm font-semibold disabled:opacity-40 hover:bg-orange-50"
                >
                  السابق
                </button>
                {startPage > 1 && <span className="px-2 text-neutral-400">...</span>}
                {pages.map(p => (
                  <button
                    key={p}
                    onClick={() => setBasketPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${p === safePage ? 'bg-orange-500 text-white shadow' : 'border border-neutral-200 hover:bg-orange-50 text-neutral-700'}`}
                  >
                    {p}
                  </button>
                ))}
                {endPage < totalPages && <span className="px-2 text-neutral-400">...</span>}
                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setBasketPage(safePage + 1)}
                  className="px-3 py-1 rounded-lg border text-sm font-semibold disabled:opacity-40 hover:bg-orange-50"
                >
                  التالي
                </button>
              </div>
            </div>
          );
        })()}
      </ChartCard>

      {/* Missed opportunities */}
      <ChartCard title="❗ فرص ضائعة (Missed Opportunities)">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th text-center w-[60px]">#</th>
                <th className="th">الموظف</th>
                <th className="th">المنتج المباع</th>
                <th className="th">المنتجات المفقودة</th>
                <th className="th text-center">Count</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const list = derived.missedList;
                const pageCount = Math.ceil(list.length / MISSED_PER_PAGE);
                const start = (missedPage - 1) * MISSED_PER_PAGE;
                const visibleItems = list.slice(start, start + MISSED_PER_PAGE);

                return visibleItems.map((r: any, i: number) => {
                  const missed = Array.isArray(r.missed_items) ? [...r.missed_items].sort((a, b) => safeNum(b.count) - safeNum(a.count)) : [];
                  const top = missed[0];
                  const others = missed.length - 1;
                  return (
                    <tr
                      key={`${r.employee_id}-${i}`}
                      className="hover:bg-orange-50 cursor-pointer"
                      onClick={() => {
                        setMissedRow({ ...r, missed_items: missed });
                        setMissedOpen(true);
                      }}
                    >
                      <td className="td text-center text-neutral-500">{start + i + 1}</td>
                      <td className="td">
                        <div className="font-bold text-neutral-900">{r.employee_name}</div>
                        <div className="font-mono text-xs text-neutral-500">{r.employee_id}</div>
                      </td>
                      <td className="td text-green-700 font-semibold">{r.sold_item}</td>
                      <td className="td text-red-700">
                        <span className="font-semibold">{top?.name || '-'}</span>
                        {others > 0 && <span className="text-xs text-neutral-500 ms-2">+{others} أخرى</span>}
                      </td>
                      <td className="td text-center font-extrabold text-orange-700">{Math.round(safeNum(r.total_count)).toLocaleString()}</td>
                    </tr>
                  );
                });
              })()}
              {derived.missedList.length === 0 && (
                <tr>
                  <td className="td text-center text-neutral-500" colSpan={5}>
                    لا توجد بيانات (أو فرص ضائعة) لهذا النطاق.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination Controls for Missed Opportunities */}
        {derived.missedList.length > MISSED_PER_PAGE && (() => {
          const totalPages = Math.ceil(derived.missedList.length / MISSED_PER_PAGE);
          const safePage = Math.min(missedPage, totalPages);
          const maxVisible = 5;
          let startPage = Math.max(1, safePage - Math.floor(maxVisible / 2));
          let endPage = Math.min(totalPages, startPage + maxVisible - 1);
          if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
          const pages: number[] = [];
          for (let p = startPage; p <= endPage; p++) pages.push(p);

          return (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50 mt-2">
              <div className="text-sm text-neutral-500">
                صفحة {safePage} من {totalPages}
              </div>
              <div className="flex items-center gap-1">
                <button
                  disabled={safePage <= 1}
                  onClick={() => setMissedPage(safePage - 1)}
                  className="px-3 py-1 rounded-lg border text-sm font-semibold disabled:opacity-40 hover:bg-orange-50"
                >
                  السابق
                </button>
                {startPage > 1 && <span className="px-2 text-neutral-400">...</span>}
                {pages.map(p => (
                  <button
                    key={p}
                    onClick={() => setMissedPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${p === safePage ? 'bg-orange-500 text-white shadow' : 'border border-neutral-200 hover:bg-orange-50 text-neutral-700'}`}
                  >
                    {p}
                  </button>
                ))}
                {endPage < totalPages && <span className="px-2 text-neutral-400">...</span>}
                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setMissedPage(safePage + 1)}
                  className="px-3 py-1 rounded-lg border text-sm font-semibold disabled:opacity-40 hover:bg-orange-50"
                >
                  التالي
                </button>
              </div>
            </div>
          );
        })()}
      </ChartCard>

      {/* Catalog modal */}
      <Modal open={catalogOpen} onClose={() => setCatalogOpen(false)} title="📂 تصفح الأقسام" maxWidthClass="max-w-6xl">
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
        </div>
      </Modal>

      {/* Product details modal */}
      <Modal
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

      {/* Missed details modal */}
      <Modal open={missedOpen && !!missedRow} onClose={() => setMissedOpen(false)} title="تفاصيل الفرص الضائعة" maxWidthClass="max-w-3xl">
        {!missedRow ? null : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50">
              <div className="font-bold text-neutral-900">{missedRow.employee_name}</div>
              <div className="text-xs text-neutral-500 font-mono">{missedRow.employee_id}</div>
              <div className="mt-2 text-sm">
                <span className="text-neutral-600">المنتج المباع:</span> <span className="font-semibold text-green-700">{missedRow.sold_item}</span>
              </div>
              <div className="mt-1 text-sm">
                <span className="text-neutral-600">عدد مرات الفرصة:</span> <span className="font-extrabold text-orange-700">{missedRow.total_count}</span>
              </div>
            </div>

            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <div className="p-3 bg-white border-b border-neutral-200 font-semibold">المنتجات المفقودة</div>
              <ul className="divide-y divide-neutral-200 bg-white">
                {(missedRow.missed_items || []).map((m: any, idx: number) => (
                  <li key={idx} className="p-3 flex items-center justify-between">
                    <span className="text-sm text-neutral-900">{m.name}</span>
                    <span className="text-xs font-extrabold bg-red-100 text-red-700 px-3 py-1 rounded-full">{m.count}</span>
                  </li>
                ))}
                {(missedRow.missed_items || []).length === 0 && <li className="p-3 text-sm text-neutral-500 text-center">لا توجد بيانات.</li>}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

