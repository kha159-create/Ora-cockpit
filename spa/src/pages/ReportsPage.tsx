import { useEffect, useMemo, useState } from 'react';
import { loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import * as XLSX from 'xlsx';

type FilterMode = 'mtd' | 'yesterday' | 'today' | 'standard' | 'custom';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getRange(
  mode: FilterMode,
  standardYear: number,
  standardMonth: string,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (mode === 'today') return { start: toYMD(today), end: toYMD(today) };
  if (mode === 'yesterday') return { start: toYMD(yesterday), end: toYMD(yesterday) };
  if (mode === 'mtd') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: toYMD(start), end: toYMD(today) };
  }
  if (mode === 'custom') {
    const start = customStart || toYMD(new Date(today.getFullYear(), today.getMonth(), 1));
    const end = customEnd || toYMD(yesterday);
    return { start, end };
  }
  const y = standardYear || today.getFullYear();
  if (standardMonth === 'all') {
    return { start: `${y}-01-01`, end: y === today.getFullYear() ? toYMD(today) : `${y}-12-31` };
  }
  const m = Math.max(1, Math.min(12, Number(standardMonth)));
  const start = new Date(y, m - 1, 1);
  let end = new Date(y, m, 0);
  if (end > today) end = new Date(today);
  return { start: toYMD(start), end: toYMD(end) };
}

