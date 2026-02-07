/** Format number as SAR currency */
export function formatSAR(val: number): string {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

/** Format number with commas */
export function formatNumber(val: number): string {
  return Math.round(val).toLocaleString();
}

/** Format percentage */
export function formatPct(val: number, decimals = 1): string {
  return `${val.toFixed(decimals)}%`;
}
