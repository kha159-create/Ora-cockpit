import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { generateGlobalSalesPDF, generateEmployeePerformancePDF, generateDailyReportPDF, generateStoreReportWithDaily, generateEmployeeReportByStore } from '../services/pdf/pdfService';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';

import { getCurrentUser } from '../auth/storage';
import { getPrevYearDate, getPrevYearRange } from '../utils/seasons';
import {
  getMarch2026TargetMetrics,
  sumManagementTargetsForMonth,
  march2026TargetRowMatchesReference,
  getEmployeeTargetForEffectiveDate,
  getMarch2026PhaseSalesBounds,
} from '../utils/march2026Targets';
import { mtdRangeThroughYesterday } from '../utils/mtdDateRange';
import { buildOriginalEmployeeStatusMap, isOriginalActiveEmployee } from '../utils/originalEmployeeStatus';
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
    const r = mtdRangeThroughYesterday(today);
    return { start: r.start, end: r.end };
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
        const meta = (rawMgmt.store_meta as Record<string, { manager?: string; city?: string; type?: string }>)[id];
        if (effectiveManager !== 'all' && (meta?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && (meta?.city || '') !== city) return false;
        if (storeType !== 'all') {
          const type = String(meta?.type || '').toLowerCase();
          const isOnline = type === 'online' || type === 'platform' || type === 'warehouse';
          if (storeType === 'online' && !isOnline) return false;
          if (storeType === 'store' && isOnline) return false;
        }
        return true;
      })
      .map(([id, name]) => ({ id, name: (name as string) || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawMgmt, effectiveManager, city, storeType]);

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
    const dataMap: Record<string, { date: string; storeId: string; sales: number; trans: number; visitors: number; target: number }> = {};
    const ensure = (d: string, s: string) => {
      const k = `${d}_${s}`;
      if (!dataMap[k]) dataMap[k] = { date: d, storeId: s, sales: 0, trans: 0, visitors: 0, target: 0 };
      return dataMap[k];
    };
    const exportDates: string[] = [];
    let cursor = new Date(range.start);
    const rangeEnd = new Date(range.end);
    while (cursor <= rangeEnd) {
      exportDates.push(toYMD(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const exportStoreIds = branches.map((b) => b.id).filter((sid) => passFilter(sid));
    exportStoreIds.forEach((sid) => {
      exportDates.forEach((d) => ensure(d, sid));
    });
    (rawMgmt.sales || []).forEach(([d, s, v]: any[]) => {
      if (inRange(d) && passFilter(s)) ensure(d, s).sales += v || 0;
    });
    (rawMgmt.transactions || []).forEach(([d, s, v]: any[]) => {
      if (inRange(d) && passFilter(s)) ensure(d, s).trans += v || 0;
    });
    (rawMgmt.visitors || []).forEach(([d, s, v]: any[]) => {
      if (inRange(d) && passFilter(s)) ensure(d, s).visitors += v || 0;
    });
    (rawMgmt.targets || []).forEach(([d, s, v]: any[]) => {
      if (inRange(d) && passFilter(s)) ensure(d, s).target += v || 0;
    });
    const rows = Object.values(dataMap).map((r) => {
      const prevDate = getPrevYearDate(r.date);
      let prevSales = 0;
      let prevVisitors = 0;
      (rawMgmt.sales || []).forEach(([d, s, v]: any[]) => {
        if (d === prevDate && s === r.storeId) prevSales += v || 0;
      });
      (rawMgmt.visitors || []).forEach(([d, s, v]: any[]) => {
        if (d === prevDate && s === r.storeId) prevVisitors += v || 0;
      });

      const growth = prevSales > 0 ? ((r.sales - prevSales) / prevSales) * 100 : 0;
      const customerValue = r.visitors > 0 ? r.sales / r.visitors : 0;
      const ach = r.target > 0 ? ((r.sales / r.target) * 100).toFixed(1) + '%' : '0%';

      const meta = rawMgmt.store_meta?.[r.storeId] || {};
      return {
        'التاريخ': r.date,
        'المعرض': rawMgmt.stores?.[r.storeId] || r.storeId,
        'المدينة': meta.city || '-',
        'مدير المنطقة': meta.manager || '-',
        'المبيعات': r.sales,
        'مبيعات السنة السابقة': prevSales,
        'الهدف': r.target,
        'نسبة التحقيق': ach,
        'النمو %': growth.toFixed(1) + '%',
        'عدد الفواتير': r.trans,
        'الزوار': r.visitors,
        'زوار السنة السابقة': prevVisitors,
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
  };

  const generateEmployeePerformance = () => {
    if (!rawMgmt || !rawEmp) return;
    const history = rawEmp.history || {};
    const names = rawEmp.employee_names || {};
    const storesMap = rawMgmt.stores || {};

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yStr = toYMD(yesterday);

    const { start: mtdStart, end: mtdEndStr } = mtdRangeThroughYesterday(today);
    const marchMtd = getMarch2026PhaseSalesBounds(mtdEndStr);
    const effMtdStart = marchMtd?.start ?? mtdStart;
    const effMtdEnd = marchMtd?.end ?? mtdEndStr;

    const getTarget = (rawId: string) => getEmployeeTargetForEffectiveDate(rawEmp, rawId, mtdEndStr);

    const activeStatusMtd = buildOriginalEmployeeStatusMap(rawEmp, passFilter, effMtdStart, effMtdEnd, today);

    // Group employees by store
    const byStore: Record<string, Record<string, any>> = {};

    Object.entries(history).forEach(([sid, recs]: [string, any]) => {
      if (!passFilter(sid)) return;
      if (!byStore[sid]) byStore[sid] = {};

      (recs || []).forEach(([dt, eid, s, t]: any[]) => {
        const empId = String(eid || '').split('-')[0].trim();
        if (!empId || empId === 'مرتجع') return;
        if (!isOriginalActiveEmployee(activeStatusMtd, empId)) return;

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
        if (dt >= effMtdStart && dt <= effMtdEnd) {
          byStore[sid][empId].mSales += s || 0;
          byStore[sid][empId].mTrans += t || 0;
        }
      });
    });

    const remainingDays = getMarch2026TargetMetrics(yesterday).remainingDaysExclusive;

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
  };

  const exportEmployeeExcel = () => {
    if (!rawMgmt || !rawEmp) return;
    const history = rawEmp.history || {};
    const empNames = rawEmp.employee_names || {};
    const empSalesByDateId: Record<string, number> = {};
    Object.entries(history).forEach(([sid, recs]) => {
      if (!passFilter(sid)) return;
      (recs || []).forEach((rec: any[]) => {
        const [date, empId, sales] = rec;
        const idPart = String(empId || '').split('-')[0].trim();
        if (!idPart) return;
        const key = `${date}_${idPart}`;
        empSalesByDateId[key] = (empSalesByDateId[key] || 0) + (Number(sales) || 0);
      });
    });
    let targetStoreIds = Object.keys(history).filter((sid) => passFilter(sid));
    const activeStatusExcel = buildOriginalEmployeeStatusMap(rawEmp, passFilter, range.start, range.end);
    const rows: any[] = [];
    targetStoreIds.forEach((sid) => {
      const recs = history[sid] || [];
      const storeName = rawMgmt.stores?.[sid] || sid;
      recs.forEach((rec: any[]) => {
        const [date, empId, sales, trans] = rec;
        if (date >= range.start && date <= range.end) {
          const idPart = String(empId || '').split('-')[0].trim();
          if (!isOriginalActiveEmployee(activeStatusExcel, idPart)) return;
          let name = empNames[idPart] || empNames[idPart?.padStart(4, '0')] || empId;
          if (empId && String(empId).includes('-')) {
            const parts = String(empId).split('-');
            const nameFromParts = parts.slice(1).join('-').trim();
            if (nameFromParts) name = nameFromParts;
          }
          const prevSales = empSalesByDateId[`${getPrevYearDate(date)}_${idPart}`] || 0;
          const targetVal = getEmployeeTargetForEffectiveDate(rawEmp, idPart, String(date).substring(0, 10));
          rows.push({
            'التاريخ': date,
            'المعرض': storeName,
            'الرقم الوظيفي': idPart,
            'اسم الموظف': name,
            'المبيعات': sales,
            'مبيعات السنة السابقة': prevSales,
            'الهدف (الشهري)': targetVal,
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
      const today2 = new Date();
      const refEnd = range.end <= toYMD(today2) ? range.end : toYMD(today2);
      (rawMgmt.targets || []).forEach(([d, s, v]: any[]) => {
        if (!inRange(d) || !passFilter(s)) return;
        const ds = String(d).substring(0, 10);
        if (!march2026TargetRowMatchesReference(ds, refEnd)) return;
        if (!dataMap[s]) dataMap[s] = { name: rawMgmt.stores?.[s] || s, sales: 0, prevSales: 0, trans: 0, visitors: 0, prevVisitors: 0, target: 0 };
        dataMap[s].target += v || 0;
      });

      const remainingDays2 = getMarch2026TargetMetrics(today2).remainingDaysInclusive;

      rows = Object.entries(dataMap).map(([sid, r]) => {
        const remaining = Math.max(0, r.target - r.sales);
        return {
          ...r,
          sid,
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
      const { start: mtdStartYMD, end: mtdEndStr } = mtdRangeThroughYesterday(today);

      title = `أداء الموظفين (أمس vs MTD)`;
      const history = rawEmp?.history || {};
      const names = rawEmp?.employee_names || {};
      const selectedIdsArray = Array.from(selectedEmpIds);
      const storesMap = rawMgmt.stores || {};

      const marchMtdYe = getMarch2026PhaseSalesBounds(mtdEndStr);
      const effMtdStartYe = marchMtdYe?.start ?? mtdStartYMD;
      const effMtdEndYe = marchMtdYe?.end ?? mtdEndStr;

      const activeStatusYe = buildOriginalEmployeeStatusMap(rawEmp, passFilter, effMtdStartYe, effMtdEndYe, today);

      const getTarget = (rawId: string) => getEmployeeTargetForEffectiveDate(rawEmp, rawId, mtdEndStr);

      // Group by store → employees (same structure as generateEmployeePerformance)
      const byStore: Record<string, Record<string, any>> = {};

      Object.entries(history).forEach(([sid, recs]: [string, any]) => {
        if (!passFilter(sid)) return;
        if (!byStore[sid]) byStore[sid] = {};

        (recs || []).forEach((rec: any[]) => {
          const d = rec[0];
          const rawId = String(rec[1] || '').split('-')[0].trim();
          if (!rawId || rawId === 'مرتجع') return;
          const id = rawId.padStart(4, '0');
          if (selectedIdsArray.length > 0 && !selectedIdsArray.includes(id) && !selectedIdsArray.includes(rawId)) return;
          if (!isOriginalActiveEmployee(activeStatusYe, rawId)) return;

          if (!byStore[sid][id]) {
            byStore[sid][id] = {
              name: names[id] || names[rawId] || rawId,
              ySales: 0, yTrans: 0,
              mSales: 0, mTrans: 0,
              target: getTarget(rawId)
            };
          }
          const sales = Number(rec[2]) || 0;
          const trans = Number(rec[3]) || 0;

          if (d === yesterdayYMD) {
            byStore[sid][id].ySales += sales;
            byStore[sid][id].yTrans += trans;
          }
          if (d >= effMtdStartYe && d <= effMtdEndYe) {
            byStore[sid][id].mSales += sales;
            byStore[sid][id].mTrans += trans;
          }
        });
      });

      const remainingDays3 = getMarch2026TargetMetrics(yesterdayDate).remainingDaysExclusive;

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
    const storesMap = rawMgmt.stores || {};

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const { start: mtdStart, end: mtdEndStr } = mtdRangeThroughYesterday(today);
    const marchTpl = getMarch2026PhaseSalesBounds(mtdEndStr);
    const effTplStart = marchTpl?.start ?? mtdStart;
    const effTplEnd = marchTpl?.end ?? mtdEndStr;

    const getTarget = (rawId: string) => getEmployeeTargetForEffectiveDate(rawEmp, rawId, mtdEndStr);

    // Build employee list with MTD sales + عدد الأيام الفعلية التي باع فيها الموظف
    const empMap: Record<string, any> = {};
    const empDaysMap: Record<string, Set<string>> = {};
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
        if (d >= effTplStart && d <= effTplEnd) {
          empMap[id].mtdSales += sales;
          empMap[id].mtdTrans += trans;
          if (sales > 0) {
            if (!empDaysMap[id]) empDaysMap[id] = new Set<string>();
            empDaysMap[id].add(String(d).substring(0, 10));
          }
        }
      });
    });

    // بعد بناء البيانات، نحدد من هو "نشط" فعلياً:
    // تعريف النشاط:
    // - باع في 3 أيام مختلفة على الأقل خلال الشهر، و
    // - حصته من مبيعات الفرع الذي يعمل فيه ليست هامشية جداً (>= 1% من مبيعات الفرع MTD).
    const storeTotals: Record<string, number> = {};
    Object.values(empMap).forEach((e: any) => {
      storeTotals[e.storeId] = (storeTotals[e.storeId] || 0) + (e.mtdSales || 0);
    });
    Object.values(empMap).forEach((e: any) => {
      const daysCount = empDaysMap[e.id]?.size || 0;
      const storeTotal = storeTotals[e.storeId] || 0;
      const share = storeTotal > 0 ? (e.mtdSales || 0) / storeTotal : 0;
      const isActiveByDays = daysCount >= 3;
      const isActiveByShare = share >= 0.01; // 1% على الأقل من مبيعات الفرع
      e.active = isActiveByDays && isActiveByShare;
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
      {/* عنوان الصفحة */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-neutral-900 border-r-4 border-primary-500 pr-3">التقارير</h2>
        <p className="text-sm text-neutral-500">آخر تحديث: <span className="text-primary-600 font-medium">{lastUpdate}</span></p>
      </div>

      {/* نوع التقرير والفلاتر (مطابق للريبو الأصلي) */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 sm:p-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-2 border-r-4 border-orange-500 pr-2">نوع التقرير</h3>
        <p className="text-sm text-neutral-500 mb-4">جميع التقارير (PDF / Excel) تستخدم الفلاتر أدناه.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-neutral-700">الفترة</label>
            <select
              className="input w-full"
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            >
              <option value="today">اليوم (Today)</option>
              <option value="yesterday">أمس (Yesterday)</option>
              <option value="mtd">الشهر الحالي (MTD)</option>
              <option value="standard">شهر محدد / سنوي</option>
              <option value="custom">فترة مخصصة (Custom Range)</option>
            </select>
            {filterMode === 'standard' && (
              <div className="flex gap-2 flex-wrap">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">السنة</label>
                  <select className="input flex-1 min-w-[100px]" value={standardYear} onChange={(e) => setStandardYear(Number(e.target.value))}>
                    {[2026, 2025, 2024].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">الشهر</label>
                  <select className="input flex-1 min-w-[120px]" value={standardMonth} onChange={(e) => setStandardMonth(e.target.value)}>
                    <option value="all">كل السنة</option>
                    {months.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {filterMode === 'custom' && (
              <div className="flex gap-2 flex-wrap">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">من تاريخ</label>
                  <input type="date" className="input flex-1 min-w-[140px]" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">إلى تاريخ</label>
                  <input type="date" className="input flex-1 min-w-[140px]" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <div className="space-y-3 flex flex-wrap gap-x-4 gap-y-2 items-end">
            {isAdminOrAuditor(user?.role) && (
              <div>
                <label className="block text-sm font-semibold text-neutral-700">مدير المنطقة (Manager)</label>
                <select className="input mt-1" value={manager} onChange={(e) => setManager(e.target.value)}>
                  <option value="all">الكل</option>
                  {managers.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-neutral-700">المدينة (City)</label>
              <select className="input mt-1" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="all">الكل</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">نوع المعرض (Type)</label>
              <select className="input mt-1" value={storeType} onChange={(e) => setStoreType(e.target.value)}>
                <option value="all">الكل</option>
                <option value="store">معارض</option>
                <option value="online">أونلاين</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">المعرض / الفرع</label>
              <select className="input mt-1" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="all">كافة الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-neutral-900 border-r-4 border-orange-500 pr-2">تقارير المعارض</h3>
              <p className="text-sm text-neutral-500 mt-2">كل تقارير الفروع تستخدم نفس الفلاتر بالأعلى، مع مقارنة العام الماضي حسب منطق الريبو الأصلي.</p>
            </div>
            <span className="text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-100 rounded-full px-3 py-1">PDF / Excel</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handlePdfGeneration('yesterday_store')}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-5 rounded-xl transition"
            >
              عرض تقرير المعارض
            </button>
            <button
              type="button"
              onClick={() => { setExcelType('store'); setShowExcelModal(true); }}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-5 rounded-xl transition"
            >
              تصدير Excel
            </button>
          </div>
          <p className="text-xs text-neutral-400 mt-3">من المعاينة يمكنك طباعة جدول واحد أو إنشاء PDF ملخص لكل فرع.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-neutral-900 border-r-4 border-orange-500 pr-2">الملخصات الإدارية</h3>
              <p className="text-sm text-neutral-500 mt-2">ملخص عام سريع أو تقرير شهري حسب الفترة المختارة، بدون نافذة اختيار إضافية.</p>
            </div>
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-3 py-1">PDF</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generateGlobalSummary}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-5 rounded-xl transition"
            >
              ملخص عام
            </button>
            <button
              type="button"
              onClick={() => handlePdfGeneration('monthly_summary')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-xl transition"
            >
              التقرير الشهري
            </button>
          </div>
        </div>
      </div>

      {canExportEmployee && (
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-neutral-900 border-r-4 border-orange-500 pr-2">تقارير الموظفين</h3>
              <p className="text-sm text-neutral-500 mt-2">أداء الموظفين، تقرير أمس، Excel، وقالب التارجت من مكان واحد.</p>
            </div>
            <Link
              to="/employees"
              className="text-sm font-semibold text-primary-600 hover:underline"
            >
              فتح صفحة أداء الموظفين
            </Link>
          </div>
          <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs font-semibold text-emerald-800">
            تقارير الموظفين تعتمد تلقائياً آلية الريبو الأصلي: يتم تضمين الموظفين النشطين فقط، واستبعاد من يظهر كـ مراجعة أو مستقيل.
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => generateEmployeePerformance()}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-5 rounded-xl transition"
            >
              أداء الموظفين
            </button>
            <button
              type="button"
              onClick={() => handlePdfGeneration('yesterday_employee')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-xl transition"
            >
              تقرير أمس
            </button>
            <button
              type="button"
              onClick={() => { setExcelType('employee'); setShowExcelModal(true); }}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-5 rounded-xl transition"
            >
              تصدير Excel
            </button>
            <button
              type="button"
              onClick={openTargetTemplateModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-5 rounded-xl transition"
            >
              قالب تارجت الشهر القادم
            </button>
          </div>
        </div>
      )}

      {/* روابط سريعة */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-2 border-r-4 border-orange-500 pr-2">صفحات ذات صلة</h3>
        <div className="flex flex-wrap gap-3">
          <Link to="/products" className="text-primary-600 hover:underline font-medium">تحليل المنتجات</Link>
          <Link to="/stores" className="text-primary-600 hover:underline font-medium">تفاصيل المعارض</Link>
          <Link to="/offers" className="text-primary-600 hover:underline font-medium">تحليل العروض</Link>
        </div>
      </div>

      {/* نافذة تصدير Excel - مطابقة للريبو الأصلي (اختر الفترة + نوع التقرير) */}
      {
        showExcelModal && (
          <div className="modal-center-screen" onClick={() => setShowExcelModal(false)}>
            <div className="modal-content max-w-md w-full p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
              <h5 className="font-bold text-lg text-neutral-900 mb-4">📊 تصدير Excel</h5>
              <p className="text-sm text-neutral-600 mb-2">اختر الفترة: من <span className="font-mono">{range.start}</span> إلى <span className="font-mono">{range.end}</span></p>
              <p className="text-xs text-neutral-500 mb-3">(الفترة من الفلاتر أعلاه)</p>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">نوع التقرير {isAdminOrAuditor(user?.role) && '(Sales Manager / Admin)'}</label>
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  className={`flex-1 py-2 px-3 rounded-xl font-medium text-sm transition ${excelType === 'store' ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                  onClick={() => setExcelType('store')}
                >
                  مبيعات المعارض (Store Sales)
                </button>
                {canExportEmployee && (
                  <button
                    type="button"
                    className={`flex-1 py-2 px-3 rounded-xl font-medium text-sm transition ${excelType === 'employee' ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                    onClick={() => setExcelType('employee')}
                  >
                    مبيعات الموظفين (Employee Sales)
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" className="flex-1 btn-secondary py-2" onClick={() => setShowExcelModal(false)}>إلغاء</button>
                <button type="button" className="flex-1 bg-green-600 text-white font-bold py-2 rounded-xl hover:bg-green-700 disabled:opacity-50" onClick={runExcelExport} disabled={excelExporting}>
                  {excelExporting ? 'جاري التصدير...' : 'تصدير (Export)'}
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
                  {previewReport.type === 'global' && 'ملخص عام - Global Summary'}
                  {previewReport.type === 'stores' && 'تقرير المعارض'}
                  {previewReport.type === 'employee' && 'أداء الموظفين - Employee Performance'}
                </h3>
                <div className="flex items-center gap-2">
                  {previewReport.type === 'stores' && (
                    <button
                      type="button"
                      className="bg-amber-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-amber-700 transition flex items-center gap-2"
                      onClick={async () => {
                        if (!rawMgmt?.sales || !rawMgmt?.stores) return;
                        const meta = rawMgmt.store_meta || {};
                        const storesMap = rawMgmt.stores || {};
                        let storeIds = (previewReport.data as any[]).map((r: any) => r.sid).filter(Boolean);
                        if (storeIds.length === 0) storeIds = Object.keys(storesMap).filter((sid) => passFilter(sid));
                        if (storeIds.length === 0) return;
                        const dates: string[] = [];
                        let curr = new Date(range.start);
                        const end = new Date(range.end);
                        while (curr <= end) {
                          dates.push(toYMD(curr));
                          curr.setDate(curr.getDate() + 1);
                        }
                        const prevDateMap: Record<string, string> = {};
                        dates.forEach((dt) => { prevDateMap[dt] = getPrevYearDate(dt); });
                        const byStore: Record<string, Record<string, { sales: number; trans: number; visitors: number }>> = {};
                        const byStorePrev: Record<string, Record<string, { sales: number; trans: number; visitors: number }>> = {};
                        storeIds.forEach((sid) => {
                          byStore[sid] = {};
                          byStorePrev[sid] = {};
                          dates.forEach((dt) => {
                            byStore[sid][dt] = { sales: 0, trans: 0, visitors: 0 };
                            byStorePrev[sid][prevDateMap[dt]] = { sales: 0, trans: 0, visitors: 0 };
                          });
                        });
                        (rawMgmt.sales || []).forEach(([d, sid, v]: any[]) => {
                          const dateStr = String(d).substring(0, 10);
                          if (!storeIds.includes(sid)) return;
                          if (byStore[sid]?.[dateStr]) byStore[sid][dateStr].sales += v || 0;
                          if (byStorePrev[sid]?.[dateStr]) byStorePrev[sid][dateStr].sales += v || 0;
                        });
                        (rawMgmt.transactions || []).forEach(([d, sid, v]: any[]) => {
                          const dateStr = String(d).substring(0, 10);
                          if (storeIds.includes(sid) && byStore[sid]?.[dateStr]) byStore[sid][dateStr].trans += v || 0;
                        });
                        (rawMgmt.visitors || []).forEach(([d, sid, v]: any[]) => {
                          const dateStr = String(d).substring(0, 10);
                          if (!storeIds.includes(sid)) return;
                          if (byStore[sid]?.[dateStr]) byStore[sid][dateStr].visitors += v || 0;
                          if (byStorePrev[sid]?.[dateStr]) byStorePrev[sid][dateStr].visitors += v || 0;
                        });
                        const globalData = dates.map((dt) => {
                          const prevDt = prevDateMap[dt];
                          let sales = 0, salesPrev = 0, trans = 0, visitors = 0, visitorsPrev = 0;
                          storeIds.forEach((sid) => {
                            sales += byStore[sid]?.[dt]?.sales || 0;
                            trans += byStore[sid]?.[dt]?.trans || 0;
                            visitors += byStore[sid]?.[dt]?.visitors || 0;
                            salesPrev += byStorePrev[sid]?.[prevDt]?.sales || 0;
                            visitorsPrev += byStorePrev[sid]?.[prevDt]?.visitors || 0;
                          });
                          const growth = salesPrev > 0 ? ((sales - salesPrev) / salesPrev * 100) : 0;
                          const avgInv = trans > 0 ? sales / trans : 0;
                          const customerValue = visitors > 0 ? sales / visitors : 0;
                          const conversion = visitors > 0 ? (trans / visitors * 100) : 0;
                          return { date: dt, sales, salesPrev, growth, trans, avgInv, customerValue, visitors, visitorsPrev, conversion };
                        });
                        const storesData = storeIds.map((sid) => {
                          const storeMeta = meta[sid] || {};
                          const refPdf = range.end <= toYMD(new Date()) ? range.end : toYMD(new Date());
                          const storeTargetsPdf = sumManagementTargetsForMonth(rawMgmt.targets, range.start.substring(0, 7), refPdf);
                          const storeTarget = storeTargetsPdf[sid] || 0;
                          const dailyData = dates.map((dt) => {
                            const prevDt = prevDateMap[dt];
                            const d = byStore[sid]?.[dt] || { sales: 0, trans: 0, visitors: 0 };
                            const dPrev = byStorePrev[sid]?.[prevDt] || { sales: 0, trans: 0, visitors: 0 };
                            const growth = dPrev.sales > 0 ? ((d.sales - dPrev.sales) / dPrev.sales * 100) : 0;
                            const avgInv = d.trans > 0 ? d.sales / d.trans : 0;
                            const customerValue = d.visitors > 0 ? d.sales / d.visitors : 0;
                            const conversion = d.visitors > 0 ? (d.trans / d.visitors * 100) : 0;
                            return { date: dt, sales: d.sales, salesPrev: dPrev.sales, growth, trans: d.trans, avgInv, customerValue, visitors: d.visitors, visitorsPrev: dPrev.visitors, conversion };
                          });
                          return { id: sid, name: storesMap[sid] || sid, manager: storeMeta.manager, target: storeTarget, dailyData };
                        });
                        await generateStoreReportWithDaily(globalData, storesData, { start: range.start, end: range.end }, storeIds.length);
                      }}
                    >
                      <span>📑</span> PDF ملخص لكل فرع
                    </button>
                  )}
                  <button
                    type="button"
                    className="bg-primary-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-primary-700 transition delay-100 flex items-center gap-2"
                    onClick={async () => {
                      if (previewReport.type === 'global') {
                        await generateGlobalSalesPDF(previewReport.data, { start: range.start, end: range.end });
                      } else if (previewReport.type === 'stores') {
                        const yDate = range.start === range.end ? range.start : `${range.start} إلى ${range.end}`;
                        const lyRange = getPrevYearRange(range.start, range.end);
                        const lyDate = lyRange.start === lyRange.end ? lyRange.start : `${lyRange.start} إلى ${lyRange.end}`;
                        await generateDailyReportPDF(previewReport.data, { yesterday: yDate, lastYear: lyDate });
                      } else if (previewReport.type === 'employee') {
                        const today = new Date();
                        const yest = new Date(today); yest.setDate(today.getDate() - 1);
                        const employeeMtd = mtdRangeThroughYesterday(today);
                        const employeeMarchMtd = getMarch2026PhaseSalesBounds(employeeMtd.end);
                        const employeeMonthStart = employeeMarchMtd?.start ?? employeeMtd.start;

                        // Check if we have store-grouped data
                        if (previewReport.data[0]?.storeId && previewReport.data[0]?.employees) {
                          await generateEmployeeReportByStore(previewReport.data, {
                            yesterday: toYMD(yest),
                            monthStart: employeeMonthStart
                          });
                        } else {
                          await generateEmployeePerformancePDF(previewReport.data, {
                            yesterday: toYMD(yest),
                            monthStart: employeeMonthStart
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
                    <p className="text-sm text-neutral-500">
                      {previewReport.type === 'global' && 'ملخص عام'}
                      {previewReport.type === 'stores' && 'تقرير المعارض - مقارنة المبيعات والنمو'}
                      {previewReport.type === 'employee' && 'أداء الموظفين'}
                    </p>
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
                        <tr key={r.sid ?? r.name} className="hover:bg-neutral-50 odd:bg-white even:bg-neutral-50">
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
