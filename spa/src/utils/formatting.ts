/** Format number as SAR currency */
export function formatSAR(val: any): string {
  const n = Number(val);
  if (isNaN(n)) return 'SAR 0';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

/** Format number with commas */
export function formatNumber(val: any): string {
  const n = Number(val);
  if (isNaN(n)) return '0';
  return Math.round(n).toLocaleString();
}

/** Format percentage */
export function formatPct(val: any, decimals = 1): string {
  const n = Number(val);
  if (isNaN(n)) return '0%';
  return `${n.toFixed(decimals)}%`;
}
