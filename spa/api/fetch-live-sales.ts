import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { CLIENT_ID, CLIENT_SECRET, TENANT_ID } = process.env;

        if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID) {
            console.error('Missing Dynamics 365 Credentials in Vercel Environment');
            return res.status(500).json({ error: 'Server configuration error: Missing Credentials' });
        }

        const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
        const RESOURCE = 'https://orangepax.operations.eu.dynamics.com';
        const SCOPE = `${RESOURCE}/.default`;

        // 1. Get OAuth Token
        const tokenParams = new URLSearchParams();
        tokenParams.append('client_id', CLIENT_ID);
        tokenParams.append('client_secret', CLIENT_SECRET);
        tokenParams.append('scope', SCOPE);
        tokenParams.append('grant_type', 'client_credentials');

        const tokenResponse = await fetch(AUTHORITY, {
            method: 'POST',
            body: tokenParams,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('OAuth Token Error:', errorText);
            return res.status(500).json({ error: 'Authentication with Dynamics failed.' });
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            return res.status(500).json({ error: 'Failed to retrieve access token.' });
        }

        // 2. Query Retail Transactions
        const todayFn = () => {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const todayStr = todayFn();

        // Use requested date or default to today
        let targetDateStr = todayStr;
        if (req.query.date && typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
            targetDateStr = req.query.date;
        }

        const apiUrl = `${RESOURCE}/data/RetailTransactionSalesTransBIEntities`;
        const filterStr = `ReceiptDateRequested ge ${targetDateStr}T00:00:00Z and ReceiptDateRequested le ${targetDateStr}T23:59:59Z`;

        let reqUrl: string | null = `${apiUrl}?$filter=${filterStr}`;
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        const transactions: any[] = [];

        while (reqUrl) {
            // Encode the URL properly for Node fetch
            const fetchUrl = reqUrl.replace(/ /g, '%20');

            const dynResponse = await fetch(fetchUrl, { headers });

            if (!dynResponse.ok) {
                const errText = await dynResponse.text();
                console.error(`Dynamics API Error ${dynResponse.status}:`, errText);
                return res.status(500).json({ error: 'Failed to fetch data from Dynamics 365.' });
            }

            const data = await dynResponse.json();
            const values = data.value || [];
            transactions.push(...values);

            reqUrl = data['@odata.nextLink'] || null;
        }

        // 3. Process and Aggregate
        const salesAgg: Record<string, number> = {};
        const transSet: Record<string, Set<string>> = {};
        const empAgg: Record<string, Record<string, { sales: number, trans_set: Set<string> }>> = {};

        // --- Ramadan Shifts Aggregation ---
        // shift1: 06:00 - 11:30
        // shift2: 11:30 - 18:00
        // shift3: 18:00 - 06:00 (Night)
        const shiftAgg: Record<string, { morning: number, afternoon: number, night: number }> = {};

        for (const t of transactions) {
            if (t.transactionStatus === 'Voided') continue;

            let store = t.store || t.OperatingUnitNumber || t.Store || '';
            let staff = t.SalesGroup || '';
            let amount = Math.abs(parseFloat(t.netAmountInclTax || t.NetAmount || '0.0'));
            let receipt = String(t.transactionId || t.ReceiptId || '');

            // Get transaction time (Dynamics returns UTC, so we add 3 hours for KSA)
            let txDateStr = t.ReceiptDateRequested || t.CreatedDateTime || t.TransactionDate;
            let decimalTime = 0;
            if (txDateStr) {
                const dt = new Date(txDateStr);
                const ksaHours = (dt.getUTCHours() + 3) % 24;
                const ksaMinutes = dt.getUTCMinutes();
                decimalTime = ksaHours + (ksaMinutes / 60);
            }

            store = String(store).trim();
            staff = String(staff).trim();
            if (staff && staff.length < 4) {
                staff = staff.padStart(4, '0');
            }

            if (!store) continue;

            salesAgg[store] = (salesAgg[store] || 0) + amount;

            if (!transSet[store]) transSet[store] = new Set();
            if (receipt) transSet[store].add(receipt);

            if (staff) {
                if (!empAgg[store]) empAgg[store] = {};
                if (!empAgg[store][staff]) {
                    empAgg[store][staff] = { sales: 0, trans_set: new Set() };
                }
                empAgg[store][staff].sales += amount;
                if (receipt) empAgg[store][staff].trans_set.add(receipt);
            }

            // Ramadan Shifts Check
            if (!shiftAgg[store]) {
                shiftAgg[store] = { morning: 0, afternoon: 0, night: 0 };
            }
            if (decimalTime >= 6 && decimalTime < 11.5) {
                shiftAgg[store].morning += amount;
            } else if (decimalTime >= 11.5 && decimalTime < 18) {
                shiftAgg[store].afternoon += amount;
            } else {
                shiftAgg[store].night += amount;
            }
        }

        // 4. Format Output
        // Format: [date, store or empId, sales, trans_count]
        const output = {
            timestamp: new Date().toISOString(),
            date: targetDateStr,
            sales: Object.entries(salesAgg).map(([k, v]) => [targetDateStr, k, Number(v.toFixed(2))]),
            transactions: Object.entries(transSet).map(([k, set]) => [targetDateStr, k, set.size]),
            visitors: [],
            shifts: shiftAgg, // <-- New Shifts Property for UI
            employee_history: {} as Record<string, any[]>
        };

        for (const [st, emps] of Object.entries(empAgg)) {
            const records: any[] = [];
            for (const [empId, metrics] of Object.entries(emps)) {
                records.push([targetDateStr, empId, Number(metrics.sales.toFixed(2)), metrics.trans_set.size]);
            }
            output.employee_history[st] = records;
        }

        return res.status(200).json(output);

    } catch (err: any) {
        console.error('Vercel API Exception:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
