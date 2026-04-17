/** Local Gregorian YYYY-MM-DD (browser local timezone). */
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Calendar yesterday relative to `from` (end of "today" is midnight → still same calendar day until 23:59:59). */
export function calendarYesterday(from: Date = new Date()): Date {
  const y = new Date(from);
  y.setDate(from.getDate() - 1);
  return y;
}

/**
 * MTD: first day of the current calendar month through **yesterday** (today never included).
 * On the first day of a new month (yesterday still in previous month), returns a same-day range on month start (no completed MTD days yet).
 */
export function mtdRangeThroughYesterday(from: Date = new Date()): { start: string; end: string } {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const yest = calendarYesterday(from);
  const startStr = toLocalYMD(start);
  const endStr = toLocalYMD(yest);
  if (endStr < startStr) return { start: startStr, end: startStr };
  return { start: startStr, end: endStr };
}
