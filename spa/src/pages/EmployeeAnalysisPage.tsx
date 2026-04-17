import { Fragment, useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '../auth/storage';
import { loadEmployeeProductsData, loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { mtdRangeThroughYesterday } from '../utils/mtdDateRange';

function safeNum(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function formatSAR(v: number) {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

function median(values: number[]) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 === 0 ? (list[mid - 1] + list[mid]) / 2 : list[mid];
}

function normText(v: string) {
  return String(v || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .trim();
}

function normalizeEmpId(raw: unknown) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const preDash = s.includes('-') ? s.split('-')[0].trim() : s;
  const digitsOnly = preDash.replace(/[^\d]/g, '');
  if (!digitsOnly) return preDash;
  const asNum = String(parseInt(digitsOnly, 10));
  return asNum === 'NaN' ? digitsOnly : asNum;
}

function resolveEmployeeName(rawId: string, fallbackName: string, employeeNames: Record<string, string>) {
  const id = String(rawId || '').trim();
  if (!id) return fallbackName || id;
  if (employeeNames?.[id]) return employeeNames[id];
  if (/^\d+$/.test(id)) {
    const padded = id.padStart(4, '0');
    if (employeeNames?.[padded]) return employeeNames[padded];
    const unpadded = String(parseInt(id, 10));
    if (unpadded !== id && employeeNames?.[unpadded]) return employeeNames[unpadded];
  }
  return fallbackName || id;
}

function canonicalTop6Category(v: string) {
  const t = normText(v);
  const isKing = t.includes('king') || t.includes('كينغ') || t.includes('كنج');
  const isFull = t.includes('full') || t.includes('فل') || t.includes('twin') || t.includes('توين');
  const isPillow = t.includes('مخده') || t.includes('مخدات') || t.includes('pillow');
  const isDuvet = t.includes('لحاف') || t.includes('لحافات') || t.includes('duvet');
  const isPad = t.includes('لباد') || t.includes('لبده') || t.includes('mattress');
  if (isDuvet && isKing) return 'king_duvet';
  if (isDuvet && isFull) return 'full_duvet';
  if (isPillow && isKing) return 'king_pillow';
  if (isPillow && (t.includes('ستاندر') || t.includes('standard') || isFull)) return 'full_pillow';
  if (isPad && isKing) return 'king_pad';
  if (isPad && isFull) return 'full_pad';
  return null;
}

function formatMetricValue(value: number, hasData: boolean, suffix = '') {
  if (!hasData) return 'لا توجد بيانات';
  return `${value.toFixed(0)}${suffix}`;
}

function chipTone(kind: string) {
  if (/(قوي|ممتاز|A|Premium|Balanced|بيع مباشر)/.test(kind)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (/(متوسط|طبيعي|B|Volume|Duvet|Add-on|متوازن)/.test(kind)) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (/(ضعيف|C|Weak|اعتماد|نشاط)/.test(kind)) return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-neutral-100 text-neutral-700 border-neutral-200';
}

type ProductInsights = {
  kingDuvet: number;
  fullDuvet: number;
  kingPad: number;
  fullPad: number;
  kingPillow: number;
  fullPillow: number;
  kingAttachRate: number;
  fullAttachRate: number;
  kingPillowAttachRate: number;
  fullPillowAttachRate: number;
  kingPillowAttachAdj: number;
  kingBandLow: number;
  kingBandMid: number;
  kingBandHigh: number;
  fullBandLow: number;
  fullBandMid: number;
  fullBandHigh: number;
  kingPadBandLow: number;
  kingPadBandMid: number;
  kingPadBandHigh: number;
  offerFocusPct: number;
};

type ProductPeriodKey = 'mtd' | 'yest' | '7d' | '14d' | '30d';

type EmployeeRow = {
  id: string;
  name: string;
  storeId: string;
  storeName: string;
  manager: string;
  sales: number;
  trans: number;
  items: number;
  avgTicket: number;
  hasProductData: boolean;
  productInsights: ProductInsights;
};

const AI_BASE = typeof window !== 'undefined' && window.location?.hostname?.includes('vercel.app') ? '' : 'https://ora-cockpit.vercel.app';
const AI_ERROR = 'تعذر تشغيل التحليل الذكي حالياً. حاول مرة أخرى لاحقاً.';

export default function EmployeeAnalysisPage() {
  const user = getCurrentUser();
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [empProductsRaw, setEmpProductsRaw] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [manager, setManager] = useState('all');
  const [branch, setBranch] = useState('all');
  const [city, setCity] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [productsPeriodKey, setProductsPeriodKey] = useState<ProductPeriodKey>('mtd');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadEmployeesData(), loadManagementData(), loadEmployeeProductsData()]).then(([e, m, ep]) => {
      setEmpRaw(e);
      setMgmt(m);
      setEmpProductsRaw(ep);
      const r = mtdRangeThroughYesterday(new Date());
      setCustomStart(r.start);
      setCustomEnd(r.end);
    });
  }, []);

  const effectiveManager = useMemo(() => (isAdminOrAuditor(user?.role) ? manager : user?.name || manager), [manager, user?.name, user?.role]);

  const { rows, managers, branches, cities } = useMemo(() => {
    if (!empRaw || !mgmt) return { rows: [] as EmployeeRow[], managers: [] as string[], branches: [] as Array<{ id: string; name: string }>, cities: [] as string[] };
    const storeMeta = mgmt.store_meta || {};
    const stores = mgmt.stores || {};
    const history = empRaw.history || {};
    const employeeNames: Record<string, string> = empRaw.employee_names || {};
    const start = customStart || '1900-01-01';
    const end = customEnd || '2999-12-31';
    const mSet = new Set<string>();
    const cSet = new Set<string>();
    Object.values(storeMeta).forEach((m: any) => {
      if (m?.manager) mSet.add(String(m.manager));
      if (m?.city) cSet.add(String(m.city));
    });
    const byEmp = new Map<string, EmployeeRow>();
    Object.entries(history).forEach(([sid, recs]: [string, any]) => {
      const meta = storeMeta[sid] || {};
      if (branch !== 'all' && sid !== branch) return;
      if (effectiveManager !== 'all' && String(meta?.manager || '') !== effectiveManager) return;
      if (city !== 'all' && String(meta?.city || '') !== city) return;
      (recs || []).forEach((r: any[]) => {
        const ds = String(r?.[0] || '').substring(0, 10);
        if (!ds || ds < start || ds > end) return;
        const rawEmp = String(r?.[1] || '');
        const idRaw = rawEmp.split('-')[0]?.trim();
        if (!idRaw || idRaw === 'ظ…ط±طھط¬ط¹') return;
        const empKey = normalizeEmpId(idRaw);
        if (!empKey) return;
        const nameFromRec = rawEmp.includes('-') ? rawEmp.split('-').slice(1).join('-').trim() : '';
        const displayName = resolveEmployeeName(empKey, nameFromRec, employeeNames);
        const prev = byEmp.get(empKey);
        const salesAdd = safeNum(r?.[2]);
        if (!prev) {
          byEmp.set(empKey, {
            id: empKey,
            name: displayName,
            storeId: sid,
            storeName: stores[sid] || sid,
            manager: String(meta?.manager || ''),
            sales: salesAdd,
            trans: safeNum(r?.[3]),
            items: safeNum(r?.[4]),
            avgTicket: 0,
            hasProductData: false,
            productInsights: { kingDuvet: 0, fullDuvet: 0, kingPad: 0, fullPad: 0, kingPillow: 0, fullPillow: 0, kingAttachRate: 0, fullAttachRate: 0, kingPillowAttachRate: 0, fullPillowAttachRate: 0, kingPillowAttachAdj: 0, kingBandLow: 0, kingBandMid: 0, kingBandHigh: 0, fullBandLow: 0, fullBandMid: 0, fullBandHigh: 0, kingPadBandLow: 0, kingPadBandMid: 0, kingPadBandHigh: 0, offerFocusPct: 0 },
          });
        } else {
          prev.sales += salesAdd;
          prev.trans += safeNum(r?.[3]);
          prev.items += safeNum(r?.[4]);
          if (displayName && displayName !== empKey && (prev.name === empKey || prev.name.length < displayName.length)) prev.name = displayName;
          if (salesAdd > 0 && (prev.storeName === empKey || prev.sales <= salesAdd)) {
            prev.storeId = sid;
            prev.storeName = stores[sid] || sid;
            prev.manager = String(meta?.manager || '');
          }
        }
      });
    });
    const periods = empProductsRaw?.periods || {};
    const scoped = periods?.[productsPeriodKey] || periods?.mtd || {};
    Array.from(byEmp.entries()).forEach(([empId, row]) => {
      const idNorm = normalizeEmpId(empId);
      const empBlock = scoped?.[empId] || scoped?.[empId.padStart(4, '0')] || scoped?.[idNorm] || scoped?.[idNorm.padStart(4, '0')] || Object.entries(scoped).find(([k]) => normalizeEmpId(k) === idNorm)?.[1] || null;
      const categories = Array.isArray((empBlock as any)?.categories) ? (empBlock as any).categories : [];
      const items = Array.isArray((empBlock as any)?.items) ? (empBlock as any).items : [];
      const hasProductData = Boolean(empBlock && (categories.length > 0 || items.length > 0));
      const p: ProductInsights = { kingDuvet: 0, fullDuvet: 0, kingPad: 0, fullPad: 0, kingPillow: 0, fullPillow: 0, kingAttachRate: 0, fullAttachRate: 0, kingPillowAttachRate: 0, fullPillowAttachRate: 0, kingPillowAttachAdj: 0, kingBandLow: 0, kingBandMid: 0, kingBandHigh: 0, fullBandLow: 0, fullBandMid: 0, fullBandHigh: 0, kingPadBandLow: 0, kingPadBandMid: 0, kingPadBandHigh: 0, offerFocusPct: 0 };
      categories.forEach((c: any) => {
        const mapped = canonicalTop6Category(String(c?.name || ''));
        const qty = safeNum(c?.qty);
        if (mapped === 'king_duvet') p.kingDuvet += qty;
        if (mapped === 'full_duvet') p.fullDuvet += qty;
        if (mapped === 'king_pad') p.kingPad += qty;
        if (mapped === 'full_pad') p.fullPad += qty;
        if (mapped === 'king_pillow') p.kingPillow += qty;
        if (mapped === 'full_pillow') p.fullPillow += qty;
      });
      let kingBandRaw = 0;
      let fullBandRaw = 0;
      let kingPadBandRaw = 0;
      items.forEach((it: any) => {
        const cat = canonicalTop6Category(String(it?.name || ''));
        const qty = safeNum(it?.qty);
        const avg = qty > 0 ? safeNum(it?.amt) / qty : 0;
        if (qty <= 0) return;
        if (cat === 'king_duvet') {
          kingBandRaw += qty;
          if (avg <= 300) p.kingBandLow += qty; else if (avg <= 600) p.kingBandMid += qty; else p.kingBandHigh += qty;
        }
        if (cat === 'full_duvet') {
          fullBandRaw += qty;
          if (avg <= 300) p.fullBandLow += qty; else if (avg <= 600) p.fullBandMid += qty; else p.fullBandHigh += qty;
        }
        if (cat === 'king_pad') {
          kingPadBandRaw += qty;
          if (avg <= 300) p.kingPadBandLow += qty; else if (avg <= 600) p.kingPadBandMid += qty; else p.kingPadBandHigh += qty;
        }
      });
      if (p.kingDuvet > 0) {
        p.kingAttachRate = (p.kingPad / p.kingDuvet) * 100;
        p.kingPillowAttachRate = (p.kingPillow / p.kingDuvet) * 100;
        p.kingPillowAttachAdj = (p.kingPillow / (p.kingDuvet * 2)) * 100;
      }
      if (p.fullDuvet > 0) {
        p.fullAttachRate = (p.fullPad / p.fullDuvet) * 100;
        p.fullPillowAttachRate = (p.fullPillow / p.fullDuvet) * 100;
      }
      if (kingBandRaw > 0 && p.kingDuvet > 0) {
        const scale = p.kingDuvet / kingBandRaw;
        p.kingBandLow *= scale; p.kingBandMid *= scale; p.kingBandHigh *= scale;
      }
      if (fullBandRaw > 0 && p.fullDuvet > 0) {
        const scale = p.fullDuvet / fullBandRaw;
        p.fullBandLow *= scale; p.fullBandMid *= scale; p.fullBandHigh *= scale;
      }
      if (kingPadBandRaw > 0 && p.kingPad > 0) {
        const scale = p.kingPad / kingPadBandRaw;
        p.kingPadBandLow *= scale; p.kingPadBandMid *= scale; p.kingPadBandHigh *= scale;
      }
      const offerUnits = p.kingPad + p.fullPad + p.kingPillow + p.fullPillow;
      const coreUnits = p.kingDuvet + p.fullDuvet + offerUnits;
      p.offerFocusPct = coreUnits > 0 ? (offerUnits / coreUnits) * 100 : 0;
      row.hasProductData = hasProductData;
      row.productInsights = p;
    });
    return {
      rows: Array.from(byEmp.values()).map((r) => ({ ...r, avgTicket: r.trans > 0 ? r.sales / r.trans : 0 })),
      managers: Array.from(mSet).sort((a, b) => a.localeCompare(b, 'ar')),
      branches: Object.keys(stores).map((sid) => ({ id: sid, name: stores[sid] || sid })).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
      cities: Array.from(cSet).sort((a, b) => a.localeCompare(b, 'ar')),
    };
  }, [branch, city, customEnd, customStart, effectiveManager, empProductsRaw, empRaw, mgmt, productsPeriodKey]);

  const decisionRows = useMemo(() => {
    const salesMedian = median(rows.map((r) => r.sales));
    const atvMedian = median(rows.map((r) => r.avgTicket));
    const duvetMedian = median(rows.map((r) => r.productInsights.kingDuvet + r.productInsights.fullDuvet));
    const transMedian = median(rows.map((r) => r.trans));
    return rows.map((row) => {
      const p = row.productInsights;
      const hasProductData = row.hasProductData;
      const totalDuvet = p.kingDuvet + p.fullDuvet;
      const totalPad = p.kingPad + p.fullPad;
      const totalPillow = p.kingPillow + p.fullPillow;
      const padAttach = totalDuvet > 0 ? (totalPad / totalDuvet) * 100 : 0;
      const pillowAttach = totalDuvet > 0 ? (totalPillow / (totalDuvet * 2)) * 100 : 0;
      const salesScore = row.sales >= salesMedian * 1.15 ? 2 : row.sales >= salesMedian * 0.8 ? 1 : 0;
      const atvScore = row.avgTicket >= atvMedian * 1.08 ? 2 : row.avgTicket >= atvMedian * 0.92 ? 1 : 0;
      const duvetScore = !hasProductData ? null : totalDuvet >= Math.max(1, duvetMedian * 1.15) ? 2 : totalDuvet >= Math.max(1, duvetMedian * 0.8) ? 1 : 0;
      const padScore = !hasProductData ? null : padAttach >= 85 ? 2 : padAttach >= 55 ? 1 : 0;
      const pillowScore = !hasProductData ? null : pillowAttach > 100 ? 2 : pillowAttach >= 70 ? 1 : 0;
      let offerBehavior = hasProductData ? 'متوازن' : 'لا توجد بيانات';
      let offerScore = hasProductData ? 1 : null;
      if (hasProductData) {
        if (p.offerFocusPct >= 55 && row.sales < salesMedian * 0.9) { offerBehavior = 'اعتماد على العروض'; offerScore = 0; }
        else if (p.offerFocusPct <= 35 && row.sales >= salesMedian) { offerBehavior = 'بيع مباشر قوي'; offerScore = 2; }
        else if (p.offerFocusPct <= 25 && row.sales < salesMedian * 0.85) { offerBehavior = 'نشاط تجاري ضعيف'; offerScore = 0; }
        else if (p.offerFocusPct >= 55) offerBehavior = 'استفادة جيدة من العروض';
      }
      const weightedScoreParts = [((salesScore + atvScore) / 2) * 1.4, duvetScore, padScore, pillowScore, offerScore].filter((value) => value !== null) as number[];
      const weightedScoreDenominator = hasProductData ? 5.4 : 1.4;
      const score = weightedScoreParts.reduce((sum, value) => sum + value, 0) / weightedScoreDenominator;
      const level = score >= 1.45 ? 'A' : score < 0.9 ? 'C' : 'B';
      const levelLabel = level === 'A' ? 'A - قوي' : level === 'B' ? 'B - متوسط' : 'C - يحتاج تدخل';
      const padBands = [{ label: 'منخفض', value: p.kingPadBandLow }, { label: 'متوسط', value: p.kingPadBandMid }, { label: 'مرتفع', value: p.kingPadBandHigh }];
      const bandTotal = padBands.reduce((s, b) => s + b.value, 0);
      const topBand = padBands.slice().sort((a, b) => b.value - a.value)[0];
      const padFocus = !bandTotal || topBand.value / bandTotal < 0.55 ? 'متوازن' : topBand.label;
      const duvetStatus = !hasProductData ? 'لا توجد بيانات' : duvetScore === 2 ? 'قوي' : duvetScore === 1 ? 'متوسط' : 'ضعيف';
      const padQuality = !hasProductData ? 'لا توجد بيانات' : padScore === 2 ? 'قوي' : padScore === 1 ? 'متوسط' : 'ضعيف';
      const pillowStatus = !hasProductData ? 'لا توجد بيانات' : pillowScore === 2 ? 'ممتاز' : pillowScore === 1 ? 'طبيعي' : 'ضعيف';
      let pattern = 'Balanced Seller';
      if (offerBehavior === 'اعتماد على العروض') pattern = 'Offer Driven';
      else if (row.trans >= transMedian * 1.15 && row.avgTicket < atvMedian * 0.92) pattern = 'Volume Seller';
      else if (row.avgTicket >= atvMedian * 1.08 && offerBehavior === 'بيع مباشر قوي') pattern = 'Premium Seller';
      else if (duvetScore === 2 && (padScore ?? 0) <= 1 && (pillowScore ?? 0) <= 1) pattern = 'Duvet Seller';
      else if (padScore === 2 || pillowScore === 2) pattern = 'Add-on Seller';
      else if (hasProductData && (padScore === 0 || pillowScore === 0)) pattern = 'Weak Attach';
      else if (atvScore === 0) pattern = 'Weak Basket';
      const strength = [
        { label: 'جودة بيع قوية', score: (salesScore + atvScore) / 2 },
        ...(hasProductData ? [
          { label: 'بيع اللحاف', score: duvetScore as number },
          { label: 'ربط اللباد', score: padScore as number },
          { label: 'إكمال المخدة', score: pillowScore as number },
          { label: offerBehavior === 'بيع مباشر قوي' ? 'بيع مباشر قوي' : 'سلوك تجاري جيد', score: offerScore as number },
        ] : []),
      ].sort((a, b) => b.score - a.score)[0]?.label || 'متوازن';
      let weakness = 'الثبات';
      if (offerBehavior === 'اعتماد على العروض') weakness = 'الاعتماد على العروض';
      else if (offerBehavior === 'نشاط تجاري ضعيف') weakness = 'النشاط التجاري';
      else if (hasProductData && pillowScore === 0) weakness = 'إكمال المخدة';
      else if (hasProductData && padScore === 0) weakness = 'تركيز اللباد';
      else if (hasProductData && duvetScore === 0) weakness = 'بيع اللحاف';
      else if (atvScore === 0) weakness = 'ATV';
      const actionMap: Record<string, string> = { ATV: 'رفع قيمة السلة في كل فاتورة', 'بيع اللحاف': 'تنشيط بيع اللحاف يومياً', 'تركيز اللباد': 'دفع مزج اللباد المتوسط/العالي', 'إكمال المخدة': 'زيادة إكمال المخدة مع كل لحاف', 'الاعتماد على العروض': 'تقليل الاعتماد على العرض فقط', 'النشاط التجاري': 'متابعة يومية على النشاط التجاري', 'الثبات': 'كوچنغ يومي على الإغلاق' };
      return { ...row, level, levelLabel, pattern, strength, weakness, action: actionMap[weakness] || 'متابعة يومية', duvetStatus, padFocus: hasProductData ? padFocus : 'لا توجد بيانات', padQuality, pillowStatus, offerBehavior, totalDuvet, totalPad, totalPillow, weightedPadAttach: padAttach, weightedPillowAttach: pillowAttach, salesQualityScore: (salesScore + atvScore) / 2, duvetScore, padScore, pillowScore, hasProductData };
    }).sort((a, b) => ({ C: 0, B: 1, A: 2 }[a.level] - { C: 0, B: 1, A: 2 }[b.level] || b.sales - a.sales));
  }, [rows]);

  const topCards = useMemo(() => {
    const weakCounts = new Map<string, number>();
    const storeMap = new Map<string, { attach: number; basket: number; count: number }>();
    decisionRows.forEach((row) => {
      weakCounts.set(row.weakness, (weakCounts.get(row.weakness) || 0) + 1);
      const prev = storeMap.get(row.storeName) || { attach: 0, basket: 0, count: 0 };
      prev.attach += (row.duvetScore + row.padScore + row.pillowScore) / 3;
      prev.basket += row.salesQualityScore;
      prev.count += 1;
      storeMap.set(row.storeName, prev);
    });
    const commonWeakness = Array.from(weakCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'لا يوجد';
    const stores = Array.from(storeMap.entries()).map(([store, val]) => ({ store, attach: val.attach / Math.max(val.count, 1), basket: val.basket / Math.max(val.count, 1) }));
    return {
      a: decisionRows.filter((r) => r.level === 'A').length,
      b: decisionRows.filter((r) => r.level === 'B').length,
      c: decisionRows.filter((r) => r.level === 'C').length,
      commonWeakness,
      strongestStore: stores.slice().sort((x, y) => y.attach - x.attach)[0]?.store || 'لا يوجد',
      weakestStore: stores.slice().sort((x, y) => x.basket - y.basket)[0]?.store || 'لا يوجد',
      summary: {
        employees: decisionRows.length,
        sales: decisionRows.reduce((s, r) => s + r.sales, 0),
        trans: decisionRows.reduce((s, r) => s + r.trans, 0),
        avgTicket: decisionRows.reduce((s, r) => s + r.sales, 0) / Math.max(decisionRows.reduce((s, r) => s + r.trans, 0), 1),
      },
    };
  }, [decisionRows]);

  async function analyzeWithAI() {
    if (!decisionRows.length) {
      setAiResult('لا توجد بيانات كافية للتحليل الذكي حالياً.');
      return;
    }
    try {
      setAiLoading(true);
      setAiResult('');
      const res = await fetch(`${AI_BASE}/api/employee-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: { manager: effectiveManager, city, branch, customStart, customEnd, productsPeriodKey },
          summary: { employees: topCards.summary.employees, sales: Math.round(topCards.summary.sales), transactions: Math.round(topCards.summary.trans), avgTicket: Number(topCards.summary.avgTicket.toFixed(1)) },
          rows: decisionRows.map((row) => ({ employee: row.name, store: row.storeName, level: row.level, pattern: row.pattern, strength: row.strength, weakness: row.weakness, action: row.action, duvetStatus: row.duvetStatus, padFocus: row.padFocus, padQuality: row.padQuality, pillowStatus: row.pillowStatus, offerBehavior: row.offerBehavior, avgTicket: row.avgTicket, sales: row.sales, transactions: row.trans, duvetTotal: row.totalDuvet, padAttachPct: row.weightedPadAttach, pillowAttachPct: row.weightedPillowAttach, offerFocusPct: row.productInsights.offerFocusPct })),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAiResult(String(data?.text || '').trim() || AI_ERROR);
    } catch {
      setAiResult(AI_ERROR);
    } finally {
      setAiLoading(false);
    }
  }

  if (!empRaw || !mgmt || !empProductsRaw) return <div className="p-6">جارٍ تحميل بيانات تحليل الموظفين...</div>;

  return (
    <div className="space-y-5 pb-16">
      <div className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-neutral-900 via-neutral-900 to-orange-700 p-5 text-white shadow-xl">
        <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-bold tracking-wide text-orange-200/90">Orange Cockpit</div>
            <h1 className="text-2xl font-black">تحليل الموظفين</h1>
            <p className="mt-1 text-sm text-white/80">عرض قرار إداري سريع لأداء البيع والربط وجودة السلة</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs">MTD في النظام = من أول الشهر حتى <span className="font-black">أمس</span> (لا يُحسب يوم اليوم حتى ينتهي عند 12 ليلاً)</div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div><div className="mb-1 text-xs font-semibold text-neutral-500">من</div><input type="date" className="input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></div>
          <div><div className="mb-1 text-xs font-semibold text-neutral-500">إلى</div><input type="date" className="input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></div>
          <div><div className="mb-1 text-xs font-semibold text-neutral-500">مدير المنطقة</div><select className="input" value={manager} onChange={(e) => setManager(e.target.value)}><option value="all">الكل</option>{managers.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <div><div className="mb-1 text-xs font-semibold text-neutral-500">المدينة</div><select className="input" value={city} onChange={(e) => setCity(e.target.value)}><option value="all">الكل</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><div className="mb-1 text-xs font-semibold text-neutral-500">الفرع</div><select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="all">كافة الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><div className="mb-1 text-xs font-semibold text-neutral-500">مصدر أصناف الموظف</div><select className="input" value={productsPeriodKey} onChange={(e) => setProductsPeriodKey(e.target.value as ProductPeriodKey)}><option value="mtd">MTD (حتى أمس)</option><option value="30d">آخر 30 يوم</option><option value="14d">آخر 14 يوم</option><option value="7d">آخر 7 أيام</option><option value="yest">أمس</option></select></div>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-neutral-500">القرار أولاً في الجدول الرئيسي، والتفاصيل الرقمية داخل الصف الموسع.</div>
          <button type="button" onClick={analyzeWithAI} disabled={aiLoading} className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-2.5 font-black text-white shadow-md transition hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-70">{aiLoading ? 'جارٍ التحليل...' : 'تحليل ذكي'}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-4"><div className="text-xs text-neutral-500">عدد موظفي A</div><div className="text-2xl font-black text-emerald-700">{topCards.a}</div></div>
        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-white to-amber-50 p-4"><div className="text-xs text-neutral-500">عدد موظفي B</div><div className="text-2xl font-black text-amber-700">{topCards.b}</div></div>
        <div className="rounded-xl border border-red-100 bg-gradient-to-br from-white to-red-50 p-4"><div className="text-xs text-neutral-500">عدد موظفي C</div><div className="text-2xl font-black text-red-700">{topCards.c}</div></div>
        <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-white to-orange-50 p-4"><div className="text-xs text-neutral-500">أكثر نقطة ضعف</div><div className="mt-1 text-sm font-black text-neutral-900">{topCards.commonWeakness}</div></div>
        <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4"><div className="text-xs text-neutral-500">أقوى فرع في الربط</div><div className="mt-1 text-sm font-black text-neutral-900">{topCards.strongestStore}</div><div className="mt-2 text-xs text-neutral-500">أضعف فرع في جودة السلة: {topCards.weakestStore}</div></div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-white to-orange-50 p-4"><div className="text-xs text-neutral-500">إجمالي المبيعات</div><div className="dir-ltr text-2xl font-black text-neutral-900">{formatSAR(topCards.summary.sales)}</div></div>
        <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-white to-orange-50 p-4"><div className="text-xs text-neutral-500">متوسط الفاتورة</div><div className="dir-ltr text-2xl font-black text-neutral-900">{formatSAR(topCards.summary.avgTicket)}</div></div>
        <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-white to-orange-50 p-4"><div className="text-xs text-neutral-500">عدد الموظفين ضمن الفلتر</div><div className="text-2xl font-black text-neutral-900">{topCards.summary.employees}</div></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="bg-neutral-100 text-neutral-700">
                <th className="px-3 py-3 text-right">الموظف</th>
                <th className="px-3 py-3 text-right">الفرع</th>
                <th className="px-3 py-3 text-center">المستوى</th>
                <th className="px-3 py-3 text-center">النمط البيعي</th>
                <th className="px-3 py-3 text-center">نقطة القوة</th>
                <th className="px-3 py-3 text-center">نقطة الضعف</th>
                <th className="px-3 py-3 text-center">اللحاف</th>
                <th className="px-3 py-3 text-center">اللباد</th>
                <th className="px-3 py-3 text-center">المخدة</th>
                <th className="px-3 py-3 text-center">متوسط الفاتورة</th>
                <th className="px-3 py-3 text-center">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {decisionRows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-neutral-100 align-top hover:bg-orange-50/30">
                    <td className="px-3 py-3"><div className="font-semibold text-neutral-900">{row.name}</div><div className="mt-1 flex items-center gap-2 text-xs text-neutral-500"><span className="font-mono">{row.id}</span><button type="button" onClick={() => setExpandedId((prev) => prev === row.id ? null : row.id)} className="rounded-full border border-orange-200 px-2 py-0.5 font-semibold text-orange-700">{expandedId === row.id ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}</button></div></td>
                    <td className="px-3 py-3 text-neutral-700">{row.storeName}</td>
                    <td className="px-3 py-3 text-center"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.levelLabel)}`}>{row.levelLabel}</span></td>
                    <td className="px-3 py-3 text-center"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.pattern)}`}>{row.pattern}</span></td>
                    <td className="px-3 py-3 text-center"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.strength)}`}>{row.strength}</span></td>
                    <td className="px-3 py-3 text-center"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.weakness)}`}>{row.weakness}</span></td>
                    <td className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.duvetStatus)}`}>{row.duvetStatus}</span><span className="text-xs text-neutral-500">{row.hasProductData ? `${Math.round(row.totalDuvet)} قطعة` : 'لا توجد بيانات'}</span></div></td>
                    <td className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.padQuality)}`}>{row.hasProductData ? `${row.padFocus} | ${row.padQuality}` : 'لا توجد بيانات'}</span><span className="text-xs text-neutral-500">{formatMetricValue(row.weightedPadAttach, row.hasProductData, '%')}</span></div></td>
                    <td className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.pillowStatus)}`}>{row.pillowStatus}</span><span className="text-xs text-neutral-500">{formatMetricValue(row.weightedPillowAttach, row.hasProductData, '%')}</span></div></td>
                    <td className="px-3 py-3 text-center"><div className="font-black text-neutral-900">{formatSAR(row.avgTicket)}</div><div className="text-xs text-neutral-500">{row.offerBehavior}</div></td>
                    <td className="px-3 py-3 text-center"><div className="mx-auto max-w-[180px] text-xs font-semibold leading-5 text-neutral-700">{row.action}</div></td>
                  </tr>
                  {expandedId === row.id ? <tr className="border-t border-orange-100 bg-orange-50/30"><td colSpan={11} className="px-4 py-4"><div className="grid grid-cols-1 gap-3 md:grid-cols-4"><div className="rounded-xl border border-neutral-200 bg-white p-3"><div className="text-xs text-neutral-500">المبيعات / العمليات</div><div className="mt-1 font-black text-neutral-900">{formatSAR(row.sales)}</div><div className="mt-1 text-xs text-neutral-500">عدد العمليات: {Math.round(row.trans).toLocaleString()}</div><div className="text-xs text-neutral-500">عدد القطع: {Math.round(row.items).toLocaleString()}</div></div><div className="rounded-xl border border-neutral-200 bg-white p-3"><div className="text-xs text-neutral-500">تفصيل اللحاف</div><div className="mt-1 text-sm font-bold text-neutral-900">كينج: {row.hasProductData ? Math.round(row.productInsights.kingDuvet).toLocaleString() : 'لا توجد بيانات'}</div><div className="text-sm font-bold text-neutral-900">فل: {row.hasProductData ? Math.round(row.productInsights.fullDuvet).toLocaleString() : 'لا توجد بيانات'}</div><div className="mt-1 text-xs text-neutral-500">الحالة العامة: {row.duvetStatus}</div></div><div className="rounded-xl border border-neutral-200 bg-white p-3"><div className="text-xs text-neutral-500">تفصيل اللباد</div><div className="mt-1 text-sm font-bold text-neutral-900">الربط: {formatMetricValue(row.weightedPadAttach, row.hasProductData, '%')}</div><div className="text-xs text-neutral-500">التركيز: {row.padFocus}</div><div className="mt-1 text-xs text-neutral-500">منخفض / متوسط / مرتفع = {row.hasProductData ? `${Math.round(row.productInsights.kingPadBandLow)} / ${Math.round(row.productInsights.kingPadBandMid)} / ${Math.round(row.productInsights.kingPadBandHigh)}` : 'لا توجد بيانات'}</div></div><div className="rounded-xl border border-neutral-200 bg-white p-3"><div className="text-xs text-neutral-500">تفصيل المخدة والعروض</div><div className="mt-1 text-sm font-bold text-neutral-900">المخدة: {formatMetricValue(row.weightedPillowAttach, row.hasProductData, '%')}</div><div className="text-xs text-neutral-500">التصنيف: {row.pillowStatus}</div><div className="mt-1 text-xs text-neutral-500">تركيز العروض: {formatMetricValue(row.productInsights.offerFocusPct, row.hasProductData, '%')}</div><div className="text-xs text-neutral-500">السلوك: {row.offerBehavior}</div></div></div></td></tr> : null}
                </Fragment>
              ))}
              {!decisionRows.length ? <tr><td colSpan={11} className="py-8 text-center text-neutral-400">لا توجد بيانات ضمن الفلاتر الحالية.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg">
        <h3 className="mb-2 font-bold text-neutral-900">مخرجات التحليل الذكي</h3>
        <div className="min-h-20 whitespace-pre-wrap text-sm leading-7 text-neutral-700">{aiResult || 'اضغط على "تحليل ذكي" لإرسال البيانات الحالية إلى الخادم والحصول على قراءة إدارية مختصرة.'}</div>
      </div>
    </div>
  );
}
