/**
 * Gemini AI service for Ora-Cockpit.
 * Uses API key from environment: VITE_GEMINI_API_KEY (set in Vercel / GitHub Secrets).
 * Never commit the key; add it only in Vercel dashboard and GitHub Secrets.
 */

const GEMINI_API_KEY = typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// الموديل الافتراضي يعمل مع المفتاح الحالي؛ والباقي كاحتياطي
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-pro'];

export function isGeminiAvailable(): boolean {
  return Boolean(GEMINI_API_KEY && String(GEMINI_API_KEY).trim().length > 0);
}

export interface GeminiGenerateParams {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Call Gemini generateContent API.
 * صيغة الطلب حسب توثيق Google: contents بدون role أحياناً، و generationConfig بصيغة صحيحة.
 */
export async function generateWithGemini(params: GeminiGenerateParams): Promise<string | null> {
  const { prompt, maxTokens = 512, temperature = 0.4 } = params;
  if (!isGeminiAvailable()) return null;
  if (!prompt || String(prompt).trim().length === 0) return null;

  const body = {
    contents: [{ parts: [{ text: String(prompt).trim() }] }],
    generationConfig: {
      maxOutputTokens: Math.min(Math.max(1, maxTokens), 2048),
      temperature: Math.max(0, Math.min(1, temperature)),
    },
  };

  let lastError: string = '';
  for (const model of GEMINI_MODELS) {
    const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const errText = await res.text();
      if (res.ok) {
        const data = JSON.parse(errText);
        const candidate = data?.candidates?.[0];
        if (candidate?.content?.parts?.length) {
          const text = candidate.content.parts[0].text;
          return typeof text === 'string' ? text.trim() : null;
        }
        continue;
      }
      lastError = errText;
      try {
        const errJson = JSON.parse(errText);
        const msg = errJson?.error?.message || errJson?.message || errText?.substring(0, 200);
        console.warn(`Gemini ${model} error`, res.status, msg);
      } catch {
        console.warn('Gemini API error', res.status, errText?.substring(0, 150));
      }
    } catch (e) {
      lastError = String(e);
      console.warn('Gemini request failed', model, e);
    }
  }
  return null;
}

/**
 * Build a short Arabic insight for "customer value" card from store summary.
 */
export async function getCustomerValueInsight(summary: {
  bestStores: { name: string; customerValue: number; changePct: number }[];
  worstStores: { name: string; customerValue: number; changePct: number; loss?: number }[];
  avgInvoice: number;
  periodLabel: string;
}): Promise<string | null> {
  const prompt = `أنت محلل أداء معارض. اكتب جملة أو جملتين بالعربية فقط (بدون عناوين) تلخص الأداء بناءً على:
- أفضل المعارض من ناحية قيمة العميل: ${summary.bestStores.map(s => `${s.name} (قيمة عميل ${Math.round(s.customerValue)}، تغيير ${s.changePct > 0 ? '+' : ''}${s.changePct}%)`).join('؛ ')}
- أسوأ المعارض (انخفاض قيمة العميل): ${summary.worstStores.map(s => `${s.name} (تغيير ${s.changePct}%${s.loss != null ? `، خسارة تقريبية ${Math.round(s.loss)} ر.س` : ''})`).join('؛ ')}
- معدل الفاتورة الحالي: ${Math.round(summary.avgInvoice)} ر.س
- الفترة: ${summary.periodLabel}
ركز على: لماذا قيمة العميل مهمة، وماذا يفعل الأفضل، وماذا ينصح للمتأخرين. بدون ترقيم أو نقاط.`;
  return generateWithGemini({ prompt, maxTokens: 280, temperature: 0.3 });
}
