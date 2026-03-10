export type D365SalesPayload = {
  metadata?: any;
  sales: any[];
  transactions: any[];
  sales_hourly: any[];
};

const D365_API_BASE =
  typeof window !== 'undefined' && window.location?.hostname?.includes('vercel.app')
    ? '' // same origin on Vercel
    : 'https://ora-cockpit.vercel.app';

export async function loadD365SalesRange(from: string, to: string): Promise<D365SalesPayload> {
  const url = `${D365_API_BASE}/api/d365-sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`d365_live_fetch_failed_${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    metadata: data?.metadata || {},
    sales: Array.isArray(data?.sales) ? data.sales : [],
    transactions: Array.isArray(data?.transactions) ? data.transactions : [],
    sales_hourly: Array.isArray(data?.sales_hourly) ? data.sales_hourly : [],
  };
}

