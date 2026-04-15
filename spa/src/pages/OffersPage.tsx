import React, { useEffect, useMemo, useState } from 'react';
import { loadOffersData, loadManagementData, loadProductMapping } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { DownloadIcon, XIcon, TagIcon, SalesIcon, InvoicesIcon, PremiumTargetIcon, CustomerValueIcon, FireIcon } from '../components/Icons';
import { KPICard } from '../components/DashboardComponents';
import * as XLSX from 'xlsx';
import { generateOffersPDF } from '../services/pdf/pdfService';

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

type PeriodKey = 'mtd' | '7d' | '14d' | '30d' | 'yest' | 'custom';
type FlashDealComponent = { label: string; itemCode: string; resolvedOfferItemIds?: string[] };
type FlashDeal = { id: string; name: string; components: FlashDealComponent[] };

const FLASH_DEALS_STORAGE_KEY = 'ora.offers.flashDeals.v1';
const DEFAULT_FLASH_DEALS: FlashDeal[] = [
  {
    id: 'flash-peach-caspian-4489420',
    name: 'فلاش ديل لحاف Peach Caspian - 395',
    components: [{ label: 'لحاف Peach Caspian', itemCode: '4489420' }],
  },
  {
    id: 'flash-lahaf-495-bundle',
    name: 'فلاش ديل أطقم اللحاف - 495',
    components: [
      { label: 'ANNETTE GREY PINK', itemCode: '4489416' },
      { label: 'JOUY DE TOILE', itemCode: '4489424' },
      { label: 'Dakota Linen', itemCode: '4489419' },
      { label: 'STRIPE GRAPE PURPLE', itemCode: '4489403' },
      { label: 'PARADIES BIRDS', itemCode: '4489418' },
    ],
  },
  {
    id: 'flash-199-quilt-pillow',
    name: 'فلاش ديل لحاف 199 + مخدة مجاناً',
    components: [
      { label: 'لحاف مفرد 199', itemCode: '2701' },
      { label: 'Perfect pillow (مجاني)', itemCode: '9619' },
    ],
  },
];

function loadFlashDeals(): FlashDeal[] {
  try {
    const raw = window.localStorage.getItem(FLASH_DEALS_STORAGE_KEY);
    if (!raw) return DEFAULT_FLASH_DEALS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_FLASH_DEALS;
    const cleaned = parsed
      .map((d: any) => ({
        id: String(d?.id || ''),
        name: String(d?.name || '').trim(),
        components: Array.isArray(d?.components)
          ? d.components
              .map((c: any) => ({
                label: String(c?.label || '').trim(),
                itemCode: String(c?.itemCode || '').trim(),
                resolvedOfferItemIds: Array.isArray(c?.resolvedOfferItemIds)
                  ? c.resolvedOfferItemIds.map((x: any) => String(x || '').trim()).filter(Boolean)
                  : undefined,
              }))
              .filter((c: FlashDealComponent) => c.label && c.itemCode)
          : [],
      }))
      .filter((d: FlashDeal) => d.id && d.name && d.components.length);
    return cleaned.length ? cleaned : DEFAULT_FLASH_DEALS;
  } catch {
    return DEFAULT_FLASH_DEALS;
  }
}

