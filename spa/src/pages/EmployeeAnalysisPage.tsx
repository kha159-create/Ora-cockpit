import { useEffect, useMemo, useState } from 'react';
import { loadEmployeeProductsData, loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function safeNum(x: unknown) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function formatSAR(v: number) { return v.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }); }
function isAdminOrAuditor(role?: string) { return role === 'Admin' || role === 'Auditor'; }
function normText(v: string) {
  return String(v || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/إ|أ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .trim();
}
function normalizeEmpId(raw: unknown) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const preDash = s.includes('-') ? s.split('-')[0].trim() : s;
  const digitsOnly = preDash.replace(/[^\d]/g, '');
  if (!digitsOnly) return preDash;
  const asNum = String(parseInt(digitsOnly, 10));
  return asNum === 'NaN' ? digitsOnly : asNum;
}
function canonicalTop6Category(v: string) {
  const t = normText(v);
  const isKing = t.includes('king') || t.includes('كينغ') || t.includes('كنج');
  const isFull = t.includes('full') || t.includes('فل') || t.includes('twin') || t.includes('توين');
  const isPillow = t.includes('مخده') || t.includes('مخدات') || t.includes('pillow');
  const isDuvet = t.includes('لحاف') || t.includes('لحافات') || t.includes('duvet');
  const isPad = t.includes('لباد') || t.includes('لبده') || t.includes('mattress');
  if (isDuvet && isKing) return 'لحافات كينغ';
  if (isDuvet && isFull) return 'لحافات فل';
  if (isPillow && isKing) return 'مخدات كينغ';
  if (isPillow && (t.includes('ستاندر') || t.includes('standard') || isFull)) return 'مخدات ستاندر';
  if (isPad && isKing) return 'لباد كينج';
  if (isPad && isFull) return 'لباد فل';
  return null;
}

type ProductInsights = {
  kingDuvet: number;
  fullDuvet: number;
  kingPad: number;
  fullPad: number;
  kingPillow: number;
  fullPillow: number;
  kingAttachRate: number;
  fullAttachRate: number;
  kingPillowAttachRate: number;
  fullPillowAttachRate: number;
  kingBandLow: number;
  kingBandMid: number;
  kingBandHigh: number;
  fullBandLow: number;
  fullBandMid: number;
  fullBandHigh: number;
  offerFocusPct: number;
};
type ProductPeriodKey = 'mtd' | 'yest' | '7d' | '14d' | '30d';

type EmployeeRow = {
  id: string;
  name: string;
  storeId: string;
  storeName: string;
  manager: string;
  sales: number;
  trans: number;
  items: number;
  maxTicket: number;
  avgTicket: number;
  productInsights: ProductInsights;
};

