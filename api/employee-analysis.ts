declare const process: any;

type VercelRequest = {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
};

type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  json: (payload: any) => any;
};

const CORS_ORIGINS = ['https://kha159-create.github.io', 'https://ora-cockpit.vercel.app'];

function setCors(res: VercelResponse, req: VercelRequest) {
  const origin = (req.headers && (req.headers.origin || req.headers.Origin)) || '';
  const allow =
    origin && (CORS_ORIGINS.some((o) => origin.startsWith(o)) || origin.includes('vercel.app'))
      ? origin
      : '*';

  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseBody(req: VercelRequest) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function sanitizeRows(rows: any[]) {
  return rows.slice(0, 180).map((row) => ({
    employee: String(row?.employee || '').trim(),
    employeeId: String(row?.employeeId || '').trim(),
    store: String(row?.store || '').trim(),
    level: String(row?.level || '').trim(),
    pattern: String(row?.pattern || '').trim(),
    structure: String(row?.structure || '').trim(),
    strength: String(row?.strength || '').trim(),
    weakness: String(row?.weakness || '').trim(),
    action: String(row?.action || '').trim(),
    duvetStatus: String(row?.duvetStatus || '').trim(),
    padFocus: String(row?.padFocus || '').trim(),
    padQuality: String(row?.padQuality || '').trim(),
    pillowStatus: String(row?.pillowStatus || '').trim(),
    atvVsStore: String(row?.atvVsStore || '').trim(),
    avgTicket: Math.round(toNumber(row?.avgTicket)),
    sales: Math.round(toNumber(row?.sales)),
    transactions: Math.round(toNumber(row?.transactions)),
    duvetTotal: Math.round(toNumber(row?.duvetTotal)),
    padTotal: Math.round(toNumber(row?.padTotal)),
    pillowTotal: Math.round(toNumber(row?.pillowTotal)),
    padAttachPct: Number(toNumber(row?.padAttachPct).toFixed(1)),
    pillowAttachPct: Number(toNumber(row?.pillowAttachPct).toFixed(1)),
    targetAchievementPct: Number(toNumber(row?.targetAchievementPct).toFixed(1)),
    targetPaceStatus: String(row?.targetPaceStatus || '').trim(),
    dailyRiskStatus: String(row?.dailyRiskStatus || '').trim(),
    avgDailySales: Math.round(toNumber(row?.avgDailySales)),
    requiredRemainingDailySales: Math.round(toNumber(row?.requiredRemainingDailySales)),
    periodPerformance: String(row?.periodPerformance || '').trim(),
    periodBuckets: Array.isArray(row?.periodBuckets) ? row.periodBuckets.slice(0, 4) : [],
    duvetKingBands: row?.duvetKingBands || {},
    duvetFullBands: row?.duvetFullBands || {},
    padKingModels: row?.padKingModels || {},
    padFullModels: row?.padFullModels || {},
    pillowKing: row?.pillowKing || {},
    pillowFull: row?.pillowFull || {},
    productMix: row?.productMix || {},
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req);

  if (req.method === 'OPTIONS') return res.status(204).json(null);
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const body = parseBody(req);
    const rows = Array.isArray(body?.rows) ? sanitizeRows(body.rows) : [];
    const filters = body?.filters && typeof body.filters === 'object' ? body.filters : {};
    const summary = body?.summary && typeof body.summary === 'object' ? body.summary : {};

    if (!rows.length) {
      return res.status(400).json({ error: 'missing_rows' });
    }

    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      console.error('employee-analysis: missing OPENAI_API_KEY');
      return res.status(500).json({ error: 'ai_unavailable' });
    }

    const systemPrompt = [
      'أنت مدير أداء إقليمي أول في تجارة التجزئة المنزلية.',
      'حلل أداء الموظفين بشكل فردي وبأسلوب عملي يصلح للاستخدام المباشر من المدير.',
      'استخدم لغة إدارية بسيطة وواضحة وتجنب المصطلحات التحليلية المعقدة.',
      'ركز على: جودة المبيعات، متوسط الفاتورة مقابل الفرع، بيع اللحاف، توزيع شرائح سعر اللحاف، ربط اللباد، موديلات اللباد 5/10/15 سم، توزيع اللباد السعري داخل كينغ وداخل فل/كوين/توين، ربط المخدة على أساس أن لكل لحاف يجب بيع مخدتين، وضع الهدف الحالي، وضع المطلوب اليومي، واتساق الأداء بين الفترات.',
      'استخدم أيضاً ملخص مزيج المنتجات لتحديد هل المبيعات متنوعة ومنظمة أم مركزة في فئة واحدة أو معتمدة على منتجات ثانوية.',
      'ميّز بوضوح بين البيع المنظم والبيع غير المتوازن، وبين التنوع الصحي والتنويع غير المفيد.',
      'لا تقدم ملخصات عامة أو عبارات إنشائية.',
      'اكتب بالعربية فقط وبشكل واضح ومختصر وقابل للتنفيذ.',
      'ابدأ بملخص تنفيذي قصير جداً، ثم نقاط قرار للإدارة، ثم أبرز الموظفين الذين يحتاجون تدخلاً أو تعزيزاً.',
      'لكل موظف مهم، حاول تحديد: مصدر القوة الحقيقي، نقطة الضعف الأساسية، هل البيع منظم أم غير متوازن، هل هناك تنوع صحي أم تركّز ضيق، ومن أين يأتي الأداء، ثم توصية إدارية مباشرة.',
    ].join(' ');

    const userPrompt = JSON.stringify(
      {
        filters,
        summary,
        employees: rows,
      },
      null,
      2,
    );

    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `حلل البيانات التالية وقدم قراءة إدارية عربية موجهة للمدير:
${userPrompt}`,
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      console.error('employee-analysis: openai error', openaiRes.status, errorText.slice(0, 400));
      return res.status(502).json({ error: 'ai_request_failed' });
    }

    const json = await openaiRes.json();
    const text =
      String(json?.output_text || '').trim() ||
      String(json?.output?.[0]?.content?.[0]?.text || '').trim();

    if (!text) {
      return res.status(502).json({ error: 'empty_ai_response' });
    }

    return res.status(200).json({ text });
  } catch (error: any) {
    console.error('employee-analysis: server error', error);
    return res.status(500).json({ error: 'employee_analysis_failed' });
  }
}
