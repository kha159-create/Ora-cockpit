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

// ----- فرص ضائعة (نفس مصدر صفحة المنتجات) — ربط موظف ↔ صنف مباع (sold_item) -----

export type MissedOppRow = {
  employee_id?: string;
  employee_name?: string;
  sold_item?: string;
  missed_items?: { name: string; count: number }[];
  total_count?: number;
};

export function employeeIdMatchesRow(rowEmployeeId: unknown, targetEmployeeId: string): boolean {
  const t = String(targetEmployeeId || '').trim();
  if (!t) return false;
  const r = String(rowEmployeeId || '').trim();
  const tp = t.padStart(4, '0');
  const tClean = t.replace(/^0+/, '') || t;
  const rClean = r.replace(/^0+/, '') || r;
  if (r === t || r === tp) return true;
  if (rClean === tClean && tClean.length > 0) return true;
  const digitsR = r.replace(/\D/g, '');
  const digitsT = t.replace(/\D/g, '');
  if (digitsR && digitsT && digitsR === digitsT) return true;
  return false;
}

export function missedOpportunitiesRowsForStore(prodRaw: any, storeCode: string): MissedOppRow[] {
  const pData = pickProductAnalysisPeriod(prodRaw);
  const mo = pData?.missed_opportunities?.[String(storeCode)];
  return Array.isArray(mo) ? (mo as MissedOppRow[]) : [];
}

export function missedOpportunitiesForEmployee(rows: MissedOppRow[], employeeId: string): MissedOppRow[] {
  return rows.filter((r) => employeeIdMatchesRow(r.employee_id, employeeId));
}

/**
 * تصنيف نص المنتج المباع (sold_item) لمجموعات عرض — نفس فكرة تمييز اللحاف في المنتجات.
 */
export function deriveProductGroupFromSoldItem(soldItem: string): string {
  const s0 = String(soldItem || '');
  const t = s0.toLowerCase();
  if (/مخد|وساد|pillow|sham/.test(t)) return 'مخدات ووسائد';
  if (/كيس لحاف/.test(t)) return 'أغطية لحاف (كيس)';
  const kingHint = /كينغ|كنج|\bking\b|240|260/.test(t) || /كينغ/.test(s0);
  if ((/طقم لحاف|لحاف|مفرش/.test(t) || /duvet/.test(t)) && kingHint) return 'أطقم لحاف كينغ';
  if (/طقم لحاف|لحاف|مفرش|duvet/.test(t)) return 'أطقم لحاف فل / عام';
  if (/غطاء سرير|لباد|شرشف|طقم غطاء/.test(t)) return 'ملحقات سرير';
  return 'أخرى';
}

/** تجميع أوزان total_count حسب مجموعة المنتج المباع. */
export function aggregateMissedRowsByProductGroup(rows: MissedOppRow[]): { name: string; value: number }[] {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const g = deriveProductGroupFromSoldItem(String(r.sold_item || ''));
    m[g] = (m[g] || 0) + safeNum(r.total_count);
  }
  return Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function aggregateSoldItemsInMissedGroup(
  rows: MissedOppRow[],
  groupName: string
): { name: string; soldQty: number }[] {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    if (deriveProductGroupFromSoldItem(String(r.sold_item || '')) !== groupName) continue;
    const k = String(r.sold_item || '').trim();
    if (!k) continue;
    acc[k] = (acc[k] || 0) + safeNum(r.total_count);
  }
  return Object.entries(acc)
    .map(([name, soldQty]) => ({ name, soldQty }))
    .sort((a, b) => b.soldQty - a.soldQty)
    .slice(0, 15);
}

/** مجاميع لحاف/كيس من صفوف الموظف في فرص ضائعة (وزن عددي not SAR). */
export function duvetGroupsFromMissedEmployeeRows(rows: MissedOppRow[]): { label: string; qty: number }[] {
  const allow = new Set(['أطقم لحاف كينغ', 'أطقم لحاف فل / عام', 'أغطية لحاف (كيس)']);
  return aggregateMissedRowsByProductGroup(rows)
    .filter((a) => allow.has(a.name))
    .map((a) => ({ label: a.name, qty: Math.round(a.value) }))
    .filter((x) => x.qty > 0);
}

export function totalDuvetWeightFromMissed(groups: { label: string; qty: number }[]): number {
  return groups.reduce((s, g) => s + g.qty, 0);
}