export default function EmployeeAnalysisPage() {
  const user = getCurrentUser();
  const [empRaw, setEmpRaw] = useState<any>(null);
  const [empProductsRaw, setEmpProductsRaw] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [manager, setManager] = useState('all');
  const [branch, setBranch] = useState('all');
  const [city, setCity] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [productsPeriodKey, setProductsPeriodKey] = useState<ProductPeriodKey>('mtd');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_api_key') || import.meta.env.VITE_OPENAI_API_KEY || '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');

  useEffect(() => {
    Promise.all([loadEmployeesData(), loadManagementData(), loadEmployeeProductsData()]).then(([e, m, ep]) => {
      setEmpRaw(e);
      setMgmt(m);
      setEmpProductsRaw(ep);
      const now = new Date();
      const today = new Date(now);
      if (now.getHours() < 12) today.setDate(now.getDate() - 1);
      setCustomStart(`${today.getFullYear()}-${pad2(today.getMonth() + 1)}-01`);
      setCustomEnd(toYMD(today));
    });
  }, []);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const { rows, managers, branches, cities } = useMemo(() => {
    if (!empRaw || !mgmt) return { rows: [] as EmployeeRow[], managers: [] as string[], branches: [] as Array<{ id: string; name: string }>, cities: [] as string[] };
    const storeMeta = mgmt.store_meta || {};
    const stores = mgmt.stores || {};
    const history = empRaw.history || {};
    const start = customStart || '1900-01-01';
    const end = customEnd || '2999-12-31';

    const mSet = new Set<string>();
    const cSet = new Set<string>();
    Object.values(storeMeta).forEach((m: any) => {
      if (m?.manager) mSet.add(String(m.manager));
      if (m?.city) cSet.add(String(m.city));
    });
    const managers = Array.from(mSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const cities = Array.from(cSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const branches = Object.keys(stores).map((sid) => ({ id: sid, name: stores[sid] || sid })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    const byEmp = new Map<string, EmployeeRow>();
    Object.entries(history).forEach(([sid, recs]: [string, any]) => {
      const meta = storeMeta[sid] || {};
      if (branch !== 'all' && sid !== branch) return;
      if (effectiveManager !== 'all' && String(meta?.manager || '') !== effectiveManager) return;
      if (city !== 'all' && String(meta?.city || '') !== city) return;
      (recs || []).forEach((r: any[]) => {
        const ds = String(r?.[0] || '').substring(0, 10);
        if (!ds || ds < start || ds > end) return;
        const rawEmp = String(r?.[1] || '');
        const id = rawEmp.split('-')[0]?.trim();
        if (!id || id === 'مرتجع') return;
        const name = rawEmp.includes('-') ? rawEmp.split('-').slice(1).join('-').trim() : id;
        if (!byEmp.has(id)) {
          byEmp.set(id, {
            id,
            name: name || id,
            storeId: sid,
            storeName: stores[sid] || sid,
            manager: String(meta?.manager || ''),
            sales: 0,
            trans: 0,
            items: 0,
            maxTicket: 0,
            avgTicket: 0,
            productInsights: {
              kingDuvet: 0, fullDuvet: 0, kingPad: 0, fullPad: 0, kingPillow: 0, fullPillow: 0,
              kingAttachRate: 0, fullAttachRate: 0, kingPillowAttachRate: 0, fullPillowAttachRate: 0,
              kingBandLow: 0, kingBandMid: 0, kingBandHigh: 0, fullBandLow: 0, fullBandMid: 0, fullBandHigh: 0,
              offerFocusPct: 0,
            },
          });
        }
        const x = byEmp.get(id)!;
        x.sales += safeNum(r?.[2]);
        x.trans += safeNum(r?.[3]);
        x.items += safeNum(r?.[4]);
        x.maxTicket = Math.max(x.maxTicket, safeNum(r?.[5]));
      });
    });

    const periods = empProductsRaw?.periods || {};
    const scoped = periods?.[productsPeriodKey] || periods?.mtd || {};
    Array.from(byEmp.entries()).forEach(([empId, row]) => {
      const idRaw = String(empId || '').trim();
      const idNorm = normalizeEmpId(idRaw);
      const empBlock =
        scoped?.[idRaw] ||
        scoped?.[idRaw.padStart(4, '0')] ||
        scoped?.[idNorm] ||
        scoped?.[idNorm.padStart(4, '0')] ||
        Object.entries(scoped).find(([k]) => normalizeEmpId(k) === idNorm)?.[1] ||
        null;
      const categories = Array.isArray((empBlock as any)?.categories) ? (empBlock as any).categories : [];
      const items = Array.isArray((empBlock as any)?.items) ? (empBlock as any).items : [];

      const p: ProductInsights = {
        kingDuvet: 0, fullDuvet: 0, kingPad: 0, fullPad: 0, kingPillow: 0, fullPillow: 0,
        kingAttachRate: 0, fullAttachRate: 0, kingPillowAttachRate: 0, fullPillowAttachRate: 0,
        kingBandLow: 0, kingBandMid: 0, kingBandHigh: 0, fullBandLow: 0, fullBandMid: 0, fullBandHigh: 0,
        offerFocusPct: 0,
      };
      categories.forEach((c: any) => {
        const mapped = canonicalTop6Category(String(c?.name || ''));
        const qty = safeNum(c?.qty);
        if (mapped === 'لحافات كينغ') p.kingDuvet += qty;
        if (mapped === 'لحافات فل') p.fullDuvet += qty;
        if (mapped === 'لباد كينج') p.kingPad += qty;
        if (mapped === 'لباد فل') p.fullPad += qty;
        if (mapped === 'مخدات كينغ') p.kingPillow += qty;
        if (mapped === 'مخدات ستاندر') p.fullPillow += qty;
      });

      let kingBandRaw = 0;
      let fullBandRaw = 0;
      items.forEach((it: any) => {
        const name = String(it?.name || '');
        const qty = safeNum(it?.qty);
        const amt = safeNum(it?.amt);
        if (qty <= 0) return;
        const cat = canonicalTop6Category(name);
        const avg = qty > 0 ? amt / qty : 0;
        if (cat === 'لحافات كينغ') {
          kingBandRaw += qty;
          if (avg <= 300) p.kingBandLow += qty;
          else if (avg <= 600) p.kingBandMid += qty;
          else p.kingBandHigh += qty;
        }
        if (cat === 'لحافات فل') {
          fullBandRaw += qty;
          if (avg <= 300) p.fullBandLow += qty;
          else if (avg <= 600) p.fullBandMid += qty;
          else p.fullBandHigh += qty;
        }
      });

      if (p.kingDuvet > 0) {
        p.kingAttachRate = (p.kingPad / p.kingDuvet) * 100;
        p.kingPillowAttachRate = (p.kingPillow / p.kingDuvet) * 100;
      }
      if (p.fullDuvet > 0) {
        p.fullAttachRate = (p.fullPad / p.fullDuvet) * 100;
        p.fullPillowAttachRate = (p.fullPillow / p.fullDuvet) * 100;
      }
      if (kingBandRaw > 0 && p.kingDuvet > 0) {
        const scale = p.kingDuvet / kingBandRaw;
        p.kingBandLow *= scale;
        p.kingBandMid *= scale;
        p.kingBandHigh *= scale;
      }
      if (fullBandRaw > 0 && p.fullDuvet > 0) {
        const scale = p.fullDuvet / fullBandRaw;
        p.fullBandLow *= scale;
        p.fullBandMid *= scale;
        p.fullBandHigh *= scale;
      }

      const offerUnits = p.kingPad + p.fullPad + p.kingPillow + p.fullPillow;
      const coreUnits = p.kingDuvet + p.fullDuvet + offerUnits;
      p.offerFocusPct = coreUnits > 0 ? (offerUnits / coreUnits) * 100 : 0;

      row.productInsights = p;
      byEmp.set(empId, row);
    });

    const rows = Array.from(byEmp.values()).map((r) => ({ ...r, avgTicket: r.trans > 0 ? r.sales / r.trans : 0 })).sort((a, b) => b.sales - a.sales);
    return { rows, managers, branches, cities };
  }, [empRaw, mgmt, empProductsRaw, productsPeriodKey, branch, city, customEnd, customStart, effectiveManager]);

  const summary = useMemo(() => {
    const s = {
      sales: 0,
      trans: 0,
      kingDuvet: 0,
      fullDuvet: 0,
      kingPad: 0,
      fullPad: 0,
      kingPillow: 0,
      fullPillow: 0,
      kingBandLow: 0,
      kingBandMid: 0,
      kingBandHigh: 0,
    };
    rows.forEach((r) => {
      s.sales += r.sales;
      s.trans += r.trans;
      s.kingDuvet += r.productInsights.kingDuvet;
      s.fullDuvet += r.productInsights.fullDuvet;
      s.kingPad += r.productInsights.kingPad;
      s.fullPad += r.productInsights.fullPad;
      s.kingPillow += r.productInsights.kingPillow;
      s.fullPillow += r.productInsights.fullPillow;
      s.kingBandLow += r.productInsights.kingBandLow;
      s.kingBandMid += r.productInsights.kingBandMid;
      s.kingBandHigh += r.productInsights.kingBandHigh;
    });
    const kingPadAttach = s.kingDuvet > 0 ? (s.kingPad / s.kingDuvet) * 100 : 0;
    const fullPadAttach = s.fullDuvet > 0 ? (s.fullPad / s.fullDuvet) * 100 : 0;
    const kingPillowAttach = s.kingDuvet > 0 ? (s.kingPillow / s.kingDuvet) * 100 : 0;
    const fullPillowAttach = s.fullDuvet > 0 ? (s.fullPillow / s.fullDuvet) * 100 : 0;
    const bandTotal = s.kingBandLow + s.kingBandMid + s.kingBandHigh;
    const integrityBandVsKing = s.kingDuvet > 0 ? (bandTotal / s.kingDuvet) * 100 : 0;
    return {
      ...s,
      kingPadAttach,
      fullPadAttach,
      kingPillowAttach,
      fullPillowAttach,
      integrityBandVsKing,
      avgTicket: s.trans > 0 ? s.sales / s.trans : 0,
      topAttach: rows
        .filter((r) => r.productInsights.kingDuvet + r.productInsights.fullDuvet > 0)
        .slice()
        .sort((a, b) => (b.productInsights.kingAttachRate + b.productInsights.fullAttachRate) - (a.productInsights.kingAttachRate + a.productInsights.fullAttachRate))
        .slice(0, 8),
    };
  }, [rows]);

  const analyzeWithAI = async () => {
    if (!rows.length) return;
    if (!apiKey) {
      alert('أدخل OpenAI API Key أولاً.');
      return;
    }
    try {
      setAiLoading(true);
      localStorage.setItem('openai_api_key', apiKey);
      const top = rows.slice(0, 30).map((r) => ({
        id: r.id,
        name: r.name,
        store: r.storeName,
        sales: Math.round(r.sales),
        trans: Math.round(r.trans),
        avgTicket: Number(r.avgTicket.toFixed(1)),
        items: Math.round(r.items),
        kingDuvet: Math.round(r.productInsights.kingDuvet),
        fullDuvet: Math.round(r.productInsights.fullDuvet),
        kingPad: Math.round(r.productInsights.kingPad),
        fullPad: Math.round(r.productInsights.fullPad),
        kingPillow: Math.round(r.productInsights.kingPillow),
        fullPillow: Math.round(r.productInsights.fullPillow),
        kingAttachRate: Number(r.productInsights.kingAttachRate.toFixed(1)),
        fullAttachRate: Number(r.productInsights.fullAttachRate.toFixed(1)),
        offerFocusPct: Number(r.productInsights.offerFocusPct.toFixed(1)),
      }));
      const context = {
        filters: { customStart, customEnd, manager, city, branch, productsPeriodKey },
        summary: {
          employees: rows.length,
          sales: Math.round(summary.sales),
          transactions: Math.round(summary.trans),
          avgTicket: Number(summary.avgTicket.toFixed(1)),
          kingDuvet: Math.round(summary.kingDuvet),
          fullDuvet: Math.round(summary.fullDuvet),
          kingPadAttach: Number(summary.kingPadAttach.toFixed(1)),
          fullPadAttach: Number(summary.fullPadAttach.toFixed(1)),
          kingPillowAttach: Number(summary.kingPillowAttach.toFixed(1)),
          fullPillowAttach: Number(summary.fullPillowAttach.toFixed(1)),
          dataIntegrityBandVsKing: Number(summary.integrityBandVsKing.toFixed(1)),
        },
      };
      const resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          input: [
            {
              role: 'system',
              content: 'أنت خبير أداء مبيعات تجزئة. المطلوب تحليل عملي شديد الدقة باللغة العربية وبنَفَس إداري تنفيذي. أخرج: 1) ملخص تنفيذي، 2) أفضل 5 موظفين، 3) الموظفون عاليي المخاطر، 4) تحليل ربط لحاف/لباد/مخدة كينج وفل وهل النسب منطقية، 5) تحليل الفئات السعرية للحاف، 6) مدى تركيز الموظف على العروض، 7) خطة تحسين أسبوعية قابلة للتنفيذ.',
            },
            {
              role: 'user',
              content: `سياق عام:\n${JSON.stringify(context)}\n\nبيانات الموظفين:\n${JSON.stringify(top)}\n\nأعطني مخرجات مرتبة بنقاط واضحة، وأضف عتبات رقمية للحكم على جودة كل نسبة.`,
            },
          ],
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`OpenAI API ${resp.status}: ${errText}`);
      }
      const json = await resp.json();
      const text = json?.output_text || json?.output?.[0]?.content?.[0]?.text || 'لم يصل رد واضح من النموذج.';
      setAiResult(String(text));
    } catch (e: any) {
      setAiResult(`فشل التحليل: ${e?.message || 'خطأ غير متوقع'}`);
    } finally {
      setAiLoading(false);
    }
  };

  if (!empRaw || !mgmt || !empProductsRaw) {
    return <div className="p-6">جاري تحميل بيانات تحليل الموظفين...</div>;
  }

  return (
    <div className="space-y-5 pb-16">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg p-4 space-y-3">
        <h1 className="text-xl font-black text-neutral-900">تحليل الموظفين</h1>
        <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          هوية Orange Cockpit — تحليل شامل الأداء + الربط البيعي + ذكاء اصطناعي
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">من</div>
            <input type="date" className="input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">إلى</div>
            <input type="date" className="input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</div>
            <select className="input" value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value="all">الكل</option>
              {managers.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفرع</div>
            <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">مصدر تحليل المنتجات</div>
            <select className="input" value={productsPeriodKey} onChange={(e) => setProductsPeriodKey(e.target.value as ProductPeriodKey)}>
              <option value="mtd">MTD</option>
              <option value="30d">آخر 30 يوم</option>
              <option value="14d">آخر 14 يوم</option>
              <option value="7d">آخر 7 أيام</option>
              <option value="yest">أمس</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3">
            <div className="text-xs font-semibold text-neutral-500 mb-1">OpenAI API Key</div>
            <input
              type="password"
              className="input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={analyzeWithAI} className="w-full px-3 py-2 rounded-lg bg-neutral-900 text-white font-bold hover:bg-neutral-800">
              {aiLoading ? 'جاري التحليل...' : 'تحليل بالذكاء الاصطناعي'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-white to-orange-50 rounded-xl border border-orange-100 p-4">
          <div className="text-xs text-neutral-500">إجمالي المبيعات</div>
          <div className="text-2xl font-black text-neutral-900 dir-ltr">{formatSAR(summary.sales)}</div>
        </div>
        <div className="bg-gradient-to-br from-white to-orange-50 rounded-xl border border-orange-100 p-4">
          <div className="text-xs text-neutral-500">متوسط الفاتورة</div>
          <div className="text-2xl font-black text-neutral-900 dir-ltr">{formatSAR(summary.avgTicket)}</div>
        </div>
        <div className="bg-gradient-to-br from-white to-orange-50 rounded-xl border border-orange-100 p-4">
          <div className="text-xs text-neutral-500">مطابقة ربط لباد/لحاف (كينج/فل)</div>
          <div className="text-lg font-black dir-ltr">
            <span className={summary.kingPadAttach >= 70 ? 'text-emerald-700' : 'text-red-700'}>K {summary.kingPadAttach.toFixed(0)}%</span>
            <span className="text-neutral-400"> · </span>
            <span className={summary.fullPadAttach >= 70 ? 'text-emerald-700' : 'text-red-700'}>F {summary.fullPadAttach.toFixed(0)}%</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-white to-orange-50 rounded-xl border border-orange-100 p-4">
          <div className="text-xs text-neutral-500">سلامة الربط البياني (Band vs King)</div>
          <div className={`text-2xl font-black dir-ltr ${summary.integrityBandVsKing >= 90 && summary.integrityBandVsKing <= 110 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {summary.integrityBandVsKing.toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg p-4">
          <h3 className="font-bold text-neutral-900 mb-3">توزيع الفئة السعرية للحاف كينج</h3>
          {(() => {
            const total = summary.kingBandLow + summary.kingBandMid + summary.kingBandHigh;
            const rowsBand = [
              { label: 'منخفض (<=300)', val: summary.kingBandLow, color: 'bg-red-400' },
              { label: 'متوسط (301-600)', val: summary.kingBandMid, color: 'bg-amber-400' },
              { label: 'عالي (600+)', val: summary.kingBandHigh, color: 'bg-emerald-500' },
            ];
            return (
              <div className="space-y-2">
                {rowsBand.map((b) => {
                  const pct = total > 0 ? (b.val / total) * 100 : 0;
                  return (
                    <div key={b.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>{b.label}</span>
                        <span className="dir-ltr font-bold">{Math.round(b.val).toLocaleString()} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div className={`${b.color} h-full`} style={{ width: `${Math.max(2, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg p-4">
          <h3 className="font-bold text-neutral-900 mb-3">أفضل الموظفين في الربط البيعي</h3>
          <div className="space-y-2">
            {summary.topAttach.map((r) => {
              const score = (r.productInsights.kingAttachRate + r.productInsights.fullAttachRate) / 2;
              return (
                <div key={r.id} className="border border-neutral-100 rounded-lg p-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{r.name}</span>
                    <span className="dir-ltr font-bold text-emerald-700">{score.toFixed(0)}%</span>
                  </div>
                  <div className="text-xs text-neutral-500">{r.storeName}</div>
                </div>
              );
            })}
            {!summary.topAttach.length && <div className="text-sm text-neutral-400">لا توجد بيانات ربط كافية.</div>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-100 text-neutral-700">
              <th className="py-2 px-3 text-right">رقم الموظف</th>
              <th className="py-2 px-3 text-right">اسم الموظف</th>
              <th className="py-2 px-3 text-right">الفرع</th>
              <th className="py-2 px-3 text-center">المبيعات</th>
              <th className="py-2 px-3 text-center">عدد العمليات</th>
              <th className="py-2 px-3 text-center">معدل الفاتورة</th>
              <th className="py-2 px-3 text-center">لحاف كينج/فل</th>
              <th className="py-2 px-3 text-center">لباد مقابل اللحاف %</th>
              <th className="py-2 px-3 text-center">مخدة مقابل اللحاف %</th>
              <th className="py-2 px-3 text-center">سعري لحاف كينج (منخفض/متوسط/عالي)</th>
              <th className="py-2 px-3 text-center">تركيز العروض</th>
              <th className="py-2 px-3 text-center">عدد القطع</th>
              <th className="py-2 px-3 text-center">أعلى فاتورة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="py-2 px-3 font-mono">{r.id}</td>
                <td className="py-2 px-3 font-semibold">{r.name}</td>
                <td className="py-2 px-3">{r.storeName}</td>
                <td className="py-2 px-3 text-center">{formatSAR(r.sales)}</td>
                <td className="py-2 px-3 text-center">{Math.round(r.trans).toLocaleString()}</td>
                <td className="py-2 px-3 text-center">{formatSAR(r.avgTicket)}</td>
                <td className="py-2 px-3 text-center dir-ltr">
                  {Math.round(r.productInsights.kingDuvet).toLocaleString()} / {Math.round(r.productInsights.fullDuvet).toLocaleString()}
                </td>
                <td className="py-2 px-3 text-center dir-ltr">
                  <span className={r.productInsights.kingAttachRate >= 70 ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold'}>
                    K {r.productInsights.kingAttachRate.toFixed(0)}%
                  </span>
                  {' · '}
                  <span className={r.productInsights.fullAttachRate >= 70 ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold'}>
                    F {r.productInsights.fullAttachRate.toFixed(0)}%
                  </span>
                </td>
                <td className="py-2 px-3 text-center dir-ltr">
                  <span className={r.productInsights.kingPillowAttachRate >= 90 ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                    K {r.productInsights.kingPillowAttachRate.toFixed(0)}%
                  </span>
                  {' · '}
                  <span className={r.productInsights.fullPillowAttachRate >= 90 ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                    F {r.productInsights.fullPillowAttachRate.toFixed(0)}%
                  </span>
                </td>
                <td className="py-2 px-3 text-center dir-ltr">
                  {Math.round(r.productInsights.kingBandLow).toLocaleString()} / {Math.round(r.productInsights.kingBandMid).toLocaleString()} / {Math.round(r.productInsights.kingBandHigh).toLocaleString()}
                </td>
                <td className="py-2 px-3 text-center dir-ltr">
                  <span className={r.productInsights.offerFocusPct >= 55 ? 'text-emerald-700 font-bold' : 'text-neutral-700 font-bold'}>
                    {r.productInsights.offerFocusPct.toFixed(0)}%
                  </span>
                </td>
                <td className="py-2 px-3 text-center">{Math.round(r.items).toLocaleString()}</td>
                <td className="py-2 px-3 text-center">{formatSAR(r.maxTicket)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={13} className="py-8 text-center text-neutral-400">لا توجد بيانات ضمن الفلاتر.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg p-4">
        <h3 className="font-bold text-neutral-900 mb-2">مخرجات الذكاء الاصطناعي</h3>
        <div className="text-sm whitespace-pre-wrap text-neutral-700 min-h-16">{aiResult || 'شغّل التحليل لعرض التوصيات الذكية هنا.'}</div>
      </div>
    </div>
  );
}

