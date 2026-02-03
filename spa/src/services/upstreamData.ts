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

async function fetchJson<T>(file: string): Promise<T> {
  const ts = Date.now();
  const localUrl = repoRootUrl(`${file}?t=${ts}`);
  const upstreamUrl = `https://raw.githubusercontent.com/ALAAWF2/orange-dashboard/main/${file}?t=${ts}`;

  // 1) Try local (GitHub Pages / SPA public)
  try {
    const res = await fetch(localUrl, { cache: 'no-store' });
    if (res.ok) return (await res.json()) as T;
  } catch {
    // ignore
  }

  // 2) Fallback to upstream raw (guarantees no data loss)
  const res2 = await fetch(upstreamUrl, { cache: 'no-store' });
  if (!res2.ok) throw new Error(`Failed to fetch ${file} (local+upstream): ${res2.status}`);
  return (await res2.json()) as T;
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

