/**
 * Daily Report Email API (skeleton)
 * استدعاء هذا المسار من Cron (مثلاً الساعة 12) لتوليد التقرير اليومي وإرساله بالإيميل.
 *
 * إعداد Vercel Cron في vercel.json:
 *   "crons": [{ "path": "/api/daily-report-email", "schedule": "0 9 * * *" }]
 * (09:00 UTC ≈ 12:00 بتوقيت السعودية)
 *
 * متغيرات البيئة المطلوبة (بعد الإكمال):
 *   CRON_SECRET أو REPORT_CRON_SECRET: مفتاح للتحقق من الطلب
 *   REPORT_EMAIL_TO: عناوين الإيميل (مفصولة بفاصلة)
 *   SENDGRID_API_KEY أو SMTP_*: لإرسال الإيميل
 */

type VercelRequest = {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | string[]>;
};
type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  json: (payload: any) => void;
  send: (body: string) => void;
};

const CRON_SECRET = process.env.CRON_SECRET || process.env.REPORT_CRON_SECRET;
const REPORT_EMAIL_TO = process.env.REPORT_EMAIL_TO || '';

function isAuthorized(req: VercelRequest): boolean {
  if (!CRON_SECRET) return true; // للاختبار بدون مفتاح
  const auth = req.headers?.['authorization'];
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  const querySecret = typeof req.query?.secret === 'string' ? req.query.secret : '';
  return bearer === CRON_SECRET || querySecret === CRON_SECRET;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // 1) جلب البيانات (نفس مصدر التطبيق)
    const UPSTREAM = 'https://raw.githubusercontent.com/ALAAWF2/orange-dashboard/main';
    const [mgmtRes, empRes] = await Promise.all([
      fetch(`${UPSTREAM}/management_data.json`),
      fetch(`${UPSTREAM}/employees_data.json`),
    ]);
    if (!mgmtRes.ok || !empRes.ok) {
      res.status(502).json({
        error: 'Upstream data fetch failed',
        management: mgmtRes.status,
        employees: empRes.status,
      });
      return;
    }
    const raw = await mgmtRes.json();
    const empRaw = await empRes.json();

    // 2) حساب أمس وتاريخ نفس اليوم العام الماضي
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const toYMD = (d: Date) => d.toISOString().slice(0, 10);
    const yesterdayStr = toYMD(yesterday);
    const lastYearYesterday = new Date(yesterday);
    lastYearYesterday.setFullYear(lastYearYesterday.getFullYear() - 1);
    const lastYearYesterdayStr = toYMD(lastYearYesterday);

    // 3) بناء بيانات التقرير اليومي (مبسّط: نفس منطق التقرير اليومي بدون فلاتر)
    const storesMap: Record<string, string> = raw?.stores || {};
    const meta = raw?.store_meta || {};
    const byStore: Record<string, { sales: number; prevSales: number; trans: number; visitors: number; prevVisitors: number }> = {};
    const startOfMonth = yesterdayStr.slice(0, 8) + '01';
    const startLY = lastYearYesterdayStr.slice(0, 8) + '01';

    (raw?.sales || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).slice(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, prevSales: 0, trans: 0, visitors: 0, prevVisitors: 0 };
      if (dateStr === yesterdayStr) byStore[sid].sales += Number(v) || 0;
      if (dateStr === lastYearYesterdayStr) byStore[sid].prevSales += Number(v) || 0;
    });
    (raw?.transactions || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).slice(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, prevSales: 0, trans: 0, visitors: 0, prevVisitors: 0 };
      if (dateStr === yesterdayStr) byStore[sid].trans += Number(v) || 0;
    });
    (raw?.visitors || []).forEach(([d, sid, v]: any[]) => {
      const dateStr = String(d).slice(0, 10);
      if (!byStore[sid]) byStore[sid] = { sales: 0, prevSales: 0, trans: 0, visitors: 0, prevVisitors: 0 };
      if (dateStr === yesterdayStr) byStore[sid].visitors += Number(v) || 0;
      if (dateStr === lastYearYesterdayStr) byStore[sid].prevVisitors += Number(v) || 0;
    });

    const dailyReportRows = Object.entries(byStore)
      .filter(([, v]) => v.sales > 0 || v.trans > 0)
      .map(([sid, v]) => ({
        name: storesMap[sid] || sid,
        sales: v.sales,
        prevSales: v.prevSales,
        growth: v.prevSales > 0 ? ((v.sales - v.prevSales) / v.prevSales) * 100 : 0,
        trans: v.trans,
        avgInv: v.trans > 0 ? v.sales / v.trans : 0,
        visitors: v.visitors,
        prevVisitors: v.prevVisitors,
        conversion: v.visitors > 0 ? (v.trans / v.visitors) * 100 : 0,
      }))
      .sort((a, b) => b.sales - a.sales);

    // 4) توليد PDF: هنا تحتاج إما استدعاء مكتبة تعمل على السيرفر (مثل jspdf في Node أو pdf-lib)
    //    أو استدعاء خدمة خارجية. مؤقتاً نرجع ملخصاً فقط.
    // const pdfBuffer = await generateDailyReportPDFBuffer(dailyReportRows, { yesterday: yesterdayStr, lastYear: lastYearYesterdayStr });

    // 5) إرسال الإيميل: إضافة SendGrid / Resend / Nodemailer مع مرفق PDF
    // if (REPORT_EMAIL_TO) await sendEmailWithAttachment(REPORT_EMAIL_TO.split(','), pdfBuffer, `Daily_Report_${yesterdayStr}.pdf`);

    res.status(200).json({
      ok: true,
      message: 'Daily report data prepared (PDF/email not implemented yet)',
      yesterday: yesterdayStr,
      lastYear: lastYearYesterdayStr,
      storeCount: dailyReportRows.length,
      totalSales: dailyReportRows.reduce((s, r) => s + r.sales, 0),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
