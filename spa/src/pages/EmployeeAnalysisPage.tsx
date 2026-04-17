import { useEffect, useMemo, useState } from 'react';
import { loadEmployeeProductsData, loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { mtdRangeThroughYesterday } from '../utils/mtdDateRange';

function safeNum(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function formatSAR(v: number) {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}
function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

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

function resolveEmployeeName(rawId: string, fallbackName: string, employeeNames: Record<string, string>) {
  const id = String(rawId || '').trim();
  if (!id) return fallbackName || id;
  if (employeeNames?.[id]) return employeeNames[id];
  if (/^\d+$/.test(id)) {
    const padded = id.padStart(4, '0');
    if (employeeNames?.[padded]) return employeeNames[padded];
    const unpadded = String(parseInt(id, 10));
    if (unpadded !== id && employeeNames?.[unpadded]) return employeeNames[unpadded];
  }
  return fallbackName || id;
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
  /** pillows ÷ (king blankets × 2) × 100 */
  kingPillowAttachAdj: number;
  kingBandLow: number;
  kingBandMid: number;
  kingBandHigh: number;
  fullBandLow: number;
  fullBandMid: number;
  fullBandHigh: number;
  kingPadBandLow: number;
  kingPadBandMid: number;
  kingPadBandHigh: number;
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

const BUILT_IN_OPENAI_KEY = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) || '';

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
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_api_key') || BUILT_IN_OPENAI_KEY || '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');

  useEffect(() => {
    Promise.all([loadEmployeesData(), loadManagementData(), loadEmployeeProductsData()]).then(([e, m, ep]) => {
      setEmpRaw(e);
      setMgmt(m);
      setEmpProductsRaw(ep);
      const r = mtdRangeThroughYesterday(new Date());
      setCustomStart(r.start);
      setCustomEnd(r.end);
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
    const employeeNames: Record<string, string> = empRaw.employee_names || {};
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
        const idRaw = rawEmp.split('-')[0]?.trim();
        if (!idRaw || idRaw === 'مرتجع') return;
        const empKey = normalizeEmpId(idRaw);
        if (!empKey) return;
        const nameFromRec = rawEmp.includes('-') ? rawEmp.split('-').slice(1).join('-').trim() : '';
        const displayName = resolveEmployeeName(empKey, nameFromRec, employeeNames);
        const prev = byEmp.get(empKey);
        const salesAdd = safeNum(r?.[2]);
        if (!prev) {
          byEmp.set(empKey, {
            id: empKey,
            name: displayName,
            storeId: sid,
            storeName: stores[sid] || sid,
            manager: String(meta?.manager || ''),
            sales: salesAdd,
            trans: safeNum(r?.[3]),
            items: safeNum(r?.[4]),
            maxTicket: safeNum(r?.[5]),
            avgTicket: 0,
            productInsights: {
              kingDuvet: 0,
              fullDuvet: 0,
              kingPad: 0,
              fullPad: 0,
              kingPillow: 0,
              fullPillow: 0,
              kingAttachRate: 0,
              fullAttachRate: 0,
              kingPillowAttachRate: 0,
              fullPillowAttachRate: 0,
              kingPillowAttachAdj: 0,
              kingBandLow: 0,
              kingBandMid: 0,
              kingBandHigh: 0,
              fullBandLow: 0,
              fullBandMid: 0,
              fullBandHigh: 0,
              kingPadBandLow: 0,
              kingPadBandMid: 0,
              kingPadBandHigh: 0,
              offerFocusPct: 0,
            },
          });
        } else {
          prev.sales += salesAdd;
          prev.trans += safeNum(r?.[3]);
          prev.items += safeNum(r?.[4]);
          prev.maxTicket = Math.max(prev.maxTicket, safeNum(r?.[5]));
          if (displayName && displayName !== empKey && (prev.name === empKey || prev.name.length < displayName.length)) {
            prev.name = displayName;
          }
          if (salesAdd > 0 && (prev.storeName === empKey || prev.sales <= salesAdd)) {
            prev.storeId = sid;
            prev.storeName = stores[sid] || sid;
            prev.manager = String(meta?.manager || '');
          }
        }
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
        kingDuvet: 0,
        fullDuvet: 0,
        kingPad: 0,
        fullPad: 0,
        kingPillow: 0,
        fullPillow: 0,
        kingAttachRate: 0,
        fullAttachRate: 0,
        kingPillowAttachRate: 0,
        fullPillowAttachRate: 0,
        kingPillowAttachAdj: 0,
        kingBandLow: 0,
        kingBandMid: 0,
        kingBandHigh: 0,
        fullBandLow: 0,
        fullBandMid: 0,
        fullBandHigh: 0,
        kingPadBandLow: 0,
        kingPadBandMid: 0,
        kingPadBandHigh: 0,
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
      let kingPadBandRaw = 0;
      items.forEach((it: any) => {
        const name = String(it?.name || '');
        const qty = safeNum(it?.qty);
        const amt = safeNum(it?.amt);
        if (qty <= 0) return;
        const cat = canonicalTop6Category(name);
        const avg = amt / qty;
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
        if (cat === 'لباد كينج') {
          kingPadBandRaw += qty;
          if (avg <= 300) p.kingPadBandLow += qty;
          else if (avg <= 600) p.kingPadBandMid += qty;
          else p.kingPadBandHigh += qty;
        }
      });

      if (p.kingDuvet > 0) {
        p.kingAttachRate = (p.kingPad / p.kingDuvet) * 100;
        p.kingPillowAttachRate = (p.kingPillow / p.kingDuvet) * 100;
        p.kingPillowAttachAdj = (p.kingPillow / (p.kingDuvet * 2)) * 100;
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
      if (kingPadBandRaw > 0 && p.kingPad > 0) {
        const scale = p.kingPad / kingPadBandRaw;
        p.kingPadBandLow *= scale;
        p.kingPadBandMid *= scale;
        p.kingPadBandHigh *= scale;
      }

      const offerUnits = p.kingPad + p.fullPad + p.kingPillow + p.fullPillow;
      const coreUnits = p.kingDuvet + p.fullDuvet + offerUnits;
      p.offerFocusPct = coreUnits > 0 ? (offerUnits / coreUnits) * 100 : 0;

      row.productInsights = p;
      byEmp.set(empId, row);
    });

    const rows = Array.from(byEmp.values())
      .map((r) => ({ ...r, avgTicket: r.trans > 0 ? r.sales / r.trans : 0 }))
      .sort((a, b) => b.sales - a.sales);
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
        .sort(
          (a, b) =>
            b.productInsights.kingAttachRate +
            b.productInsights.fullAttachRate -
            (a.productInsights.kingAttachRate + a.productInsights.fullAttachRate),
        )
        .slice(0, 8),
    };
  }, [rows]);

  const analyzeWithAI = async () => {
    if (!rows.length) return;
    const key = apiKey || BUILT_IN_OPENAI_KEY;
    if (!key) {
      alert('أدخل OpenAI API Key أو أضف VITE_OPENAI_API_KEY في أسرار GitHub عند البناء.');
      return;
    }
    try {
      setAiLoading(true);
      if (apiKey) localStorage.setItem('openai_api_key', apiKey);

      const atvList = rows.map((r) => r.avgTicket).filter((x) => x > 0).sort((a, b) => a - b);
      const medianAtv = atvList.length ? atvList[Math.floor(atvList.length / 2)] : 0;

      const top = rows.slice(0, 40).map((r) => {
        const p = r.productInsights;
        const salesPerTrans = r.trans > 0 ? r.sales / r.trans : 0;
        const itemsPerTrans = r.trans > 0 ? r.items / r.trans : 0;
        return {
          id: r.id,
          name: r.name,
          store: r.storeName,
          sales: Math.round(r.sales),
          transactions: Math.round(r.trans),
          avgTicket: Number(r.avgTicket.toFixed(1)),
          itemsPerInvoice: Number(itemsPerTrans.toFixed(2)),
          salesPerTransaction: Number(salesPerTrans.toFixed(1)),
          kingBlanketsSold: Math.round(p.kingDuvet),
          fullBlanketsSold: Math.round(p.fullDuvet),
          kingPadsSold: Math.round(p.kingPad),
          fullPadsSold: Math.round(p.fullPad),
          kingPillowsSold: Math.round(p.kingPillow),
          fullPillowsSold: Math.round(p.fullPillow),
          pillowAttachRateAdjustedPct: Number(p.kingPillowAttachAdj.toFixed(1)),
          padAttachKingPct: Number(p.kingAttachRate.toFixed(1)),
          padAttachFullPct: Number(p.fullAttachRate.toFixed(1)),
          kingDuvetPriceMixLowMedHigh: [Math.round(p.kingBandLow), Math.round(p.kingBandMid), Math.round(p.kingBandHigh)],
          kingPadPriceMixLowMedHigh: [Math.round(p.kingPadBandLow), Math.round(p.kingPadBandMid), Math.round(p.kingPadBandHigh)],
          offerFocusPct: Number(p.offerFocusPct.toFixed(1)),
          vsMedianAtv: medianAtv > 0 ? Number(((r.avgTicket / medianAtv - 1) * 100).toFixed(1)) : 0,
        };
      });

      const context = {
        role: 'Senior retail performance manager analysis',
        filters: { customStart, customEnd, manager, city, branch, productsPeriodKey },
        cohortMedianAtv: Number(medianAtv.toFixed(1)),
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
        instructions: [
          'For EACH employee in the payload, output in order:',
          '1) EXACT weakness category: ATV | Conversion | Attach | Offer misuse | Consistency (pick one primary).',
          '2) Classify: A (high) | B (average) | C (weak).',
          '3) Behavior pattern: Discount seller | Premium seller | Volume seller | Balanced seller.',
          '4) ACTIONABLE: one instruction for manager + one for employee (specific, not generic).',
          '5) Red flags if any (zero attach, high ATV low sales, high transactions low revenue).',
          'Use Arabic for narrative but keep category labels as specified in English where shown.',
          'Be decision-oriented, short bullets, no fluff.',
        ],
      };

      const resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          input: [
            {
              role: 'system',
              content:
                'Act as a senior retail performance manager. Analyze each employee individually using the metrics provided. Output structured, short, decision-oriented Arabic (with the English category tokens where required). Avoid generic analysis; focus on WHAT TO DO.',
            },
            {
              role: 'user',
              content: `Context:\n${JSON.stringify(context)}\n\nEmployees:\n${JSON.stringify(top)}`,
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
      <div className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900 to-orange-700 rounded-2xl border border-orange-500/30 shadow-xl p-5 text-white">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,#fff_0%,transparent_45%)] pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-orange-200/90 tracking-wide">Orange Cockpit</div>
            <h1 className="text-2xl font-black">تحليل الموظفين</h1>
            <p className="text-sm text-white/80 mt-1">أداء المبيعات + الربط (لحاف/لباد/مخدة) + تركيز العروض + تحليل ذكي</p>
          </div>
          <div className="text-xs bg-white/10 border border-white/20 rounded-xl px-3 py-2">
            MTD في النظام = من أول الشهر حتى <span className="font-black">أمس</span> (لا يُحسب يوم اليوم حتى ينتهي عند 12 ليلاً)
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg p-4 space-y-3">
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
              {managers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">المدينة</div>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">الفرع</div>
            <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-1">مصدر أصناف الموظف</div>
            <select className="input" value={productsPeriodKey} onChange={(e) => setProductsPeriodKey(e.target.value as ProductPeriodKey)}>
              <option value="mtd">MTD (حتى أمس)</option>
              <option value="30d">آخر 30 يوم</option>
              <option value="14d">آخر 14 يوم</option>
              <option value="7d">آخر 7 أيام</option>
              <option value="yest">أمس</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3 space-y-1">
            <div className="text-xs font-semibold text-neutral-500">OpenAI API Key</div>
            {BUILT_IN_OPENAI_KEY ? (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
                تم حقن المفتاح من البناء (GitHub Secret → VITE_OPENAI_API_KEY). يمكنك ترك الحقل فارغًا أو لصق مفتاحًا آخر للتجربة محليًا.
              </div>
            ) : null}
            <input
              type="password"
              className="input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={BUILT_IN_OPENAI_KEY ? 'اختياري — المفتاح محمّل من النشر' : 'sk-...'}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={analyzeWithAI}
              className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-black hover:from-orange-600 hover:to-orange-700 shadow-md"
            >
              {aiLoading ? 'جاري التحليل...' : 'تحليل ذكي (مدير أداء)'}
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
          <div className="text-xs text-neutral-500">ربط لباد/لحاف (كينج·فل)</div>
          <div className="text-lg font-black dir-ltr">
            <span className={summary.kingPadAttach >= 70 ? 'text-emerald-700' : 'text-red-700'}>K {summary.kingPadAttach.toFixed(0)}%</span>
            <span className="text-neutral-400"> · </span>
            <span className={summary.fullPadAttach >= 70 ? 'text-emerald-700' : 'text-red-700'}>F {summary.fullPadAttach.toFixed(0)}%</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-white to-orange-50 rounded-xl border border-orange-100 p-4">
          <div className="text-xs text-neutral-500">تطابق لحاف كينج (سعري vs إجمالي)</div>
          <div className={`text-2xl font-black dir-ltr ${summary.integrityBandVsKing >= 90 && summary.integrityBandVsKing <= 110 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {summary.integrityBandVsKing.toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg p-4">
          <h3 className="font-bold text-neutral-900 mb-3">توزيع الفئة السعرية — لحاف كينج</h3>
          {(() => {
            const total = summary.kingBandLow + summary.kingBandMid + summary.kingBandHigh;
            const rowsBand = [
              { label: 'منخفض (≤300)', val: summary.kingBandLow, color: 'bg-red-400' },
              { label: 'متوسط (301–600)', val: summary.kingBandMid, color: 'bg-amber-400' },
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
                        <span className="dir-ltr font-bold">
                          {Math.round(b.val).toLocaleString()} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div className={`${b.color} h-full`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg p-4">
          <h3 className="font-bold text-neutral-900 mb-3">أفضل الربط (لباد + لحاف)</h3>
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
              <th className="py-2 px-3 text-center">العمليات</th>
              <th className="py-2 px-3 text-center">معدل الفاتورة</th>
              <th className="py-2 px-3 text-center">لحاف كينج/فل</th>
              <th className="py-2 px-3 text-center">لباد %</th>
              <th className="py-2 px-3 text-center">مخدة %</th>
              <th className="py-2 px-3 text-center">مخدة معدّلة ÷(لحاف×2)</th>
              <th className="py-2 px-3 text-center">لباد كينج سعري ل/م/ع</th>
              <th className="py-2 px-3 text-center">لحاف كينج سعري ل/م/ع</th>
              <th className="py-2 px-3 text-center">تركيز عروض</th>
              <th className="py-2 px-3 text-center">قطع</th>
              <th className="py-2 px-3 text-center">أعلى فاتورة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.productInsights;
              return (
                <tr key={r.id} className="border-t border-neutral-100 hover:bg-orange-50/40">
                  <td className="py-2 px-3 font-mono">{r.id}</td>
                  <td className="py-2 px-3 font-semibold text-neutral-900">{r.name}</td>
                  <td className="py-2 px-3">{r.storeName}</td>
                  <td className="py-2 px-3 text-center">{formatSAR(r.sales)}</td>
                  <td className="py-2 px-3 text-center">{Math.round(r.trans).toLocaleString()}</td>
                  <td className="py-2 px-3 text-center">{formatSAR(r.avgTicket)}</td>
                  <td className="py-2 px-3 text-center dir-ltr">
                    {Math.round(p.kingDuvet).toLocaleString()} / {Math.round(p.fullDuvet).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-center dir-ltr">
                    <span className={p.kingAttachRate >= 70 ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold'}>K {p.kingAttachRate.toFixed(0)}%</span>
                    {' · '}
                    <span className={p.fullAttachRate >= 70 ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold'}>F {p.fullAttachRate.toFixed(0)}%</span>
                  </td>
                  <td className="py-2 px-3 text-center dir-ltr">
                    <span className={p.kingPillowAttachRate >= 90 ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>K {p.kingPillowAttachRate.toFixed(0)}%</span>
                    {' · '}
                    <span className={p.fullPillowAttachRate >= 90 ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>F {p.fullPillowAttachRate.toFixed(0)}%</span>
                  </td>
                  <td className="py-2 px-3 text-center dir-ltr font-bold text-neutral-800">{p.kingPillowAttachAdj.toFixed(0)}%</td>
                  <td className="py-2 px-3 text-center dir-ltr text-xs">
                    {Math.round(p.kingPadBandLow)} / {Math.round(p.kingPadBandMid)} / {Math.round(p.kingPadBandHigh)}
                  </td>
                  <td className="py-2 px-3 text-center dir-ltr text-xs">
                    {Math.round(p.kingBandLow)} / {Math.round(p.kingBandMid)} / {Math.round(p.kingBandHigh)}
                  </td>
                  <td className="py-2 px-3 text-center dir-ltr">
                    <span className={p.offerFocusPct >= 55 ? 'text-emerald-700 font-bold' : 'text-neutral-700 font-bold'}>{p.offerFocusPct.toFixed(0)}%</span>
                  </td>
                  <td className="py-2 px-3 text-center">{Math.round(r.items).toLocaleString()}</td>
                  <td className="py-2 px-3 text-center">{formatSAR(r.maxTicket)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={15} className="py-8 text-center text-neutral-400">
                  لا توجد بيانات ضمن الفلاتر.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg p-4">
        <h3 className="font-bold text-neutral-900 mb-2">مخرجات الذكاء الاصطناعي</h3>
        <div className="text-sm whitespace-pre-wrap text-neutral-700 min-h-16">{aiResult || 'شغّل التحليل لعرض تقييم كل موظف (A/B/C) والضعف الدقيق والتوصيات.'}</div>
      </div>
    </div>
  );
}
