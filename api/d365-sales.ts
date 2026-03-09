import type { VercelRequest, VercelResponse } from '@vercel/node';

type TxRow = {
  OperatingUnitNumber?: string;
  TransactionDate?: string;
  PaymentAmount?: number | string;
  TransactionNumber?: string;
  [k: string]: any;
};

function toIsoDayStart(day: string) {
  return `${day}T00:00:00Z`;
}

function nextDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function fmtUtcDateHour(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toISOString().slice(0, 10);
  const hour = d.getUTCHours();
  return { date, hour };
}

async function getToken(baseUrl: string, tenantId: string, clientId: string, clientSecret: string) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: `${baseUrl}/.default`,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`token_error_${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = await res.json();
  if (!json?.access_token) throw new Error('missing_access_token');
  return String(json.access_token);
}

async function fetchAllRows(url: string, token: string) {
  const rows: TxRow[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`d365_fetch_${res.status}: ${txt.slice(0, 300)}`);
    }
    const json = await res.json();
    rows.push(...((json?.value || []) as TxRow[]));
    next = (json?.['@odata.nextLink'] as string) || null;
  }
  return rows;
}

function uniqueCount<T>(arr: T[]) {
  return new Set(arr).size;
}

async function pickTimeField(
  baseUrl: string,
  token: string,
  entityPath: string,
  fixedSelect: string[],
  candidateFields: string[],
  filterExpr: string,
) {
  for (const field of candidateFields) {
    const select = [...fixedSelect, field].join(',');
    const probeUrl = `${baseUrl}/data/${entityPath}?$top=1&$select=${select}&$filter=${filterExpr}`;
    try {
      const rows = await fetchAllRows(probeUrl, token);
      if (!rows.length) continue;
      const sample = rows[0]?.[field];
      if (sample !== undefined && sample !== null && String(sample).trim() !== '') {
        return field;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

type TimeProfile = {
  field: string;
  parseable: number;
  distinctHours: number;
  nonEmpty: number;
  score: number;
};

function parseHourCandidate(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCHours();
}

function buildTimeProfiles(rows: any[], fields: string[]): TimeProfile[] {
  const profiles: TimeProfile[] = [];
  for (const f of fields) {
    let parseable = 0;
    let nonEmpty = 0;
    const hours: number[] = [];
    for (const r of rows) {
      const v = r?.[f];
      if (v !== null && v !== undefined && String(v).trim() !== '') nonEmpty++;
      const h = parseHourCandidate(v);
      if (h !== null) {
        parseable++;
        hours.push(h);
      }
    }
    const distinctHours = uniqueCount(hours);
    // Heavier weight on hour diversity, then parseable coverage.
    const score = distinctHours * 1000 + parseable * 10 + nonEmpty;
    profiles.push({ field: f, parseable, distinctHours, nonEmpty, score });
  }
  profiles.sort((a, b) => b.score - a.score);
  return profiles;
}

async function probeEntityTimeField(
  baseUrl: string,
  token: string,
  entityPath: string,
  dateFilter: string,
) {
  const probeUrl = `${baseUrl}/data/${entityPath}?$top=300&$filter=${dateFilter}`;
  const rows = await fetchAllRows(probeUrl, token);
  if (!rows.length) return { rows, bestField: null as string | null, profiles: [] as TimeProfile[] };

  const allFields = Object.keys(rows[0] || {});
  const timeLike = allFields.filter((k) => /date|time/i.test(k));
  const profiles = buildTimeProfiles(rows, timeLike);
  const best = profiles[0]?.field || null;
  return { rows, bestField: best, profiles };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || from);
    if (!isYmd(from) || !isYmd(to)) {
      return res.status(400).json({ error: 'invalid_date_range_use_yyyy-mm-dd' });
    }

    const rangeMs = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
    const rangeDays = Math.floor(rangeMs / (24 * 3600 * 1000)) + 1;
    if (rangeDays < 1 || rangeDays > 7) {
      return res.status(400).json({ error: 'range_days_must_be_between_1_and_7' });
    }

    const baseUrl = process.env.D365_URL || '';
    const tenantId = process.env.D365_TENANT_ID || '';
    const clientId = process.env.D365_CLIENT_ID || '';
    const clientSecret = process.env.D365_CLIENT_SECRET || '';

    if (!baseUrl || !tenantId || !clientId || !clientSecret) {
      return res.status(500).json({ error: 'missing_d365_env_vars' });
    }

    const token = await getToken(baseUrl, tenantId, clientId, clientSecret);
    const fromIso = toIsoDayStart(from);
    const toExclusive = toIsoDayStart(nextDay(to));

    const dailySales = new Map<string, number>();
    const dailyTrans = new Map<string, Set<string>>();
    const hourlySales = new Map<string, number>();
    const hourlyTrans = new Map<string, Set<string>>();
    let sourceEntity = 'RetailTransactions';
    let timeFieldUsed = 'TransactionDate';
    let rawRowCount = 0;
    let probeSummary: any = {};

    // Probe both entities and choose the one with stronger hour diversity.
    const linesFilter = `ReceiptDateRequested ge ${fromIso} and ReceiptDateRequested lt ${toExclusive}`;
    const txFilter = `PaymentAmount ne 0 and TransactionDate ge ${fromIso} and TransactionDate lt ${toExclusive}`;
    let useLines = true;
    let linesProbe: any = null;
    let txProbe: any = null;
    try {
      linesProbe = await probeEntityTimeField(baseUrl, token, 'RetailTransactionSalesTransBIEntities', linesFilter);
    } catch {
      linesProbe = { rows: [], bestField: null, profiles: [] };
    }
    try {
      txProbe = await probeEntityTimeField(baseUrl, token, 'RetailTransactions', txFilter);
    } catch {
      txProbe = { rows: [], bestField: null, profiles: [] };
    }

    const linesScore = linesProbe?.profiles?.[0]?.score || 0;
    const txScore = txProbe?.profiles?.[0]?.score || 0;
    if (txScore > linesScore) useLines = false;

    probeSummary = {
      lines: linesProbe?.profiles?.slice(0, 5) || [],
      transactions: txProbe?.profiles?.slice(0, 5) || [],
      chosen: useLines ? 'RetailTransactionSalesTransBIEntities' : 'RetailTransactions',
    };

    if (useLines) {
      const linesFixed = ['store', 'transactionId', 'netAmountInclTax', 'transactionStatus'];
      const linesTimeField =
        linesProbe?.bestField ||
        (await pickTimeField(
          baseUrl,
          token,
          'RetailTransactionSalesTransBIEntities',
          linesFixed,
          ['CreatedDateTime', 'ReceiptDateRequested', 'TransactionDate'],
          linesFilter,
        )) ||
        'ReceiptDateRequested';

      const linesUrl =
        `${baseUrl}/data/RetailTransactionSalesTransBIEntities` +
        `?$select=${[...linesFixed, linesTimeField].join(',')}` +
        `&$filter=${linesFilter}`;
      const lineRows = await fetchAllRows(linesUrl, token);
      rawRowCount = lineRows.length;
      sourceEntity = 'RetailTransactionSalesTransBIEntities';
      timeFieldUsed = linesTimeField;

      for (const r of lineRows) {
        const status = String(r.transactionStatus || '');
        if (status.toLowerCase() === 'voided') continue;

        const sid = String(r.store || '').trim();
        const tx = String(r.transactionId || '').trim();
        const ts = String(r[linesTimeField] || '').trim();
        const val = Number(r.netAmountInclTax) || 0;
        if (!sid || !tx || !ts) continue;

        const parsed = fmtUtcDateHour(ts);
        if (!parsed) continue;
        const dateKey = `${parsed.date}|${sid}`;
        const hourKey = `${parsed.date}|${sid}|${parsed.hour}`;

        dailySales.set(dateKey, (dailySales.get(dateKey) || 0) + val);
        if (!dailyTrans.has(dateKey)) dailyTrans.set(dateKey, new Set<string>());
        dailyTrans.get(dateKey)!.add(tx);

        hourlySales.set(hourKey, (hourlySales.get(hourKey) || 0) + val);
        if (!hourlyTrans.has(hourKey)) hourlyTrans.set(hourKey, new Set<string>());
        hourlyTrans.get(hourKey)!.add(tx);
      }
    } else {
      // Use RetailTransactions when it shows better time diversity.
      const txFixed = ['OperatingUnitNumber', 'PaymentAmount', 'TransactionNumber'];
      const txTimeField =
        txProbe?.bestField ||
        (await pickTimeField(
          baseUrl,
          token,
          'RetailTransactions',
          txFixed,
          ['CreatedDateTime', 'TransactionDate'],
          txFilter,
        )) || 'TransactionDate';

      const txUrl =
        `${baseUrl}/data/RetailTransactions` +
        `?$select=${[...txFixed, txTimeField].join(',')}` +
        `&$filter=${txFilter}`;
      const rows = await fetchAllRows(txUrl, token);
      rawRowCount = rows.length;
      sourceEntity = 'RetailTransactions';
      timeFieldUsed = txTimeField;

      for (const r of rows) {
        const sid = String(r.OperatingUnitNumber || '').trim();
        const tx = String(r.TransactionNumber || '').trim();
        const ts = String(r[txTimeField] || '').trim();
        const val = Number(r.PaymentAmount) || 0;
        if (!sid || !ts) continue;

        const parsed = fmtUtcDateHour(ts);
        if (!parsed) continue;
        const dateKey = `${parsed.date}|${sid}`;
        const hourKey = `${parsed.date}|${sid}|${parsed.hour}`;

        dailySales.set(dateKey, (dailySales.get(dateKey) || 0) + val);
        if (!dailyTrans.has(dateKey)) dailyTrans.set(dateKey, new Set<string>());
        if (tx) dailyTrans.get(dateKey)!.add(tx);

        hourlySales.set(hourKey, (hourlySales.get(hourKey) || 0) + val);
        if (!hourlyTrans.has(hourKey)) hourlyTrans.set(hourKey, new Set<string>());
        if (tx) hourlyTrans.get(hourKey)!.add(tx);
      }
    }

    const sales: any[] = [];
    const transactions: any[] = [];
    const salesHourly: any[] = [];

    for (const [key, v] of dailySales.entries()) {
      const [date, sid] = key.split('|');
      sales.push([date, sid, Number(v.toFixed(2))]);
      transactions.push([date, sid, dailyTrans.get(key)?.size || 0]);
    }

    for (const [key, v] of hourlySales.entries()) {
      const [date, sid, hourStr] = key.split('|');
      salesHourly.push([date, sid, Number(hourStr), Number(v.toFixed(2)), hourlyTrans.get(key)?.size || 0]);
    }

    sales.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
    transactions.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
    salesHourly.sort(
      (a, b) =>
        String(a[0]).localeCompare(String(b[0])) ||
        String(a[1]).localeCompare(String(b[1])) ||
        Number(a[2]) - Number(b[2]),
    );
    const distinctHours = uniqueCount(salesHourly.map((r) => Number(r[2])));

    return res.status(200).json({
      metadata: {
        source: 'd365-direct',
        source_entity: sourceEntity,
        time_field: timeFieldUsed,
        from,
        to,
        fetched_at: new Date().toISOString(),
        tx_rows: rawRowCount,
        distinct_hours: distinctHours,
        probe_summary: probeSummary,
      },
      sales,
      transactions,
      sales_hourly: salesHourly,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'd365_api_error' });
  }
}