export default function OffersPage() {
  const user = getCurrentUser();
  const [data, setData] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [productMapping, setProductMapping] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [storeType, setStoreType] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodKey>('mtd');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [sortMode, setSortMode] = useState<'sales' | 'smart' | 'eff'>('sales');

  // -- [NEW] View Mode State --
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // -- [NEW] Comparison & Copy Logic --
  const [compareList, setCompareList] = useState<any[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [flashDeals, setFlashDeals] = useState<FlashDeal[]>(() => loadFlashDeals());
  const [flashStart, setFlashStart] = useState('');
  const [flashEnd, setFlashEnd] = useState('');
  const [showFlashEditor, setShowFlashEditor] = useState(false);
  const [flashDraftName, setFlashDraftName] = useState('');
  const [flashDraftComponents, setFlashDraftComponents] = useState<FlashDealComponent[]>([
    { label: '', itemCode: '' },
  ]);

  useEffect(() => {
    loadOffersData()
      .then(setData)
      .catch((e) => setErr(e?.message || String(e)));
    loadManagementData().then(setMgmt).catch(() => { });
    loadProductMapping().then((rows) => setProductMapping(Array.isArray(rows) ? rows : [])).catch(() => setProductMapping([]));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FLASH_DEALS_STORAGE_KEY, JSON.stringify(flashDeals));
    } catch {
      // Ignore persistence errors and keep UI working.
    }
  }, [flashDeals]);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const { managers, branches, cities, allowedStoreIds } = useMemo(() => {
    const meta: Record<string, { manager?: string; city?: string; type?: string }> = mgmt?.store_meta || {};
    const stores = mgmt?.stores || {};
    const managersSet = new Set<string>();
    const citiesSet = new Set<string>();
    Object.values(meta).forEach((m: any) => {
      if (m?.manager) managersSet.add(String(m.manager));
      if (m?.city) citiesSet.add(String(m.city));
    });
    const managers = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const cities = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const branches = Object.keys(stores)
      .filter((sid) => {
        const m = meta[sid];
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && String(m?.city || '') !== city) return false;
        if (storeType !== 'all') {
          const type = String(m?.type || '').toLowerCase();
          const isOnline = type === 'online' || type === 'platform' || type === 'warehouse';
          if (storeType === 'online' && !isOnline) return false;
          if (storeType === 'store' && isOnline) return false;
        }
        return true;
      })
      .sort((a, b) => (stores[a] || a).localeCompare(stores[b] || b, 'ar'));
    const allowed = new Set<string>();
    if (branch === 'all' && effectiveManager === 'all' && city === 'all') {
      Object.keys(stores).forEach((sid) => allowed.add(sid));
    } else {
      Object.keys(meta).forEach((sid) => {
        const m = meta[sid];
        if (branch !== 'all' && sid !== branch) return;
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return;
        if (city !== 'all' && String(m?.city || '') !== city) return;
        allowed.add(sid);
      });
      if (allowed.size === 0) Object.keys(stores).forEach((sid) => allowed.add(sid));
    }
    return { managers, branches, cities, allowedStoreIds: allowed };
  }, [mgmt, branch, city, effectiveManager, storeType]);

  const rawOffers = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : (Array.isArray(data?.offers) ? data.offers : []);
  }, [data]);

  // Compute date range based on period
  const dateRange = useMemo(() => {
    const now = new Date();
    const todayYMD = toYMD(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayYMD = toYMD(yesterday);
    const ymd = (d: Date) => toYMD(d);

    if (period === 'yest') return { start: yesterdayYMD, end: yesterdayYMD, label: 'أمس' };
    if (period === '7d') {
      const s = new Date(now); s.setDate(now.getDate() - 7);
      return { start: ymd(s), end: yesterdayYMD, label: 'آخر 7 أيام' };
    }
    if (period === '14d') {
      const s = new Date(now); s.setDate(now.getDate() - 14);
      return { start: ymd(s), end: yesterdayYMD, label: 'آخر 14 يوم' };
    }
    if (period === '30d') {
      const s = new Date(now); s.setDate(now.getDate() - 30);
      return { start: ymd(s), end: yesterdayYMD, label: 'آخر 30 يوم' };
    }
    if (period === 'mtd') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const endMtd = yesterday.getMonth() !== now.getMonth() ? now : yesterday;
      return { start: ymd(s), end: ymd(endMtd), label: 'الشهر الحالي' };
    }
    if (period === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd, label: 'فترة مخصصة' };
    }
    return { start: todayYMD, end: todayYMD, label: 'اليوم' };
  }, [period, customStart, customEnd]);

  const offers = useMemo(() => {
    const { start, end } = dateRange;
    const now = new Date();
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayYMD = toYMD(yesterdayDate);
    const storesMap = mgmt?.stores || {};

    let processedOffers = rawOffers.map((o: any) => {
      let yestSales = 0, yestDisc = 0, yestOps = 0;
      let periodSales = 0, periodDisc = 0, periodOps = 0;

      const storeBreakdown: Record<string, { sales: number; disc: number; ops: number; name: string }> = {};

      // Aggregate from stats (daily per-store sale records)
      const statsArray = o.stats || [];
      statsArray.forEach((s: any) => {
        const d = s.d;
        const sid = String(s.s);
        if (!allowedStoreIds.has(sid)) return;

        if (d >= start && d <= end) {
          const sale = Number(s.bill ?? s.sale ?? 0);
          const disc = Number(s.disc ?? 0);
          const cnt = Number(s.cnt ?? 0);
          periodSales += sale;
          periodDisc += disc;
          periodOps += cnt;

          if (!storeBreakdown[sid]) storeBreakdown[sid] = { sales: 0, disc: 0, ops: 0, name: storesMap[sid] || sid };
          storeBreakdown[sid].sales += sale;
          storeBreakdown[sid].disc += disc;
          storeBreakdown[sid].ops += cnt;
        }
        if (d === yesterdayYMD) {
          yestSales += Number(s.bill ?? s.sale ?? 0);
          yestDisc += Number(s.disc ?? 0);
          yestOps += Number(s.cnt ?? 0);
        }
      });

      // Legacy fallback
      if (periodSales === 0 && periodOps === 0 && o.stores) {
        Object.keys(o.stores).forEach(sid => {
          if (allowedStoreIds.has(String(sid))) {
            const sObj = o.stores[sid] || {};
            const sale = Number(sObj.s_m ?? 0);
            const disc = Number(sObj.d_m ?? 0);
            const ops = Number(sObj.t_m ?? 0);
            periodSales += sale;
            periodDisc += disc;
            periodOps += ops;
            yestSales += Number(sObj.s_y ?? 0);
            yestDisc += Number(sObj.d_y ?? 0);
            yestOps += Number(sObj.t_y ?? 0);

            if (!storeBreakdown[sid]) storeBreakdown[sid] = { sales: 0, disc: 0, ops: 0, name: storesMap[sid] || sid };
            storeBreakdown[sid].sales += sale;
            storeBreakdown[sid].disc += disc;
            storeBreakdown[sid].ops += ops;
          }
        });
      }

      // Aggregate items within date range and allowed stores
      const itemsRaw = o.items || [];
      const itemAgg: Record<string, { id: string; name: string; qty: number }> = {};
      itemsRaw.forEach((it: any) => {
        const d = it.d;
        const sid = String(it.s || '');
        // Filter by date range and store
        if (d && d >= start && d <= end && (sid === '' || allowedStoreIds.has(sid))) {
          const itemId = String(it.i || it.id || it.item_id || '');
          const itemName = String(it.n || it.name || it.item_name || itemId);
          const qty = Math.abs(Number(it.q || it.qty || it.quantity || 0));
          if (!itemId) return;
          if (!itemAgg[itemId]) itemAgg[itemId] = { id: itemId, name: itemName, qty: 0 };
          itemAgg[itemId].qty += qty;
          // Use the longest/most descriptive name
          if (itemName.length > itemAgg[itemId].name.length) itemAgg[itemId].name = itemName;
        }
      });
      const aggregatedItems = Object.values(itemAgg).sort((a, b) => b.qty - a.qty);

      const periodEff = periodSales > 0 ? (periodSales / (periodSales + periodDisc)) * 100 : 100;
      const periodAvgBasket = periodOps > 0 ? periodSales / periodOps : 0;

      // Smart Score Calculation
      // Sales (40%), Efficiency (40%), Volume (20%) - Adjusted roughly
      // Normalize? For now, raw score: (Sales/1000 * 0.4) + (Eff * 0.4) + (Ops * 0.2)
      // Using a base of 1000 for sales to make it comparable to Eff (0-100) and Ops (can be large)
      const scoreSales = (periodSales / 1000) * 0.4;
      const scoreEff = periodEff * 0.4;
      const scoreOps = (periodOps / 10) * 0.2; // Assuming average ops are in tens/hundreds, adjust divisor as needed

      const smartScore = scoreSales + scoreEff + scoreOps;

      return {
        ...o,
        yestSales, yestDisc, yestOps,
        periodSales, periodDisc, periodOps,
        yestEff: yestSales > 0 ? (yestSales / (yestSales + yestDisc)) * 100 : 100,
        periodEff,
        periodAvgBasket,
        storeBreakdown,
        aggregatedItems,
        smartScore,
      };
    }).filter((o: any) => {
      if (statusFilter === 'Enabled' && (o.status === 'Disabled' || o.enabled === false)) return false;
      if (statusFilter === 'Disabled' && (o.status !== 'Disabled' && o.enabled !== false)) return false;
      return o.periodSales > 0 || o.periodOps > 0 || o.yestSales > 0;
    });

    // Apply sorting based on sortMode
    if (sortMode === 'smart') {
      processedOffers.sort((a: any, b: any) => b.smartScore - a.smartScore);
    } else if (sortMode === 'eff') {
      processedOffers.sort((a: any, b: any) => b.periodEff - a.periodEff);
    } else { // Default to 'sales'
      processedOffers.sort((a: any, b: any) => b.periodSales - a.periodSales);
    }

    return processedOffers;
  }, [rawOffers, allowedStoreIds, dateRange, statusFilter, mgmt, sortMode]);

  useEffect(() => {
    if (!flashStart) setFlashStart(dateRange.start);
    if (!flashEnd) setFlashEnd(dateRange.end);
  }, [dateRange.start, dateRange.end, flashStart, flashEnd]);

  const flashDateRange = useMemo(() => {
    const start = flashStart || dateRange.start;
    const end = flashEnd || dateRange.end;
    if (start <= end) return { start, end };
    return { start: end, end: start };
  }, [flashStart, flashEnd, dateRange.start, dateRange.end]);

  const allOfferItems = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    rawOffers.forEach((o: any) => {
      const itemsRaw = Array.isArray(o?.items) ? o.items : [];
      itemsRaw.forEach((it: any) => {
        const itemId = String(it?.i || it?.id || it?.item_id || '').trim();
        if (!itemId) return;
        const itemName = String(it?.n || it?.name || it?.item_name || itemId).trim();
        const prev = byId.get(itemId);
        if (!prev || itemName.length > prev.name.length) byId.set(itemId, { id: itemId, name: itemName || itemId });
      });
    });
    return Array.from(byId.values());
  }, [rawOffers]);

  const flashLookup = useMemo(() => {
    const offerNameById = new Map(allOfferItems.map((x) => [x.id, x.name] as const));
    const tokenToItemIds = new Map<string, Set<string>>();

    const attachToken = (tokenRaw: string, itemIds: string[]) => {
      const token = tokenRaw.trim();
      if (!token || !itemIds.length) return;
      if (!tokenToItemIds.has(token)) tokenToItemIds.set(token, new Set());
      const dst = tokenToItemIds.get(token)!;
      itemIds.forEach((id) => dst.add(id));
    };

    allOfferItems.forEach((x) => attachToken(x.id, [x.id]));
    productMapping.forEach((m: any) => {
      const id = String(m?.id || '').trim();
      const dCode = String(m?.dCode || '').trim();
      const alias = String(m?.alias || '').trim();
      const candidates = Array.from(new Set([id, dCode, alias].filter(Boolean)));
      if (!candidates.length) return;
      [id, dCode, alias].forEach((token) => attachToken(token, candidates));
    });

    const suggestions = new Map<string, { token: string; offerItemId: string; name: string }>();
    tokenToItemIds.forEach((itemIds, token) => {
      itemIds.forEach((itemId) => {
        const key = `${token}::${itemId}`;
        suggestions.set(key, {
          token,
          offerItemId: itemId,
          name: offerNameById.get(itemId) || String(
            productMapping.find((x: any) =>
              String(x?.id || '').trim() === itemId ||
              String(x?.dCode || '').trim() === itemId ||
              String(x?.alias || '').trim() === itemId
            )?.name || itemId
          ),
        });
      });
    });

    return {
      tokenToItemIds,
      suggestions: Array.from(suggestions.values()).sort((a, b) => a.token.localeCompare(b.token)),
    };
  }, [allOfferItems, productMapping]);

  const resolveOfferItemIds = (token: string): string[] => {
    const t = token.trim();
    if (!t) return [];
    const ids = flashLookup.tokenToItemIds.get(t);
    return ids ? Array.from(ids) : [];
  };

  const flashDealRows = useMemo(() => {
    const qtyByItem = new Map<string, number>();
    rawOffers.forEach((o: any) => {
      const itemsRaw = Array.isArray(o?.items) ? o.items : [];
      itemsRaw.forEach((it: any) => {
        const d = String(it?.d || '').substring(0, 10);
        const sid = String(it?.s || '');
        if (!d || d < flashDateRange.start || d > flashDateRange.end) return;
        if (sid && !allowedStoreIds.has(sid)) return;
        const itemId = String(it?.i || it?.id || it?.item_id || '').trim();
        if (!itemId) return;
        const qty = Math.abs(Number(it?.q || it?.qty || it?.quantity || 0));
        if (!Number.isFinite(qty) || qty <= 0) return;
        qtyByItem.set(itemId, (qtyByItem.get(itemId) || 0) + qty);
      });
    });

    return flashDeals.map((deal) => {
      const components = deal.components.map((comp) => {
        const fallbackIds = resolveOfferItemIds(comp.itemCode);
        const resolvedIds = comp.resolvedOfferItemIds?.length ? comp.resolvedOfferItemIds : fallbackIds;
        const sold = resolvedIds.reduce((sum, id) => sum + (qtyByItem.get(id) || 0), 0);
        return { ...comp, sold, resolvedOfferItemIds: resolvedIds };
      });
      const estimatedBundleSales = components.length ? Math.min(...components.map((c) => c.sold)) : 0;
      return { ...deal, components, estimatedBundleSales };
    });
  }, [rawOffers, flashDeals, flashDateRange.start, flashDateRange.end, allowedStoreIds, flashLookup]);

  const resetFlashDraft = () => {
    setFlashDraftName('');
    setFlashDraftComponents([{ label: '', itemCode: '' }]);
  };

  const addFlashDeal = () => {
    const name = flashDraftName.trim();
    const draftRows = flashDraftComponents
      .map((c) => ({
        label: c.label.trim(),
        itemCode: c.itemCode.trim(),
        resolvedOfferItemIds: c.resolvedOfferItemIds?.length ? c.resolvedOfferItemIds : resolveOfferItemIds(c.itemCode),
      }))
      .filter((c) => c.label && c.itemCode);
    if (!name || !draftRows.length) {
      alert('أدخل اسم العرض ومكوّناً واحداً على الأقل.');
      return;
    }
    const unresolved = draftRows.filter((c) => !(c.resolvedOfferItemIds && c.resolvedOfferItemIds.length));
    if (unresolved.length) {
      alert('يوجد منتجات غير مرتبطة بداتا العروض. اخترها من نتائج البحث المقترحة لضمان دقة الأرقام.');
      return;
    }
    const components = draftRows as Array<{ label: string; itemCode: string; resolvedOfferItemIds: string[] }>;
    const deal: FlashDeal = {
      id: `flash-${Date.now()}`,
      name,
      components,
    };
    setFlashDeals((prev) => [deal, ...prev]);
    resetFlashDraft();
    setShowFlashEditor(false);
  };

  const removeFlashDeal = (dealId: string) => {
    setFlashDeals((prev) => prev.filter((d) => d.id !== dealId));
  };

  const getFlashSuggestions = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return flashLookup.suggestions.slice(0, 20);
    return flashLookup.suggestions
      .filter((s) => s.token.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 20);
  };

  const stats = useMemo(() => {
    const res = offers.reduce((acc: any, o: any) => {
      acc.totalYest += o.yestSales;
      acc.totalPeriod += o.periodSales;
      acc.totalYestOps += o.yestOps;
      acc.totalPeriodOps += o.periodOps;
      acc.totalPeriodDisc += o.periodDisc;
      return acc;
    }, { totalYest: 0, totalPeriod: 0, totalYestOps: 0, totalPeriodOps: 0, totalPeriodDisc: 0 });

    return {
      ...res,
      totalOffers: offers.length,
      periodEff: res.totalPeriod > 0 ? (res.totalPeriod / (res.totalPeriod + res.totalPeriodDisc)) * 100 : 0,
      periodAvgBasket: res.totalPeriodOps > 0 ? res.totalPeriod / res.totalPeriodOps : 0,
    };
  }, [offers]);

  // Top products across all offers (aggregated items)
  const topProducts = useMemo(() => {
    const prodMap = new Map<string, { id: string; name: string; qty: number; offerCount: number }>();
    offers.forEach((o: any) => {
      const items = o.aggregatedItems || [];
      items.forEach((it: any) => {
        const prev = prodMap.get(it.id) || { id: it.id, name: it.name, qty: 0, offerCount: 0 };
        prev.qty += it.qty;
        prev.offerCount += 1;
        if (it.name.length > prev.name.length) prev.name = it.name;
        prodMap.set(it.id, prev);
      });
    });
    return Array.from(prodMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [offers]);

  // Efficiency summary
  const efficiencySummary = useMemo(() => {
    return [...offers]
      .filter((o: any) => o.periodSales > 0)
      .sort((a: any, b: any) => b.periodEff - a.periodEff)
      .slice(0, 15)
      .map((o: any) => ({
        name: o.name || o.offer_name || o.id || '-',
        periodEff: o.periodEff,
        periodAvgBasket: o.periodAvgBasket,
        periodSales: o.periodSales,
        periodOps: o.periodOps,
      }));
  }, [offers]);

  const exportToExcel = () => {
    const rows = offers.map((o: any) => ({
      'كود العرض': o.id || o.code,
      'اسم العرض': o.name,
      'الحالة': o.status === 'Enabled' ? 'مفعل' : 'معطل',
      'مبيعات أمس': o.yestSales,
      [`مبيعات (${dateRange.label})`]: o.periodSales,
      'عمليات أمس': o.yestOps,
      [`عمليات (${dateRange.label})`]: o.periodOps,
      [`خصم (${dateRange.label})`]: o.periodDisc,
      'كفاءة %': o.periodEff.toFixed(1) + '%',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Offers Report');
    XLSX.writeFile(wb, `Offers_Report_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  const exportToPDF = async () => {
    if (!offers.length) {
      alert('لا توجد بيانات للتصدير');
      return;
    }
    try {
      await generateOffersPDF(
        offers.map((o: any) => ({
          name: o.name || '',
          start: o.start_date,
          end: o.end_date,
          periodSales: o.periodSales || 0,
          periodDisc: o.periodDisc || 0,
          periodOps: o.periodOps || 0,
          periodEff: o.periodEff ?? 0,
          periodAvgBasket: o.periodAvgBasket || 0,
        })),
        { start: dateRange.start, end: dateRange.end, label: dateRange.label }
      );
    } catch (e: any) {
      alert(e?.message || 'تعذر إنشاء PDF');
    }
  };

  const top5 = useMemo(() => {
    return [...offers].sort((a: any, b: any) => b.periodSales - a.periodSales).slice(0, 5);
  }, [offers]);

  const weakOffers = useMemo(() => {
    return [...offers]
      .filter((o: any) => o.periodEff > 0 && o.periodEff < 50)
      .sort((a: any, b: any) => a.periodEff - b.periodEff)
      .slice(0, 5);
  }, [offers]);

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  // -- [NEW] Comparison & Copy Logic --
  // Moved state to top


  const toggleCompare = (offer: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (compareList.find(o => o.id === offer.id)) {
      setCompareList(prev => prev.filter(o => o.id !== offer.id));
    } else {
      if (compareList.length >= 3) {
        alert('يمكنك مقارنة 3 عروض كحد أقصى.');
        return;
      }
      setCompareList(prev => [...prev, offer]);
    }
  };

  const copyOfferDetails = (offer: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `
*${offer.name || offer.offer_name}*
📊 المبيعات: ${formatSAR(offer.periodSales)}
📉 الخصم: ${formatSAR(offer.periodDisc)}
🎯 الكفاءة: ${offer.periodEff.toFixed(1)}%
🛒 العمليات: ${offer.periodOps}
 متوسط السلة: ${formatSAR(offer.periodAvgBasket)}
`.trim();
    navigator.clipboard.writeText(text).then(() => {
      alert('تم نسخ تفاصيل العرض!');
    });
  };

  // -- [NEW] Badges Logic --
  const getBadges = (o: any) => {
    const badges = [];
    // Hot: Top 10% in Sales
    const isTop10Sales = top5.some((t: any) => t.id === o.id); // Simple approximation
    if (isTop10Sales) badges.push({ label: '🔥 Hot', color: 'bg-orange-100 text-orange-700' });

    // New: If start date is recent (last 7 days) - assuming we had a start date. 
    // Fallback: Recent high growth? Or valid start_date field if exists. 
    // Let's use efficiency > 90% as "Star" for now or just manually check if New.
    // We don't have start_date in data sample, skipping 'New' for now or using random? No random.

    // Expiring: If end_date is close.
    if (o.end_date) {
      const end = new Date(o.end_date);
      const now = new Date();
      const diff = (end.getTime() - now.getTime()) / (1000 * 3600 * 24);
      if (diff > 0 && diff <= 3) badges.push({ label: '⚠️ Expiring', color: 'bg-red-100 text-red-700' });
    }

    // High Eff
    if (o.periodEff >= 95) badges.push({ label: '⭐ Top Eff', color: 'bg-green-100 text-green-700' });

    return badges;
  };

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 relative"> {/* Added relative & padding for FAB */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">تحليل العروض</h1>
          <p className="text-neutral-500 mt-1">أداء العروض والخصومات حسب الفترة والمعرض</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="bg-neutral-100 p-1 rounded-lg flex items-center">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow text-orange-600' : 'text-neutral-500 hover:text-neutral-700'}`}
              title="شبكة"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-orange-600' : 'text-neutral-500 hover:text-neutral-700'}`}
              title="قائمة"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>

          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-bold shadow-md text-sm"
          >
            <DownloadIcon />
            <span className="hidden sm:inline">تصدير Excel</span>
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all font-bold shadow-md text-sm"
          >
            <span>📄</span>
            <span className="hidden sm:inline">تصدير PDF</span>
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-sm font-semibold text-neutral-600">الفترة:</span>
          <div className="flex flex-wrap gap-2">
            <PeriodButton active={period === 'yest'} label="أمس" onClick={() => setPeriod('yest')} />
            <PeriodButton active={period === 'mtd'} label="الشهر الحالي" onClick={() => setPeriod('mtd')} />
            <PeriodButton active={period === '7d'} label="7 أيام" onClick={() => setPeriod('7d')} />
            <PeriodButton active={period === '14d'} label="14 يوم" onClick={() => setPeriod('14d')} />
            <PeriodButton active={period === '30d'} label="30 يوم" onClick={() => setPeriod('30d')} />
            <PeriodButton active={period === 'custom'} label="مخصص" onClick={() => setPeriod('custom')} />
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" className="input text-sm" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span className="text-neutral-400">→</span>
              <input type="date" className="input text-sm" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          )}
          <span className="text-xs text-neutral-400 mr-auto">{dateRange.label} | {dateRange.start} → {dateRange.end}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {isAdminOrAuditor(user?.role) && (
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</label>
              <select className="input w-full" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="all">الكل</option>
                {managers.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">الفرع</label>
            <select className="input w-full" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {branches.map((code) => (
                <option key={code} value={code}>{mgmt?.stores?.[code] || code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">المدينة</label>
            <select className="input w-full" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {(cities || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">نوع المعرض</label>
            <select className="input w-full" value={storeType} onChange={(e) => setStoreType(e.target.value)}>
              <option value="all">الكل</option>
              <option value="store">المعارض فقط</option>
              <option value="online">الأونلاين فقط</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">الحالة</label>
            <select className="input w-full" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">الكل</option>
              <option value="Enabled">فعال (Enabled)</option>
              <option value="Disabled">معطل (Disabled)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">الترتيب</label>
            <select className="input w-full" value={sortMode} onChange={(e) => setSortMode(e.target.value as any)}>
              <option value="sales">المبيعات (الأعلى)</option>
              <option value="smart">ذكاء اصطناعي (Smart Sort)</option>
              <option value="eff">الكفاءة (الأعلى)</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
        <KPICard title="إجمالي العروض" value={stats.totalOffers} format={v => Math.round(v).toLocaleString()} icon={<TagIcon />} />
        <KPICard title="مبيعات أمس" value={stats.totalYest} format={formatSAR} icon={<SalesIcon />} />
        <KPICard title={`مبيعات (${period === 'mtd' ? 'الشهر' : 'الفترة'})`} value={stats.totalPeriod} format={formatSAR} icon={<SalesIcon />} />
        <KPICard title="عمليات الفترة" value={stats.totalPeriodOps} format={v => Math.round(v).toLocaleString()} icon={<InvoicesIcon />} />
        <KPICard title="كفاءة العروض" value={stats.periodEff} format={v => v.toFixed(1) + '%'} icon={<PremiumTargetIcon />} showProgress progressValue={stats.periodEff} />
        <KPICard title="متوسط السلة" value={stats.periodAvgBasket} format={formatSAR} icon={<CustomerValueIcon />} />
        <KPICard title="إجمالي الخصم" value={stats.totalPeriodDisc} format={formatSAR} icon={<FireIcon />} />
      </div>

      {/* Flash Deals */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-3 border-b border-neutral-200 bg-gradient-to-l from-violet-50 to-white flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-neutral-900">عروض فلاش ديل</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              الحسابات تعتمد على فلاتر المعارض الأساسية الحالية (مدير/فرع/مدينة/نوع) مع فترة مخصصة لهذه البطاقة.
            </p>
          </div>
          <button
            onClick={() => setShowFlashEditor((p) => !p)}
            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors"
          >
            {showFlashEditor ? 'إغلاق الإضافة' : 'إضافة عرض فلاش ديل'}
          </button>
        </div>

        {showFlashEditor && (
          <div className="p-4 border-b border-neutral-200 bg-violet-50/40 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1">اسم العرض</label>
                <input
                  className="input w-full"
                  value={flashDraftName}
                  onChange={(e) => setFlashDraftName(e.target.value)}
                  placeholder="مثال: لحاف 199 + مخدة مجاناً"
                />
              </div>
            </div>
            <div className="space-y-2">
              {flashDraftComponents.map((comp, idx) => (
                <div key={`draft-comp-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">اسم المنتج داخل العرض</label>
                    <input
                      className="input w-full"
                      value={comp.label}
                      onChange={(e) => setFlashDraftComponents((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))}
                      placeholder="مثال: Perfect pillow مجاني"
                    />
                  </div>
                  <div className="md:col-span-5">
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">بحث المنتج / الرمز</label>
                    <input
                      className="input w-full dir-ltr"
                      value={comp.itemCode}
                      onChange={(e) =>
                        setFlashDraftComponents((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, itemCode: e.target.value, resolvedOfferItemIds: undefined } : x
                          )
                        )
                      }
                      placeholder="اكتب بداية الكود أو اسم المنتج"
                    />
                    <div className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
                      {getFlashSuggestions(comp.itemCode).map((s) => (
                        <button
                          type="button"
                          key={`${s.token}-${s.offerItemId}`}
                          className="w-full text-right px-2 py-1.5 hover:bg-orange-50 border-b border-neutral-100 last:border-b-0"
                          onClick={() =>
                            setFlashDraftComponents((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? { ...x, itemCode: s.token, label: x.label || s.name, resolvedOfferItemIds: [s.offerItemId] }
                                  : x
                              )
                            )
                          }
                        >
                          <div className="text-[11px] font-mono text-neutral-700 dir-ltr">{s.token}</div>
                          <div className="text-[11px] text-neutral-500 truncate">{s.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      className="w-full px-2 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-bold disabled:opacity-50"
                      disabled={flashDraftComponents.length === 1}
                      onClick={() => setFlashDraftComponents((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      حذف السطر
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-700 text-xs font-bold"
                onClick={() => setFlashDraftComponents((prev) => [...prev, { label: '', itemCode: '' }])}
              >
                + إضافة منتج داخل العرض
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold"
                onClick={addFlashDeal}
              >
                حفظ العرض
              </button>
            </div>
          </div>
        )}

        <div className="p-4 border-b border-neutral-100 bg-neutral-50/70">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">من تاريخ</label>
              <input type="date" className="input w-full" value={flashStart} onChange={(e) => setFlashStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">إلى تاريخ</label>
              <input type="date" className="input w-full" value={flashEnd} onChange={(e) => setFlashEnd(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex items-end">
              <div className="text-xs text-neutral-500">
                الفترة الفعلية: <span className="font-mono dir-ltr">{flashDateRange.start}</span> → <span className="font-mono dir-ltr">{flashDateRange.end}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-100 text-neutral-700">
                <th className="py-2 px-3 text-right text-xs font-bold">العرض</th>
                <th className="py-2 px-3 text-right text-xs font-bold">تفاصيل المنتجات داخل العرض</th>
                <th className="py-2 px-3 text-center text-xs font-bold">تقدير بيع العرض المركب</th>
                <th className="py-2 px-3 text-center text-xs font-bold">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {flashDealRows.length ? flashDealRows.map((deal) => (
                <tr key={deal.id} className="border-t border-neutral-100 align-top">
                  <td className="py-3 px-3">
                    <div className="font-bold text-neutral-900">{deal.name}</div>
                    <div className="text-[11px] text-neutral-500 mt-1">{deal.components.length} منتج/مكوّن</div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="space-y-1.5">
                      {deal.components.map((comp, idx) => (
                        <div key={`${deal.id}-comp-${idx}`} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-neutral-800">{comp.label}</span>
                          <span className="font-mono text-neutral-500">({comp.itemCode})</span>
                          <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold dir-ltr">
                            {Math.round(comp.sold).toLocaleString()} بيع
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 font-bold dir-ltr">
                      {Math.round(deal.estimatedBundleSales).toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      className="px-2.5 py-1 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs font-bold"
                      onClick={() => removeFlashDeal(deal.id)}
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-neutral-400">لا توجد عروض فلاش ديل حالياً.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Additional Insights (aligned with original feature set, same local design) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
          <div className="p-3 border-b border-neutral-200 bg-gradient-to-l from-amber-50 to-white">
            <h3 className="text-base font-bold text-neutral-900">أفضل 5 عروض</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 text-neutral-600">
                  <th className="py-2 px-3 text-right text-xs font-bold">#</th>
                  <th className="py-2 px-3 text-right text-xs font-bold">العرض</th>
                  <th className="py-2 px-3 text-center text-xs font-bold">المبيعات</th>
                  <th className="py-2 px-3 text-center text-xs font-bold">الكفاءة</th>
                </tr>
              </thead>
              <tbody>
                {top5.length ? top5.map((o: any, idx: number) => (
                  <tr key={`top-${o.id || idx}`} className="border-t border-neutral-100">
                    <td className="py-2 px-3 text-neutral-500 text-xs">{idx + 1}</td>
                    <td className="py-2 px-3 font-semibold text-neutral-900 text-sm">{o.name || o.offer_name || o.id || '-'}</td>
                    <td className="py-2 px-3 text-center dir-ltr font-bold text-emerald-700 text-sm">{formatSAR(o.periodSales)}</td>
                    <td className="py-2 px-3 text-center dir-ltr font-bold text-orange-700 text-sm">{o.periodEff.toFixed(1)}%</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-6 text-center text-neutral-400 text-sm">لا توجد بيانات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
          <div className="p-3 border-b border-neutral-200 bg-gradient-to-l from-rose-50 to-white">
            <h3 className="text-base font-bold text-neutral-900">عروض ضعيفة الأداء</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 text-neutral-600">
                  <th className="py-2 px-3 text-right text-xs font-bold">#</th>
                  <th className="py-2 px-3 text-right text-xs font-bold">العرض</th>
                  <th className="py-2 px-3 text-center text-xs font-bold">الكفاءة</th>
                  <th className="py-2 px-3 text-center text-xs font-bold">العمليات</th>
                </tr>
              </thead>
              <tbody>
                {weakOffers.length ? weakOffers.map((o: any, idx: number) => (
                  <tr key={`weak-${o.id || idx}`} className="border-t border-neutral-100">
                    <td className="py-2 px-3 text-neutral-500 text-xs">{idx + 1}</td>
                    <td className="py-2 px-3 font-semibold text-neutral-900 text-sm">{o.name || o.offer_name || o.id || '-'}</td>
                    <td className="py-2 px-3 text-center dir-ltr font-bold text-red-600 text-sm">{o.periodEff.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-center dir-ltr text-neutral-700 text-sm">{o.periodOps.toLocaleString()}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-6 text-center text-neutral-400 text-sm">لا توجد عروض ضعيفة ضمن الفلاتر</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
          <div className="p-3 border-b border-neutral-200 bg-gradient-to-l from-sky-50 to-white">
            <h3 className="text-base font-bold text-neutral-900">أكثر المنتجات مبيعاً في العروض</h3>
          </div>
          <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50">
                <tr className="text-neutral-600">
                  <th className="py-2 px-3 text-right text-xs font-bold">#</th>
                  <th className="py-2 px-3 text-right text-xs font-bold">رقم المنتج</th>
                  <th className="py-2 px-3 text-right text-xs font-bold">اسم المنتج</th>
                  <th className="py-2 px-3 text-center text-xs font-bold">الكمية</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.length ? topProducts.map((p: any, idx: number) => (
                  <tr key={`prod-${p.id}-${idx}`} className="border-t border-neutral-100">
                    <td className="py-2 px-3 text-neutral-500 text-xs">{idx + 1}</td>
                    <td className="py-2 px-3 font-mono text-neutral-600 text-xs">{p.id}</td>
                    <td className="py-2 px-3 text-neutral-900 text-sm">{p.name}</td>
                    <td className="py-2 px-3 text-center font-bold text-orange-700 dir-ltr text-sm">{Math.round(p.qty).toLocaleString()}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-6 text-center text-neutral-400 text-sm">لا توجد بيانات منتجات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
          <div className="p-3 border-b border-neutral-200 bg-gradient-to-l from-emerald-50 to-white">
            <h3 className="text-base font-bold text-neutral-900">ملخص كفاءة العروض</h3>
          </div>
          <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50">
                <tr className="text-neutral-600">
                  <th className="py-2 px-3 text-right text-xs font-bold">#</th>
                  <th className="py-2 px-3 text-right text-xs font-bold">العرض</th>
                  <th className="py-2 px-3 text-center text-xs font-bold">الكفاءة</th>
                  <th className="py-2 px-3 text-center text-xs font-bold">متوسط السلة</th>
                </tr>
              </thead>
              <tbody>
                {efficiencySummary.length ? efficiencySummary.map((o: any, idx: number) => (
                  <tr key={`eff-${idx}`} className="border-t border-neutral-100">
                    <td className="py-2 px-3 text-neutral-500 text-xs">{idx + 1}</td>
                    <td className="py-2 px-3 text-neutral-900 text-sm font-semibold">{o.name}</td>
                    <td className="py-2 px-3 text-center dir-ltr font-bold text-emerald-700 text-sm">{o.periodEff.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-center dir-ltr text-sky-700 font-semibold text-sm">{formatSAR(o.periodAvgBasket)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-6 text-center text-neutral-400 text-sm">لا توجد بيانات كفاءة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-3 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
          <h3 className="text-base font-bold text-neutral-900">اقتراحات للمنتجات الراكدة داخل العروض</h3>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {weakOffers.slice(0, 3).map((o: any, idx: number) => (
            <div key={`stagnant-offer-${idx}`} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-xs text-neutral-500 mb-1">عرض يحتاج تحسين</div>
              <div className="text-sm font-bold text-neutral-900">{o.name || o.offer_name || o.id || '-'}</div>
              <div className="mt-1 text-xs text-red-600 font-semibold">الكفاءة الحالية: {o.periodEff.toFixed(1)}%</div>
              <div className="mt-2 text-xs text-neutral-600">
                اقتراح: راجع المنتجات المضافة للعرض وارفع الجاذبية بعناصر من الأعلى مبيعاً أو حسّن نسبة الخصم.
              </div>
            </div>
          ))}
          {!weakOffers.length && (
            <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
              لا توجد عروض منخفضة الأداء حالياً، استمر بمراقبة الكفاءة يومياً.
            </div>
          )}
          {topProducts.slice(0, 2).map((p: any, idx: number) => (
            <div key={`stagnant-product-${idx}`} className="rounded-xl border border-orange-200 bg-orange-50/60 p-3">
              <div className="text-xs text-neutral-500 mb-1">منتج مرشح للدفع داخل العروض</div>
              <div className="text-sm font-bold text-neutral-900">{p.name}</div>
              <div className="mt-1 text-xs text-orange-700 font-semibold">مباع: {Math.round(p.qty).toLocaleString()} قطعة</div>
              <div className="mt-2 text-xs text-neutral-600">
                اقتراح: إدراجه ضمن عرض مركّب مع منتجات ضعيفة الحركة لرفع معدل السلة.
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Offers List / Grid */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white flex justify-between items-center">
          <h3 className="text-lg font-bold text-neutral-900">قائمة العروض ({offers.length})</h3>
        </div>

        {viewMode === 'list' ? (
          <div className="overflow-x-auto">
            {offers.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">لا توجد عروض بعد تطبيق الفلاتر.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-800 text-white">
                    <th className="py-3 px-4 w-10"></th> {/* Checkbox Col */}
                    <th className="py-3 px-4 text-right">#</th>
                    <th className="py-3 px-4 text-right">اسم العرض</th>
                    <th className="py-3 px-4 text-center bg-neutral-700/50">أمس</th>
                    <th className="py-3 px-4 text-center bg-neutral-700/50">فواتير أمس</th>
                    <th className="py-3 px-4 text-center">المبيعات</th>
                    <th className="py-3 px-4 text-center">الفواتير</th>
                    <th className="py-3 px-4 text-center">الخصم</th>
                    <th className="py-3 px-4 text-center">كفاءة</th>
                    <th className="py-3 px-4 text-center">م. السلة</th>
                    <th className="py-3 px-4 text-center">منتجات</th>
                    <th className="py-3 px-4 text-center w-10">نسخ</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.slice(0, 100).map((o: any, i: number) => {
                    const isSelected = !!compareList.find(c => c.id === o.id);
                    return (
                      <tr
                        key={i}
                        className={`border-b border-neutral-100 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-orange-50'}`}
                        onClick={() => setSelectedOffer(o)}
                      >
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleCompare(o, e as any)}
                            className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 text-neutral-500">{i + 1}</td>
                        <td className="py-3 px-4 font-bold text-neutral-900">
                          {o.name || o.offer_name || o.id || '-'}
                          <div className="flex gap-1 mt-1">
                            {getBadges(o).map((b, idx) => (
                              <span key={idx} className={`text-[10px] px-1.5 py-0.5 rounded-full ${b.color}`}>{b.label}</span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-green-600 bg-green-50/30">{formatSAR(o.yestSales)}</td>
                        <td className="py-3 px-4 text-center text-neutral-600 bg-green-50/30">{o.yestOps.toLocaleString()}</td>
                        <td className="py-3 px-4 text-center font-bold text-blue-700">{formatSAR(o.periodSales)}</td>
                        <td className="py-3 px-4 text-center font-medium">{o.periodOps.toLocaleString()}</td>
                        <td className="py-3 px-4 text-center text-red-500 font-mono">{o.periodDisc.toLocaleString()}</td>
                        <td className="py-3 px-4 text-center font-black text-orange-600">{o.periodEff.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-center text-sky-700 font-semibold">{formatSAR(o.periodAvgBasket)}</td>
                        <td className="py-3 px-4 text-center text-neutral-600">{o.aggregatedItems?.length || 0}</td>
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <button onClick={(e) => copyOfferDetails(o, e)} className="p-1.5 hover:bg-neutral-200 rounded text-neutral-500 hover:text-neutral-800" title="نسخ">
                            <ClipboardIcon className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* GRID VIEW */
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 bg-neutral-50">
            {offers.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 col-span-full">لا توجد عروض بعد تطبيق الفلاتر.</div>
            ) : (
              offers.slice(0, 100).map((o: any, i: number) => (
                <OfferCard
                  key={i}
                  offer={o}
                  onClick={() => setSelectedOffer(o)}
                  badges={getBadges(o)}
                  isSelected={!!compareList.find(c => c.id === o.id)}
                  onToggle={(e: any) => toggleCompare(o, e)}
                  onCopy={(e: any) => copyOfferDetails(o, e)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Floating Compare Action Bar */}
      {compareList.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-neutral-900/90 text-white backdrop-blur-md px-6 py-3 rounded-full shadow-2xl z-40 flex items-center gap-4 anim-scale-in">
          <span className="font-bold text-sm bg-orange-600 px-2 py-0.5 rounded-full">{compareList.length}</span>
          <span className="text-sm font-medium">عروض للمقارنة</span>
          <div className="h-4 w-[1px] bg-neutral-700 mx-1"></div>
          <button
            onClick={() => setShowCompareModal(true)}
            className="text-sm font-bold hover:text-orange-400 transition-colors flex items-center gap-1"
          >
            <div /* icon placeholder */ /> مقارنة الآن
          </button>
          <button
            onClick={() => setCompareList([])}
            className="text-neutral-400 hover:text-white transition-colors"
            title="إلغاء التحديد"
          >
            <XIcon />
          </button>
        </div>
      )}

      {/* Comparison Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowCompareModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] md:w-full max-w-5xl max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-neutral-900">مقارنة العروض</h2>
              <button onClick={() => setShowCompareModal(false)} className="p-2 hover:bg-neutral-100 rounded-lg"><XIcon /></button>
            </div>
            <div className="p-6 overflow-x-auto">
              <div className="flex gap-4 min-w-[600px]">
                {/* Labels Column */}
                <div className="w-1/4 pt-16 space-y-6 text-sm font-semibold text-neutral-500 text-right">
                  <div className="h-8">المبيعات</div>
                  <div className="h-8 border-t border-neutral-100 pt-2">الخصم</div>
                  <div className="h-8 border-t border-neutral-100 pt-2">الكفاءة</div>
                  <div className="h-8 border-t border-neutral-100 pt-2">عدد العمليات</div>
                  <div className="h-8 border-t border-neutral-100 pt-2">متوسط السلة</div>
                  <div className="h-8 border-t border-neutral-100 pt-2">عدد المنتجات</div>
                </div>
                {/* Offers Columns */}
                {compareList.map((o, i) => (
                  <div key={i} className="flex-1 bg-neutral-50 rounded-xl p-4 border border-neutral-200 relative">
                    <button
                      onClick={() => setCompareList(prev => prev.filter(c => c.id !== o.id))}
                      className="absolute top-2 left-2 text-neutral-400 hover:text-red-500"
                    >
                      <XIcon />
                    </button>
                    <h3 className="font-bold text-neutral-900 text-center mb-4 min-h-[3em] flex items-center justify-center">{o.name}</h3>
                    <div className="space-y-6 text-center text-sm font-bold text-neutral-800">
                      <div className="h-8 text-green-700 text-lg">{formatSAR(o.periodSales)}</div>
                      <div className="h-8 border-t border-neutral-200 pt-2 text-red-600">{formatSAR(o.periodDisc)}</div>
                      <div className="h-8 border-t border-neutral-200 pt-2 text-orange-600 text-lg">{o.periodEff.toFixed(1)}%</div>
                      <div className="h-8 border-t border-neutral-200 pt-2">{o.periodOps}</div>
                      <div className="h-8 border-t border-neutral-200 pt-2 text-blue-600">{formatSAR(o.periodAvgBasket)}</div>
                      <div className="h-8 border-t border-neutral-200 pt-2 text-neutral-500">{o.aggregatedItems?.length || 0}</div>
                    </div>
                  </div>
                ))}
                {/* Empty Placeholder if < 3 */}
                {Array.from({ length: 3 - compareList.length }).map((_, i) => (
                  <div key={i} className="flex-1 border-2 border-dashed border-neutral-200 rounded-xl flex items-center justify-center text-neutral-400 text-sm">
                    اختر عرضاً للمقارنة
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offer Detail Modal */}
      {selectedOffer && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelectedOffer(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-[95vw] md:w-full max-w-4xl max-h-[90vh] overflow-y-auto anim-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-neutral-200 p-4 flex items-center justify-between rounded-t-2xl z-10 shadow-sm">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">{selectedOffer.name || selectedOffer.offer_name || '-'}</h2>
                <div className="text-xs text-neutral-500 mt-1 flex gap-2 items-center">
                  <span>{selectedOffer.id || ''}</span>
                  <span>|</span>
                  <span className={`px-2 py-0.5 rounded-full ${selectedOffer.status === 'Enabled' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {selectedOffer.status}
                  </span>
                  <span>|</span>
                  <span>{dateRange.label}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={(e) => copyOfferDetails(selectedOffer, e)} className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-600 font-bold text-xs flex items-center gap-1">
                  <ClipboardIcon className="w-4 h-4" /> نسخ
                </button>
                <button onClick={() => setSelectedOffer(null)} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500 hover:text-red-500 transition-colors"><XIcon /></button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Offer KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                  <div className="text-xs text-neutral-500 font-semibold mb-1">المبيعات</div>
                  <div className="text-xl font-black text-green-700">{formatSAR(selectedOffer.periodSales)}</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                  <div className="text-xs text-neutral-500 font-semibold mb-1">الخصم</div>
                  <div className="text-xl font-black text-red-600">{formatSAR(selectedOffer.periodDisc)}</div>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100 relative overflow-hidden">
                  <div className="text-xs text-neutral-500 font-semibold mb-1">كفاءة %</div>
                  <div className="text-xl font-black text-orange-700 relative z-10">{selectedOffer.periodEff.toFixed(1)}%</div>
                  {/* Mini Progress */}
                  <div className="absolute bottom-0 left-0 h-1 bg-orange-200 w-full"><div className="h-full bg-orange-500" style={{ width: `${selectedOffer.periodEff}%` }} /></div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                  <div className="text-xs text-neutral-500 font-semibold mb-1">متوسط السلة</div>
                  <div className="text-xl font-black text-blue-700">{formatSAR(selectedOffer.periodAvgBasket)}</div>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-100">
                  <div className="text-xs text-neutral-500 font-semibold mb-1">العمليات</div>
                  <div className="text-xl font-black text-purple-700">{selectedOffer.periodOps.toLocaleString()}</div>
                </div>
              </div>

              {/* Products Breakdown */}
              {selectedOffer.aggregatedItems && selectedOffer.aggregatedItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-neutral-700 mb-3 border-r-4 border-orange-400 pr-2 flex items-center gap-2">
                    <CubeIcon className="w-4 h-4 text-orange-500" />
                    منتجات العرض ({selectedOffer.aggregatedItems.length})
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200 max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-neutral-50 shadow-sm z-10">
                        <tr>
                          <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">#</th>
                          <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">كود</th>
                          <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">المنتج</th>
                          <th className="py-2 px-3 text-center text-xs font-semibold text-neutral-500">الكمية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOffer.aggregatedItems.map((it: any, idx: number) => (
                          <tr key={idx} className="border-t border-neutral-100 hover:bg-orange-50 transition-colors">
                            <td className="py-2 px-3 text-neutral-400 text-xs">{idx + 1}</td>
                            <td className="py-2 px-3 font-mono text-xs text-neutral-500">{it.id}</td>
                            <td className="py-2 px-3 font-semibold text-neutral-900 text-sm">{it.name}</td>
                            <td className="py-2 px-3 text-center font-bold text-orange-700">{Math.round(it.qty).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* No items message */}
              {(!selectedOffer.aggregatedItems || selectedOffer.aggregatedItems.length === 0) && (
                <div className="text-center p-6 bg-neutral-50 rounded-xl text-neutral-500 text-sm border-dashed border-2 border-neutral-200">لا توجد بيانات منتجات لهذا العرض في الفترة المحددة.</div>
              )}

              {/* Per-Store Breakdown */}
              {selectedOffer.storeBreakdown && Object.keys(selectedOffer.storeBreakdown).length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-neutral-700 mb-3 border-r-4 border-blue-400 pr-2 flex items-center gap-2">
                    <OfficeBuildingIcon className="w-4 h-4 text-blue-500" />
                    أداء العرض حسب المعرض ({Object.keys(selectedOffer.storeBreakdown).length})
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-neutral-50">
                          <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">المعرض</th>
                          <th className="py-2 px-3 text-center text-xs font-semibold text-neutral-500">المبيعات</th>
                          <th className="py-2 px-3 text-center text-xs font-semibold text-neutral-500">الخصم</th>
                          <th className="py-2 px-3 text-center text-xs font-semibold text-neutral-500">العمليات</th>
                          <th className="py-2 px-3 text-center text-xs font-semibold text-neutral-500">كفاءة %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(selectedOffer.storeBreakdown)
                          .sort(([, a]: any, [, b]: any) => b.sales - a.sales)
                          .map(([sid, s]: [string, any]) => {
                            const eff = s.sales > 0 ? (s.sales / (s.sales + s.disc)) * 100 : 0;
                            return (
                              <tr key={sid} className="border-t border-neutral-100 hover:bg-blue-50 transition-colors">
                                <td className="py-2 px-3 font-semibold text-neutral-900">{s.name}</td>
                                <td className="py-2 px-3 text-center font-bold text-green-700">{formatSAR(s.sales)}</td>
                                <td className="py-2 px-3 text-center text-red-500">{formatSAR(s.disc)}</td>
                                <td className="py-2 px-3 text-center">{s.ops.toLocaleString()}</td>
                                <td className={`py-2 px-3 text-center font-bold ${eff >= 80 ? 'text-green-600' : eff >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{eff.toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Components ---

function OfferCard({ offer, onClick, badges, isSelected, onToggle, onCopy }: { offer: any; onClick: () => void; badges: any[]; isSelected: boolean; onToggle: (e: any) => void; onCopy: (e: any) => void }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border transition-all cursor-pointer flex flex-col group relative overflow-hidden ${isSelected ? 'border-orange-500 ring-2 ring-orange-200' : 'border-neutral-200 hover:shadow-lg hover:border-orange-300'}`}
      onClick={onClick}
    >
      <div className="absolute top-2 right-2 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="w-5 h-5 text-orange-600 rounded bg-white/80 backdrop-blur-sm border-neutral-300 focus:ring-orange-500 cursor-pointer shadow-sm hover:scale-110 transition-transform"
        />
      </div>

      <div className="p-4 flex-1 pt-8"> {/* Added padding top for checkbox space */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex flex-wrap gap-1">
            {badges.map((b, i) => (
              <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${b.color}`}>{b.label}</span>
            ))}
          </div>
          {/* Copy Button */}
          <button onClick={onCopy} className="text-neutral-300 hover:text-neutral-600 transition-colors" title="نسخ" >
            <ClipboardIcon className="w-4 h-4" />
          </button>
        </div>

        <h3 className="font-bold text-neutral-900 text-sm mb-3 line-clamp-2 min-h-[2.5em] group-hover:text-orange-600 transition-colors">
          {offer.name || offer.offer_name || offer.id || '-'}
        </h3>

        <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
          <div>
            <span className="block text-neutral-500 mb-0.5">المبيعات</span>
            <span className="font-bold text-neutral-900 text-sm">{formatSAR(offer.periodSales)}</span>
          </div>
          <div>
            <span className="block text-neutral-500 mb-0.5">الكفاءة</span>
            <span className={`font-bold text-sm ${offer.periodEff >= 80 ? 'text-green-600' : 'text-orange-600'}`}>
              {offer.periodEff.toFixed(1)}%
            </span>
          </div>
          <div className="col-span-2 flex items-center justify-between border-t border-neutral-100 pt-2 mt-1">
            <span className="text-neutral-500">العمليات: <b className="text-neutral-800">{offer.periodOps}</b></span>
            <span className="text-neutral-500">الخصم: <b className="text-red-500">{formatSAR(offer.periodDisc).replace('SAR', '')}</b></span>
          </div>
        </div>
      </div>
      {/* Hover Action Strip */}
      <div className="bg-orange-50 p-2 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs font-bold text-orange-600 flex items-center gap-1">
          عرض التفاصيل <CubeIcon className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}

function KPIBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: `4px solid ${color}` }}>
      <div className="text-xs font-semibold text-neutral-500">{label}</div>
      <div className="text-xl font-bold text-neutral-900 mt-1">{value}</div>
    </div>
  );
}

function PeriodButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${active ? 'bg-orange-600 text-white shadow-md' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
    >
      {label}
    </button>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>;
}

// Icons needed that might be missing in imports?
function OfficeBuildingIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
}

function CubeIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
}
