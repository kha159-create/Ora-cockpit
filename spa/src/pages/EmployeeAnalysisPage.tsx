
import { Fragment, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { getCurrentUser } from '../auth/storage';
import { loadEmployeeProductsData, loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { calendarYesterday, mtdRangeThroughYesterday, toLocalYMD } from '../utils/mtdDateRange';
import { getEmployeeTargetForEffectiveDate, sumEmployeeTargetForDateRange } from '../utils/march2026Targets';
import { buildBucketsForDateRange, daysInclusiveYMD } from '../utils/targetSplitPeriods';

const PAD_MODEL_CODE_MAP: Record<string, 5 | 10 | 15> = {
  '9300': 5,
  '9611': 10,
  '9629': 15,
  '9612': 5,
  '9615': 10,
  '9630': 15,
  '130010008': 5,
  '130010023': 10,
  '130010024': 15,
  '130030008': 5,
  '130030009': 10,
  '130030010': 15,
};

const KING_PAD_CODE_SET = new Set(['9300', '9611', '9629', '130010008', '130010023', '130010024']);
const FULL_PAD_CODE_SET = new Set(['9612', '9615', '9630', '130030008', '130030009', '130030010']);

const PAD_NAME_MODEL_MAP: Array<{ pattern: RegExp; model: 5 | 10 | 15 }> = [
  { pattern: /justrelax|matresspadkingjustrelax/, model: 5 },
  { pattern: /clouddre+a?m15cm|matresspadfullclouddre+a?m15cm|fullclouddre+a?m15cm/, model: 15 },
  { pattern: /clouddream10cm|matresspadfullclouddream10cm/, model: 10 },
  { pattern: /clouddream5cm|matresspadfullclouddream5cm/, model: 5 },
  { pattern: /matresspadkingclouddream|kingclouddream|clouddreammatresspadking/, model: 10 },
  { pattern: /15\s*cm/i, model: 15 },
  { pattern: /10\s*cm/i, model: 10 },
  { pattern: /5\s*cm/i, model: 5 },
];

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

function normalizeProductKey(raw: unknown) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
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
  const isFull = t.includes('full') || t.includes('queen') || t.includes('فل') || t.includes('كوين') || t.includes('twin') || t.includes('توين');
  const isPillow = t.includes('مخده') || t.includes('مخدات') || t.includes('pillow');
  const isDuvet = t.includes('لحاف') || t.includes('لحافات') || t.includes('duvet') || t.includes('comforter');
  const isPad = t.includes('لباد') || t.includes('لبده') || t.includes('mattress') || t.includes('protect');
  if (isDuvet && isKing) return 'king_duvet';
  if (isDuvet && isFull) return 'full_duvet';
  if (isPillow && isKing) return 'king_pillow';
  if (isPillow && (t.includes('ستاندر') || t.includes('standard') || isFull)) return 'full_pillow';
  if (isPad && isKing) return 'king_pad';
  if (isPad && isFull) return 'full_pad';
  return null;
}

function parsePadModel(name: string): 5 | 10 | 15 | null {
  const t = normText(name).replace(/\s+/g, '');
  if (t.includes('15cm') || t.includes('15سم') || t.includes('15سم')) return 15;
  if (t.includes('10cm') || t.includes('10سم') || t.includes('10سم')) return 10;
  if (t.includes('5cm') || t.includes('5سم') || t.includes('5سم')) return 5;
  return null;
}

function getItemKeys(item: any) {
  return [
    item?.alias,
    item?.dynamic_code,
    item?.dynamicCode,
    item?.old_code,
    item?.oldCode,
    item?.new_code,
    item?.newCode,
    item?.product_code,
    item?.productCode,
    item?.code,
    item?.id,
  ]
    .map(normalizeProductKey)
    .filter(Boolean);
}

function getItemAvgPrice(item: any) {
  const qty = safeNum(item?.qty);
  if (qty <= 0) return null;
  const amt = safeNum(item?.amt);
  if (amt <= 0) return null;
  return amt / qty;
}

function parsePadBucketFromItem(item: any): 'king' | 'full' | null {
  const keys = getItemKeys(item);
  for (const key of keys) {
    if (KING_PAD_CODE_SET.has(key)) return 'king';
    if (FULL_PAD_CODE_SET.has(key)) return 'full';
  }

  const t = normText(String(item?.name || ''));
  const isPad = t.includes('ظ„ط¨ط§ط¯') || t.includes('ظ„ط¨ط¯ظ‡') || t.includes('mattress') || t.includes('protect');
  if (!isPad) return null;
  if (t.includes('king') || t.includes('ظƒظٹظ†ط؛') || t.includes('ظƒظ†ط¬')) return 'king';
  if (t.includes('full') || t.includes('queen') || t.includes('twin') || t.includes('ظپظ„') || t.includes('طƒظˆظٹظ†') || t.includes('طھظˆظٹظ†')) return 'full';
  return null;
}

function parsePadModelFromPrice(item: any, bucket: 'king' | 'full'): 5 | 10 | 15 | null {
  const avg = getItemAvgPrice(item);
  if (avg == null || avg <= 0) return null;
  if (bucket === 'king') {
    if (avg <= 250) return 5;
    if (avg <= 450) return 10;
    return 15;
  }
  if (avg <= 220) return 5;
  if (avg <= 380) return 10;
  return 15;
}

function parsePadModelFromItem(item: any): 5 | 10 | 15 | null {
  const keys = getItemKeys(item);
  const bucket = parsePadBucketFromItem(item);

  for (const key of keys) {
    if (PAD_MODEL_CODE_MAP[key]) return PAD_MODEL_CODE_MAP[key];
  }

  const normalizedName = normalizeProductKey(normText(String(item?.name || '')));
  for (const rule of PAD_NAME_MODEL_MAP) {
    if (rule.pattern.test(normalizedName)) return rule.model;
  }

  const parsedFromName = parsePadModel(String(item?.name || ''));
  if (parsedFromName) return parsedFromName;
  if (bucket) return parsePadModelFromPrice(item, bucket);
  return null;
}

function targetPaceLabel(status: string) {
  if (status === 'on_track') return 'على مسار الهدف';
  if (status === 'slightly_behind') return 'أقل من المطلوب قليلاً';
  return 'أقل من المطلوب بشكل واضح';
}

function dailyNeedLabel(status: string) {
  if (status === 'manageable') return 'المطلوب اليومي مناسب';
  if (status === 'needs_push') return 'يحتاج دفع يومي';
  return 'المطلوب اليومي مرتفع';
}

function formatMetricValue(value: number | null, hasData: boolean, suffix = '') {
  if (!hasData || value == null || !Number.isFinite(value)) return 'لا توجد بيانات';
  return `${value.toFixed(0)}${suffix}`;
}

function chipTone(kind: string) {
  if (/(قوي|ممتاز|A|Premium|Balanced|بيع مباشر|فوق|منظ|بيع منظم|على مسار الهدف|مناسب|healthy)/i.test(kind)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (/(متوسط|طبيعي|B|Volume|Duvet|Add-on|متوازن|near|slightly|push|average|قليلاً|يحتاج دفع)/i.test(kind)) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (/(ضعيف|C|Weak|اعتماد|نشاط|below|behind|risky|dependence|مشتت|غير متوازن|مرتفع|واضح)/i.test(kind)) return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-neutral-100 text-neutral-700 border-neutral-200';
}

function daysInMonthFromYmd(ymd: string) {
  const [year, month] = ymd.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function firstDayOfMonth(ymd: string) {
  return `${ymd.slice(0, 7)}-01`;
}

function lastDayOfMonth(ymd: string) {
  return `${ymd.slice(0, 7)}-${String(daysInMonthFromYmd(ymd)).padStart(2, '0')}`;
}

function clampYmd(a: string, b: string) {
  return a <= b ? a : b;
}

function focusLabel(entries: Array<{ label: string; value: number }>, balancedText = 'متوازن') {
  const total = entries.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return 'لا توجد بيانات';
  const top = entries.slice().sort((a, b) => b.value - a.value)[0];
  if (!top || top.value / total < 0.55) return balancedText;
  return top.label;
}

function summarizePeriodPerformance(achievements: number[]) {
  const valid = achievements.filter((value) => Number.isFinite(value));
  if (!valid.length) return 'لا توجد بيانات';
  const first = valid[0];
  const last = valid[valid.length - 1];
  const spread = Math.max(...valid) - Math.min(...valid);
  if (valid.length >= 2 && first >= 105 && last < 85) return 'بداية قوية ثم تراجع';
  if (valid.length >= 2 && first < 85 && last >= 100) return 'بداية ضعيفة ثم تحسن';
  if (spread >= 35) return 'أداء متذبذب';
  if (last - first >= 15) return 'يتحسن عبر الفترات';
  if (first - last >= 15) return 'يتراجع عبر الفترات';
  if (valid[0] >= 100) return 'قوي في الفترة الأولى';
  if (valid.length > 1 && valid[1] < 85) return 'ضعيف في الفترة الثانية';
  return 'أداء مستقر';
}

function periodStrengthLabel(value: number) {
  if (value >= 100) return 'قوي';
  if (value >= 85) return 'متوسط';
  return 'ضعيف';
}

function classifyPillowStatus(attachPct: number | null) {
  if (attachPct == null) return 'لا توجد بيانات';
  if (attachPct > 100) return 'ممتاز';
  if (attachPct >= 70) return 'طبيعي';
  return 'ضعيف';
}

function classifyPadQuality(attachPct: number | null) {
  if (attachPct == null) return 'لا توجد بيانات';
  if (attachPct >= 85) return 'قوي';
  if (attachPct >= 55) return 'متوسط';
  return 'ضعيف';
}

function riskRank(status: string) {
  if (status === 'risky') return 2;
  if (status === 'needs_push') return 1;
  return 0;
}

function paceRank(status: string) {
  if (status === 'significantly_behind') return 2;
  if (status === 'slightly_behind') return 1;
  return 0;
}

type ProductPeriodKey = 'mtd' | 'yest' | '7d' | '14d' | '30d';
type DatePeriodKey = ProductPeriodKey | 'custom';
type SortKey = 'name' | 'store' | 'level' | 'sales' | 'avgTicket' | 'targetAchievement' | 'dailyRisk' | 'targetPace';
type SortDir = 'asc' | 'desc';
type DuvetBands = { low: number; medium: number; high: number; total: number; focus: string };
type PadModels = { model5: number; model10: number; model15: number; total: number; unclassified: number; focus: string; attachPct: number | null; quality: string; low?: number; medium?: number; high?: number; priceFocus?: string; avgUnitPrice?: number | null };
type PillowDetail = { total: number; attachPct: number | null; status: string };
type PeriodSnapshot = { label: string; sales: number; target: number; achievementPct: number };
type ProductMixSummary = { topCategory: string; concentrationPct: number; otherSharePct: number; coreSharePct: number; distinctCategories: number; diversityLabel: string; supportLabel: string };

function getDateRangeForMode(mode: DatePeriodKey, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();
  const yest = calendarYesterday(now);
  const yestYMD = toLocalYMD(yest);
  if (mode === 'yest') return { start: yestYMD, end: yestYMD };
  if (mode === 'custom' && customStart && customEnd) {
    return customStart <= customEnd
      ? { start: customStart, end: customEnd }
      : { start: customEnd, end: customStart };
  }
  if (mode === '7d') {
    const s = new Date(yest);
    s.setDate(yest.getDate() - 7);
    return { start: toLocalYMD(s), end: yestYMD };
  }
  if (mode === '14d') {
    const s = new Date(yest);
    s.setDate(yest.getDate() - 14);
    return { start: toLocalYMD(s), end: yestYMD };
  }
  if (mode === '30d') {
    const s = new Date(yest);
    s.setDate(yest.getDate() - 30);
    return { start: toLocalYMD(s), end: yestYMD };
  }
  return mtdRangeThroughYesterday(now);
}

type ProductInsights = {
  kingDuvet: number;
  fullDuvet: number;
  kingPad: number;
  fullPad: number;
  kingPillow: number;
  fullPillow: number;
  kingDuvetBands: DuvetBands;
  fullDuvetBands: DuvetBands;
  kingPadModels: PadModels;
  fullPadModels: PadModels;
  kingPillowDetail: PillowDetail;
  fullPillowDetail: PillowDetail;
  mixSummary?: ProductMixSummary;
};

type EmployeeRow = {
  id: string;
  name: string;
  storeId: string;
  storeName: string;
  manager: string;
  sales: number;
  trans: number;
  items: number;
  monthSales: number;
  monthTrans: number;
  monthItems: number;
  salesByDate: Record<string, number>;
  avgTicket: number;
  hasProductData: boolean;
  productInsights: ProductInsights;
};

const emptyDuvetBands = (): DuvetBands => ({ low: 0, medium: 0, high: 0, total: 0, focus: 'لا توجد بيانات' });
const emptyPadModels = (): PadModels => ({ model5: 0, model10: 0, model15: 0, total: 0, unclassified: 0, focus: 'لا توجد بيانات', attachPct: null, quality: 'لا توجد بيانات' });
const emptyPillowDetail = (): PillowDetail => ({ total: 0, attachPct: null, status: 'لا توجد بيانات' });
const emptyProductInsights = (): ProductInsights => ({
  kingDuvet: 0,
  fullDuvet: 0,
  kingPad: 0,
  fullPad: 0,
  kingPillow: 0,
  fullPillow: 0,
  kingDuvetBands: emptyDuvetBands(),
  fullDuvetBands: emptyDuvetBands(),
  kingPadModels: emptyPadModels(),
  fullPadModels: emptyPadModels(),
  kingPillowDetail: emptyPillowDetail(),
  fullPillowDetail: emptyPillowDetail(),
});

const AI_BASE = typeof window !== 'undefined' && window.location?.hostname?.includes('vercel.app') ? '' : 'https://ora-cockpit.vercel.app';
const AI_ERROR = 'تعذر تشغيل التحليل الذكي حالياً. حاول مرة أخرى لاحقاً.';

function SortableHeader({ label, sortKey, activeKey, direction, onClick, align = 'center' }: { label: string; sortKey: SortKey; activeKey: SortKey; direction: SortDir; onClick: (key: SortKey) => void; align?: 'center' | 'right' }) {
  const indicator = activeKey !== sortKey ? '<>' : direction === 'asc' ? '^' : 'v';
  const className = align === 'right' ? 'flex items-center gap-2 font-bold' : 'mx-auto flex items-center gap-2 font-bold';
  return <button type="button" className={className} onClick={() => onClick(sortKey)}>{label} <span className="text-xs">{indicator}</span></button>;
}

function formatExportDate(value: Date) {
  return value.toLocaleString('ar-SA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EmployeeAnalysisPage() {
  const user = getCurrentUser();
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [empProductsRaw, setEmpProductsRaw] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [manager, setManager] = useState('all');
  const [branch, setBranch] = useState(user?.storeId || 'all');
  const [city, setCity] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [dateMode, setDateMode] = useState<DatePeriodKey>('mtd');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('level');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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

  const applyDateMode = (nextMode: DatePeriodKey) => {
    setDateMode(nextMode);
    if (nextMode !== 'custom') {
      const range = getDateRangeForMode(nextMode, customStart, customEnd);
      setCustomStart(range.start);
      setCustomEnd(range.end);
    }
  };

  const effectiveManager = useMemo(() => (isAdminOrAuditor(user?.role) ? manager : user?.name || manager), [manager, user?.name, user?.role]);

  const derived = useMemo(() => {
    if (!empRaw || !mgmt || !customEnd) {
      return {
        rows: [] as EmployeeRow[],
        managers: [] as string[],
        branches: [] as Array<{ id: string; name: string }>,
        cities: [] as string[],
        monthStart: '',
        monthEnd: '',
        paceEnd: '',
        elapsedDays: 0,
        totalMonthDays: 0,
      };
    }

    const storeMeta = mgmt.store_meta || {};
    const stores = mgmt.stores || {};
    const history = empRaw.history || {};
    const employeeNames: Record<string, string> = empRaw.employee_names || {};
    const selectedRange = getDateRangeForMode(dateMode, customStart, customEnd);
    const start = selectedRange.start || '1900-01-01';
    const end = selectedRange.end || '2999-12-31';
    const monthStart = firstDayOfMonth(end);
    const monthEnd = lastDayOfMonth(end);
    const mSet = new Set<string>();
    const cSet = new Set<string>();
    Object.values(storeMeta).forEach((m: any) => {
      if (m?.manager) mSet.add(String(m.manager));
    });

    Object.entries(storeMeta).forEach(([sid, m]: [string, any]) => {
      if (user?.role === 'BranchManager' && sid !== user?.storeId) return;
      if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return;
      if (m?.city) cSet.add(String(m.city));
    });

    const scopedBranchList = Object.keys(stores)
      .filter((sid) => {
        const meta = storeMeta[sid] || {};
        if (user?.role === 'BranchManager' && sid !== user?.storeId) return false;
        if (!isAdminOrAuditor(user?.role) && user?.role !== 'BranchManager' && String(meta?.manager || '') !== String(user?.name || '')) return false;
        if (effectiveManager !== 'all' && String(meta?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && String(meta?.city || '') !== city) return false;
        return true;
      })
      .map((sid) => ({ id: sid, name: stores[sid] || sid }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    const byEmp = new Map<string, EmployeeRow>();

    Object.entries(history).forEach(([sid, recs]: [string, any]) => {
      const meta = storeMeta[sid] || {};
      if (user?.role === 'BranchManager' && sid !== user?.storeId) return;
      if (!isAdminOrAuditor(user?.role) && user?.role !== 'BranchManager' && String(meta?.manager || '') !== String(user?.name || '')) return;
      if (branch !== 'all' && sid !== branch) return;
      if (effectiveManager !== 'all' && String(meta?.manager || '') !== effectiveManager) return;
      if (city !== 'all' && String(meta?.city || '') !== city) return;
      (recs || []).forEach((r: any[]) => {
        const ds = String(r?.[0] || '').substring(0, 10);
        if (!ds) return;
        const rawEmp = String(r?.[1] || '');
        const idRaw = rawEmp.split('-')[0]?.trim();
        if (!idRaw || idRaw === 'مرتجع') return;
        const empKey = normalizeEmpId(idRaw);
        if (!empKey) return;
        const nameFromRec = rawEmp.includes('-') ? rawEmp.split('-').slice(1).join('-').trim() : '';
        const displayName = resolveEmployeeName(empKey, nameFromRec, employeeNames);
        let row = byEmp.get(empKey);
        if (!row) {
          row = {
            id: empKey,
            name: displayName,
            storeId: sid,
            storeName: stores[sid] || sid,
            manager: String(meta?.manager || ''),
            sales: 0,
            trans: 0,
            items: 0,
            monthSales: 0,
            monthTrans: 0,
            monthItems: 0,
            salesByDate: {},
            avgTicket: 0,
            hasProductData: false,
            productInsights: emptyProductInsights(),
          };
          byEmp.set(empKey, row);
        }
        const salesAdd = safeNum(r?.[2]);
        const transAdd = safeNum(r?.[3]);
        const itemsAdd = safeNum(r?.[4]);
        if (displayName && displayName !== empKey && (row.name === empKey || row.name.length < displayName.length)) row.name = displayName;
        if (ds >= start && ds <= end) {
          row.sales += salesAdd;
          row.trans += transAdd;
          row.items += itemsAdd;
          if (salesAdd > 0) {
            row.storeId = sid;
            row.storeName = stores[sid] || sid;
            row.manager = String(meta?.manager || '');
          }
        }
        if (ds >= monthStart && ds <= end) {
          row.monthSales += salesAdd;
          row.monthTrans += transAdd;
          row.monthItems += itemsAdd;
          row.salesByDate[ds] = (row.salesByDate[ds] || 0) + salesAdd;
        }
      });
    });

    const periods = empProductsRaw?.periods || {};
    const productPeriodKey: ProductPeriodKey = dateMode === 'custom' ? 'mtd' : dateMode;
    const scoped = periods?.[productPeriodKey] || periods?.mtd || {};

    Array.from(byEmp.entries()).forEach(([empId, row]) => {
      const idNorm = normalizeEmpId(empId);
      const empBlock = scoped?.[empId] || scoped?.[empId.padStart(4, '0')] || scoped?.[idNorm] || scoped?.[idNorm.padStart(4, '0')] || Object.entries(scoped).find(([k]) => normalizeEmpId(k) === idNorm)?.[1] || null;
      const categories = Array.isArray((empBlock as any)?.categories) ? (empBlock as any).categories : [];
      const items = Array.isArray((empBlock as any)?.items) ? (empBlock as any).items : [];
      const hasProductData = Boolean(empBlock && (categories.length > 0 || items.length > 0));
      const p = emptyProductInsights();
      const categoryQtyMap = new Map<string, number>();
      const hasCategoryAggregates = categories.some((c: any) => safeNum(c?.qty) > 0);
      let kingDuvetBandRaw = 0;
      let fullDuvetBandRaw = 0;
      let kingPadItemQty = 0;
      let fullPadItemQty = 0;
      let kingPadItemAmt = 0;
      let fullPadItemAmt = 0;

      categories.forEach((c: any) => {
        const rawName = String(c?.name || 'غير مصنف').trim() || 'غير مصنف';
        const mapped = canonicalTop6Category(rawName);
        const qty = safeNum(c?.qty);
        if (qty > 0) categoryQtyMap.set(rawName, (categoryQtyMap.get(rawName) || 0) + qty);
        if (mapped === 'king_duvet') p.kingDuvet += qty;
        if (mapped === 'full_duvet') p.fullDuvet += qty;
        if (mapped === 'king_pad') p.kingPad += qty;
        if (mapped === 'full_pad') p.fullPad += qty;
        if (mapped === 'king_pillow') p.kingPillow += qty;
        if (mapped === 'full_pillow') p.fullPillow += qty;
      });

      items.forEach((it: any) => {
        const name = String(it?.name || '');
        const rawCat = canonicalTop6Category(name);
        const padBucket = parsePadBucketFromItem(it);
        const cat = padBucket ? (padBucket === 'king' ? 'king_pad' : 'full_pad') : rawCat;
        const qty = safeNum(it?.qty);
        const avg = qty > 0 ? safeNum(it?.amt) / qty : 0;
        if (qty <= 0) return;
        if (!hasCategoryAggregates) {
          const bucketName = name.trim() || 'غير مصنف';
          categoryQtyMap.set(bucketName, (categoryQtyMap.get(bucketName) || 0) + qty);
        }
        if (cat === 'king_duvet') {
          kingDuvetBandRaw += qty;
          if (avg <= 300) p.kingDuvetBands.low += qty;
          else if (avg <= 600) p.kingDuvetBands.medium += qty;
          else p.kingDuvetBands.high += qty;
        }
        if (cat === 'full_duvet') {
          fullDuvetBandRaw += qty;
          if (avg <= 300) p.fullDuvetBands.low += qty;
          else if (avg <= 499) p.fullDuvetBands.medium += qty;
          else p.fullDuvetBands.high += qty;
        }
        if (cat === 'king_pad') {
          kingPadItemQty += qty;
          kingPadItemAmt += safeNum(it?.amt);
          const model = parsePadModelFromItem(it);
          if (model === 5) p.kingPadModels.model5 += qty;
          else if (model === 10) p.kingPadModels.model10 += qty;
          else if (model === 15) p.kingPadModels.model15 += qty;
          else p.kingPadModels.unclassified += qty;
          if (avg > 0) {
            if (avg <= 250) p.kingPadModels.low = (p.kingPadModels.low || 0) + qty;
            else if (avg <= 450) p.kingPadModels.medium = (p.kingPadModels.medium || 0) + qty;
            else p.kingPadModels.high = (p.kingPadModels.high || 0) + qty;
          }
        }
        if (cat === 'full_pad') {
          fullPadItemQty += qty;
          fullPadItemAmt += safeNum(it?.amt);
          const model = parsePadModelFromItem(it);
          if (model === 5) p.fullPadModels.model5 += qty;
          else if (model === 10) p.fullPadModels.model10 += qty;
          else if (model === 15) p.fullPadModels.model15 += qty;
          else p.fullPadModels.unclassified += qty;
          if (avg > 0) {
            if (avg <= 220) p.fullPadModels.low = (p.fullPadModels.low || 0) + qty;
            else if (avg <= 380) p.fullPadModels.medium = (p.fullPadModels.medium || 0) + qty;
            else p.fullPadModels.high = (p.fullPadModels.high || 0) + qty;
          }
        }
      });

      if (kingDuvetBandRaw > 0 && p.kingDuvet > 0) {
        const scale = p.kingDuvet / kingDuvetBandRaw;
        p.kingDuvetBands.low *= scale;
        p.kingDuvetBands.medium *= scale;
        p.kingDuvetBands.high *= scale;
      }
      if (fullDuvetBandRaw > 0 && p.fullDuvet > 0) {
        const scale = p.fullDuvet / fullDuvetBandRaw;
        p.fullDuvetBands.low *= scale;
        p.fullDuvetBands.medium *= scale;
        p.fullDuvetBands.high *= scale;
      }

      if (kingPadItemQty > 0) p.kingPad = kingPadItemQty;
      if (fullPadItemQty > 0) p.fullPad = fullPadItemQty;
      p.kingDuvetBands.total = p.kingDuvet;
      p.fullDuvetBands.total = p.fullDuvet;
      p.kingDuvetBands.focus = focusLabel([{ label: 'تركيز سعري منخفض', value: p.kingDuvetBands.low }, { label: 'تركيز سعري متوسط', value: p.kingDuvetBands.medium }, { label: 'تركيز سعري مرتفع', value: p.kingDuvetBands.high }]);
      p.fullDuvetBands.focus = focusLabel([{ label: 'تركيز سعري منخفض', value: p.fullDuvetBands.low }, { label: 'تركيز سعري متوسط', value: p.fullDuvetBands.medium }, { label: 'تركيز سعري مرتفع', value: p.fullDuvetBands.high }]);
      p.kingPadModels.total = p.kingPad;
      p.fullPadModels.total = p.fullPad;
      p.kingPadModels.attachPct = p.kingDuvet > 0 ? (p.kingPad / p.kingDuvet) * 100 : null;
      p.fullPadModels.attachPct = p.fullDuvet > 0 ? (p.fullPad / p.fullDuvet) * 100 : null;
      p.kingPadModels.quality = classifyPadQuality(p.kingPadModels.attachPct);
      p.fullPadModels.quality = classifyPadQuality(p.fullPadModels.attachPct);
      p.kingPadModels.focus = focusLabel([{ label: 'تركيز 5 سم', value: p.kingPadModels.model5 }, { label: 'تركيز 10 سم', value: p.kingPadModels.model10 }, { label: 'تركيز 15 سم', value: p.kingPadModels.model15 }]);
      p.fullPadModels.focus = focusLabel([{ label: 'تركيز 5 سم', value: p.fullPadModels.model5 }, { label: 'تركيز 10 سم', value: p.fullPadModels.model10 }, { label: 'تركيز 15 سم', value: p.fullPadModels.model15 }]);
      p.kingPadModels.avgUnitPrice = kingPadItemQty > 0 ? kingPadItemAmt / kingPadItemQty : null;
      p.fullPadModels.avgUnitPrice = fullPadItemQty > 0 ? fullPadItemAmt / fullPadItemQty : null;
      p.kingPadModels.priceFocus = focusLabel([{ label: 'سعري منخفض', value: p.kingPadModels.low || 0 }, { label: 'سعري متوسط', value: p.kingPadModels.medium || 0 }, { label: 'سعري مرتفع', value: p.kingPadModels.high || 0 }]);
      p.fullPadModels.priceFocus = focusLabel([{ label: 'سعري منخفض', value: p.fullPadModels.low || 0 }, { label: 'سعري متوسط', value: p.fullPadModels.medium || 0 }, { label: 'سعري مرتفع', value: p.fullPadModels.high || 0 }]);
      p.kingPillowDetail.total = p.kingPillow;
      p.fullPillowDetail.total = p.fullPillow;
      p.kingPillowDetail.attachPct = p.kingDuvet > 0 ? (p.kingPillow / (p.kingDuvet * 2)) * 100 : null;
      p.fullPillowDetail.attachPct = p.fullDuvet > 0 ? (p.fullPillow / (p.fullDuvet * 2)) * 100 : null;
      p.kingPillowDetail.status = classifyPillowStatus(p.kingPillowDetail.attachPct);
      p.fullPillowDetail.status = classifyPillowStatus(p.fullPillowDetail.attachPct);

      const coreUnits = p.kingDuvet + p.fullDuvet + p.kingPad + p.fullPad + p.kingPillow + p.fullPillow;
      const mixRows = Array.from(categoryQtyMap.entries()).map(([name, qty]) => ({ name, qty })).filter((entry) => entry.qty > 0).sort((a, b) => b.qty - a.qty);
      const mixTotal = mixRows.reduce((sum, entry) => sum + entry.qty, 0);
      const mixCore = mixRows.reduce((sum, entry) => (canonicalTop6Category(entry.name) ? sum + entry.qty : sum), 0);
      const topMix = mixRows[0];
      const concentrationPct = mixTotal > 0 && topMix ? (topMix.qty / mixTotal) * 100 : 0;
      const otherSharePct = mixTotal > 0 ? ((mixTotal - mixCore) / mixTotal) * 100 : 0;
      p.mixSummary = {
        topCategory: topMix?.name || 'لا توجد بيانات',
        concentrationPct,
        otherSharePct,
        coreSharePct: mixTotal > 0 ? (mixCore / mixTotal) * 100 : 0,
        distinctCategories: mixRows.length,
        diversityLabel: mixTotal <= 0 ? 'لا توجد بيانات' : concentrationPct >= 68 ? 'مبيعات مركزة' : mixRows.length >= 4 ? 'تنوع صحي' : 'تنوع متوسط',
        supportLabel: mixTotal <= 0 ? 'لا توجد بيانات' : otherSharePct >= 30 ? 'تنوع داعم واضح' : otherSharePct >= 12 ? 'تنوع داعم محدود' : 'اعتماد أساسي على الفئات الرئيسية',
      };

      row.hasProductData = hasProductData;
      row.productInsights = p;
      row.avgTicket = row.trans > 0 ? row.sales / row.trans : 0;
    });

    return {
      rows: Array.from(byEmp.values()),
      managers: Array.from(mSet).sort((a, b) => a.localeCompare(b, 'ar')),
      branches: scopedBranchList,
      cities: Array.from(cSet).sort((a, b) => a.localeCompare(b, 'ar')),
      monthStart,
      monthEnd,
      paceEnd: end,
      elapsedDays: daysInclusiveYMD(monthStart, end),
      totalMonthDays: daysInMonthFromYmd(end),
    };
  }, [branch, city, customEnd, customStart, dateMode, effectiveManager, empProductsRaw, empRaw, mgmt, user?.name, user?.role, user?.storeId]);

  const decisionRows = useMemo(() => {
    if (!derived.rows.length || !derived.monthStart || !derived.paceEnd) return [];
    const salesMedian = median(derived.rows.map((r) => r.sales));
    const atvMedian = median(derived.rows.map((r) => r.avgTicket));
    const duvetMedian = median(derived.rows.map((r) => r.productInsights.kingDuvet + r.productInsights.fullDuvet));
    const transMedian = median(derived.rows.map((r) => r.trans));
    const storeAvgTicket = new Map<string, number>();
    const grouped = new Map<string, { sales: number; trans: number }>();
    derived.rows.forEach((row) => {
      const prev = grouped.get(row.storeName) || { sales: 0, trans: 0 };
      prev.sales += row.sales;
      prev.trans += row.trans;
      grouped.set(row.storeName, prev);
    });
    grouped.forEach((value, key) => {
      storeAvgTicket.set(key, value.trans > 0 ? value.sales / value.trans : 0);
    });

    const buckets = buildBucketsForDateRange(derived.monthStart, derived.monthEnd, '10');

    return derived.rows.map((row) => {
      const p = row.productInsights;
      const mixSummary = p.mixSummary || { topCategory: 'لا توجد بيانات', concentrationPct: 0, otherSharePct: 0, coreSharePct: 0, distinctCategories: 0, diversityLabel: 'لا توجد بيانات', supportLabel: 'لا توجد بيانات' };
      const hasProductData = row.hasProductData;
      const totalDuvet = p.kingDuvet + p.fullDuvet;
      const totalPad = p.kingPad + p.fullPad;
      const totalPillow = p.kingPillow + p.fullPillow;
      const weightedPadAttach = totalDuvet > 0 ? (totalPad / totalDuvet) * 100 : null;
      const weightedPillowAttach = totalDuvet > 0 ? (totalPillow / (totalDuvet * 2)) * 100 : null;
      const storeAvg = storeAvgTicket.get(row.storeName) || 0;
      const atvVsStore = row.avgTicket >= storeAvg * 1.08 ? 'above_store_average' : row.avgTicket >= storeAvg * 0.92 ? 'near_store_average' : 'below_store_average';
      const atvVsStoreLabel = atvVsStore === 'above_store_average' ? 'فوق متوسط الفرع' : atvVsStore === 'near_store_average' ? 'قريب من متوسط الفرع' : 'أقل من متوسط الفرع';
      const monthTarget = getEmployeeTargetForEffectiveDate(empRaw, row.id, derived.paceEnd);
      const targetAchievementPct = monthTarget > 0 ? (row.monthSales / monthTarget) * 100 : 0;
      const expectedPacePct = derived.totalMonthDays > 0 ? (derived.elapsedDays / derived.totalMonthDays) * 100 : 0;
      const targetPaceStatus = targetAchievementPct >= expectedPacePct * 0.98 ? 'on_track' : targetAchievementPct >= expectedPacePct * 0.82 ? 'slightly_behind' : 'significantly_behind';
      const targetPaceLabelText = targetPaceLabel(targetPaceStatus);
      const remainingDays = Math.max(0, derived.totalMonthDays - derived.elapsedDays);
      const avgDailySales = derived.elapsedDays > 0 ? row.monthSales / derived.elapsedDays : 0;
      const remainingTarget = Math.max(0, monthTarget - row.monthSales);
      const requiredRemainingDailySales = remainingDays > 0 ? remainingTarget / remainingDays : 0;
      const dailyRiskStatus = remainingDays === 0 || remainingTarget <= 0 ? 'manageable' : requiredRemainingDailySales <= avgDailySales * 1.15 ? 'manageable' : requiredRemainingDailySales <= avgDailySales * 1.45 ? 'needs_push' : 'risky';
      const dailyRiskLabelText = dailyNeedLabel(dailyRiskStatus);

      const bucketSnapshots: PeriodSnapshot[] = buckets.map((bucket, index) => {
        const effectiveEnd = clampYmd(bucket.end, derived.paceEnd);
        if (bucket.start > derived.paceEnd) return { label: `الفترة ${index + 1}`, sales: 0, target: 0, achievementPct: 0 };
        const sales = Object.entries(row.salesByDate).reduce((sum, [date, value]) => (date >= bucket.start && date <= effectiveEnd ? sum + value : sum), 0);
        const target = sumEmployeeTargetForDateRange(empRaw, row.id, bucket.start, effectiveEnd);
        const achievementPct = target > 0 ? (sales / target) * 100 : 0;
        return { label: `الفترة ${index + 1}`, sales, target, achievementPct };
      }).filter((snapshot) => snapshot.sales > 0 || snapshot.target > 0);
      const periodPerformance = summarizePeriodPerformance(bucketSnapshots.map((snapshot) => snapshot.achievementPct));
      const consistencyScore = periodPerformance === 'أداء متذبذب' || periodPerformance === 'بداية قوية ثم تراجع' ? 0 : periodPerformance === 'يتحسن عبر الفترات' || periodPerformance === 'بداية ضعيفة ثم تحسن' ? 2 : 1;

      const salesScore = row.sales >= salesMedian * 1.15 ? 2 : row.sales >= salesMedian * 0.8 ? 1 : 0;
      const atvScore = atvVsStore === 'above_store_average' ? 2 : atvVsStore === 'near_store_average' ? 1 : 0;
      const paceScore = targetPaceStatus === 'on_track' ? 2 : targetPaceStatus === 'slightly_behind' ? 1 : 0;
      const mixScore = !hasProductData ? null : mixSummary.concentrationPct >= 68 ? 0 : mixSummary.distinctCategories >= 4 || mixSummary.otherSharePct >= 18 ? 2 : 1;
      const duvetScore = !hasProductData ? null : totalDuvet >= Math.max(1, duvetMedian * 1.15) ? 2 : totalDuvet >= Math.max(1, duvetMedian * 0.8) ? 1 : 0;
      const padScore = !hasProductData ? null : weightedPadAttach != null && weightedPadAttach >= 85 ? 2 : weightedPadAttach != null && weightedPadAttach >= 55 ? 1 : 0;
      const pillowScore = !hasProductData ? null : weightedPillowAttach != null && weightedPillowAttach > 100 ? 2 : weightedPillowAttach != null && weightedPillowAttach >= 70 ? 1 : 0;
      const productFocuses = [p.kingDuvetBands.focus, p.fullDuvetBands.focus, p.kingPadModels.focus, p.fullPadModels.focus].filter((focus) => focus !== 'لا توجد بيانات' && focus !== 'متوازن');
      const narrowMix = mixSummary.concentrationPct >= 68;
      const strongMix = mixSummary.distinctCategories >= 4 && mixSummary.concentrationPct < 55;
      const supportiveMix = mixSummary.otherSharePct >= 18;
      const scatteredSelling = periodPerformance === 'أداء متذبذب' || periodPerformance === 'بداية قوية ثم تراجع' || productFocuses.length >= 3 || (narrowMix && ((padScore ?? 1) === 0 || (pillowScore ?? 1) === 0));
      const structuredSelling = (padScore ?? 1) >= 1 && (pillowScore ?? 1) >= 1 && consistencyScore >= 1 && (strongMix || supportiveMix || !narrowMix);
      const sellingStructure = structuredSelling ? 'بيع منظم' : scatteredSelling ? 'البيع غير متوازن' : 'بيع جزئي';
      const weightedScoreParts = [salesScore, atvScore, paceScore, dailyRiskStatus === 'manageable' ? 2 : dailyRiskStatus === 'needs_push' ? 1 : 0, consistencyScore, duvetScore, padScore, pillowScore, mixScore].filter((value) => value !== null) as number[];
      const score = weightedScoreParts.reduce((sum, value) => sum + value, 0) / Math.max(weightedScoreParts.length, 1);
      const level = score >= 1.45 ? 'A' : score < 0.9 ? 'C' : 'B';
      const levelLabel = level === 'A' ? 'A - قوي' : level === 'B' ? 'B - متوسط' : 'C - يحتاج تدخل';
      let pattern = 'Balanced Seller';
      if (narrowMix && (padScore ?? 1) <= 1 && (pillowScore ?? 1) <= 1) pattern = 'Scattered Seller';
      else if (row.trans >= transMedian * 1.15 && row.avgTicket < atvMedian * 0.92) pattern = 'Volume Seller';
      else if (row.avgTicket >= atvMedian * 1.08) pattern = 'Premium Seller';
      else if ((duvetScore ?? 0) === 2 && (padScore ?? 0) <= 1 && (pillowScore ?? 0) <= 1) pattern = 'Duvet Seller';
      else if ((padScore ?? 0) === 2 || (pillowScore ?? 0) === 2 || supportiveMix) pattern = 'Add-on Seller';
      else if (hasProductData && ((padScore ?? 1) === 0 || (pillowScore ?? 1) === 0)) pattern = 'Weak Attach';
      else if (atvScore === 0) pattern = 'Weak Basket';

      const duvetStatus = !hasProductData ? 'لا توجد بيانات' : (duvetScore ?? 0) === 2 ? 'قوي' : (duvetScore ?? 0) === 1 ? 'متوسط' : 'ضعيف';
      const padQuality = !hasProductData ? 'لا توجد بيانات' : classifyPadQuality(weightedPadAttach);
      const padFocus = !hasProductData ? 'لا توجد بيانات' : focusLabel([{ label: 'منخفض', value: p.kingPadModels.model5 + p.fullPadModels.model5 }, { label: 'متوسط', value: p.kingPadModels.model10 + p.fullPadModels.model10 }, { label: 'مرتفع', value: p.kingPadModels.model15 + p.fullPadModels.model15 }]);
      const pillowStatus = !hasProductData ? 'لا توجد بيانات' : classifyPillowStatus(weightedPillowAttach);
      const strengths = [{ label: '??? ???? ?????', score: paceScore }, { label: 'ATV ??? ????? ?????', score: atvScore }, { label: '??? ??????', score: duvetScore ?? -1 }, { label: '??? ??????', score: padScore ?? -1 }, { label: '????? ??????', score: pillowScore ?? -1 }, { label: mixSummary.diversityLabel === '???? ???' ? '???? ???? ???' : '??? ?? ?????? ??????', score: mixScore ?? -1 }, { label: periodPerformance === '????? ??? ???????' ? '???? ??? ???????' : '??????? ??????', score: consistencyScore }].sort((a, b) => b.score - a.score);
      const strength = strengths[0]?.label || 'أداء متوازن';

      let weakness = 'الثبات';
      if (dailyRiskStatus === 'risky') weakness = 'وضع المطلوب اليومي';
      else if (targetPaceStatus === 'significantly_behind') weakness = 'وضع الهدف الحالي';
      else if (hasProductData && narrowMix) weakness = 'تنوع المنتجات';
      else if (hasProductData && pillowStatus === 'ضعيف') weakness = 'إكمال المخدة';
      else if (hasProductData && padQuality === 'ضعيف') weakness = 'تركيز اللباد';
      else if (hasProductData && duvetStatus === 'ضعيف') weakness = 'بيع اللحاف';
      else if (atvVsStore === 'below_store_average') weakness = 'ATV';

      const actionMap: Record<string, string> = {
        'تنوع المنتجات': 'توسيع المزج البيعي وعدم الاكتفاء بفئة واحدة فقط',
        'وضع المطلوب اليومي': 'رفع الإغلاق اليومي ومتابعة المطلوب المتبقي',
        'وضع الهدف الحالي': 'زيادة الدفع اليومي للوصول إلى النسبة المطلوبة',
        'إكمال المخدة': 'زيادة إكمال المخدة مع كل لحاف',
        'تركيز اللباد': 'دفع مزج 10 و15 سم مع كل فرصة مناسبة',
        'بيع اللحاف': 'تنشيط بيع اللحاف بسلم سعري أوضح',
        ATV: 'رفع قيمة السلة في كل فاتورة',
        الثبات: 'كوچنغ يومي لرفع الثبات بين الفترات',
      };
      const action = actionMap[weakness] || 'متابعة يومية';
      const isActive = monthTarget > 0 || row.sales > 0 || row.trans > 0 || hasProductData;

      return {
        ...row,
        level,
        levelLabel,
        pattern,
        strength,
        weakness,
        action,
        duvetStatus,
        padFocus,
        padQuality,
        pillowStatus,
        sellingStructure,
        totalDuvet,
        totalPad,
        totalPillow,
        weightedPadAttach,
        weightedPillowAttach,
        atvVsStore,
        atvVsStoreLabel,
        monthTarget,
        targetAchievementPct,
        expectedPacePct,
        targetPaceStatus,
        targetPaceLabel: targetPaceLabelText,
        avgDailySales,
        remainingTarget,
        requiredRemainingDailySales,
        dailyRiskStatus,
        dailyRiskLabel: dailyRiskLabelText,
        periodPerformance,
        periodBuckets: bucketSnapshots,
        quickSummary: `${levelLabel} | ${sellingStructure} | ${atvVsStoreLabel}`,
        salesQualityScore: (salesScore + atvScore + paceScore) / 3,
        duvetScore,
        padScore,
        pillowScore,
        isActive,
      };
    });
  }, [derived, empRaw]);

  const sortedRows = useMemo(() => {
    const levelValue = { A: 0, B: 1, C: 2 } as Record<string, number>;
    const compareText = (a: string, b: string) => a.localeCompare(b, 'ar');
    const compareNumber = (a: number, b: number) => a - b;
    return decisionRows.slice().sort((a, b) => {
      let value = 0;
      if (sortKey === 'name') value = compareText(a.name, b.name);
      else if (sortKey === 'store') value = compareText(a.storeName, b.storeName);
      else if (sortKey === 'level') value = compareNumber(levelValue[a.level], levelValue[b.level]);
      else if (sortKey === 'sales') value = compareNumber(a.sales, b.sales);
      else if (sortKey === 'avgTicket') value = compareNumber(a.avgTicket, b.avgTicket);
      else if (sortKey === 'targetAchievement') value = compareNumber(a.targetAchievementPct, b.targetAchievementPct);
      else if (sortKey === 'dailyRisk') value = compareNumber(riskRank(a.dailyRiskStatus), riskRank(b.dailyRiskStatus));
      else if (sortKey === 'targetPace') value = compareNumber(paceRank(a.targetPaceStatus), paceRank(b.targetPaceStatus));
      if (value === 0) value = b.sales - a.sales;
      return sortDir === 'asc' ? value : -value;
    });
  }, [decisionRows, sortDir, sortKey]);

  const visibleRows = useMemo(() => {
    return sortedRows.filter((row) => row.isActive);
  }, [sortedRows]);

  const groupedVisibleRows = useMemo(() => {
    const branchOrder = new Map(derived.branches.map((item, index) => [item.id, index]));
    const grouped = new Map<string, { storeId: string; storeName: string; rows: typeof visibleRows }>();

    visibleRows.forEach((row) => {
      const current = grouped.get(row.storeId);
      if (current) {
        current.rows.push(row);
        return;
      }
      grouped.set(row.storeId, { storeId: row.storeId, storeName: row.storeName, rows: [row] });
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const aIndex = branchOrder.get(a.storeId);
      const bIndex = branchOrder.get(b.storeId);
      if (aIndex != null && bIndex != null) return aIndex - bIndex;
      if (aIndex != null) return -1;
      if (bIndex != null) return 1;
      return a.storeName.localeCompare(b.storeName, 'ar');
    });
  }, [derived.branches, visibleRows]);

  const topCards = useMemo(() => {
    const weakCounts = new Map<string, number>();
    const storeMap = new Map<string, { attach: number; basket: number; count: number }>();
    visibleRows.forEach((row) => {
      weakCounts.set(row.weakness, (weakCounts.get(row.weakness) || 0) + 1);
      const prev = storeMap.get(row.storeName) || { attach: 0, basket: 0, count: 0 };
      prev.attach += ((row.duvetScore ?? 0) + (row.padScore ?? 0) + (row.pillowScore ?? 0)) / 3;
      prev.basket += row.salesQualityScore;
      prev.count += 1;
      storeMap.set(row.storeName, prev);
    });
    const commonWeakness = Array.from(weakCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'لا يوجد';
    const stores = Array.from(storeMap.entries()).map(([store, val]) => ({ store, attach: val.attach / Math.max(val.count, 1), basket: val.basket / Math.max(val.count, 1) }));
    return {
      a: visibleRows.filter((r) => r.level === 'A').length,
      b: visibleRows.filter((r) => r.level === 'B').length,
      c: visibleRows.filter((r) => r.level === 'C').length,
      commonWeakness,
      strongestStore: stores.slice().sort((x, y) => y.attach - x.attach)[0]?.store || 'لا يوجد',
      weakestStore: stores.slice().sort((x, y) => x.basket - y.basket)[0]?.store || 'لا يوجد',
      summary: {
        employees: visibleRows.length,
        sales: visibleRows.reduce((s, r) => s + r.sales, 0),
        trans: visibleRows.reduce((s, r) => s + r.trans, 0),
        avgTicket: visibleRows.reduce((s, r) => s + r.sales, 0) / Math.max(visibleRows.reduce((s, r) => s + r.trans, 0), 1),
      },
    };
  }, [visibleRows]);

  const activeDateRange = getDateRangeForMode(dateMode, customStart, customEnd);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'name' || key === 'store' || key === 'level' ? 'asc' : 'desc');
  }

  async function analyzeWithAI() {
    if (!visibleRows.length) {
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
          filters: { manager: effectiveManager, city, branch, dateStart: activeDateRange.start, dateEnd: activeDateRange.end, activeOnly: true },
          summary: { employees: topCards.summary.employees, sales: Math.round(topCards.summary.sales), transactions: Math.round(topCards.summary.trans), avgTicket: Number(topCards.summary.avgTicket.toFixed(1)) },
          rows: visibleRows.map((row) => ({ employee: row.name, employeeId: row.id, store: row.storeName, level: row.level, pattern: row.pattern, structure: row.sellingStructure, strength: row.strength, weakness: row.weakness, action: row.action, duvetStatus: row.duvetStatus, padFocus: row.padFocus, padQuality: row.padQuality, pillowStatus: row.pillowStatus, avgTicket: row.avgTicket, atvVsStore: row.atvVsStoreLabel, sales: row.sales, transactions: row.trans, duvetTotal: row.totalDuvet, padTotal: row.totalPad, pillowTotal: row.totalPillow, padAttachPct: row.weightedPadAttach, pillowAttachPct: row.weightedPillowAttach, targetAchievementPct: row.targetAchievementPct, targetPaceStatus: row.targetPaceLabel, dailyRiskStatus: row.dailyRiskLabel, avgDailySales: row.avgDailySales, requiredRemainingDailySales: row.requiredRemainingDailySales, periodPerformance: row.periodPerformance, periodBuckets: row.periodBuckets, duvetKingBands: row.productInsights.kingDuvetBands, duvetFullBands: row.productInsights.fullDuvetBands, padKingModels: row.productInsights.kingPadModels, padFullModels: row.productInsights.fullPadModels, pillowKing: row.productInsights.kingPillowDetail, pillowFull: row.productInsights.fullPillowDetail, productMix: row.productInsights.mixSummary })),
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

  function exportToExcel() {
    if (!visibleRows.length) return;

    const filtersUsed = [
      `مدير المنطقة: ${effectiveManager === 'all' ? 'الكل' : effectiveManager}`,
      `المدينة: ${city === 'all' ? 'الكل' : city}`,
      `الفرع: ${branch === 'all' ? 'كافة الفروع' : derived.branches.find((item) => item.id === branch)?.name || branch}`,
      `الفترة: ${activeDateRange.start || '-'} إلى ${activeDateRange.end || '-'}`,
    ].join(' | ');

    const exportRows = groupedVisibleRows.flatMap((group) =>
      group.rows.map((row) => ({
        'اسم الموظف': row.name,
        'الفرع': group.storeName,
        'المبيعات': Math.round(row.sales),
        'معدل الفاتورة': Number(row.avgTicket.toFixed(1)),
        'نسبة تحقيق التارجت': Number(row.targetAchievementPct.toFixed(1)),
        'المطلوب يومياً': Number(row.requiredRemainingDailySales.toFixed(1)),
        'لحاف كينج': Math.round(row.productInsights.kingDuvetBands.total),
        'لحاف فل': Math.round(row.productInsights.fullDuvetBands.total),
        'لباد كينج': Math.round(row.productInsights.kingPadModels.total),
        'لباد فل': Math.round(row.productInsights.fullPadModels.total),
        'مخدة كينج': Math.round(row.productInsights.kingPillowDetail.total),
        'مخدة فل': Math.round(row.productInsights.fullPillowDetail.total),
      })),
    );

    const workbook = XLSX.utils.book_new();
    const mainSheet = XLSX.utils.json_to_sheet(exportRows);
    mainSheet['!cols'] = [
      { wch: 24 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(workbook, mainSheet, 'تحليل الموظفين');

    const metadataSheet = XLSX.utils.aoa_to_sheet([
      ['البيان', 'القيمة'],
      ['تاريخ التصدير', formatExportDate(new Date())],
      ['عدد الموظفين', visibleRows.length],
      ['الفلاتر المستخدمة', filtersUsed],
    ]);
    metadataSheet['!cols'] = [{ wch: 20 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(workbook, metadataSheet, 'معلومات التصدير');

    XLSX.writeFile(workbook, `employee-analysis-${customEnd || 'export'}.xlsx`);
  }

  if (!empRaw || !mgmt || !empProductsRaw) return <div className="p-6">جارٍ تحميل بيانات تحليل الموظفين...</div>;

  return (
    <div className="space-y-5 pb-16">
      <div className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-neutral-900 via-neutral-900 to-orange-700 p-5 text-white shadow-xl">
        <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-bold tracking-wide text-orange-200/90">Orange Cockpit</div>
            <h1 className="text-2xl font-black">تحليل الموظفين</h1>
            <p className="mt-1 text-sm text-white/80">أداء المبيعات + الربط + قراءة قرار إداري سريعة</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => applyDateMode('mtd')} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${dateMode === 'mtd' ? 'bg-orange-500 text-white shadow-md' : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-orange-50'}`}>الشهر الحالي</button>
            <button type="button" onClick={() => applyDateMode('7d')} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${dateMode === '7d' ? 'bg-orange-500 text-white shadow-md' : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-orange-50'}`}>7 أيام</button>
            <button type="button" onClick={() => applyDateMode('14d')} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${dateMode === '14d' ? 'bg-orange-500 text-white shadow-md' : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-orange-50'}`}>14 يوم</button>
            <button type="button" onClick={() => applyDateMode('30d')} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${dateMode === '30d' ? 'bg-orange-500 text-white shadow-md' : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-orange-50'}`}>30 يوم</button>
            <button type="button" onClick={() => applyDateMode('yest')} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${dateMode === 'yest' ? 'bg-orange-500 text-white shadow-md' : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-orange-50'}`}>أمس</button>
            <button type="button" onClick={() => applyDateMode('custom')} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${dateMode === 'custom' ? 'bg-orange-500 text-white shadow-md' : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-orange-50'}`}>فترة مخصصة</button>
          </div>
          <div className="text-sm font-semibold text-neutral-600 dir-ltr">{derived.monthStart ? `${activeDateRange.start} → ${activeDateRange.end}` : ''}</div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          {dateMode === 'custom' ? (
            <>
              <div><div className="mb-1 text-xs font-semibold text-neutral-500">من</div><input type="date" className="input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></div>
              <div><div className="mb-1 text-xs font-semibold text-neutral-500">إلى</div><input type="date" className="input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></div>
            </>
          ) : null}
          {isAdminOrAuditor(user?.role) ? <div><div className="mb-1 text-xs font-semibold text-neutral-500">مدير المنطقة</div><select className="input" value={manager} onChange={(e) => setManager(e.target.value)}><option value="all">الكل</option>{derived.managers.map((m) => <option key={m} value={m}>{m}</option>)}</select></div> : null}
          <div className={user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}><div className="mb-1 text-xs font-semibold text-neutral-500">المدينة</div><select className="input" value={city} onChange={(e) => setCity(e.target.value)}><option value="all">الكل</option>{derived.cities.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className={user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}><div className="mb-1 text-xs font-semibold text-neutral-500">الفرع</div><select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="all">كافة الفروع</option>{derived.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-neutral-500">انقر على صف الموظف نفسه لفتح التقرير التفصيلي، ويمكنك فرز الجدول من رؤوس الأعمدة.</div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <button type="button" onClick={exportToExcel} disabled={!visibleRows.length} className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 font-bold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50">تصدير Excel</button>
            <button type="button" onClick={analyzeWithAI} disabled={aiLoading} className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-2.5 font-black text-white shadow-md transition hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-70">{aiLoading ? 'جارٍ التحليل...' : 'تحليل ذكي'}</button>
          </div>
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
          <table className="w-full min-w-[1220px] text-sm">
            <thead>
              <tr className="bg-neutral-100 text-neutral-700">
                <th className="px-3 py-3 text-right"><SortableHeader label="الموظف" sortKey="name" activeKey={sortKey} direction={sortDir} onClick={toggleSort} align="right" /></th>
                <th className="px-3 py-3 text-right"><SortableHeader label="الفرع" sortKey="store" activeKey={sortKey} direction={sortDir} onClick={toggleSort} align="right" /></th>
                <th className="px-3 py-3 text-center">نقطة القوة</th>
                <th className="px-3 py-3 text-center">نقطة الضعف</th>
                <th className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><div className="font-bold">اللحاف</div><button type="button" className="text-[11px] text-neutral-500 underline" onClick={() => toggleSort('sales')}>ترتيب بالمبيعات</button></div></th>
                <th className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><div className="font-bold">اللباد</div><button type="button" className="text-[11px] text-neutral-500 underline" onClick={() => toggleSort('dailyRisk')}>ترتيب بوضع المطلوب اليومي</button></div></th>
                <th className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><div className="font-bold">المخدة</div><button type="button" className="text-[11px] text-neutral-500 underline" onClick={() => toggleSort('targetPace')}>ترتيب بوضع الهدف الحالي</button></div></th>
                <th className="px-3 py-3 text-center"><SortableHeader label="متوسط الفاتورة" sortKey="avgTicket" activeKey={sortKey} direction={sortDir} onClick={toggleSort} /></th>
                <th className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><div className="font-bold">الإجراء</div><button type="button" className="text-[11px] text-neutral-500 underline" onClick={() => toggleSort('targetAchievement')}>ترتيب بالإنجاز</button></div></th>
              </tr>
            </thead>
            <tbody>
              {groupedVisibleRows.map((group) => (
                <Fragment key={group.storeId}>
                  <tr className="border-t border-neutral-200 bg-gradient-to-r from-orange-50 to-white">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-black text-neutral-900">{group.storeName}</div>
                        <div className="text-xs text-neutral-500">عدد الموظفين: {group.rows.length}</div>
                      </div>
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <Fragment key={row.id}>
                  <tr className="cursor-pointer border-t border-neutral-100 align-top transition hover:bg-orange-50/40" onClick={() => setExpandedId((prev) => prev === row.id ? null : row.id)}>
                    <td className="px-3 py-3"><div className="font-semibold text-neutral-900">{row.name}</div><div className="mt-1 flex items-center gap-2 text-xs text-neutral-500"><span className="font-mono">{row.id}</span><span className="rounded-full border border-neutral-200 px-2 py-0.5">{expandedId === row.id ? 'إخفاء التقرير' : 'فتح التقرير'}</span></div></td>
                    <td className="px-3 py-3 text-neutral-700">{row.storeName}</td>
                    <td className="px-3 py-3 text-center"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.strength)}`}>{row.strength}</span></td>
                    <td className="px-3 py-3 text-center"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.weakness)}`}>{row.weakness}</span></td>
                    <td className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.duvetStatus)}`}>{row.duvetStatus}</span><span className="text-xs text-neutral-500">{row.hasProductData ? `${Math.round(row.totalDuvet)} قطعة` : 'لا توجد بيانات'}</span></div></td>
                    <td className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.padQuality)}`}>{row.hasProductData ? `${row.padFocus} | ${row.padQuality}` : 'لا توجد بيانات'}</span><span className="text-xs text-neutral-500">{formatMetricValue(row.weightedPadAttach, row.hasProductData, '%')}</span></div></td>
                    <td className="px-3 py-3 text-center"><div className="flex flex-col items-center gap-1"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipTone(row.pillowStatus)}`}>{row.pillowStatus}</span><span className="text-xs text-neutral-500">{formatMetricValue(row.weightedPillowAttach, row.hasProductData, '%')}</span></div></td>
                    <td className="px-3 py-3 text-center"><div className="font-black text-neutral-900">{formatSAR(row.avgTicket)}</div><div className="text-xs text-neutral-500">{row.atvVsStoreLabel}</div></td>
                    <td className="px-3 py-3 text-center"><div className="mx-auto max-w-[180px] text-xs font-semibold leading-5 text-neutral-700">{row.action}<div className="text-neutral-500">الإنجاز: {row.targetAchievementPct.toFixed(1)}%</div></div></td>
                  </tr>
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              {!visibleRows.length ? <tr><td colSpan={9} className="py-8 text-center text-neutral-400">لا توجد بيانات ضمن الفلاتر الحالية.</td></tr> : null}
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
