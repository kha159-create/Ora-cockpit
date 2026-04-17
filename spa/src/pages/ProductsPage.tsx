import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadManagementData, loadProductAnalysisData, loadStockData, loadProductMapping } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { ChartCard, KPICard, LineChart } from '../components/DashboardComponents';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { CubeIcon, SalesIcon, InvoicesIcon, VisitorsIcon, XIcon } from '../components/Icons';
import * as XLSX from 'xlsx';
import { generateProductSummaryPDF } from '../services/pdf/pdfService';
import { calendarYesterday, mtdRangeThroughYesterday } from '../utils/mtdDateRange';

type PeriodMode = 'mtd' | '7d' | '14d' | '30d' | 'yest' | 'custom';
type RepSearchMode = 'sales_stock' | 'stock_only';
type RepStockStatus = 'all' | 'in_stock' | 'low' | 'out';
type RepViewMode = 'product' | 'store' | 'month';
type RepLogic = 'AND' | 'OR';
type RepField = 'alias' | 'name';
type RepOp = 'contains' | 'equals' | 'not_equals' | 'starts_with' | 'in_list';
type RepCondition = { id: number; field: RepField; op: RepOp; value: string };

const BASKET_PER_PAGE = 10;
const MISSED_PER_PAGE = 10;
const ITEMS_PER_PAGE = 10;

const TARGET_CATEGORY_ORDER = [
  'لحافات كينغ',
  'لحافات فل',
  'مخدات كينغ',
  'مخدات ستاندر',
  'لباد كينج',
  'لباد فل',
] as const;
type TargetCategoryName = (typeof TARGET_CATEGORY_ORDER)[number];

function safeNum(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function getDateRangeForMode(m: PeriodMode, customStart?: string, customEnd?: string): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const nowReal = new Date();
  const yest = calendarYesterday(nowReal);
  const yestYMD = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`;
  if (m === 'yest') return { start: yestYMD, end: yestYMD };
  if (m === 'custom' && customStart && customEnd) {
    return customStart <= customEnd
      ? { start: customStart, end: customEnd }
      : { start: customEnd, end: customStart };
  }
  if (m === '7d') {
    const s = new Date(yest); s.setDate(yest.getDate() - 7);
    return { start: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`, end: yestYMD };
  }
  if (m === '14d') {
    const s = new Date(yest); s.setDate(yest.getDate() - 14);
    return { start: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`, end: yestYMD };
  }
  if (m === '30d') {
    const s = new Date(yest); s.setDate(yest.getDate() - 30);
    return { start: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`, end: yestYMD };
  }
  const r = mtdRangeThroughYesterday(nowReal);
  return { start: r.start, end: r.end };
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

type CatalogItem = {
  id: string;
  name: string;
  alias?: string;
  old_code?: string;
  dCode?: string;
  category: string;
  qty: number;
  amount: number;
  trend?: string;
  trendReason?: string;
  salesByStore?: Record<string, { q: number; a: number }>;
  stockByStore?: Record<string, number>;
  totalStock?: number;
};

type ValueAnalysisBucket = {
  low: { qty: number; amount: number; count: number };
  medium: { qty: number; amount: number; count: number };
  high: { qty: number; amount: number; count: number };
  total: { qty: number; amount: number; count: number };
};