export default function ReportsPage() {
  const user = getCurrentUser();
  const [rawMgmt, setRawMgmt] = useState<any>(null);
  const [rawEmp, setRawEmp] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('mtd');
  const [standardYear, setStandardYear] = useState(new Date().getFullYear());
  const [standardMonth, setStandardMonth] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [manager, setManager] = useState('all');
  const [city, setCity] = useState('all');
  const [storeType, setStoreType] = useState('all');
  const [branch, setBranch] = useState('all');
  const [lastUpdate, setLastUpdate] = useState<string>('--:--');
  const [excelExporting, setExcelExporting] = useState(false);
  const [excelType, setExcelType] = useState<'store' | 'employee'>('store');
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [showReportChoiceModal, setShowReportChoiceModal] = useState(false);
  const [reportChoiceType, setReportChoiceType] = useState<'pdf' | 'excel' | null>(null);

  const originalReports = [
    { id: 'yesterday_store', name: 'تقرير مبيعات الأمس (المعارض)', type: 'pdf', icon: '🏪', desc: 'مقارنة مبيعات الأمس بالسنة الماضية والأهداف' },
    { id: 'yesterday_employee', name: 'أداء الموظفين (الأمس)', type: 'pdf', icon: '👤', desc: 'مبيعات الموظفين يوم أمس وتغطية الأهداف' },
    { id: 'monthly_summary', name: 'الملخص الشهري العام', type: 'pdf', icon: '📅', desc: 'تراكمي الشهر الحالي مقارنة بالفترات السابقة' },
    { id: 'stagnant_items', name: 'تقرير المنتجات الراكدة', type: 'excel', icon: '📦', desc: 'تحليل المخزون الذي لم يتحرك لفترة طويلة' },
    { id: 'market_basket', name: 'تحليل الأنماط الشرائية', type: 'excel', icon: '🧺', desc: 'المنتجات التي تباع سوياً بشكل متكرر' },
  ];

  useEffect(() => {
    loadManagementData()
      .then((d) => {
        setRawMgmt(d);
        setLastUpdate((d as any)?.metadata?.generated_at || '--:--');
      })
      .catch((e) => setErr(e?.message || String(e)));
    loadEmployeesData().then(setRawEmp).catch(() => { });
  }, []);

  const range = useMemo(
    () => getRange(filterMode, standardYear, standardMonth, customStart, customEnd),
    [filterMode, standardYear, standardMonth, customStart, customEnd]
  );

  const managers = useMemo(() => {
    if (!rawMgmt?.store_meta) return [];
    const set = new Set<string>();
    Object.values(rawMgmt.store_meta).forEach((m: any) => m?.manager && set.add(m.manager));
    return Array.from(set).sort();
  }, [rawMgmt]);

  const cities = useMemo(() => {
    if (!rawMgmt?.store_meta) return [];
    const set = new Set<string>();
    Object.values(rawMgmt.store_meta).forEach((m: any) => m?.city && set.add(m.city));
    return Array.from(set).sort();
  }, [rawMgmt]);

  const branches = useMemo(() => {
    if (!rawMgmt?.stores || !rawMgmt?.store_meta) return [];
    return Object.entries(rawMgmt.stores)
      .filter(([id]) => {
        const meta = (rawMgmt.store_meta as Record<string, { manager?: string; city?: string }>)[id];
        if (manager !== 'all' && (meta?.manager || '') !== manager) return false;
        if (city !== 'all' && (meta?.city || '') !== city) return false;
        return true;
      })
      .map(([id, name]) => ({ id, name: (name as string) || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawMgmt, manager, city]);

  const passFilter = (storeId: string) => {
    if (branch !== 'all' && storeId !== branch) return false;
    const meta = rawMgmt?.store_meta?.[storeId] || {};
    if (manager !== 'all' && meta.manager !== manager) return false;
    if (city !== 'all' && meta.city !== city) return false;
    if (storeType !== 'all' && meta.type !== storeType) return false;
    return true;
  };

  const inRange = (d: string) => d >= range.start && d <= range.end;

  const exportStoreExcel = () => {
    if (!rawMgmt) return;
    const dataMap: Record<string, { date: string; storeId: string; sales: number; trans: number; visitors: number }> = {};
    const ensure = (d: string, s: string) => {
      const k = `${d}_${s}`;
      if (!dataMap[k]) dataMap[k] = { date: d, storeId: s, sales: 0, trans: 0, visitors: 0 };
      return dataMap[k];
    };
    (rawMgmt.sales || []).forEach(([d, s, v]: any[]) => {
      if (inRange(d) && passFilter(s)) ensure(d, s).sales += v || 0;
    });
    (rawMgmt.transactions || []).forEach(([d, s, v]: any[]) => {
      if (inRange(d) && passFilter(s)) ensure(d, s).trans += v || 0;
    });
    (rawMgmt.visitors || []).forEach(([d, s, v]: any[]) => {
      if (inRange(d) && passFilter(s)) ensure(d, s).visitors += v || 0;
    });
    const rows = Object.values(dataMap).map((r) => {
      const meta = rawMgmt.store_meta?.[r.storeId] || {};
      return {
        'التاريخ': r.date,
        'المعرض': rawMgmt.stores?.[r.storeId] || r.storeId,
        'المدينة': meta.city || '-',
        'مدير المنطقة': meta.manager || '-',
        'المبيعات': r.sales,
        'عدد الفواتير': r.trans,
        'الزوار': r.visitors,
        'متوسط الفاتورة': r.trans > 0 ? Math.round(r.sales / r.trans) : 0,
        'نسبة التحويل': r.visitors > 0 ? ((r.trans / r.visitors) * 100).toFixed(1) + '%' : '0%',
      };
    });
    if (rows.length === 0) {
      alert('لا توجد بيانات للفترة المحددة');
      return;
    }
    rows.sort((a, b) => (a['التاريخ'] !== b['التاريخ'] ? a['التاريخ'].localeCompare(b['التاريخ']) : (a['المعرض'] as string).localeCompare(b['المعرض'] as string)));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Store Sales');
    XLSX.writeFile(wb, `Store_Sales_${range.start}_${range.end}.xlsx`);
  };

  const exportEmployeeExcel = () => {
    if (!rawMgmt || !rawEmp) return;
    const history = rawEmp.history || {};
    const empNames = rawEmp.employee_names || {};
    let targetStoreIds = Object.keys(history).filter((sid) => passFilter(sid));
    const rows: any[] = [];
    targetStoreIds.forEach((sid) => {
      const recs = history[sid] || [];
      const storeName = rawMgmt.stores?.[sid] || sid;
      recs.forEach((rec: any[]) => {
        const [date, empId, sales, trans] = rec;
        if (date >= range.start && date <= range.end) {
          let name = empNames[empId] || empId;
          if (empId && String(empId).includes('-')) {
            const parts = String(empId).split('-');
            name = parts.slice(1).join('-').trim() || empId;
          }
          rows.push({
            'التاريخ': date,
            'المعرض': storeName,
            'الرقم الوظيفي': empId,
            'اسم الموظف': name,
            'المبيعات': sales,
            'عدد الفواتير': trans,
          });
        }
      });
    });
    if (rows.length === 0) {
      alert('لا توجد بيانات موظفين للفترة المحددة');
      return;
    }
    rows.sort((a, b) => {
      if (a['التاريخ'] !== b['التاريخ']) return a['التاريخ'].localeCompare(b['التاريخ']);
      if (a['المعرض'] !== b['المعرض']) return (a['المعرض'] as string).localeCompare(b['المعرض'] as string);
      return (a['اسم الموظف'] as string).localeCompare(b['اسم الموظف'] as string);
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Sales');
    XLSX.writeFile(wb, `Employee_Sales_${range.start}_${range.end}.xlsx`);
  };

  const runExcelExport = () => {
    setExcelExporting(true);
    try {
      if (excelType === 'store') exportStoreExcel();
      else exportEmployeeExcel();
      setShowExcelModal(false);
      setShowReportChoiceModal(false);
      setReportChoiceType(null);
    } finally {
      setExcelExporting(false);
    }
  };

  const openReportChoice = (type: 'pdf' | 'excel') => {
    setReportChoiceType(type);
    setShowReportChoiceModal(true);
  };

  const openPdfLegacy = (reportId: string = 'dashboard') => {
    setShowReportChoiceModal(false);
    setReportChoiceType(null);
    // التواصل مع المستخدم حول كيفية إصدار الـ PDF
    const msg = `سيتم إصدار تقرير (${reportId === 'dashboard' ? 'لوحة التحكم' : reportId}) بصيغة PDF بناءً على الفلاتر المختارة:
الفترة: ${range.start} إلى ${range.end}
الفرع: ${branch === 'all' ? 'الكل' : branch}

جاري معالجة البيانات وتحويلها إلى PDF...`;
    alert(msg);
    // ملاحظة: هنا سنقوم لاحقاً بدمج منطق pdf_export.js بشكل كامل
    // حالياً نكتفي بتأكيد الفلاتر
  };

  const canExportEmployee = user?.role === 'Admin' || user?.name === 'Sales Manager';

  if (err) {
    return (
      <div className="p-6 bg-white rounded-2xl shadow-lg border border-neutral-200 text-red-600 font-semibold">
        {err}
      </div>
    );
  }
  if (!rawMgmt) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600" />
      </div>
    );
  }

  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  return (
    <div className="space-y-6 relative min-h-[400px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-500">آخر تحديث: <span className="text-primary-600 font-medium">{lastUpdate}</span></p>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 sm:p-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-4">الفلاتر</h3>
        <p className="text-sm text-neutral-500 mb-4">جميع التقارير (PDF / Excel) ستستخدم هذه الفلاتر.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-neutral-700">الفترة</label>
            <select
              className="input w-full"
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            >
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="mtd">الشهر الحالي (MTD)</option>
              <option value="standard">شهر محدد</option>
              <option value="custom">فترة مخصصة</option>
            </select>
            {filterMode === 'standard' && (
              <div className="flex gap-2 flex-wrap">
                <select className="input flex-1 min-w-[100px]" value={standardYear} onChange={(e) => setStandardYear(Number(e.target.value))}>
                  {[2026, 2025, 2024].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select className="input flex-1 min-w-[120px]" value={standardMonth} onChange={(e) => setStandardMonth(e.target.value)}>
                  <option value="all">كل السنة</option>
                  {months.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            )}
            {filterMode === 'custom' && (
              <div className="flex gap-2 flex-wrap">
                <input
                  type="date"
                  className="input flex-1 min-w-[140px]"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <input
                  type="date"
                  className="input flex-1 min-w-[140px]"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="space-y-3 flex flex-wrap gap-x-4 gap-y-2 items-end">
            <div>
              <label className="block text-sm font-semibold text-neutral-700">مدير المنطقة</label>
              <select className="input mt-1" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="all">الكل</option>
                {managers.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">المدينة</label>
              <select className="input mt-1" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="all">الكل</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">نوع المعرض</label>
              <select className="input mt-1" value={storeType} onChange={(e) => setStoreType(e.target.value)}>
                <option value="all">الكل</option>
                <option value="Showroom">معارض</option>
                <option value="Online">أونلاين</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">الفرع</label>
              <select className="input mt-1" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="all">الكل</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        <button
          type="button"
          onClick={() => openReportChoice('pdf')}
          className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6 text-center hover:shadow-xl hover:border-primary-200 transition-all cursor-pointer group"
        >
          <div className="text-red-500 text-4xl mb-3">📄</div>
          <h5 className="font-bold text-neutral-900">تقارير PDF المخصصة</h5>
          <p className="text-sm text-neutral-500 mt-1">لوحة التحكم، تقرير أمس للمعارض، تقرير أمس للموظفين</p>
          <span className="inline-block mt-3 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-lg group-hover:bg-amber-600">اختر وتصدير PDF</span>
        </button>
        <button
          type="button"
          onClick={() => openReportChoice('excel')}
          className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6 text-center hover:shadow-xl hover:border-primary-200 transition-all cursor-pointer group"
        >
          <div className="text-green-600 text-4xl mb-3">📊</div>
          <h5 className="font-bold text-neutral-900">تقارير Excel المخصصة</h5>
          <p className="text-sm text-neutral-500 mt-1">مبيعات المعارض، مبيعات الموظفين</p>
          <span className="inline-block mt-3 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg group-hover:bg-green-700">اختر وتصدير Excel</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
          <h3 className="text-lg font-bold text-neutral-900">📚 مكتبة التقارير القياسية</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
          {originalReports.map((repo) => (
            <div key={repo.id} className="p-4 rounded-xl border border-neutral-100 bg-neutral-50 hover:bg-white hover:shadow-md transition-all cursor-pointer group" onClick={() => repo.type === 'pdf' ? openPdfLegacy(repo.id) : alert('سيتم تصدير ملف الإكسل الخاص بهذا التقرير قريباً')}>
              <div className="flex items-start gap-3">
                <div className="text-3xl">{repo.icon}</div>
                <div className="flex-1">
                  <h6 className="font-bold text-neutral-900 group-hover:text-primary-600">{repo.name}</h6>
                  <p className="text-xs text-neutral-500 mt-1">{repo.desc}</p>
                  <div className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${repo.type === 'pdf' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {repo.type}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Report type choice modal - داخل حدود الصفحة */}
      {showReportChoiceModal && reportChoiceType && (
        <div className="modal-center-screen" onClick={() => setShowReportChoiceModal(false)}>
          <div className="modal-content max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold text-lg text-neutral-900 mb-4">
              {reportChoiceType === 'pdf' ? 'اختر تقرير PDF' : 'اختر تقرير Excel'}
            </h5>
            {reportChoiceType === 'pdf' ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => openPdfLegacy('dashboard')}
                  className="w-full py-3 px-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600"
                >
                  فتح صفحة تصدير PDF (لوحة التحكم، أمس للمعارض، أمس للموظفين)
                </button>
                <p className="text-sm text-neutral-500">ستفتح نافذة جديدة لتصدير PDF باستخدام الفلاتر الحالية.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => { setExcelType('store'); setShowReportChoiceModal(false); setShowExcelModal(true); setReportChoiceType(null); }}
                  className="w-full py-3 px-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"
                >
                  مبيعات المعارض (Excel)
                </button>
                {canExportEmployee && (
                  <button
                    type="button"
                    onClick={() => { setExcelType('employee'); setShowReportChoiceModal(false); setShowExcelModal(true); setReportChoiceType(null); }}
                    className="w-full py-3 px-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"
                  >
                    مبيعات الموظفين (Excel)
                  </button>
                )}
              </div>
            )}
            <button type="button" className="mt-4 w-full btn-secondary py-2" onClick={() => { setShowReportChoiceModal(false); setReportChoiceType(null); }}>إلغاء</button>
          </div>
        </div>
      )}

      {/* Excel confirm modal - داخل حدود الصفحة */}
      {showExcelModal && (
        <div className="modal-center-screen" onClick={() => setShowExcelModal(false)}>
          <div className="modal-content max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold text-lg text-neutral-900 mb-4">تصدير Excel</h5>
            <p className="text-sm text-neutral-600 mb-2">الفترة: {range.start} → {range.end}</p>
            <p className="text-sm text-neutral-500 mb-4">{excelType === 'store' ? 'مبيعات المعارض' : 'مبيعات الموظفين'}</p>
            <div className="flex gap-3">
              <button type="button" className="flex-1 btn-secondary py-2" onClick={() => setShowExcelModal(false)}>إلغاء</button>
              <button type="button" className="flex-1 bg-green-600 text-white font-bold py-2 rounded-xl hover:bg-green-700 disabled:opacity-50" onClick={runExcelExport} disabled={excelExporting}>
                {excelExporting ? 'جاري التصدير...' : 'تصدير'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
