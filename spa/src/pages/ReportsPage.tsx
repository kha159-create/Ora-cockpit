import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { generateGlobalSalesPDF, generateEmployeePerformancePDF, generateDailyReportPDF, generateStoreReportWithDaily, generateEmployeeReportByStore } from '../services/pdf/pdfService';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';

import { getCurrentUser } from '../auth/storage';
import { getPrevYearDate, getPrevYearRange } from '../utils/seasons';
import * as XLSX from 'xlsx';

type FilterMode = 'mtd' | 'yesterday' | 'today' | 'standard' | 'custom';

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

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
    const endMtd = yesterday.getMonth() !== today.getMonth() ? today : yesterday;
    return { start: toYMD(start), end: toYMD(endMtd) };
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

function normalizeTargetsByMonth(employeesJson: any) {
  const direct = employeesJson?.targets_by_month;
  if (direct && typeof direct === 'object') return direct as Record<string, Record<string, number>>;

  const monthlyTargets = employeesJson?.monthly_targets;
  const byMonth: Record<string, Record<string, number>> = {};
  if (monthlyTargets && typeof monthlyTargets === 'object') {
    for (const [empIdRaw, mp] of Object.entries(monthlyTargets)) {
      if (!mp || typeof mp !== 'object') continue;
      const empId = String(empIdRaw);
      for (const [monthStart, val] of Object.entries(mp as Record<string, number>)) {
        const monthKey = String(monthStart).substring(0, 7);
        if (!byMonth[monthKey]) byMonth[monthKey] = {};
        byMonth[monthKey][empId] = Number(val) || 0;
      }
    }
  }
  return byMonth;
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
  const [previewReport, setPreviewReport] = useState<{ type: string; data: any } | null>(null);

  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetEmpList, setTargetEmpList] = useState<any[]>([]);
  const [targetSelected, setTargetSelected] = useState<Set<string>>(new Set());

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

  // Role enforcement: non-Admin/Auditor users are scoped to their own stores
  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const managers = useMemo(() => {
    if (!rawMgmt?.store_meta) return [];
    const set = new Set<string>();
    Object.values(rawMgmt.store_meta).forEach((m: any) => m?.manager && set.add(m.manager));
    return Array.from(set).sort();
  }, [rawMgmt]);

  const cities = useMemo(() => {
    if (!rawMgmt?.store_meta) return [];
    const set = new Set<string>();
    Object.values(rawMgmt.store_meta).forEach((m: any) => {
      if (effectiveManager === 'all' || (m?.manager && m.manager === effectiveManager)) {
        if (m?.city) set.add(m.city);
      }
    });
    return Array.from(set).sort();
  }, [rawMgmt, effectiveManager]);

  const branches = useMemo(() => {
    if (!rawMgmt?.stores || !rawMgmt?.store_meta) return [];
    return Object.entries(rawMgmt.stores)
      .filter(([id]) => {
        const meta = (rawMgmt.store_meta as Record<string, { manager?: string; city?: string }>)[id];
        if (effectiveManager !== 'all' && (meta?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && (meta?.city || '') !== city) return false;
        return true;
      })
      .map(([id, name]) => ({ id, name: (name as string) || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawMgmt, effectiveManager, city]);

  if (!rawMgmt || !rawEmp) {
    return <DashboardSkeleton />;
  }

  const passFilter = (storeId: string) => {
    if (branch !== 'all' && storeId !== branch) return false;
    const meta = rawMgmt?.store_meta?.[storeId] || {};
    if (effectiveManager !== 'all' && meta.manager !== effectiveManager) return false;
    if (city !== 'all' && meta.city !== city) return false;
    if (storeType !== 'all') {
      const type = String(meta.type || '').toLowerCase();
      const isOnline = type === 'online' || type === 'platform' || type === 'warehouse';
      if (storeType === 'online' && !isOnline) return false;
      if (storeType === 'store' && isOnline) return false;
    }
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
      const prevRange = {
        start: r.date.replace(/^\d{4}/, (y) => String(Number(y) - 1)),
        end: r.date.replace(/^\d{4}/, (y) => String(Number(y) - 1))
      };
      let prevSales = 0;
      let prevVisitors = 0;
      (rawMgmt.sales || []).forEach(([d, s, v]: any[]) => {
        if (d === prevRange.start && s === r.storeId) prevSales += v || 0;
      });
      (rawMgmt.visitors || []).forEach(([d, s, v]: any[]) => {
        if (d === prevRange.start && s === r.storeId) prevVisitors += v || 0;
      });

      const growth = prevSales > 0 ? ((r.sales - prevSales) / prevSales) * 100 : 0;
      const customerValue = r.visitors > 0 ? r.sales / r.visitors : 0;

      const meta = rawMgmt.store_meta?.[r.storeId] || {};
      return {
        'التاريخ': r.date,
        'المعرض': rawMgmt.stores?.[r.storeId] || r.storeId,
        'المدينة': meta.city || '-',
        'مدير المنطقة': meta.manager || '-',
        'المبيعات الحالية': r.sales,
        'مبيعات العام الماضي': prevSales,
        'النمو %': growth.toFixed(1) + '%',
        'عدد الفواتير': r.trans,
        'الزوار': r.visitors,
        'زوار العام الماضي': prevVisitors,
        'متوسط الفاتورة': r.trans > 0 ? Math.round(r.sales / r.trans) : 0,
        'نسبة التحويل': r.visitors > 0 ? ((r.trans / r.visitors) * 100).toFixed(1) + '%' : '0%',
        'قيمة العميل': Math.round(customerValue)
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

  const generateGlobalSummary = () => {
    if (!rawMgmt) return;
    const days: string[] = [];
    let curr = new Date(range.start);
    const end = new Date(range.end);
    while (curr <= end) {
      days.push(toYMD(curr));
      curr.setDate(curr.getDate() + 1);
    }

    const reportData = days.map(d => {
      const dPrev = getPrevYearDate(d);

      let s = 0, sPrev = 0, t = 0, v = 0, vPrev = 0;
      (rawMgmt.sales || []).forEach(([dt, sid, val]: any[]) => {
        if (passFilter(sid)) {
          if (dt === d) s += val || 0;
          if (dt === dPrev) sPrev += val || 0;
        }
      });
      (rawMgmt.transactions || []).forEach(([dt, sid, val]: any[]) => {
        if (passFilter(sid) && dt === d) t += val || 0;
      });
      (rawMgmt.visitors || []).forEach(([dt, sid, val]: any[]) => {
        if (passFilter(sid)) {
          if (dt === d) v += val || 0;
          if (dt === dPrev) vPrev += val || 0;
        }
      });

      return {
        date: d,
        sales: s,
        salesPrev: sPrev,
        growth: sPrev > 0 ? ((s - sPrev) / sPrev) * 100 : 0,
        trans: t,
        avgInv: t > 0 ? s / t : 0,
        customerValue: v > 0 ? s / v : 0,
        visitors: v,
        visitorsPrev: vPrev,
        conversion: v > 0 ? (t / v) * 100 : 0
      };
    });

    setPreviewReport({ type: 'global', data: reportData });
    setShowReportChoiceModal(false);
  };

  const generateEmployeePerformance = () => {
    if (!rawMgmt || !rawEmp) return;
    const history = rawEmp.history || {};
    const names = rawEmp.employee_names || {};
    const targets = rawEmp.targets || {};
    const targetsByMonth = normalizeTargetsByMonth(rawEmp);
    const storesMap = rawMgmt.stores || {};

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yStr = toYMD(yesterday);

    // MTD month-boundary fix
    const mtdStartObj = new Date(today.getFullYear(), today.getMonth(), 1);
    const mtdEndObj = yesterday.getMonth() !== today.getMonth() ? today : yesterday;
    const mtdStart = toYMD(mtdStartObj);
    const mtdEndStr = toYMD(mtdEndObj);

    const targetMonthKey = range.start.substring(0, 7);
    const getTarget = (rawId: string) => {
      const id = String(rawId || '').split('-')[0].trim();
      const padded = id.padStart(4, '0');
      // Check if employee is tracked in monthly targets at all
      const hasMonthlyTarget = Object.values(targetsByMonth).some(m => m[id] != null || m[padded] != null);
      if (hasMonthlyTarget) {
        if (targetsByMonth[targetMonthKey]) {
          if (targetsByMonth[targetMonthKey][id] != null) return targetsByMonth[targetMonthKey][id];
          if (targetsByMonth[targetMonthKey][padded] != null) return targetsByMonth[targetMonthKey][padded];
        }
        return 0; // Tracked monthly, but no target for this specific month = 0
      }
      return targets[id] || targets[padded] || 0;
    };

    // Group employees by store
    const byStore: Record<string, Record<string, any>> = {};

    Object.entries(history).forEach(([sid, recs]: [string, any]) => {
      if (!passFilter(sid)) return;
      if (!byStore[sid]) byStore[sid] = {};

      (recs || []).forEach(([dt, eid, s, t]: any[]) => {
        const empId = String(eid || '').split('-')[0].trim();
        if (!empId || empId === 'مرتجع') return;

        if (!byStore[sid][empId]) {
          byStore[sid][empId] = {
            name: names[empId] || names[empId.padStart(4, '0')] || eid,
            ySales: 0, yTrans: 0,
            mSales: 0, mTrans: 0,
            target: getTarget(empId)
          };
        }
        if (dt === yStr) {
          byStore[sid][empId].ySales += s || 0;
          byStore[sid][empId].yTrans += t || 0;
        }
        if (dt >= mtdStart && dt <= mtdEndStr) {
          byStore[sid][empId].mSales += s || 0;
          byStore[sid][empId].mTrans += t || 0;
        }
      });
    });

    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const remainingDays = Math.max(0, daysInMonth - yesterday.getDate());

    // Build store employee data
    const storesData = Object.entries(byStore)
      .filter(([, emps]) => Object.keys(emps).length > 0)
      .map(([storeId, emps]) => {
        const storeTotalYSales = Object.values(emps).reduce((s: number, e: any) => s + (e.ySales || 0), 0);
        const storeTotalMSales = Object.values(emps).reduce((s: number, e: any) => s + (e.mSales || 0), 0);

        const employees = Object.values(emps).map((e: any) => {
          const remaining = Math.max(0, e.target - e.mSales);
          return {
            name: e.name,
            ySales: e.ySales,
            yShare: storeTotalYSales > 0 ? (e.ySales / storeTotalYSales * 100) : 0,
            yTrans: e.yTrans,
            yAvgInv: e.yTrans > 0 ? e.ySales / e.yTrans : 0,
            mSales: e.mSales,
            mShare: storeTotalMSales > 0 ? (e.mSales / storeTotalMSales * 100) : 0,
            mTrans: e.mTrans,
            mAvgInv: e.mTrans > 0 ? e.mSales / e.mTrans : 0,
            target: e.target,
            achievement: e.target > 0 ? (e.mSales / e.target * 100) : 0,
            remaining,
            dailyReq: remainingDays > 0 ? remaining / remainingDays : 0
          };
        }).sort((a: any, b: any) => b.mSales - a.mSales);

        return {
          storeId,
          storeName: storesMap[storeId] || storeId,
          employees
        };
      })
      .sort((a, b) => {
        const aSales = a.employees.reduce((s, e) => s + e.mSales, 0);
        const bSales = b.employees.reduce((s, e) => s + e.mSales, 0);
        return bSales - aSales;
      });

    setPreviewReport({ type: 'employee', data: storesData });
    setShowReportChoiceModal(false);
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

  const handlePdfGeneration = (type: 'yesterday_store' | 'yesterday_employee' | 'monthly_summary') => {
    if (!rawMgmt) return;
    const { start, end } = range;
    let title = '';
    let rows: any[] = [];

    // Helper for date ranges (seasonal-aware)
    const prevRange = getPrevYearRange(range.start, range.end);
    const inRange = (d: string) => d >= range.start && d <= range.end;
    const inPrevRange = (d: string) => d >= prevRange.start && d <= prevRange.end;

    if (type === 'monthly_summary') {
      // Global Summary (Time Series)
      title = `الملخص العام (${start} إلى ${end})`;
      const dateMap: Record<string, any> = {};

      // Initialize dates in range
      let curr = new Date(start);
      const last = new Date(end);
      while (curr <= last) {
        const d = toYMD(curr);
        dateMap[d] = { date: d, sales: 0, salesPrev: 0, trans: 0, visitors: 0, visitorsPrev: 0, avgInv: 0, customerValue: 0, conversion: 0 };
        curr.setDate(curr.getDate() + 1);
      }

      // Build reverse mapping: prevDate -> currentDate for seasonal alignment
      const prevToCurrentMap: Record<string, string> = {};
      Object.keys(dateMap).forEach(dt => {
        prevToCurrentMap[getPrevYearDate(dt)] = dt;
      });

      // Aggregate functionality (with store filter)
      const processMetric = (source: any[], field: string, isPrevField?: string) => {
        (source || []).forEach(([d, sid, v]: any[]) => {
          if (!passFilter(sid)) return;
          if (dateMap[d]) dateMap[d][field] += v || 0;

          // Map previous year date to current year date for alignment
          if (isPrevField && inPrevRange(d)) {
            const currDate = prevToCurrentMap[d];
            if (currDate && dateMap[currDate]) dateMap[currDate][isPrevField] += v || 0;
          }
        });
      };

      processMetric(rawMgmt.sales, 'sales', 'salesPrev');
      processMetric(rawMgmt.visitors, 'visitors', 'visitorsPrev');
      processMetric(rawMgmt.transactions, 'trans');

      rows = Object.values(dateMap).map(r => ({
        ...r,
        avgInv: r.trans > 0 ? r.sales / r.trans : 0,
        customerValue: r.visitors > 0 ? r.sales / r.visitors : 0,
        conversion: r.visitors > 0 ? (r.trans / r.visitors) * 100 : 0,
        growth: r.salesPrev > 0 ? ((r.sales - r.salesPrev) / r.salesPrev) * 100 : 0
      })).sort((a, b) => a.date.localeCompare(b.date));

      setPreviewReport({ type: 'global', data: rows });

    } else if (type === 'yesterday_store') {
      // Store List Report
      title = `تقرير المعارض (${start})`;
      const dataMap: Record<string, any> = {};

      (rawMgmt.sales || []).forEach(([d, s, v]: any[]) => {
        if (!passFilter(s)) return;
        if (!dataMap[s]) dataMap[s] = { name: rawMgmt.stores?.[s] || s, sales: 0, prevSales: 0, trans: 0, visitors: 0, prevVisitors: 0, target: 0 };
        if (inRange(d)) dataMap[s].sales += v || 0;
        if (inPrevRange(d)) dataMap[s].prevSales += v || 0;
      });
      (rawMgmt.transactions || []).forEach(([d, s, v]: any[]) => {
        if (inRange(d) && passFilter(s)) {
          if (!dataMap[s]) dataMap[s] = { name: rawMgmt.stores?.[s] || s, sales: 0, prevSales: 0, trans: 0, visitors: 0, prevVisitors: 0, target: 0 };
          dataMap[s].trans += v || 0;
        }
      });
      (rawMgmt.visitors || []).forEach(([d, s, v]: any[]) => {
        if (!passFilter(s)) return;
        if (!dataMap[s]) dataMap[s] = { name: rawMgmt.stores?.[s] || s, sales: 0, prevSales: 0, trans: 0, visitors: 0, prevVisitors: 0, target: 0 };
        if (inRange(d)) dataMap[s].visitors += v || 0;
        if (inPrevRange(d)) dataMap[s].prevVisitors += v || 0;
      });
      (rawMgmt.targets || []).forEach(([d, s, v]: any[]) => {
        if (inRange(d) && passFilter(s)) {
          if (!dataMap[s]) dataMap[s] = { name: rawMgmt.stores?.[s] || s, sales: 0, prevSales: 0, trans: 0, visitors: 0, prevVisitors: 0, target: 0 };
          dataMap[s].target += v || 0;
        }
      });

      const today2 = new Date();
      const daysInMonth2 = new Date(today2.getFullYear(), today2.getMonth() + 1, 0).getDate();
      const remainingDays2 = Math.max(0, daysInMonth2 - today2.getDate() + 1);

      rows = Object.values(dataMap).map(r => {
        const remaining = Math.max(0, r.target - r.sales);
        return {
          ...r,
          avgInv: r.trans > 0 ? r.sales / r.trans : 0,
          ach: r.target > 0 ? (r.sales / r.target) * 100 : 0,
          conversion: r.visitors > 0 ? (r.trans / r.visitors) * 100 : 0,
          growth: r.prevSales > 0 ? ((r.sales - r.prevSales) / r.prevSales) * 100 : 0,
          customerValue: r.visitors > 0 ? r.sales / r.visitors : 0,
          dailyReq: remainingDays2 > 0 && remaining > 0 ? remaining / remainingDays2 : 0,
        };
      }).sort((a, b) => b.sales - a.sales);

      setPreviewReport({ type: 'stores', data: rows });

    } else if (type === 'yesterday_employee') {
      const today = new Date();
      const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayYMD = toYMD(yesterdayDate);
      const mtdStartYMD = toYMD(new Date(today.getFullYear(), today.getMonth(), 1));

      title = `أداء الموظفين (أمس vs MTD)`;
      const history = rawEmp?.history || {};
      const names = rawEmp?.employee_names || {};
      const targets = rawEmp?.targets || {};
      const targetsByMonth = normalizeTargetsByMonth(rawEmp);
      const selectedIdsArray = Array.from(selectedEmpIds);
      const storesMap = rawMgmt.stores || {};

      const mtdEndObj = yesterdayDate.getMonth() !== today.getMonth() ? today : yesterdayDate;
      const mtdEndStr = toYMD(mtdEndObj);
      const targetMonthKey = range.start.substring(0, 7);

      const getTarget = (rawId: string) => {
        const id = String(rawId || '').split('-')[0].trim();
        const padded = id.padStart(4, '0');
        const hasMonthlyTarget = Object.values(targetsByMonth).some(m => m[id] != null || m[padded] != null);
        if (hasMonthlyTarget) {
          if (targetsByMonth[targetMonthKey]) {
            if (targetsByMonth[targetMonthKey][id] != null) return targetsByMonth[targetMonthKey][id];
            if (targetsByMonth[targetMonthKey][padded] != null) return targetsByMonth[targetMonthKey][padded];
          }
          return 0;
        }
        return targets[id] || targets[padded] || 0;
      };

      // Group by store → employees (same structure as generateEmployeePerformance)
      const byStore: Record<string, Record<string, any>> = {};

      Object.entries(history).forEach(([sid, recs]: [string, any]) => {
        if (!passFilter(sid)) return;
        if (!byStore[sid]) byStore[sid] = {};

        (recs || []).forEach((rec: any[]) => {
          const d = rec[0];
          const rawId = String(rec[1] || '').split('-')[0].trim();
          const id = rawId.padStart(4, '0');
          if (rawId === 'مرتجع') return;
          if (selectedIdsArray.length > 0 && !selectedIdsArray.includes(id)) return;

          if (!byStore[sid][id]) {
            byStore[sid][id] = {
              name: names[id] || names[rawId] || rawId,
              ySales: 0, yTrans: 0,
              mSales: 0, mTrans: 0,
              target: getTarget(id)
            };
          }
          const sales = Number(rec[2]) || 0;
          const trans = Number(rec[3]) || 0;

          if (d === yesterdayYMD) {
            byStore[sid][id].ySales += sales;
            byStore[sid][id].yTrans += trans;
          }
          if (d >= mtdStartYMD && d <= mtdEndStr) {
            byStore[sid][id].mSales += sales;
            byStore[sid][id].mTrans += trans;
          }
        });
      });

      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const remainingDays3 = Math.max(0, daysInMonth - yesterdayDate.getDate());

      const storesData = Object.entries(byStore)
        .filter(([, emps]) => Object.keys(emps).length > 0)
        .map(([storeId, emps]) => {
          const storeTotalY = Object.values(emps).reduce((s: number, e: any) => s + (e.ySales || 0), 0);
          const storeTotalM = Object.values(emps).reduce((s: number, e: any) => s + (e.mSales || 0), 0);

          const employees = Object.values(emps).map((e: any) => {
            const remaining = Math.max(0, e.target - e.mSales);
            return {
              name: e.name,
              ySales: e.ySales,
              yShare: storeTotalY > 0 ? (e.ySales / storeTotalY * 100) : 0,
              yTrans: e.yTrans,
              yAvgInv: e.yTrans > 0 ? e.ySales / e.yTrans : 0,
              mSales: e.mSales,
              mShare: storeTotalM > 0 ? (e.mSales / storeTotalM * 100) : 0,
              mTrans: e.mTrans,
              mAvgInv: e.mTrans > 0 ? e.mSales / e.mTrans : 0,
              target: e.target,
              achievement: e.target > 0 ? (e.mSales / e.target * 100) : 0,
              remaining,
              dailyReq: remainingDays3 > 0 ? remaining / remainingDays3 : 0
            };
          }).sort((a: any, b: any) => b.mSales - a.mSales);

          return { storeId, storeName: storesMap[storeId] || storeId, employees };
        })
        .sort((a, b) => {
          const aSales = a.employees.reduce((s, e) => s + e.mSales, 0);
          const bSales = b.employees.reduce((s, e) => s + e.mSales, 0);
          return bSales - aSales;
        });

      setPreviewReport({ type: 'employee', data: storesData });
    }
  };
  // ===== Target Template Modal Logic =====
  const openTargetTemplateModal = () => {
    if (!rawEmp || !rawMgmt) return;
    const history = rawEmp.history || {};
    const names = rawEmp.employee_names || {};
    const targets = rawEmp.targets || {};
    const targetsByMonth = normalizeTargetsByMonth(rawEmp);
    const storesMap = rawMgmt.stores || {};

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const mtdStart = toYMD(new Date(today.getFullYear(), today.getMonth(), 1));
    const mtdEndObj = yesterday.getMonth() !== today.getMonth() ? today : yesterday;
    const mtdEndStr = toYMD(mtdEndObj);
    const targetMonthKey = range.start.substring(0, 7);

    const getTarget = (rawId: string) => {
      const id = String(rawId || '').split('-')[0].trim();
      const padded = id.padStart(4, '0');
      if (targetsByMonth[targetMonthKey]) {
        if (targetsByMonth[targetMonthKey][id] != null) return targetsByMonth[targetMonthKey][id];
        if (targetsByMonth[targetMonthKey][padded] != null) return targetsByMonth[targetMonthKey][padded];
      }
      return targets[id] || targets[padded] || 0;
    };

    // Build employee list with MTD sales
    const empMap: Record<string, any> = {};
    Object.entries(history).forEach(([sid, recs]: [string, any]) => {
      if (!passFilter(sid)) return;
      (recs || []).forEach((rec: any[]) => {
        const d = rec[0];
        const rawId = String(rec[1] || '').split('-')[0].trim();
        if (!rawId || rawId === 'مرتجع') return;
        const id = rawId.padStart(4, '0');
        const sales = Number(rec[2]) || 0;
        const trans = Number(rec[3]) || 0;

        if (!empMap[id]) {
          empMap[id] = {
            id,
            name: names[id] || names[rawId] || rawId,
            storeId: sid,
            storeName: storesMap[sid] || sid,
            mtdSales: 0,
            mtdTrans: 0,
            target: getTarget(id),
            active: false,
          };
        }
        if (d >= mtdStart && d <= mtdEndStr) {
          empMap[id].mtdSales += sales;
          empMap[id].mtdTrans += trans;
          if (sales > 0) empMap[id].active = true;
        }
      });
    });

    const list = Object.values(empMap).sort((a: any, b: any) => b.mtdSales - a.mtdSales);
    setTargetEmpList(list);
    // Default: select active employees
    setTargetSelected(new Set(list.filter((e: any) => e.active).map((e: any) => e.id)));
    setShowTargetModal(true);
  };

  const exportTargetTemplate = () => {
    const selectedEmps = targetEmpList.filter((e: any) => targetSelected.has(e.id));
    if (selectedEmps.length === 0) { alert('الرجاء اختيار موظف واحد على الأقل'); return; }

    const data = selectedEmps.map((e: any) => ({
      'Employee ID': String(e.id).replace(/unknown/gi, '').replace(/unkown/gi, '').trim(),
      'Employee Name': e.name,
      'Store': e.storeName,
      'Current Target': e.target || '',
      'Target Amount': '', // Empty for user input
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Targets Template');

    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthName = nextMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    XLSX.writeFile(wb, `Target_Template_${monthName}.xlsx`);
    setShowTargetModal(false);
  };

  const openReportChoice = (type: 'pdf' | 'excel') => {
    setReportChoiceType(type);
    setShowReportChoiceModal(true);
  };





  const canExportEmployee = !!user;

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
            {isAdminOrAuditor(user?.role) && (
              <div>
                <label className="block text-sm font-semibold text-neutral-700">مدير المنطقة</label>
                <select className="input mt-1" value={manager} onChange={(e) => setManager(e.target.value)}>
                  <option value="all">الكل</option>
                  {managers.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-neutral-700">نوع المعرض</label>
              <select className="input mt-1" value={storeType} onChange={(e) => setStoreType(e.target.value)}>
                <option value="all">الكل</option>
                <option value="store">المعارض فقط</option>
                <option value="online">الأونلاين فقط</option>
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
      </div >

      {/* تقارير المعارض */}
      < div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6" >
        <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">🏪</span> تقارير المعارض
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => handlePdfGeneration('yesterday_store')}
            className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-red-400 transition-all group"
          >
            <div className="text-red-500 text-2xl mb-2">📄</div>
            <h5 className="font-bold text-neutral-800 text-sm">تقرير المعارض</h5>
            <p className="text-xs text-neutral-500 mt-1">PDF - مقارنة المبيعات والنمو</p>
          </button>
          <button
            type="button"
            onClick={() => { setExcelType('store'); setShowExcelModal(true); }}
            className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-green-400 transition-all group"
          >
            <div className="text-green-600 text-2xl mb-2">📊</div>
            <h5 className="font-bold text-neutral-800 text-sm">بيانات المعارض</h5>
            <p className="text-xs text-neutral-500 mt-1">Excel - بيانات تفصيلية</p>
          </button>
          <button
            type="button"
            onClick={generateGlobalSummary}
            className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-amber-400 transition-all group"
          >
            <div className="text-amber-600 text-2xl mb-2">📈</div>
            <h5 className="font-bold text-neutral-800 text-sm">ملخص عام</h5>
            <p className="text-xs text-neutral-500 mt-1">PDF - تحليل الأداء اليومي</p>
          </button>
          <button
            type="button"
            onClick={() => handlePdfGeneration('monthly_summary')}
            className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-blue-400 transition-all group"
          >
            <div className="text-blue-600 text-2xl mb-2">📊</div>
            <h5 className="font-bold text-neutral-800 text-sm">التقرير الشهري</h5>
            <p className="text-xs text-neutral-500 mt-1">PDF - ملخص الشهر</p>
          </button>
        </div>
      </div >

      {/* تقارير الموظفين */}
      {
        canExportEmployee && (
          <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
            <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">👥</span> تقارير الموظفين
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => generateEmployeePerformance()}
                className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-purple-400 transition-all group"
              >
                <div className="text-purple-500 text-2xl mb-2">📄</div>
                <h5 className="font-bold text-neutral-800 text-sm">أداء الموظفين</h5>
                <p className="text-xs text-neutral-500 mt-1">PDF - أمس والشهر الحالي</p>
              </button>
              <button
                type="button"
                onClick={() => { setExcelType('employee'); setShowExcelModal(true); }}
                className="bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-teal-400 transition-all group"
              >
                <div className="text-teal-600 text-2xl mb-2">📊</div>
                <h5 className="font-bold text-neutral-800 text-sm">بيانات الموظفين</h5>
                <p className="text-xs text-neutral-500 mt-1">Excel - مبيعات تفصيلية</p>
              </button>
              <button
                type="button"
                onClick={() => handlePdfGeneration('yesterday_employee')}
                className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-indigo-400 transition-all group"
              >
                <div className="text-indigo-500 text-2xl mb-2">👤</div>
                <h5 className="font-bold text-neutral-800 text-sm">تقرير أمس</h5>
                <p className="text-xs text-neutral-500 mt-1">PDF - مقارنة الأمس بالشهر</p>
              </button>
              <button
                type="button"
                onClick={openTargetTemplateModal}
                className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-emerald-400 transition-all group"
              >
                <div className="text-emerald-600 text-2xl mb-2">🎯</div>
                <h5 className="font-bold text-neutral-800 text-sm">قالب تارجت الشهر القادم</h5>
                <p className="text-xs text-neutral-500 mt-1">Excel - اختيار الموظفين وتصدير القالب</p>
              </button>
            </div>
          </div>
        )
      }

      {/* تقارير أخرى */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">📦</span> تقارير أخرى
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            to="/offers"
            className="bg-gradient-to-br from-pink-50 to-pink-100 border border-pink-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-pink-400 transition-all group block"
          >
            <div className="text-pink-500 text-2xl mb-2">🏷️</div>
            <h5 className="font-bold text-neutral-800 text-sm">تحليل العروض</h5>
            <p className="text-xs text-neutral-500 mt-1">مبيعات العروض والخصومات</p>
          </Link>
          <Link
            to="/products"
            className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-orange-400 transition-all group block"
          >
            <div className="text-orange-500 text-2xl mb-2">📦</div>
            <h5 className="font-bold text-neutral-800 text-sm">تحليل المنتجات</h5>
            <p className="text-xs text-neutral-500 mt-1">أداء المنتجات والأصناف</p>
          </Link>
          <Link
            to="/stores"
            className="bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-cyan-400 transition-all group block"
          >
            <div className="text-cyan-500 text-2xl mb-2">🏬</div>
            <h5 className="font-bold text-neutral-800 text-sm">تفاصيل المعارض</h5>
            <p className="text-xs text-neutral-500 mt-1">بيانات الفروع</p>
          </Link>
          <Link
            to="/employees"
            className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-4 text-center hover:shadow-lg hover:border-slate-400 transition-all group block"
          >
            <div className="text-slate-500 text-2xl mb-2">👥</div>
            <h5 className="font-bold text-neutral-800 text-sm">أداء الموظفين</h5>
            <p className="text-xs text-neutral-500 mt-1">بيانات الموظفين التفصيلية</p>
          </Link>
        </div>
      </div>

      {/* Report type choice modal */}
      {
        showReportChoiceModal && reportChoiceType && (
          <div className="modal-center-screen" onClick={() => setShowReportChoiceModal(false)}>
            <div className="modal-content max-w-md w-full p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
              <h5 className="font-bold text-lg text-neutral-900 mb-4">
                {reportChoiceType === 'pdf' ? 'اختر التقرير للمعاينة' : 'اختر تقرير Excel'}
              </h5>
              {reportChoiceType === 'pdf' ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={generateGlobalSummary}
                    className="w-full py-3 px-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600"
                  >
                    فتح تقرير ملخص عام (Global Summary)
                  </button>
                  {canExportEmployee && (
                    <button
                      type="button"
                      onClick={() => { generateEmployeePerformance(); setShowReportChoiceModal(false); }}
                      className="w-full py-3 px-4 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700"
                    >
                      فتح تقرير أداء الموظفين (Employee Performance)
                    </button>
                  )}
                  <p className="text-sm text-neutral-500">سيتم فتح التقرير للمراجعة أولاً، ثم يمكنك اختيار الطباعة.</p>
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
        )
      }

      {/* Excel confirm modal */}
      {
        showExcelModal && (
          <div className="modal-center-screen" onClick={() => setShowExcelModal(false)}>
            <div className="modal-content max-w-md w-full p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
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
        )
      }

      {/* Target Template Modal */}
      {
        showTargetModal && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setShowTargetModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-neutral-100 bg-neutral-50">
                <h3 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
                  🎯 اختيار الموظفين لقالب التارجت
                </h3>
                <p className="text-sm text-neutral-500 mt-1">اختر الموظفين الذين تريد تضمينهم في قالب الشهر القادم</p>
              </div>

              <div className="p-4 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200"
                    onClick={() => setTargetSelected(new Set(targetEmpList.map((e: any) => e.id)))}
                  >
                    تحديد الكل
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                    onClick={() => setTargetSelected(new Set())}
                  >
                    إلغاء الكل
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-100 text-green-700 hover:bg-green-200"
                    onClick={() => setTargetSelected(new Set(targetEmpList.filter((e: any) => e.active).map((e: any) => e.id)))}
                  >
                    النشطين فقط
                  </button>
                </div>
                <div className="text-sm text-neutral-500">
                  المحددين: <span className="font-bold text-neutral-800">{targetSelected.size}</span> من <span className="font-bold">{targetEmpList.length}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-800 text-white">
                    <tr>
                      <th className="p-2 text-center w-10">
                        <input
                          type="checkbox"
                          checked={targetSelected.size === targetEmpList.length && targetEmpList.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setTargetSelected(new Set(targetEmpList.map((emp: any) => emp.id)));
                            else setTargetSelected(new Set());
                          }}
                        />
                      </th>
                      <th className="p-2 text-right">الموظف</th>
                      <th className="p-2 text-right">الفرع</th>
                      <th className="p-2 text-center">المبيعات (MTD)</th>
                      <th className="p-2 text-center">التارجت الحالي</th>
                      <th className="p-2 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {targetEmpList.map((emp: any) => {
                      const isSelected = targetSelected.has(emp.id);
                      const bgClass = emp.active ? '' : 'bg-red-50';
                      return (
                        <tr
                          key={emp.id}
                          className={`hover:bg-neutral-50 cursor-pointer ${bgClass}`}
                          onClick={() => {
                            const next = new Set(targetSelected);
                            if (next.has(emp.id)) next.delete(emp.id);
                            else next.add(emp.id);
                            setTargetSelected(next);
                          }}
                        >
                          <td className="p-2 text-center">
                            <input type="checkbox" checked={isSelected} readOnly />
                          </td>
                          <td className="p-2 font-medium text-neutral-800">{emp.name}</td>
                          <td className="p-2 text-neutral-600">{emp.storeName}</td>
                          <td className="p-2 text-center font-mono">{Math.round(emp.mtdSales).toLocaleString()}</td>
                          <td className="p-2 text-center font-mono text-neutral-500">{emp.target ? Math.round(emp.target).toLocaleString() : '-'}</td>
                          <td className="p-2 text-center">
                            {emp.active ? (
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">نشط</span>
                            ) : (
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-600">غير نشط</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-neutral-100 flex justify-between items-center">
                <button type="button" className="btn-secondary py-2 px-4" onClick={() => setShowTargetModal(false)}>إلغاء</button>
                <button
                  type="button"
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl transition-colors flex items-center gap-2"
                  onClick={exportTargetTemplate}
                >
                  📥 تصدير المحددين ({targetSelected.size})
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Report View Modal */}
      {
        previewReport && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
                <h3 className="font-bold text-neutral-900">
                  {previewReport.type === 'global' ? 'Global Summary - ملخص عام' : 'Employee Performance - أداء الموظفين'}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="bg-primary-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-primary-700 transition delay-100 flex items-center gap-2"
                    onClick={async () => {
                      if (previewReport.type === 'global') {
                        await generateGlobalSalesPDF(previewReport.data, { start: range.start, end: range.end });
                      } else if (previewReport.type === 'stores') {
                        const today = new Date(); // Or parse from range
                        // For daily report, we usually want Yesterday vs Last Year
                        // We can infer dates from the preview data or passed range.
                        // generateDailyReportPDF(data, { yesterday: 'YYYY-MM-DD', lastYear: 'YYYY-MM-DD' })
                        // We'll use range.start as the 'yesterday' date since that's what we built the report for.
                        const yDate = range.start;
                        const lyDate = getPrevYearDate(range.start);
                        await generateDailyReportPDF(previewReport.data, { yesterday: yDate, lastYear: lyDate });
                      } else if (previewReport.type === 'employee') {
                        const today = new Date();
                        const yest = new Date(today); yest.setDate(today.getDate() - 1);
                        const mStart = new Date(today.getFullYear(), today.getMonth(), 1);

                        // Check if we have store-grouped data
                        if (previewReport.data[0]?.storeId && previewReport.data[0]?.employees) {
                          await generateEmployeeReportByStore(previewReport.data, {
                            yesterday: yest.toISOString().split('T')[0],
                            monthStart: mStart.toISOString().split('T')[0]
                          });
                        } else {
                          await generateEmployeePerformancePDF(previewReport.data, {
                            yesterday: yest.toISOString().split('T')[0],
                            monthStart: mStart.toISOString().split('T')[0]
                          });
                        }
                      }
                    }}
                  >
                    <span>🖨️</span> طباعة PDF
                  </button>
                  <button
                    onClick={() => setPreviewReport(null)}
                    className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg font-bold text-sm hover:bg-neutral-300 transition-colors"
                  >
                    إغلاق
                  </button>
                </div>
              </div>

              <div className="p-8 overflow-y-auto flex-1">

                <div className="report-header flex justify-between items-end">
                  <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Ora Cockpit</h1>
                    <p className="text-sm text-neutral-500">{previewReport.type === 'global' ? 'Global Summary - ملخص عام' : 'Employee Performance - أداء الموظفين'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">التاريخ: {range.start} إلى {range.end}</p>
                    <p className="text-xs text-neutral-400">تم الاستخراج في: {new Date().toLocaleString('ar-SA')}</p>
                  </div>
                </div>

                {previewReport.type === 'global' && (
                  <table className="w-full report-table border-collapse">
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>مبيعات 2026</th>
                        <th>مبيعات 2025</th>
                        <th>% النمو</th>
                        <th>عدد الفواتير</th>
                        <th>م. الفاتورة</th>
                        <th>قيمة العميل</th>
                        <th>زوار 2026</th>
                        <th>زوار 2025</th>
                        <th>% التحويل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewReport.data.map((r: any) => (
                        <tr key={r.date}>
                          <td className="font-mono">{r.date}</td>
                          <td className="font-bold">{Math.round(r.sales).toLocaleString()}</td>
                          <td className="text-neutral-500">{Math.round(r.salesPrev).toLocaleString()}</td>
                          <td className={`font-bold ${r.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {r.growth >= 0 ? '+' : ''}{r.growth.toFixed(1)}%
                          </td>
                          <td>{r.trans.toLocaleString()}</td>
                          <td>{Math.round(r.avgInv).toLocaleString()}</td>
                          <td className="font-bold">{Math.round(r.customerValue).toLocaleString()}</td>
                          <td>{r.visitors.toLocaleString()}</td>
                          <td className="text-neutral-400">{r.visitorsPrev.toLocaleString()}</td>
                          <td className="text-orange-600 font-bold">{r.conversion.toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="bg-neutral-100 font-bold">
                        <td>الإجمالي</td>
                        <td>{Math.round(previewReport.data.reduce((s: any, x: any) => s + x.sales, 0)).toLocaleString()}</td>
                        <td>{Math.round(previewReport.data.reduce((s: any, x: any) => s + x.salesPrev, 0)).toLocaleString()}</td>
                        <td>{((previewReport.data.reduce((s: any, x: any) => s + x.sales, 0) - previewReport.data.reduce((s: any, x: any) => s + x.salesPrev, 0)) / (previewReport.data.reduce((s: any, x: any) => s + x.salesPrev, 0) || 1) * 100).toFixed(1)}%</td>
                        <td>{previewReport.data.reduce((s: any, x: any) => s + x.trans, 0).toLocaleString()}</td>
                        <td>-</td>
                        <td>-</td>
                        <td>{previewReport.data.reduce((s: any, x: any) => s + x.visitors, 0).toLocaleString()}</td>
                        <td>{previewReport.data.reduce((s: any, x: any) => s + x.visitorsPrev, 0).toLocaleString()}</td>
                        <td>{(previewReport.data.reduce((s: any, x: any) => s + x.trans, 0) / (previewReport.data.reduce((s: any, x: any) => s + x.visitors, 0) || 1) * 100).toFixed(1)}%</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {previewReport.type === 'stores' && (
                  <table className="w-full report-table border-collapse text-sm">
                    <thead>
                      <tr className="bg-orange-500 text-white">
                        <th className="p-2 border border-orange-600">المعرض</th>
                        <th className="p-2 border border-orange-600">المبيعات</th>
                        <th className="p-2 border border-orange-600">العام الماضي</th>
                        <th className="p-2 border border-orange-600">% النمو</th>
                        <th className="p-2 border border-orange-600">المطلوب يومياً</th>
                        <th className="p-2 border border-orange-600">الفواتير</th>
                        <th className="p-2 border border-orange-600">م. الفاتورة</th>
                        <th className="p-2 border border-orange-600">الزوار</th>
                        <th className="p-2 border border-orange-600">زوار LY</th>
                        <th className="p-2 border border-orange-600">% التحويل</th>
                        <th className="p-2 border border-orange-600">قيمة العميل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewReport.data.map((r: any) => (
                        <tr key={r.name} className="hover:bg-neutral-50 odd:bg-white even:bg-neutral-50">
                          <td className="p-2 border border-neutral-200 font-bold">{r.name}</td>
                          <td className="p-2 border border-neutral-200">{Math.round(r.sales).toLocaleString()}</td>
                          <td className="p-2 border border-neutral-200 text-neutral-500">{Math.round(r.prevSales).toLocaleString()}</td>
                          <td className={`p-2 border border-neutral-200 font-bold ${r.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {r.growth >= 0 ? '+' : ''}{r.growth.toFixed(1)}%
                          </td>
                          <td className="p-2 border border-neutral-200 text-red-600 font-bold">{Math.round(r.dailyReq || 0).toLocaleString()}</td>
                          <td className="p-2 border border-neutral-200">{r.trans.toLocaleString()}</td>
                          <td className="p-2 border border-neutral-200">{Math.round(r.avgInv).toLocaleString()}</td>
                          <td className="p-2 border border-neutral-200">{r.visitors.toLocaleString()}</td>
                          <td className="p-2 border border-neutral-200 text-neutral-400">{r.prevVisitors.toLocaleString()}</td>
                          <td className="p-2 border border-neutral-200 text-orange-600 font-bold">{r.conversion.toFixed(1)}%</td>
                          <td className="p-2 border border-neutral-200 font-bold">{Math.round(r.customerValue).toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr className="bg-neutral-200 font-bold">
                        <td className="p-2 border border-neutral-300">الإجمالي</td>
                        <td className="p-2 border border-neutral-300">{Math.round(previewReport.data.reduce((s: any, x: any) => s + x.sales, 0)).toLocaleString()}</td>
                        <td className="p-2 border border-neutral-300">{Math.round(previewReport.data.reduce((s: any, x: any) => s + x.prevSales, 0)).toLocaleString()}</td>
                        <td className="p-2 border border-neutral-300 text-center">-</td>
                        <td className="p-2 border border-neutral-300">{Math.round(previewReport.data.reduce((s: any, x: any) => s + (x.dailyReq || 0), 0)).toLocaleString()}</td>
                        <td className="p-2 border border-neutral-300">{previewReport.data.reduce((s: any, x: any) => s + x.trans, 0).toLocaleString()}</td>
                        <td className="p-2 border border-neutral-300">-</td>
                        <td className="p-2 border border-neutral-300">{previewReport.data.reduce((s: any, x: any) => s + x.visitors, 0).toLocaleString()}</td>
                        <td className="p-2 border border-neutral-300">{previewReport.data.reduce((s: any, x: any) => s + x.prevVisitors, 0).toLocaleString()}</td>
                        <td className="p-2 border border-neutral-300">-</td>
                        <td className="p-2 border border-neutral-300">-</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {previewReport.type === 'employee' && (
                  <div className="space-y-8">
                    {/* Store-grouped employee data */}
                    {previewReport.data.map((store: any) => (
                      <div key={store.storeId} className="border border-neutral-200 rounded-xl overflow-hidden">
                        <div className="bg-orange-500 text-white p-3 font-bold">
                          {store.storeId} - {store.storeName}
                        </div>
                        <table className="w-full report-table border-collapse text-sm">
                          <thead>
                            <tr className="bg-neutral-100">
                              <th rowSpan={2} className="p-2 border">الموظف</th>
                              <th colSpan={4} className="p-2 border bg-neutral-200">الأمس (Yesterday)</th>
                              <th colSpan={8} className="p-2 border bg-neutral-300">الشهر الحالي (MTD)</th>
                            </tr>
                            <tr className="bg-neutral-50 text-xs">
                              <th className="p-2 border">المبيعات</th>
                              <th className="p-2 border">مساهمة %</th>
                              <th className="p-2 border">العدد</th>
                              <th className="p-2 border">م. فاتورة</th>
                              <th className="p-2 border">المبيعات</th>
                              <th className="p-2 border">مساهمة %</th>
                              <th className="p-2 border">العدد</th>
                              <th className="p-2 border">م. فاتورة</th>
                              <th className="p-2 border">الهدف</th>
                              <th className="p-2 border">% تحقيق</th>
                              <th className="p-2 border">المتبقي</th>
                              <th className="p-2 border">يومية متبقية</th>
                            </tr>
                          </thead>
                          <tbody>
                            {store.employees.map((e: any, idx: number) => (
                              <tr key={idx} className="hover:bg-neutral-50">
                                <td className="p-2 border text-right font-bold">{e.name}</td>
                                <td className="p-2 border">{Math.round(e.ySales).toLocaleString()}</td>
                                <td className="p-2 border">{e.yShare.toFixed(0)}%</td>
                                <td className="p-2 border">{e.yTrans}</td>
                                <td className="p-2 border">{Math.round(e.yAvgInv).toLocaleString()}</td>
                                <td className="p-2 border font-bold text-primary-700">{Math.round(e.mSales).toLocaleString()}</td>
                                <td className="p-2 border">{e.mShare.toFixed(0)}%</td>
                                <td className="p-2 border">{e.mTrans}</td>
                                <td className="p-2 border">{Math.round(e.mAvgInv).toLocaleString()}</td>
                                <td className="p-2 border text-neutral-500">{Math.round(e.target).toLocaleString()}</td>
                                <td className="p-2 border font-bold text-green-600">{e.achievement.toFixed(1)}%</td>
                                <td className="p-2 border text-red-500">{Math.round(e.remaining).toLocaleString()}</td>
                                <td className="p-2 border font-bold">{Math.round(e.dailyReq).toLocaleString()}</td>
                              </tr>
                            ))}
                            <tr className="bg-neutral-100 font-bold">
                              <td className="p-2 border">الإجمالي</td>
                              <td className="p-2 border">{Math.round(store.employees.reduce((s: number, x: any) => s + x.ySales, 0)).toLocaleString()}</td>
                              <td className="p-2 border">100%</td>
                              <td className="p-2 border">{store.employees.reduce((s: number, x: any) => s + x.yTrans, 0)}</td>
                              <td className="p-2 border">-</td>
                              <td className="p-2 border">{Math.round(store.employees.reduce((s: number, x: any) => s + x.mSales, 0)).toLocaleString()}</td>
                              <td className="p-2 border">100%</td>
                              <td className="p-2 border">{store.employees.reduce((s: number, x: any) => s + x.mTrans, 0)}</td>
                              <td className="p-2 border">-</td>
                              <td className="p-2 border">{Math.round(store.employees.reduce((s: number, x: any) => s + x.target, 0)).toLocaleString()}</td>
                              <td className="p-2 border">-</td>
                              <td className="p-2 border">{Math.round(store.employees.reduce((s: number, x: any) => s + x.remaining, 0)).toLocaleString()}</td>
                              <td className="p-2 border">-</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
