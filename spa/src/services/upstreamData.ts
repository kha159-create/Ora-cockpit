export type ManagementData = any;
export type EmployeesData = any;
export type ProductAnalysisData = any;

function repoRootUrl(path: string) {
  // Fetch JSON from repo root so 15-min sync from ALAAWF2/orange-dashboard reflects.
  // GitHub Pages: /<repo>/ or /<repo>/spa/ (depending on deploy). Locally: /
  const parts = window.location.pathname.split('/').filter(Boolean);
  const repoPrefix = parts.length ? `/${parts[0]}/` : '/';
  return `${repoPrefix}${path}`;
}

const UPSTREAM_BASE = 'https://raw.githubusercontent.com/ALAAWF2/orange-dashboard/main';

async function fetchJson<T>(file: string): Promise<T> {
  const ts = Date.now();
  const upstreamUrl = `${UPSTREAM_BASE}/${file}?t=${ts}`;
  const localUrl = repoRootUrl(`${file}?t=${ts}`);

  // القاعدة: جلب البيانات من الريبو الأصلي أولاً (يُحدَّث كل 15 دقيقة)
  try {
    const res = await fetch(upstreamUrl, { cache: 'no-store' });
    if (res.ok) return (await res.json()) as T;
  } catch {
    // ignore
  }

  // Fallback: من النسخة المحلية (مثلاً بعد المزامنة)
  try {
    const res2 = await fetch(localUrl, { cache: 'no-store' });
    if (res2.ok) return (await res2.json()) as T;
  } catch {
    // ignore
  }

  throw new Error(`Failed to fetch ${file} (upstream + local): تحقق من الريبو الأصلي ALAAWF2/orange-dashboard`);
}

export function loadManagementData() {
  return fetchJson<ManagementData>('management_data.json');
}

export function loadEmployeesData() {
  return fetchJson<EmployeesData>('employees_data.json');
}

export function loadProductAnalysisData() {
  return fetchJson<ProductAnalysisData>('product_analysis_data.json');
}

export function loadOffersData() {
  return fetchJson<any>('offers_data.json');
}

export function loadStagnantData() {
  return fetchJson<any>('stagnant_data.json');
}

