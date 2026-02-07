export type ManagementData = any;
export type EmployeesData = any;
export type ProductAnalysisData = any;

function repoRootUrl(path: string) {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const repoPrefix = parts.length ? `/${parts[0]}/` : '/';
  return `${repoPrefix}${path}`;
}

const UPSTREAM_BASE = 'https://raw.githubusercontent.com/ALAAWF2/orange-dashboard/main';

// ===== Cache with staleness tracking =====
interface CacheEntry<T = any> {
  promise: Promise<T>;
  resolvedAt?: number; // timestamp when data was resolved
  data?: T;
}

const CACHE: Record<string, CacheEntry> = {};
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/** Get the timestamp of last successful data fetch for a file */
export function getDataAge(file: string): number | null {
  return CACHE[file]?.resolvedAt ?? null;
}

/** Check if cached data is stale (older than maxAge) */
export function isDataStale(file: string, maxAgeMs = CACHE_MAX_AGE_MS): boolean {
  const resolvedAt = CACHE[file]?.resolvedAt;
  if (!resolvedAt) return true;
  return Date.now() - resolvedAt > maxAgeMs;
}

/** Force clear cache for a specific file or all files */
export function clearCache(file?: string) {
  if (file) {
    delete CACHE[file];
  } else {
    Object.keys(CACHE).forEach((k) => delete CACHE[k]);
  }
}

// ===== Retry logic =====
async function fetchWithRetry(url: string, retries = 2, delayMs = 1000): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return res;
      // Non-ok response on last attempt → throw
      if (attempt === retries) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt === retries) throw err;
      // Wait with exponential backoff before retry
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error('fetchWithRetry exhausted');
}

async function fetchJson<T>(file: string, forceRefresh = false): Promise<T> {
  // Return cached data if still fresh
  if (!forceRefresh && CACHE[file]?.data && !isDataStale(file)) {
    return CACHE[file].data as T;
  }

  // Return existing in-flight promise if still pending
  if (CACHE[file]?.promise && !CACHE[file]?.resolvedAt && !forceRefresh) {
    return CACHE[file].promise;
  }

  const promise = (async () => {
    const ts = Date.now();
    const upstreamUrl = `${UPSTREAM_BASE}/${file}?t=${ts}`;
    const localUrl = repoRootUrl(`${file}?t=${ts}`);

    // Try upstream first (with retry)
    try {
      const res = await fetchWithRetry(upstreamUrl, 2, 1000);
      const data = (await res.json()) as T;
      // Store resolved data + timestamp
      if (CACHE[file]) {
        CACHE[file].resolvedAt = Date.now();
        CACHE[file].data = data;
      }
      return data;
    } catch {
      // ignore upstream failure
    }

    // Fallback: local (with retry)
    try {
      const res2 = await fetchWithRetry(localUrl, 1, 500);
      const data = (await res2.json()) as T;
      if (CACHE[file]) {
        CACHE[file].resolvedAt = Date.now();
        CACHE[file].data = data;
      }
      return data;
    } catch {
      // ignore
    }

    throw new Error(`فشل تحميل ${file} — تحقق من اتصال الإنترنت أو الريبو الأصلي`);
  })();

  CACHE[file] = { promise };

  // Clear cache entry on error so retry is possible
  promise.catch(() => {
    delete CACHE[file];
  });

  return promise;
}

export function loadManagementData(forceRefresh = false) {
  return fetchJson<ManagementData>('management_data.json', forceRefresh);
}

export function loadEmployeesData(forceRefresh = false) {
  return fetchJson<EmployeesData>('employees_data.json', forceRefresh);
}

export function loadProductAnalysisData(forceRefresh = false) {
  return fetchJson<ProductAnalysisData>('product_analysis_data.json', forceRefresh);
}

export function loadOffersData(forceRefresh = false) {
  return fetchJson<any>('offers_data.json', forceRefresh);
}

export function loadStagnantData(forceRefresh = false) {
  return fetchJson<any>('stagnant_data.json', forceRefresh);
}

/** Refresh all cached data */
export async function refreshAllData() {
  clearCache();
  return Promise.all([
    loadManagementData(true),
    loadEmployeesData(true),
    loadProductAnalysisData(true),
  ]);
}