function normText(v: string) {
  return String(v || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/إ|أ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .trim();
}

function isKingToken(v: string) {
  return v.includes('king') || v.includes('كينغ') || v.includes('كنج');
}

function isFullToken(v: string) {
  return v.includes('full') || v.includes('فل');
}

function isTwinToken(v: string) {
  return v.includes('twin') || v.includes('توين');
}

function canonicalTargetCategory(v: string): TargetCategoryName | null {
  const t = normText(v);
  const isDuvet = t.includes('لحاف') || t.includes('لحافات') || t.includes('duvet');
  const isPillow = t.includes('مخده') || t.includes('مخدات') || t.includes('pillow');
  const isPad = t.includes('لباد') || t.includes('لبده') || t.includes('mattress');

  if (isDuvet && isKingToken(t)) return 'لحافات كينغ';
  if (isDuvet && (isFullToken(t) || isTwinToken(t))) return 'لحافات فل';
  if (isPillow && isKingToken(t)) return 'مخدات كينغ';
  if (isPillow && (t.includes('ستاندر') || t.includes('standard') || isFullToken(t))) return 'مخدات ستاندر';
  if (isPad && isKingToken(t)) return 'لباد كينج';
  if (isPad && isFullToken(t)) return 'لباد فل';
  return null;
}

function ValueTierGroup({
  title,
  bucket,
  tierLabels,
  totalUnitsLabel,
}: {
  title: string;
  bucket: ValueAnalysisBucket;
  tierLabels: [string, string, string];
  totalUnitsLabel: string;
}) {
  const totalQty = bucket.total.qty;
  const safeTotal = Math.max(1, totalQty);
  const rows: { key: string; label: string; qty: number }[] = [
    { key: 'low', label: tierLabels[0], qty: bucket.low.qty },
    { key: 'medium', label: tierLabels[1], qty: bucket.medium.qty },
    { key: 'high', label: tierLabels[2], qty: bucket.high.qty },
  ];
  return (
    <div className="space-y-3 pb-4 border-b border-neutral-100 last:border-0 last:pb-0">
      <h4 className="text-sm font-bold text-neutral-900">{title}</h4>
      {rows.map((row) => {
        const pct = (row.qty / safeTotal) * 100;
        const showBar = row.qty > 0;
        return (
          <div key={row.key}>
            <div className="flex justify-between gap-2 text-xs text-neutral-600 mb-1">
              <span className=" leading-snug">{row.label}</span>
              <span className="tabular-nums font-semibold text-neutral-800 dir-ltr whitespace-nowrap shrink-0">
                {Math.round(row.qty).toLocaleString('en-US')}{' '}
                <span className="text-neutral-500 font-normal">({pct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="w-full bg-neutral-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-l from-orange-500 to-orange-400 transition-all"
                style={{ width: `${showBar ? Math.max(pct, 2) : 0}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="flex justify-between items-baseline text-sm pt-1 gap-2">
        <span className="font-bold text-neutral-900">{totalUnitsLabel}</span>
        <span className="font-bold text-orange-700 tabular-nums dir-ltr">{Math.round(totalQty).toLocaleString('en-US')}</span>
      </div>
    </div>
  );
}

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
      <div className={`modal-content w-[95vw] md:w-full max-h-[90vh] overflow-y-auto ${maxWidthClass} my-4`} onClick={(e) => e.stopPropagation()}>
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
  const [searchParams] = useSearchParams();

  const [mgmt, setMgmt] = useState<any>(null);
  const [, setErr] = useState<string | null>(null);
  const [productMapping, setProductMapping] = useState<Record<string, any>>({});

  const [mode, setMode] = useState<PeriodMode>('mtd');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [manager, setManager] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [store, setStore] = useState<string>(user?.storeId || 'all');

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMax, setPriceMax] = useState<string>('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [expandedRepOpen, setExpandedRepOpen] = useState(false);
  const [repSearchMode, setRepSearchMode] = useState<RepSearchMode>('sales_stock');
  const [repStore, setRepStore] = useState<string>('all');
  const [repCategories, setRepCategories] = useState<string[]>([]);
  const [repStockStatus, setRepStockStatus] = useState<RepStockStatus>('all');
  const [repViewMode, setRepViewMode] = useState<RepViewMode>('product');
  const [repLogic, setRepLogic] = useState<RepLogic>('AND');
  const [repConditions, setRepConditions] = useState<RepCondition[]>([
    { id: 1, field: 'alias', op: 'contains', value: '' },
  ]);
  const [repAnalysisOpen, setRepAnalysisOpen] = useState(false);

  // State Definitions moved up to avoid hoisting/TDZ issues
  const [productId, setProductId] = useState<string | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [basketPage, setBasketPage] = useState(1);
  const [missedPage, setMissedPage] = useState(1);
  const [missedOpen, setMissedOpen] = useState(false);
  const [missedRow, setMissedRow] = useState<any>(null);

  // Stock Data State
  const [stockRaw, setStockRaw] = useState<any>(null);

  // Handle URL param for direct product view
  useEffect(() => {
    const pid = searchParams.get('pid');
    if (pid) {
      setProductId(pid);
      setProductOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      loadProductAnalysisData(),
      loadManagementData(),
      loadStockData(),
      loadProductMapping(),
    ])
      .then(([p, m, stock, mapping]) => {
        setRaw(p);
        setMgmt(m);
        setStockRaw(stock);
        const mapObj: Record<string, any> = {};
        (mapping || []).forEach((item: any) => {
          if (!item || !item.id) return;
          mapObj[String(item.id)] = item;
        });
        setProductMapping(mapObj);
      })
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  // Reset page to 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [mode, manager, city, store, search, selectedCategory, priceMin, priceMax, customStart, customEnd]);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const derived = useMemo(() => {
    if (!raw || !mgmt) return null;

    const storeMeta: Record<string, any> = mgmt.store_meta || {};
    const storesMap: Record<string, string> = mgmt.stores || {};

    // Invert storesMap for Name -> ID lookup (needed for stock mapping)
    const storeNameTokId: Record<string, string> = {};
    Object.entries(storesMap).forEach(([id, name]) => {
      if (name) storeNameTokId[name.trim().toLowerCase()] = id;
    });

    // Explicit Mappings for data consistency (Matching Product Inquiry)
    storeNameTokId['warehouse riyadh'] = '0';
    storeNameTokId['transit'] = '0';
    storeNameTokId['warehouse'] = '0';

    // Pre-process Stock Data for fast lookup
    // The products_stock.json is a flat list of items per outlet.
    const stockMap = new Map<string, { total: number; byStore: Record<string, number> }>();
    if (Array.isArray(stockRaw)) {
      stockRaw.forEach((item: any) => {
        const code = String(item.code || '').trim();
        const alias = String(item.alias || '').trim();
        const totalQty = safeNum(item.stock);

        if (!code && !alias) return;

        // Use an existing accumulator if either code or alias is already mapped
        let entry = (code ? stockMap.get(code) : undefined) || (alias ? stockMap.get(alias) : undefined);

        if (!entry) {
          entry = { total: 0, byStore: {} };
          if (code) stockMap.set(code, entry);
          if (alias) stockMap.set(alias, entry);
        } else {
          // Cross-link keys to the same entry object
          if (code && !stockMap.has(code)) stockMap.set(code, entry);
          if (alias && !stockMap.has(alias)) stockMap.set(alias, entry);
        }

        entry.total += totalQty;

        // Process Branches
        if (item.branches && typeof item.branches === 'object') {
          Object.entries(item.branches).forEach(([brName, brQty]) => {
            const qty = safeNum(brQty);
            if (qty !== 0) {
              const cleanName = brName.trim();
              const normalizedParams = cleanName.toLowerCase();
              const sid = storeNameTokId[normalizedParams] || storeNameTokId[cleanName] || null;

              if (sid) {
                entry.byStore[sid] = (entry.byStore[sid] || 0) + qty;
              } else {
                entry.byStore[cleanName] = (entry.byStore[cleanName] || 0) + qty;
              }
            }
          });
        } else {
          // Fallback
          const outlet = String(item.outlet || '').trim();
          const sid = storeNameTokId[outlet] || outlet;
          if (totalQty !== 0 && sid) {
            entry.byStore[sid] = (entry.byStore[sid] || 0) + totalQty;
          }
        }
      });
    }

    const dateRange = getDateRangeForMode(mode, customStart, customEnd);
    const isCustomMode = mode === 'custom';
    const pData = !isCustomMode ? (raw.periods?.[mode] || null) : null;
    const analysisSource: Record<string, any> = (isCustomMode ? raw.periods?.mtd?.analysis : pData?.analysis || {}) as any;
    const catalog: Record<string, any[]> = (pData?.catalog || {}) as any;
    const missedByStore: Record<string, any[]> = ((isCustomMode ? raw.periods?.mtd?.missed_opportunities : pData?.missed_opportunities) || {}) as any;
    const marketBasketAll: Record<string, any[]> = raw.market_basket || {};
    const dailyHistory: Record<string, any[]> = raw.product_daily_history || {};

    const isStoreAccessible = (sid: string) => {
      if (isAdminOrAuditor(user?.role)) return true;
      if (user?.role === 'BranchManager') return sid === user?.storeId;
      const meta = storeMeta[sid];
      return meta && meta.manager === user?.name;
    };

    const accessibleStoreIds = new Set<string>(
      Object.keys(analysisSource).filter((sid) => isStoreAccessible(sid)),
    );

    // Build manager + city + store options from the data we actually have for this period
    const managersSet = new Set<string>();
    const citiesSet = new Set<string>();
    const storeOptions: { id: string; name: string; manager: string; city: string }[] = [];
    for (const sid of Object.keys(analysisSource)) {
      if (!accessibleStoreIds.has(sid)) continue;
      const meta = storeMeta[sid] || {};
      const mgr = String(meta.manager || '');
      const cityVal = String(meta.city || '');
      if (mgr) managersSet.add(mgr);

      // Filter cities based on selected manager
      if (effectiveManager === 'all' || mgr === effectiveManager) {
        if (cityVal) citiesSet.add(cityVal);
      }

      storeOptions.push({
        id: sid,
        name: analysisSource[sid]?.store_name || storesMap[sid] || meta.name || sid,
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
    const selectedStoreLabel =
      activeStore === 'all'
        ? 'كل المعارض'
        : (storeOptions.find((s) => String(s.id) === String(activeStore))?.name || storesMap[activeStore] || activeStore);
    const storeInScope = (sid: string) => {
      if (!allowedStoreIds.has(sid)) return false;
      if (activeStore !== 'all') return String(sid) === String(activeStore);
      return true;
    };

    // ===== Catalog (products list) =====
    const catalogRows: CatalogItem[] = [];
    const q = search.trim().toLowerCase();
    const searchTokens = q
      .split(/[\s,+،]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const pushCatalogItem = (catName: string, it: any) => {
      const id = String(it?.id || '');
      const name = String(it?.name || id);
      const map = productMapping[id] || {};
      const alias = String(map.alias ?? it?.alias ?? '').trim();
      const dCode = String(map.dCode ?? it?.dCode ?? '').trim();
      const stores = it?.stores || {};
      const stockEntry = stockMap.get(alias) || stockMap.get(dCode) || stockMap.get(id);

      let qty = 0;
      let amount = 0;
      let computedStock = 0;

      if (activeStore === 'all') {
        for (const [sid, st] of Object.entries(stores)) {
          if (!storeInScope(String(sid))) continue;
          qty += safeNum((st as any)?.q);
          amount += safeNum((st as any)?.a);
        }
        if (stockEntry && stockEntry.byStore) {
          for (const [sid, stQty] of Object.entries(stockEntry.byStore)) {
            if (!storeInScope(String(sid)) && sid !== '0') continue;
            computedStock += safeNum(stQty);
          }
        }
      } else {
        const st = stores?.[activeStore];
        qty = safeNum(st?.q);
        amount = safeNum(st?.a);
        computedStock = safeNum(stockEntry?.byStore?.[activeStore]);
      }

      if (!q && qty === 0 && amount === 0) return;
      catalogRows.push({
        id,
        name,
        alias,
        old_code: String(it?.old_code || ''),
        dCode,
        category: String(catName),
        qty,
        amount,
        trend: it?.trend,
        trendReason: it?.trend_reason,
        salesByStore: stores as any,
        stockByStore: stockEntry?.byStore,
        totalStock: computedStock
      });
    };

    if (!isCustomMode) {
      Object.entries(catalog).forEach(([catName, items]) => {
        if (!Array.isArray(items)) return;
        for (const it of items) pushCatalogItem(catName, it);
      });
    } else {
      const itemNames = raw.item_names || {};
      const itemCategories = raw.item_categories || {};
      const byItem = new Map<string, { id: string; name: string; category: string; stores: Record<string, { q: number; a: number }> }>();
      Object.entries(dailyHistory).forEach(([itemId, rows]) => {
        const rid = String(itemId || '').trim();
        if (!rid || !Array.isArray(rows)) return;
        rows.forEach((r: any) => {
          const ds = String(r?.date || '').substring(0, 10);
          const sid = String(r?.store || r?.s || '');
          if (!ds || ds < dateRange.start || ds > dateRange.end) return;
          if (!storeInScope(sid)) return;
          const qty = safeNum(r?.qty);
          const amount = safeNum(r?.amount);
          if (qty === 0 && amount === 0) return;
          if (!byItem.has(rid)) {
            byItem.set(rid, {
              id: rid,
              name: String(itemNames[rid] || rid),
              category: String(itemCategories[rid] || 'Uncategorized'),
              stores: {},
            });
          }
          const entry = byItem.get(rid)!;
          if (!entry.stores[sid]) entry.stores[sid] = { q: 0, a: 0 };
          entry.stores[sid].q += qty;
          entry.stores[sid].a += amount;
        });
      });
      byItem.forEach((item) => pushCatalogItem(item.category, item));
    }

    const catFilter = selectedCategory;
    let filteredCatalog = catalogRows;
    if (catFilter !== 'all') filteredCatalog = filteredCatalog.filter((r) => r.category === catFilter);
    if (searchTokens.length) {
      filteredCatalog = filteredCatalog.filter((r) =>
        searchTokens.some((token) =>
          r.id.toLowerCase().includes(token) ||
          r.name.toLowerCase().includes(token) ||
          String(r.alias || '').toLowerCase().includes(token) ||
          String(r.old_code || '').toLowerCase().includes(token) ||
          String(r.dCode || '').toLowerCase().includes(token)
        )
      );
    }
    const minVal = safeNum(priceMin);
    const maxVal = safeNum(priceMax);
    if (priceMin || priceMax) {
      filteredCatalog = filteredCatalog.filter((r) => {
        const unitPrice = r.qty > 0 ? (r.amount / r.qty) : 0;
        if (priceMin && unitPrice < minVal) return false;
        if (priceMax && unitPrice > maxVal) return false;
        return true;
      });
    }
    filteredCatalog.sort((a, b) => b.qty - a.qty);
    const catalogQtyAll = catalogRows.reduce((s, p) => s + (p.qty || 0), 0);
    const catalogAmountAll = catalogRows.reduce((s, p) => s + (p.amount || 0), 0);
    const categoryScope = selectedCategory === 'all' ? catalogRows : catalogRows.filter((p) => p.category === selectedCategory);
    const categoryScopeQty = categoryScope.reduce((s, p) => s + (p.qty || 0), 0);
    const categoryScopeAmount = categoryScope.reduce((s, p) => s + (p.amount || 0), 0);
    const categorySharePercentByQty = (categoryScopeQty / Math.max(1, catalogQtyAll)) * 100;
    const categorySharePercentByValue = (categoryScopeAmount / Math.max(1, catalogAmountAll)) * 100;
    const categorySharePercent = categorySharePercentByQty;
    const totalQty = catalogRows.reduce((s, p) => s + (p.qty || 0), 0);
    const totalAmt = catalogRows.reduce((s, p) => s + (p.amount || 0), 0);
    const totalStores = storeOptions.filter((s) => storeInScope(s.id)).length;

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
        const catText = `${item.category || ''} ${item.name || ''}`;
        const canon = canonicalTargetCategory(catText);

        let bucket: ValueBucket;
        let ranges: [number, number, number]; // low max, medium max

        if (canon === 'مخدات كينغ' || canon === 'مخدات ستاندر') {
          bucket = pillows;
          ranges = [99, 189, 999999]; // Low <=99, Med 100-189, High 190+
        } else if (canon === 'لحافات كينغ') {
          bucket = duvetKing;
          ranges = [300, 600, 999999]; // Low <=300, Med 301-600, High 600+
        } else if (canon === 'لحافات فل') {
          bucket = duvetFull;
          ranges = [300, 499, 999999]; // Low <=300, Med 301-499, High 500+
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
      dateRangeLabel: isCustomMode ? `${dateRange.start} → ${dateRange.end}` : (pData?.date_range || '-'),
      dateRangeStart: dateRange.start,
      dateRangeEnd: dateRange.end,
      managers,
      cities,
      storeOptions,
      allowedStoreIds,
      totals: { totalQty, totalAmt, totalStores, productsCount: filteredCatalog.length },
      categorySharePercentByQty,
      categorySharePercentByValue,
      categorySharePercent,
      catalogCategories: Array.from(new Set(catalogRows.map((r) => r.category))).sort((a, b) => a.localeCompare(b, 'ar')),
      filteredCatalog,
      basket,
      missedList,
      selectedHistory,
      selectedPairs,
      storesMap,
      valueAnalysis,
      selectedStoreLabel,
    };
  }, [city, customEnd, customStart, effectiveManager, mgmt, mode, priceMax, priceMin, productId, raw, search, selectedCategory, store, user?.name, user?.role]);

  const expandedRep = useMemo(() => {
    if (!derived || !raw) return null;

    const runCondition = (target: string, op: RepOp, rawValue: string) => {
      const t = String(target || '').toLowerCase();
      const v = String(rawValue || '').toLowerCase().trim();
      if (!v) return true;
      if (op === 'contains') return t.includes(v);
      if (op === 'equals') return t === v;
      if (op === 'not_equals') return t !== v;
      if (op === 'starts_with') return t.startsWith(v);
      if (op === 'in_list') {
        const tokens = v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
        return tokens.includes(t);
      }
      return true;
    };

    const activeConditions = repConditions.filter((c) => String(c.value || '').trim());
    const matchesAdvanced = (row: any) => {
      if (!activeConditions.length) return true;
      const results = activeConditions.map((c) => {
        const fieldValue = c.field === 'alias' ? String(row.alias || row.dCode || row.id || '') : String(row.name || '');
        return runCondition(fieldValue, c.op, c.value);
      });
      return repLogic === 'AND' ? results.every(Boolean) : results.some(Boolean);
    };

    const baseRows = derived.filteredCatalog.filter((r: any) => {
      if (repStore !== 'all') {
        const s = r.salesByStore?.[repStore];
        if (!s || (safeNum(s.q) === 0 && safeNum(s.a) === 0)) return false;
      }
      if (repCategories.length && !repCategories.includes(String(r.category || ''))) return false;
      if (repSearchMode === 'stock_only' && !(safeNum(r.totalStock) > 0 && safeNum(r.qty) === 0)) return false;
      if (repStockStatus === 'in_stock' && !(safeNum(r.totalStock) > 0)) return false;
      if (repStockStatus === 'low' && !(safeNum(r.totalStock) >= 1 && safeNum(r.totalStock) <= 10)) return false;
      if (repStockStatus === 'out' && !(safeNum(r.totalStock) === 0)) return false;
      if (!matchesAdvanced(r)) return false;
      return true;
    });

    let rows: any[] = [];
    if (repViewMode === 'product') {
      rows = baseRows.map((r) => ({
        alias: r.alias || r.dCode || r.id,
        name: r.name,
        category: r.category,
        unitPrice: r.qty > 0 ? r.amount / r.qty : 0,
        qty: r.qty,
        amount: r.amount,
        stock: safeNum(r.totalStock),
        viewLabel: '-',
      }));
    } else if (repViewMode === 'store') {
      baseRows.forEach((r) => {
        Object.entries(r.salesByStore || {}).forEach(([sid, st]: any) => {
          if (repStore !== 'all' && sid !== repStore) return;
          const sq = safeNum(st?.q);
          const sa = safeNum(st?.a);
          if (sq === 0 && sa === 0) return;
          rows.push({
            alias: r.alias || r.dCode || r.id,
            name: r.name,
            category: r.category,
            unitPrice: sq > 0 ? sa / sq : 0,
            qty: sq,
            amount: sa,
            stock: safeNum(r.stockByStore?.[sid]),
            viewLabel: derived.storesMap?.[sid] || sid,
          });
        });
      });
    } else {
      const hist = raw.product_daily_history || {};
      baseRows.forEach((r) => {
        const byMonth = new Map<string, { qty: number; amount: number }>();
        const hRows = Array.isArray(hist[r.id]) ? hist[r.id] : [];
        hRows.forEach((h: any) => {
          const ds = String(h?.date || '').substring(0, 10);
          if (!ds || ds < derived.dateRangeStart || ds > derived.dateRangeEnd) return;
          const month = ds.substring(0, 7);
          if (!byMonth.has(month)) byMonth.set(month, { qty: 0, amount: 0 });
          const x = byMonth.get(month)!;
          x.qty += safeNum(h?.qty);
          x.amount += safeNum(h?.amount);
        });
        byMonth.forEach((x, m) => {
          rows.push({
            alias: r.alias || r.dCode || r.id,
            name: r.name,
            category: r.category,
            unitPrice: x.qty > 0 ? x.amount / x.qty : 0,
            qty: x.qty,
            amount: x.amount,
            stock: safeNum(r.totalStock),
            viewLabel: m,
          });
        });
      });
    }

    rows.sort((a, b) => b.qty - a.qty || b.amount - a.amount);
    const totalQty = rows.reduce((s, r) => s + safeNum(r.qty), 0);
    const totalAmount = rows.reduce((s, r) => s + safeNum(r.amount), 0);
    const totalStock = rows.reduce((s, r) => s + safeNum(r.stock), 0);

    const topByValue = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 10);
    const topByQty = [...rows].sort((a, b) => b.qty - a.qty).slice(0, 10);
    const categoryMap = new Map<string, { qty: number; amount: number }>();
    rows.forEach((r) => {
      const key = String(r.category || 'Uncategorized');
      if (!categoryMap.has(key)) categoryMap.set(key, { qty: 0, amount: 0 });
      const c = categoryMap.get(key)!;
      c.qty += safeNum(r.qty);
      c.amount += safeNum(r.amount);
    });
    const categoriesByValue = Array.from(categoryMap.entries()).map(([k, v]) => ({ category: k, qty: v.qty, amount: v.amount })).sort((a, b) => b.amount - a.amount).slice(0, 10);
    const categoriesByQty = Array.from(categoryMap.entries()).map(([k, v]) => ({ category: k, qty: v.qty, amount: v.amount })).sort((a, b) => b.qty - a.qty).slice(0, 10);

    return {
      rows,
      totalItems: rows.length,
      totalQty,
      totalAmount,
      totalStock,
      topByValue,
      topByQty,
      categoriesByValue,
      categoriesByQty,
    };
  }, [derived, raw, repCategories, repConditions, repLogic, repSearchMode, repStockStatus, repStore, repViewMode]);

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

    // Find stock from derived catalog
    const prod = derived.filteredCatalog.find(p => String(p.id) === String(productId));
    const totalStock = prod?.totalStock || 0;

    return { best, worst, zeroDays, totalQty, totalAmt, avgAmt, chart, totalStock };
  }, [derived, productId]);

  const addRepCondition = () => {
    setRepConditions((prev) => [...prev, { id: Date.now(), field: 'alias', op: 'contains', value: '' }]);
  };

  const resetExpandedRep = () => {
    setRepSearchMode('sales_stock');
    setRepStore('all');
    setRepCategories([]);
    setRepStockStatus('all');
    setRepViewMode('product');
    setRepLogic('AND');
    setRepConditions([{ id: 1, field: 'alias', op: 'contains', value: '' }]);
    setRepAnalysisOpen(false);
  };

  const exportExpandedRows = () => {
    if (!expandedRep?.rows?.length) {
      alert('لا توجد بيانات للتصدير');
      return;
    }
    const rows = expandedRep.rows.map((r: any) => ({
      Alias: r.alias,
      'اسم المنتج': r.name,
      'الفئة': r.category,
      'سعر البيع': r.unitPrice,
      'الكمية المباعة': r.qty,
      'إجمالي المبيعات': r.amount,
      'الستوك الحالي': r.stock,
      'التفصيل': r.viewLabel,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'REP Results');
    XLSX.writeFile(wb, `REP_${derived?.dateRangeStart || 'from'}_${derived?.dateRangeEnd || 'to'}.xlsx`);
  };

  const exportProductExcel = () => {
    if (!derived?.filteredCatalog?.length) {
      alert('لا توجد بيانات للتصدير');
      return;
    }
    const rows = derived.filteredCatalog.map((r: any) => ({
      'رقم المنتج': r.id,
      'اسم المنتج': r.name,
      'الفئة': r.category || '-',
      'الكمية': r.qty,
      'المبيعات (ر.س)': r.amount,
      'الكود القديم': r.old_code || '-',
      'الكود الجديد': r.dCode || r.alias || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تحليل المنتجات');
    XLSX.writeFile(wb, `تحليل_المنتجات_${derived.dateRangeStart}_${derived.dateRangeEnd}.xlsx`);
  };

  const exportProductPDF = async () => {
    if (!derived?.filteredCatalog?.length) {
      alert('لا توجد بيانات للتصدير');
      return;
    }
    try {
      await generateProductSummaryPDF(
        derived.filteredCatalog.map((r: any) => ({
          name: r.name || '',
          category: r.category,
          qty: r.qty || 0,
          amount: r.amount || 0,
        })),
        { start: derived.dateRangeStart, end: derived.dateRangeEnd }
      );
    } catch (e: any) {
      alert(e?.message || 'تعذر إنشاء PDF');
    }
  };

  if (!derived) {
    return <DashboardSkeleton />;
  }

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
            <PeriodButton active={mode === 'custom'} label="📆 فترة مخصصة" onClick={() => setMode('custom')} />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-700">{derived.dateRangeLabel}</span>
            <button
              type="button"
              onClick={exportProductExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold"
            >
              📊 تصدير Excel
            </button>
            <button
              type="button"
              onClick={exportProductPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-semibold"
            >
              📄 تصدير PDF
            </button>
            <button
              type="button"
              onClick={() => setExpandedRepOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 text-sm font-semibold"
            >
              📚 تقارير موسعة
            </button>
          </div>
        </div>
        {mode === 'custom' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="input"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <span className="text-neutral-400">→</span>
            <input
              type="date"
              className="input"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        )}

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

          <div className={`${user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}`}>
            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {(derived.cities || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className={`${user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}`}>
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
            <div className="text-xs font-semibold text-neutral-500 mb-1">الأقسام</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-secondary py-2 px-3 flex items-center gap-2"
                onClick={() => setCatalogOpen(true)}
              >
                <CubeIcon className="h-4 w-4" /> تصفح الأقسام
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-neutral-500 mb-1">بحث عن منتج</div>
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم المنتج أو Item ID..." />
        </div>
      </div>

      {/* Catalog list */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-bold text-neutral-900">📦 قائمة المنتجات</div>
            <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-5 gap-2 items-center w-full md:w-auto">
              <input
                type="text"
                className="input md:col-span-2 xl:col-span-2 min-w-0"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍   كود او اسم المنتج استخدم (+) لاكثر من كود"
                title="  كود او اسم المنتج استخدم (+) لاكثر من كود"
              />
              <input
                type="number"
                className="input min-w-0"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="السعر من"
                min={0}
              />
              <input
                type="number"
                className="input min-w-0"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="السعر إلى"
                min={0}
              />
              <select className="input min-w-0" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                <option value="all">كل الأقسام</option>
                {derived.catalogCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="text-sm text-neutral-600 md:col-span-4 xl:col-span-5">مرتبة حسب: 📦 الكمية</div>
            </div>
          </div>
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-1 text-xs font-extrabold text-white shadow-md shadow-orange-200">
              🏪 الفرع: {derived.selectedStoreLabel}
            </span>
          </div>
        </div>
        {/* Summary badges */}
        <div className="px-6 py-3 flex flex-wrap gap-4 border-b border-neutral-100">
          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-bold">عدد المنتجات: {derived.filteredCatalog.length.toLocaleString()}</span>
          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-bold">إجمالي الكمية: {Math.round(derived.filteredCatalog.reduce((s: number, p: any) => s + (p.qty || 0), 0)).toLocaleString()}</span>
          <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">إجمالي القيمة: {formatSAR(derived.filteredCatalog.reduce((s: number, p: any) => s + (p.amount || 0), 0))}</span>
          <span className="bg-violet-100 text-violet-700 px-3 py-1 rounded-full text-sm font-bold">
            نسبة الفئة (بالكمية): {derived.categorySharePercent.toFixed(1)}%
          </span>
          <span className="bg-fuchsia-100 text-fuchsia-700 px-3 py-1 rounded-full text-sm font-bold">
            نسبة الفئة بالقيمة: {derived.categorySharePercentByValue.toFixed(1)}%
          </span>
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
                <th className="th text-center" title="نسبة المبيعات من إجمالي التوفر (مبيعات + مخزون)">Sell-Through</th>
                <th className="th">Trend</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const totalPages = Math.max(1, Math.ceil(derived.filteredCatalog.length / ITEMS_PER_PAGE));
                const safePage = Math.min(currentPage, totalPages);
                const start = (safePage - 1) * ITEMS_PER_PAGE;
                const pageItems = derived.filteredCatalog.slice(start, start + ITEMS_PER_PAGE);
                return pageItems.map((p: any) => {
                  const stock = p.totalStock || 0;
                  const stRate = (p.qty + stock > 0) ? (p.qty / (p.qty + stock)) * 100 : 0;
                  const stColor = stRate >= 60 ? 'text-green-700 bg-green-100' : stRate <= 20 && p.qty > 0 ? 'text-red-700 bg-red-100' : 'text-orange-700 bg-orange-100';
                  return (
                    <tr
                      key={`${p.category}-${p.id}`}
                      className="hover:bg-orange-50 cursor-pointer"
                      onClick={() => {
                        setProductId(p.id);
                        setProductOpen(true);
                      }}
                    >
                      <td className="td">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-neutral-500 bg-neutral-100 px-1 rounded">{p.id}</span>
                            {(p.alias || p.old_code) && (
                              <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold">
                                {p.alias || p.old_code}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-neutral-900 mt-0.5">{p.name}</div>
                        </div>
                      </td>
                      <td className="td text-neutral-700">{p.category}</td>
                      <td className="td text-center">{Math.round(p.qty).toLocaleString()}</td>
                      <td className="td text-center font-bold text-green-700">{formatSAR(p.amount)}</td>
                      <td className="td text-center font-medium text-neutral-600 dir-ltr">{p.qty > 0 ? formatSAR(p.amount / p.qty) : '-'}</td>
                      <td className="td text-center">
                        {stock > 0 || p.qty > 0 ? (
                          <div className={`inline-block px-2 text-[11px] py-1 rounded-full font-bold dir-ltr ${stColor}`} title={`Stock: ${stock}`}>
                            {stRate.toFixed(1)}%
                          </div>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="td text-neutral-600">
                        <div className={`inline-flex items-center gap-2 font-semibold ${p.trend === 'UP' ? 'text-green-700' : p.trend === 'DOWN' ? 'text-red-600' : 'text-neutral-600'}`}>
                          {p.trend || '-'}
                          <span className="text-xs font-normal text-neutral-500">{p.trendReason || ''}</span>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
              {derived.filteredCatalog.length === 0 && (
                <tr>
                  <td className="td text-center text-neutral-500" colSpan={8}>
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

      <div className="mt-2">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-5 flex flex-col min-h-0">
          <div className="border-b border-neutral-100 pb-3 mb-4 shrink-0">
            <h3 className="text-lg font-bold text-neutral-900">تحليل المبيعات حسب القيمة</h3>
            <p className="text-xs text-neutral-500 mt-1">
              متوسط سعر القطعة يحدد الشريحة — الفترة: <span className="font-semibold text-neutral-700">{derived.dateRangeLabel}</span>
            </p>
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-1 text-xs font-extrabold text-white shadow-md shadow-orange-200">
                🏪 الفرع: {derived.selectedStoreLabel}
              </span>
            </div>
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[620px] pr-1 custom-scrollbar flex-1">
            <ValueTierGroup
              title="لحاف كينج"
              bucket={derived.valueAnalysis.duvetKing}
              tierLabels={['قيمة منخفضة (99–300 ر.س)', 'قيمة متوسطة (301–600 ر.س)', 'قيمة عالية (أكثر من 600 ر.س)']}
              totalUnitsLabel={mode === 'mtd' ? 'إجمالي الوحدات (منذ بداية الشهر)' : 'إجمالي الوحدات (الفترة المحددة)'}
            />
            <ValueTierGroup
              title="لحاف فل"
              bucket={derived.valueAnalysis.duvetFull}
              tierLabels={['قيمة منخفضة (حتى 300 ر.س)', 'قيمة متوسطة (301–499 ر.س)', 'قيمة عالية (500 ر.س فأكثر)']}
              totalUnitsLabel={mode === 'mtd' ? 'إجمالي الوحدات (منذ بداية الشهر)' : 'إجمالي الوحدات (الفترة المحددة)'}
            />
            <ValueTierGroup
              title="مخدات"
              bucket={derived.valueAnalysis.pillows}
              tierLabels={['قيمة منخفضة (حتى 99 ر.س)', 'قيمة متوسطة (100–189 ر.س)', 'قيمة عالية (190 ر.س فأكثر)']}
              totalUnitsLabel={mode === 'mtd' ? 'إجمالي الوحدات (منذ بداية الشهر)' : 'إجمالي الوحدات (الفترة المحددة)'}
            />
          </div>
        </div>
      </div>

      {/* Market basket */}
      <ChartCard title={`🧺 الأنماط الشرائية (Market Basket) — ${derived.selectedStoreLabel}`}>
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
      <ChartCard title={`❗ فرص ضائعة (Missed Opportunities) — ${derived.selectedStoreLabel}`}>
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

      <Modal open={expandedRepOpen} onClose={() => setExpandedRepOpen(false)} title="📚 تقارير موسعة" maxWidthClass="max-w-[96vw]">
        <div className="space-y-5">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-4">
            <h3 className="font-bold text-neutral-900">🔍 البحث والفلترة</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">🎯 نوع البحث</div>
                <select className="input" value={repSearchMode} onChange={(e) => setRepSearchMode(e.target.value as RepSearchMode)}>
                  <option value="sales_stock">المبيعات والمخزون</option>
                  <option value="stock_only">المخزون فقط (بدون مبيعات)</option>
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">📅 من تاريخ</div>
                <input className="input" type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setMode('custom'); }} />
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">📅 إلى تاريخ</div>
                <input className="input" type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setMode('custom'); }} />
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">🏪 المعرض</div>
                <select className="input" value={repStore} onChange={(e) => setRepStore(e.target.value)}>
                  <option value="all">الكل</option>
                  {derived.storeOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">📂 الفئة (Ctrl للتحديد المتباعد)</div>
                <select
                  multiple
                  className="input h-28"
                  value={repCategories}
                  onChange={(e) => {
                    const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                    setRepCategories(vals);
                  }}
                >
                  {derived.catalogCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">📦 حالة المخزون</div>
                <select className="input" value={repStockStatus} onChange={(e) => setRepStockStatus(e.target.value as RepStockStatus)}>
                  <option value="all">الكل</option>
                  <option value="in_stock">متوفر (&gt; 0)</option>
                  <option value="low">منخفض (1-10)</option>
                  <option value="out">نفذت الكمية (0)</option>
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">🏪 طريقة العرض</div>
                <select className="input" value={repViewMode} onChange={(e) => setRepViewMode(e.target.value as RepViewMode)}>
                  <option value="product">مجمع حسب المنتج</option>
                  <option value="store">مفصل حسب المعرض</option>
                  <option value="month">مفصل حسب الشهر</option>
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-3 space-y-2">
              <div className="flex items-center gap-3">
                <h4 className="font-semibold text-neutral-800">🏷️ شروط البحث المتقدمة (كود أو اسم المنتج)</h4>
                <select className="input w-24" value={repLogic} onChange={(e) => setRepLogic(e.target.value as RepLogic)}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </div>
              {repConditions.map((c) => (
                <div key={c.id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                  <select className="input md:col-span-2" value={c.field} onChange={(e) => setRepConditions((prev) => prev.map((x) => x.id === c.id ? { ...x, field: e.target.value as RepField } : x))}>
                    <option value="alias">الكود (Alias)</option>
                    <option value="name">الاسم (Name)</option>
                  </select>
                  <select className="input md:col-span-3" value={c.op} onChange={(e) => setRepConditions((prev) => prev.map((x) => x.id === c.id ? { ...x, op: e.target.value as RepOp } : x))}>
                    <option value="contains">يحتوي على</option>
                    <option value="equals">يساوي</option>
                    <option value="not_equals">لا يساوي</option>
                    <option value="starts_with">يبدأ بـ</option>
                    <option value="in_list">ضمن قائمة</option>
                  </select>
                  <input className="input md:col-span-6" value={c.value} onChange={(e) => setRepConditions((prev) => prev.map((x) => x.id === c.id ? { ...x, value: e.target.value } : x))} placeholder="القيمة..." />
                  <button type="button" className="input md:col-span-1 text-red-600" onClick={() => setRepConditions((prev) => prev.length > 1 ? prev.filter((x) => x.id !== c.id) : prev)}>✕</button>
                </div>
              ))}
              <button type="button" className="btn-secondary py-2 px-3 text-sm" onClick={addRepCondition}>+ إضافة شرط</button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold" onClick={() => setMode('custom')}>🔍 بحث</button>
              <button type="button" className="px-3 py-2 bg-neutral-800 text-white rounded-lg text-sm font-bold" onClick={() => setRepAnalysisOpen((v) => !v)}>🧠 التحليل</button>
              <button type="button" className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold" onClick={exportExpandedRows}>📊 تصدير Excel</button>
              <button type="button" className="px-3 py-2 bg-emerald-700 text-white rounded-lg text-sm font-bold" onClick={exportExpandedRows}>📥 تصدير الأكثر مبيعاً</button>
              <button type="button" className="px-3 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold" onClick={exportExpandedRows}>📥 تقرير الأكثر مبيعاً-فئات</button>
              <button type="button" className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold" onClick={exportProductPDF}>📄 تصدير PDF</button>
              <button type="button" className="px-3 py-2 bg-neutral-200 text-neutral-700 rounded-lg text-sm font-bold" onClick={resetExpandedRep}>🔄 إعادة تعيين</button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <KPICard title="عدد الأصناف" value={expandedRep?.totalItems || 0} format={(v) => Math.round(v).toLocaleString()} icon={<CubeIcon />} />
            <KPICard title="إجمالي الكمية" value={expandedRep?.totalQty || 0} format={(v) => Math.round(v).toLocaleString()} icon={<InvoicesIcon />} />
            <KPICard title="إجمالي المبيعات (ر.س)" value={expandedRep?.totalAmount || 0} format={formatSAR} icon={<SalesIcon />} />
            <KPICard title="إجمالي الستوك الحالي" value={expandedRep?.totalStock || 0} format={(v) => Math.round(v).toLocaleString()} icon={<VisitorsIcon />} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="🏆 المنتجات الأكثر مبيعاً (قيمة)">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead><tr><th className="th">Alias</th><th className="th">اسم المنتج</th><th className="th text-center">القيمة</th></tr></thead>
                  <tbody>{(expandedRep?.topByValue || []).map((r: any, i: number) => <tr key={`v-${i}`}><td className="td font-mono">{r.alias}</td><td className="td">{r.name}</td><td className="td text-center">{formatSAR(r.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            </ChartCard>
            <ChartCard title="🔥 المنتجات الأكثر مبيعاً (كمية)">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead><tr><th className="th">Alias</th><th className="th">اسم المنتج</th><th className="th text-center">الكمية</th></tr></thead>
                  <tbody>{(expandedRep?.topByQty || []).map((r: any, i: number) => <tr key={`q-${i}`}><td className="td font-mono">{r.alias}</td><td className="td">{r.name}</td><td className="td text-center">{Math.round(r.qty).toLocaleString()}</td></tr>)}</tbody>
                </table>
              </div>
            </ChartCard>
            <ChartCard title="📁 الفئات الأكثر مبيعاً (قيمة)">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead><tr><th className="th">الفئة</th><th className="th text-center">القيمة</th></tr></thead>
                  <tbody>{(expandedRep?.categoriesByValue || []).map((r: any, i: number) => <tr key={`cv-${i}`}><td className="td">{r.category}</td><td className="td text-center">{formatSAR(r.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            </ChartCard>
            <ChartCard title="📦 الفئات الأكثر مبيعاً (كمية)">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead><tr><th className="th">الفئة</th><th className="th text-center">الكمية</th></tr></thead>
                  <tbody>{(expandedRep?.categoriesByQty || []).map((r: any, i: number) => <tr key={`cq-${i}`}><td className="td">{r.category}</td><td className="td text-center">{Math.round(r.qty).toLocaleString()}</td></tr>)}</tbody>
                </table>
              </div>
            </ChartCard>
          </div>

          <ChartCard title="📋 نتائج البحث">
            <div className="text-xs text-neutral-500 mb-2">{expandedRep?.rows?.length || 0}</div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="th">#</th>
                    <th className="th">Alias</th>
                    <th className="th">اسم المنتج</th>
                    <th className="th">الفئة</th>
                    <th className="th text-center">سعر البيع</th>
                    <th className="th text-center">الكمية المباعة</th>
                    <th className="th text-center">إجمالي المبيعات</th>
                    <th className="th text-center">الستوك الحالي</th>
                    <th className="th text-center">{repViewMode === 'store' ? 'المعرض' : repViewMode === 'month' ? 'الشهر' : '-'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(expandedRep?.rows || []).slice(0, 400).map((r: any, i: number) => (
                    <tr key={`rep-row-${i}`}>
                      <td className="td">{i + 1}</td>
                      <td className="td font-mono">{r.alias}</td>
                      <td className="td">{r.name}</td>
                      <td className="td">{r.category}</td>
                      <td className="td text-center">{formatSAR(r.unitPrice)}</td>
                      <td className="td text-center">{Math.round(r.qty).toLocaleString()}</td>
                      <td className="td text-center">{formatSAR(r.amount)}</td>
                      <td className="td text-center">{Math.round(r.stock).toLocaleString()}</td>
                      <td className="td text-center">{r.viewLabel}</td>
                    </tr>
                  ))}
                  {!expandedRep?.rows?.length && (
                    <tr><td className="td text-center text-neutral-500" colSpan={9}>لا توجد نتائج.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>

          {repAnalysisOpen && (
            <ChartCard title="🧠 التحليل (Analysis)">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-neutral-600">📥 تصدير التقرير (Excel)</div>
                <button type="button" className="btn-secondary py-1 px-3" onClick={exportExpandedRows}>📥 تصدير</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="th">الفئة السعرية (ر.س)</th>
                      <th className="th text-center">لحافات توين</th>
                      <th className="th text-center">لحافات فل</th>
                      <th className="th text-center">لحافات كوين</th>
                      <th className="th text-center">لحافات كينغ</th>
                      <th className="th text-center">إجمالي الستوك المتوفر</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="td">منخفض/متوسط/مرتفع</td>
                      <td className="td text-center">—</td>
                      <td className="td text-center">—</td>
                      <td className="td text-center">—</td>
                      <td className="td text-center">—</td>
                      <td className="td text-center">{Math.round(expandedRep?.totalStock || 0).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
        </div>
      </Modal>

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
              <KPICard title="Total Amount" value={productKpis.totalAmt} format={formatSAR} icon={<SalesIcon />} />
              <KPICard title="Avg / Day" value={productKpis.avgAmt} format={formatSAR} icon={<InvoicesIcon />} />
              <KPICard title="Zero Days" value={productKpis.zeroDays} format={(v) => Math.round(v).toLocaleString()} icon={<VisitorsIcon />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartCard title="📊 تحليل حركة المخزون (Sell-Through)">
                <div className="space-y-6 py-2">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                    <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Inventory Health</div>
                    {(() => {
                      const stVal = productKpis.totalStock || 0;
                      const health = stVal === 0 ? { l: 'Out of Stock', c: 'text-red-600', b: 'bg-red-50' } :
                        stVal < 20 ? { l: 'Critical Stock', c: 'text-orange-600', b: 'bg-orange-50' } :
                          stVal > 500 ? { l: 'High Inventory', c: 'text-blue-600', b: 'bg-blue-50' } :
                            { l: 'Optimal Stock', c: 'text-emerald-600', b: 'bg-emerald-50' };
                      return <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${health.b} ${health.c}`}>{health.l}</div>;
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                      <div className="text-[10px] text-neutral-400 font-bold mb-1">Sell-Through %</div>
                      {(() => {
                        const sls = productKpis.totalQty || 0;
                        const st = productKpis.totalStock || 0;
                        const total = sls + st;
                        const ratio = total > 0 ? (sls / total) * 100 : 0;
                        return (
                          <>
                            <div className="text-2xl font-black text-neutral-800">{ratio.toFixed(1)}%</div>
                            <div className="mt-2 w-full bg-neutral-200 h-1.5 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${ratio}%` }} />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                      <div className="text-[10px] text-neutral-400 font-bold mb-1">Stock On Hand</div>
                      <div className="text-2xl font-black text-neutral-800">{(productKpis.totalStock || 0).toLocaleString()}</div>
                      <div className="text-[10px] text-neutral-400 mt-1 truncate">Current across all stores</div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center text-xs pb-2 border-b border-neutral-50">
                      <span className="text-neutral-500 font-bold">Sales Velocity</span>
                      {(() => {
                        const days = productKpis.chart?.length || 1;
                        return <span className="text-neutral-800 font-black">{(productKpis.totalQty / days).toFixed(2)} pcs / day</span>;
                      })()}
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-neutral-500 font-bold">Days to Empty (Est)</span>
                      {(() => {
                        const velocity = productKpis.totalQty / (productKpis.chart?.length || 1);
                        const dte = velocity > 0 ? Math.ceil(productKpis.totalStock / velocity) : '∞';
                        return <span className={`font-black ${Number(dte) < 7 ? 'text-red-600' : 'text-neutral-800'}`}>{dte} days</span>;
                      })()}
                    </div>
                  </div>
                </div>
              </ChartCard>

              <ChartCard title="📉 التاريخ اليومي">
                <div className="h-[280px]">
                  <LineChart data={productKpis.chart} />
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

