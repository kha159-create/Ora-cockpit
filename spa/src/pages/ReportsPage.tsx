import { useEffect, useMemo, useState } from 'react';
import { loadEmployeesData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { XIcon } from '../components/Icons';
import * as XLSX from 'xlsx';

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

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
    return { start: toYMD(start), end: toYMD(yesterday) };
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

  // New States for Employee Selection (Image 3)
  const [showEmpSelectModal, setShowEmpSelectModal] = useState(false);
  const [empSelectionSearch, setEmpSelectionSearch] = useState('');
  const [empStatusFilter, setEmpStatusFilter] = useState<string[]>(['active']); // active, review, resigned
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());

  const range = useMemo(
    () => getRange(filterMode, standardYear, standardMonth, customStart, customEnd),
    [filterMode, standardYear, standardMonth, customStart, customEnd]
  );

  const [excelRangeStart, setExcelRangeStart] = useState('');
  const [excelRangeEnd, setExcelRangeEnd] = useState('');

  // Print States
  const [printData, setPrintData] = useState<{ type: 'stores' | 'employees'; title: string; rows: any[]; range: string } | null>(null);

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

  useEffect(() => {
    if (range.start) setExcelRangeStart(range.start);
    if (range.end) setExcelRangeEnd(range.end);
  }, [range]);

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
    XLSX.writeFile(wb, `Employee_Sales_${excelRangeStart}_${excelRangeEnd}.xlsx`);
  };

  const runExcelExport = () => {
    setExcelExporting(true);
    try {
      if (excelType === 'store') exportStoreExcel();
      else exportEmployeeExcel();
      setShowExcelModal(false);
    } finally {
      setTimeout(() => { // Added setTimeout here
        setExcelExporting(false);
      }, 1000);
    }
  };

  const handlePdfGeneration = (type: 'yesterday_store' | 'yesterday_employee' | 'monthly_summary') => {
    if (!rawMgmt) return;
    const { start, end } = range;
    let title = '';
    let rows: any[] = [];

    if (type === 'yesterday_store' || type === 'monthly_summary') {
      title = type === 'yesterday_store' ? `تقرير المعارض - أمس (${range.start})` : `الملخص الشهري للمعارض (${range.start} إلى ${range.end})`;
      const dataMap: Record<string, any> = {};
      (rawMgmt.sales || []).forEach(([d, s, v]: any[]) => {
        if (inRange(d) && passFilter(s)) {
          if (!dataMap[s]) dataMap[s] = { name: rawMgmt.stores?.[s] || s, sales: 0, trans: 0, visitors: 0, target: 0 };
          dataMap[s].sales += v || 0;
        }
      });
      (rawMgmt.transactions || []).forEach(([d, s, v]: any[]) => {
        if (inRange(d) && passFilter(s) && dataMap[s]) dataMap[s].trans += v || 0;
      });
      (rawMgmt.visitors || []).forEach(([d, s, v]: any[]) => {
        if (inRange(d) && passFilter(s) && dataMap[s]) dataMap[s].visitors += v || 0;
      });
      (rawMgmt.targets || []).forEach(([d, s, v]: any[]) => {
        if (inRange(d) && passFilter(s) && dataMap[s]) dataMap[s].target += v || 0;
      });
      rows = Object.values(dataMap).map(r => ({
        ...r,
        avgInv: r.trans > 0 ? r.sales / r.trans : 0,
        ach: r.target > 0 ? (r.sales / r.target) * 100 : 0,
        conversion: r.visitors > 0 ? (r.trans / r.visitors) * 100 : 0
      })).sort((a, b) => b.sales - a.sales);

      setPrintData({ type: 'stores', title, rows, range: `${start} إلى ${end}` }); // Updated range format
    } else if (type === 'yesterday_employee') {
      title = `أداء الموظفين (${range.start})`;
      const history = rawEmp?.history || {};
      const names = rawEmp?.employee_names || {};
      const empData: Record<string, any> = {};
      const selectedIdsArray = Array.from(selectedEmpIds); // Use selectedEmpIds for filtering

      Object.entries(history).forEach(([sid, recs]: [string, any]) => {
        if (!passFilter(sid)) return;
        recs.forEach((rec: any[]) => {
          if (inRange(rec[0])) {
            const rawId = String(rec[1] || '').split('-')[0].trim();
            const id = rawId.padStart(4, '0');
            if (rawId === 'مرتجع') return;
            // Only include if employee is selected (if yesterday_employee report is triggered via selection modal)
            if (selectedIdsArray.length > 0 && !selectedIdsArray.includes(id)) return;

            if (!empData[id]) empData[id] = { id, name: names[id] || rawId, sales: 0, trans: 0, store: rawMgmt.stores?.[sid] || sid };
            empData[id].sales += Number(rec[2]) || 0;
            empData[id].trans += Number(rec[3]) || 0;
          }
        });
      });
      rows = Object.values(empData).sort((a, b) => b.sales - a.sales);
      setPrintData({ type: 'employees', title, rows, range: `${start} إلى ${end}` }); // Updated range format
    }

    setTimeout(() => {
      window.print();
      setPrintData(null);
    }, 500);
  };

  const openReportChoice = (type: 'pdf' | 'excel') => {
    setReportChoiceType(type);
    setShowReportChoiceModal(true);
  };

  const openPdfLegacy = (reportId: string = 'dashboard') => {
    if (reportId === 'yesterday_employee') {
      setShowEmpSelectModal(true);
      return;
    }

    // Directly call handlePdfGeneration for other PDF reports
    const reportType = reportId === 'dashboard' ? 'monthly_summary' : reportId as 'yesterday_store' | 'monthly_summary';
    handlePdfGeneration(reportType);
  };

  const allEmployees = useMemo(() => {
    if (!rawEmp?.employee_names || !rawEmp?.history) return [];
    const history = rawEmp.history;
    const names = rawEmp.employee_names;
    // Removed unused 'meta' variable
    const emps: any[] = [];
    const processed = new Set();

    Object.entries(history).forEach(([sid, recs]: [string, any]) => {
      recs.forEach((r: any) => {
        const eid = String(r[1]);
        if (processed.has(eid)) return;
        processed.add(eid);

        let name = names[eid] || eid;
        if (eid.includes('-')) name = eid.split('-').slice(1).join('-').trim();

        // In a real app, status would come from meta, here we mock it or use name heuristics
        const status = name.includes('(مستقيل)') ? 'resigned' : name.includes('(مراجعة)') ? 'review' : 'active';

        // Calculate recent sales for sorting
        let recentSales = 0;
        if (r[0] >= range.start) recentSales = r[2];

        emps.push({
          id: eid,
          name,
          store: rawMgmt?.stores?.[sid] || sid,
          status,
          sales: recentSales
        });
      });
    });
    return emps.sort((a, b) => b.sales - a.sales);
  }, [rawEmp, rawMgmt, range.start]);

  const filteredEmployees = useMemo(() => {
    return allEmployees.filter(e => {
      const matchesSearch = e.name.toLowerCase().includes(empSelectionSearch.toLowerCase()) || e.id.includes(empSelectionSearch);
      const matchesStatus = empStatusFilter.includes(e.status);
      return matchesSearch && matchesStatus;
    });
  }, [allEmployees, empSelectionSearch, empStatusFilter]);

  const toggleEmpSelection = (id: string) => {
    setSelectedEmpIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllEmps = () => {
    if (selectedEmpIds.size === filteredEmployees.length) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(filteredEmployees.map(e => e.id)));
    }
  };

  const handleSelectActiveOnly = () => {
    setSelectedEmpIds(new Set(filteredEmployees.filter(e => e.status === 'active').map(e => e.id)));
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
            <div key={repo.id} className="p-4 rounded-xl border border-neutral-100 bg-neutral-50 hover:bg-white hover:shadow-md transition-all cursor-pointer group"
              onClick={() => {
                if (repo.type === 'excel') {
                  setExcelType(repo.id.includes('employee') ? 'employee' : 'store'); // Assuming 'stagnant_items' and 'market_basket' are store-related
                  setShowExcelModal(true);
                } else { // PDF reports
                  openPdfLegacy(repo.id); // Use openPdfLegacy which now calls handlePdfGeneration
                }
              }}>
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
                  onClick={() => { setShowReportChoiceModal(false); handlePdfGeneration('monthly_summary'); }} // Dashboard
                  className="w-full py-3 px-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600"
                >
                  لوحة التحكم (PDF)
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReportChoiceModal(false); handlePdfGeneration('yesterday_store'); }} // Yesterday Store
                  className="w-full py-3 px-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600"
                >
                  مبيعات الأمس للمعارض (PDF)
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReportChoiceModal(false); setShowEmpSelectModal(true); }} // Yesterday Employee
                  className="w-full py-3 px-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600"
                >
                  أداء الموظفين (PDF)
                </button>
                <p className="text-sm text-neutral-500">سيتم إنشاء تقرير PDF باستخدام الفلاتر الحالية.</p>
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

      {/* Employee Selection Modal (Image 3) */}
      {showEmpSelectModal && (
        <div className="modal-center-screen" onClick={() => setShowEmpSelectModal(false)}>
          <div className="modal-content max-w-4xl w-full p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
              <div>
                <h4 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                  <span>📄</span> اختيار الموظفين (PDF)
                </h4>
                <p className="text-sm text-neutral-500 mt-1 font-medium">اختر الموظفين للتقرير وأزل المستقيلين</p>
              </div>
              <button type="button" onClick={() => setShowEmpSelectModal(false)} className="p-2 hover:bg-neutral-200 rounded-full transition-colors">
                <XIcon />
              </button>
            </div>

            <div className="p-4 bg-white border-b border-neutral-100">
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex items-center gap-4 bg-neutral-50 px-4 py-2 rounded-lg border border-neutral-100">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={empStatusFilter.includes('active')} onChange={e => {
                      if (e.target.checked) setEmpStatusFilter(p => [...p, 'active']);
                      else setEmpStatusFilter(p => p.filter(s => s !== 'active'));
                    }} className="rounded text-green-600 focus:ring-green-500" />
                    <span className="text-xs font-bold text-neutral-700">موظف نشط</span>
                    <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={empStatusFilter.includes('review')} onChange={e => {
                      if (e.target.checked) setEmpStatusFilter(p => [...p, 'review']);
                      else setEmpStatusFilter(p => p.filter(s => s !== 'review'));
                    }} className="rounded text-amber-500 focus:ring-amber-500" />
                    <span className="text-xs font-bold text-neutral-700">مراجعة (معيار واحد)</span>
                    <div className="w-4 h-4 rounded bg-amber-100 border border-amber-200"></div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={empStatusFilter.includes('resigned')} onChange={e => {
                      if (e.target.checked) setEmpStatusFilter(p => [...p, 'resigned']);
                      else setEmpStatusFilter(p => p.filter(s => s !== 'resigned'));
                    }} className="rounded text-red-500 focus:ring-red-500" />
                    <span className="text-xs font-bold text-neutral-700">مستقيل (معياران)</span>
                    <div className="w-4 h-4 rounded bg-red-100 border border-red-200"></div>
                  </label>
                </div>
                <div className="flex-grow">
                  <input
                    type="text"
                    placeholder="ابحث عن موظف..."
                    className="input w-full h-10 text-sm"
                    value={empSelectionSearch}
                    onChange={e => setEmpSelectionSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="text-neutral-500 font-medium">المحددين: <span className="text-neutral-900 font-bold">{selectedEmpIds.size} من {filteredEmployees.length}</span></div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleSelectAllEmps} className="btn-secondary px-3 py-1.5 text-xs font-bold flex items-center gap-1 border-blue-200 text-blue-700">
                    {selectedEmpIds.size === filteredEmployees.length ? 'إلغاء الكل' : 'تحديد الكل'}
                  </button>
                  <button type="button" onClick={handleSelectActiveOnly} className="btn-secondary px-3 py-1.5 text-xs font-bold flex items-center gap-1">
                    👤 النشطين فقط
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[50vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-800 text-white z-10">
                  <tr>
                    <th className="th text-right">الموظف</th>
                    <th className="th text-right">الفرع</th>
                    <th className="th text-center">المبيعات</th>
                    <th className="th text-center">الحالة</th>
                    <th className="th text-center w-12 text-black">
                      <input type="checkbox" checked={selectedEmpIds.size === filteredEmployees.length && filteredEmployees.length > 0} onChange={handleSelectAllEmps} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredEmployees.map(emp => (
                    <tr key={emp.id} className="hover:bg-neutral-50 transition-colors cursor-pointer" onClick={() => toggleEmpSelection(emp.id)}>
                      <td className="td py-3">
                        <div className="font-bold text-neutral-900">{emp.name}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">{emp.id}</div>
                      </td>
                      <td className="td text-neutral-600 font-medium">{emp.store}</td>
                      <td className="td text-center font-bold text-neutral-900">{formatSAR(emp.sales)}</td>
                      <td className="td text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${emp.status === 'active' ? 'bg-green-100 text-green-700' :
                          emp.status === 'review' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}>
                          {emp.status === 'active' ? 'نشط' : emp.status === 'review' ? 'مراجعة' : 'مستقيل'}
                        </span>
                      </td>
                      <td className="td text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedEmpIds.has(emp.id)} onChange={() => toggleEmpSelection(emp.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex justify-end gap-3">
              <button type="button" onClick={() => setShowEmpSelectModal(false)} className="btn-secondary px-6 font-bold">إلغاء</button>
              <button type="button" className="btn-primary px-8 font-bold flex items-center gap-2 bg-green-600 hover:bg-green-700" onClick={() => {
                if (selectedEmpIds.size === 0) {
                  alert('الرجاء اختيار موظف واحد على الأقل.');
                  return;
                }
                setShowEmpSelectModal(false);
                handlePdfGeneration('yesterday_employee');
              }}>
                📊 إنشاء التقرير
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Export Modal (Image 5) */}
      {showExcelModal && (
        <div className="modal-center-screen" onClick={() => setShowExcelModal(false)}>
          <div className="modal-content max-w-lg w-full p-0 overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-green-700 p-4 flex items-center justify-between text-white">
              <h4 className="text-lg font-bold">تصدير Excel</h4>
              <button type="button" onClick={() => setShowExcelModal(false)} className="hover:bg-green-600 p-1 rounded-full"><XIcon /></button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-2">اختر الفترة:</label>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-neutral-400 w-8">من</span>
                    <input type="date" className="input flex-1 h-10" value={excelRangeStart} onChange={e => setExcelRangeStart(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-neutral-400 w-8">إلى</span>
                    <input type="date" className="input flex-1 h-10" value={excelRangeEnd} onChange={e => setExcelRangeEnd(e.target.value)} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-red-600 mb-3 border-b border-red-50 pb-1">نوع التقرير (Sales Manager Only):</label>
                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-100 hover:border-green-200 hover:bg-green-50/30 cursor-pointer group transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-lg">🏪</div>
                      <span className="text-sm font-bold text-neutral-700">مبيعات المعارض (Store Sales)</span>
                    </div>
                    <input type="radio" name="excelType" checked={excelType === 'store'} onChange={() => setExcelType('store')} className="w-5 h-5 text-green-600" />
                  </label>
                  <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-100 hover:border-green-200 hover:bg-green-50/30 cursor-pointer group transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-lg">👤</div>
                      <span className="text-sm font-bold text-neutral-700">مبيعات الموظفين (Employee Sales)</span>
                    </div>
                    <input type="radio" name="excelType" checked={excelType === 'employee'} onChange={() => setExcelType('employee')} className="w-5 h-5 text-green-600" />
                  </label>
                </div>
              </div>
            </div>

            <div className="p-4 bg-neutral-50 flex gap-3 border-t border-neutral-100">
              <button type="button" className="flex-1 btn-secondary py-2.5 font-bold" onClick={() => setShowExcelModal(false)}>إلغاء</button>
              <button type="button" className="flex-1 bg-green-700 text-white font-bold rounded-xl py-2.5 hover:bg-green-800 disabled:opacity-50 shadow-md" onClick={runExcelExport} disabled={excelExporting}>
                {excelExporting ? 'جاري التصدير...' : 'تصدير (Export)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print-only View */}
      {printData && (
        <div className="fixed inset-0 bg-white z-[9999] p-8 overflow-y-auto print-view" dir="rtl">
          <div className="flex justify-between items-center border-b-4 border-orange-600 pb-4 mb-6">
            <div>
              <h1 className="text-3xl font-black text-neutral-900">{printData.title}</h1>
              <p className="text-neutral-500 font-bold mt-1">الفترة: {printData.range} | استخرج بواسطة: {user?.name}</p>
            </div>
            <div className="text-left">
              <div className="text-2xl font-black text-orange-600 italic">ORA COCKPIT</div>
              <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Business Intelligence Report</div>
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-900 text-white print:bg-neutral-900 border-b-2 border-orange-600">
                <th className="p-3 text-right">#</th>
                <th className="p-3 text-right">{printData.type === 'stores' ? 'المعرض' : 'الموظف'}</th>
                {printData.type === 'stores' && <th className="p-3 text-center">الهدف</th>}
                <th className="p-3 text-center">المبيعات</th>
                <th className="p-3 text-center">الفواتير</th>
                <th className="p-3 text-center">متوسط الفاتورة</th>
                {printData.type === 'stores' && <th className="p-3 text-center">التحويل %</th>}
                {printData.type === 'stores' && <th className="p-3 text-center">التحقيق %</th>}
                {printData.type === 'employees' && <th className="p-3 text-center">المعرض</th>}
              </tr>
            </thead>
            <tbody>
              {printData.rows.map((row, idx) => (
                <tr key={idx} className="border-b border-neutral-200 hover:bg-neutral-50 even:bg-neutral-50">
                  <td className="p-3 text-neutral-500 font-bold">{idx + 1}</td>
                  <td className="p-3 font-black text-neutral-900">{row.name}</td>
                  {printData.type === 'stores' && <td className="p-3 text-center font-mono">{formatSAR(row.target)}</td>}
                  <td className="p-3 text-center font-black text-green-700 font-mono">{formatSAR(row.sales)}</td>
                  <td className="p-3 text-center font-bold text-neutral-700">{row.trans}</td>
                  <td className="p-3 text-center font-bold text-neutral-900 font-mono">{formatSAR(row.avgInv || (row.trans > 0 ? row.sales / row.trans : 0))}</td>
                  {printData.type === 'stores' && <td className="p-3 text-center font-black text-orange-600">{(row.conversion || 0).toFixed(1)}%</td>}
                  {printData.type === 'stores' && (
                    <td className="p-3 text-center">
                      <span className={`font-black ${row.ach >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                        {(row.ach || 0).toFixed(1)}%
                      </span>
                    </td>
                  )}
                  {printData.type === 'employees' && <td className="p-3 text-center text-neutral-600 font-medium">{row.store}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 pt-6 border-t border-neutral-100 flex justify-between items-center text-[10px] text-neutral-400 font-bold uppercase">
            <div>Generated on {new Date().toLocaleString()}</div>
            <div>Copyright &copy; {new Date().getFullYear()} ORA Cockpit</div>
          </div>

          <style dangerouslySetInnerHTML={{
            __html: `
            @media print {
              @page { size: A4; margin: 1cm; }
              body * { visibility: hidden; }
              .print-view, .print-view * { visibility: visible; }
              .print-view { position: absolute; left: 0; top: 0; width: 100%; border: none; padding: 0; }
              .bg-neutral-900 { background-color: #171717 !important; -webkit-print-color-adjust: exact; }
              .text-white { color: white !important; }
              .text-green-700 { color: #15803d !important; }
              .text-orange-600 { color: #ea580c !important; }
              .bg-neutral-50 { background-color: #fafafa !important; }
            }
          ` }} />
        </div>
      )}
    </div>
  );
}
