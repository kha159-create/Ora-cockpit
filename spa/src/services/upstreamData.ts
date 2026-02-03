export type ManagementData = any;
export type EmployeesData = any;
export type ProductAnalysisData = any;

function baseUrl(path: string) {
  // Important for GitHub Pages: BASE_URL includes repo path
  return `${import.meta.env.BASE_URL}${path}`;
}

async function fetchJson<T>(file: string): Promise<T> {
  const url = baseUrl(`${file}?t=${Date.now()}`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.status}`);
  return (await res.json()) as T;
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

