import { dateWithinMarchPhaseSalesBounds } from './march2026Targets';

function safeNum(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export function pickProductAnalysisPeriod(prodRaw: any) {
  const getP = (p: string) =>
    prodRaw?.periods?.[p]?.catalog && Object.keys(prodRaw.periods[p].catalog).length > 0
      ? prodRaw.periods[p]
      : null;
  return getP('mtd') || getP('30d') || getP('14d') || getP('7d') || null;
}

export type StoreCategoryRow = { name: string; value: number; qty: number; raw: any };

/** فئات الفرع من تحليل المنتجات (مبالغ حقيقية على مستوى المعرض). */
export function storeCategoriesFromAnalysis(storeCode: string, prodRaw: any): StoreCategoryRow[] {
  const pData = pickProductAnalysisPeriod(prodRaw);
  if (!pData) return [];
  const row = pData.analysis?.[String(storeCode)];
  const cats: any[] = row?.categories || [];
  return cats
    .map((c: any) => ({
      name: String(c.category || 'أخرى'),
      value: safeNum(c.amount),
      qty: safeNum(c.qty),
      raw: c,
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function productAnalysisPeriodLabel(prodRaw: any): string {
  const p = pickProductAnalysisPeriod(prodRaw);
  return String(p?.date_range || p?.dateRange || '');
}

const DUVET_RE = /لحاف|دوفت|duvet|مفرش|طقم لحاف/i;

export function isDuvetCategoryName(name: string): boolean {
  return DUVET_RE.test(String(name || ''));
}

/** تجميع كميات اللحاف/المشابه حسب متوسط سعر الفئة (كمية/قيمة الكاتيجوري). */
export function duvetQtyByPriceBand(categories: StoreCategoryRow[]): {
  label: string;
  qty: number;
}[] {
  let low = 0;
  let mid = 0;
  let high = 0;
  for (const c of categories) {
    if (!isDuvetCategoryName(c.name)) continue;
    const qty = c.qty;
    if (qty <= 0) continue;
    const avg = c.value / qty;
    if (avg <= 300) low += qty;
    else if (avg <= 600) mid += qty;
    else high += qty;
  }
  const out = [
    { label: 'قيمة منخفضة (≤300 ر.س)', qty: low },
    { label: 'قيمة متوسطة (301–600 ر.س)', qty: mid },
    { label: 'قيمة عالية (600+ ر.س)', qty: high },
  ].filter((b) => b.qty > 0);
  return out;
}

export function totalDuvetQtyInCategories(categories: StoreCategoryRow[]): number {
  return categories.filter((c) => isDuvetCategoryName(c.name)).reduce((s, c) => s + c.qty, 0);
}

/**
 * مبيعات الموظف ضمن «شهر التقويم» لتاريخ مرجعي، مع احترام مرحلة آذار 2026 إن وُجدت.
 */
export function sumEmployeeSalesForTargetMonth(
  historyData: Record<string, any[]>,
  matchesEmployee: (empField: unknown) => boolean,
  refDateStr: string
): number {
  const monthKey = refDateStr.substring(0, 7);
  let sum = 0;
  const march = refDateStr.startsWith('2026-03');
  Object.values(historyData).forEach((records) => {
    (records || []).forEach((rec: any[]) => {
      const d = String(rec?.[0] || '').substring(0, 10);
      if (!d.startsWith(monthKey)) return;
      if (march && !dateWithinMarchPhaseSalesBounds(d, refDateStr)) return;
      if (!matchesEmployee(rec?.[1])) return;
      sum += safeNum(rec?.[2]);
    });
  });
  return sum;
}
