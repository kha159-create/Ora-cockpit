import type { VercelRequest, VercelResponse } from '@vercel/node';

type TxRow = {
  OperatingUnitNumber?: string;
  TransactionDate?: string;
  PaymentAmount?: number | string;
  TransactionNumber?: string;
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

    const txUrl =
      `${baseUrl}/data/RetailTransactions` +
      `?$select=OperatingUnitNumber,TransactionDate,PaymentAmount,TransactionNumber` +
      `&$filter=PaymentAmount ne 0 and TransactionDate ge ${fromIso} and TransactionDate lt ${toExclusive}`;

    const rows = await fetchAllRows(txUrl, token);

    const dailySales = new Map<string, number>();
    const dailyTrans = new Map<string, Set<string>>();
    const hourlySales = new Map<string, number>();
    const hourlyTrans = new Map<string, Set<string>>();

    for (const r of rows) {
      const sid = String(r.OperatingUnitNumber || '').trim();
      const ts = String(r.TransactionDate || '').trim();
      const tx = String(r.TransactionNumber || '').trim();
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

    return res.status(200).json({
      metadata: {
        source: 'd365-direct',
        from,
        to,
        fetched_at: new Date().toISOString(),
        tx_rows: rows.length,
      },
      sales,
      transactions,
      sales_hourly: salesHourly,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'd365_api_error' });
  }
}

