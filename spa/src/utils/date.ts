/** Format Date to YYYY-MM-DD using local timezone */
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Alias for toLocalYMD */
export const toYMD = toLocalYMD;

/** Pad number to 2 digits */
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
