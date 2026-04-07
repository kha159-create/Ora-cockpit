import { amiriFontBase64 } from './amiriFont';
import { getMarch2026TargetMetrics } from '../../utils/march2026Targets';

// Extend window to include jspdf and jspdf-autotable from CDN
declare global {
    interface Window {
        jspdf: any;
    }
}

/**
 * PDF Service for generating corporate-branded reports for Stores and Employees.
 * Based on provided reference implementations for ORA.
 */

const getJsPDF = () => {
    if (!window.jspdf) {
        throw new Error('jsPDF library not loaded from CDN');
    }
    return window.jspdf.jsPDF;
};

const setupDoc = (orientation: 'l' | 'p' = 'l') => {
    const jsPDF = getJsPDF();
    const doc = new jsPDF(orientation, 'mm', 'a4');

    // Register Arabic Font
    doc.addFileToVFS('Amiri-Regular.ttf', amiriFontBase64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    doc.setFont('Amiri');

    return doc;
};

const addPageHeader = (doc: any, title: string, subtitle?: string) => {
    // Add Logo or Header Branding
    doc.setFillColor(20, 20, 20); // Dark theme
    doc.rect(0, 0, 297, 20, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(title, 15, 13);

    if (subtitle) {
        doc.setFontSize(9);
        doc.text(subtitle, 282, 13, { align: 'right' });
    }
};

interface StoreData {
    id: string;
    name: string;
    manager?: string;
    target?: number;
    dailyData: {
        date: string;
        sales: number;
        salesPrev: number;
        growth: number;
        trans: number;
        avgInv: number;
        customerValue: number;
        visitors: number;
        visitorsPrev: number;
        conversion: number;
    }[];
}

/**
 * Generates a multi-page PDF report for Stores with daily breakdown
 * Page 1: Global Summary
 * Pages 2-N: One page per store
 */
export const generateStoreReportWithDaily = async (
    globalData: StoreData['dailyData'],
    storesData: StoreData[],
    dateRange: { start: string, end: string },
    storeCount: number
) => {
    const doc = setupDoc('l');
    const currentYear = new Date(dateRange.start).getFullYear();
    const prevYear = currentYear - 1;
    const pageWidth = 297;

    // Calculate global totals
    const globalTotals = globalData.reduce((acc, d) => ({
        sales: acc.sales + d.sales,
        salesPrev: acc.salesPrev + d.salesPrev,
        trans: acc.trans + d.trans,
        visitors: acc.visitors + d.visitors,
        visitorsPrev: acc.visitorsPrev + d.visitorsPrev,
    }), { sales: 0, salesPrev: 0, trans: 0, visitors: 0, visitorsPrev: 0 });

    const globalGrowth = globalTotals.salesPrev > 0 ? ((globalTotals.sales - globalTotals.salesPrev) / globalTotals.salesPrev * 100) : 0;
    const globalAvgInv = globalTotals.trans > 0 ? globalTotals.sales / globalTotals.trans : 0;
    const globalConv = globalTotals.visitors > 0 ? (globalTotals.trans / globalTotals.visitors * 100) : 0;
    const globalCustVal = globalTotals.visitors > 0 ? globalTotals.sales / globalTotals.visitors : 0;

    // ===== PAGE 1: Global Summary =====
    addPageHeader(doc, 'Global Summary - ملخص عام', `Report Type: Global Summary (${storeCount} Stores)`);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Date: ${dateRange.start} to ${dateRange.end}`, 15, 28);

    // Prepare table rows
    const tableRows = globalData.map(d => [
        d.date,
        Math.round(d.sales).toLocaleString(),
        Math.round(d.salesPrev).toLocaleString(),
        `${d.growth >= 0 ? '' : ''}${d.growth.toFixed(1)}%`,
        d.trans.toLocaleString(),
        Math.round(d.avgInv).toLocaleString(),
        Math.round(d.customerValue).toLocaleString(),
        d.visitors.toLocaleString(),
        d.visitorsPrev.toLocaleString(),
        `${d.conversion.toFixed(1)}%`
    ]);

    // Add totals row
    tableRows.push([
        'الإجمالي',
        Math.round(globalTotals.sales).toLocaleString(),
        Math.round(globalTotals.salesPrev).toLocaleString(),
        `${globalGrowth >= 0 ? '' : ''}${globalGrowth.toFixed(1)}%`,
        globalTotals.trans.toLocaleString(),
        Math.round(globalAvgInv).toLocaleString(),
        Math.round(globalCustVal).toLocaleString(),
        globalTotals.visitors.toLocaleString(),
        globalTotals.visitorsPrev.toLocaleString(),
        `${globalConv.toFixed(1)}%`
    ]);

    (doc as any).autoTable({
        startY: 33,
        head: [[
            'التاريخ',
            `مبيعات ${currentYear}`,
            `مبيعات ${prevYear}`,
            '% النمو',
            'عدد الفواتير',
            'متوسط الفاتورة',
            'قيمة العميل',
            `زوار ${currentYear}`,
            `زوار ${prevYear}`,
            '% التحويل'
        ]],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center', fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [254, 121, 0], textColor: 255 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 22 },
            3: { textColor: [0, 0, 0] }
        },
        didParseCell: (data: any) => {
            // Style totals row
            if (data.row.index === tableRows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 230, 230];
            }
            // Color growth column
            if (data.column.index === 3 && data.row.index < tableRows.length - 1) {
                const val = parseFloat(data.cell.raw);
                data.cell.styles.textColor = val >= 0 ? [0, 128, 0] : [200, 50, 50];
            }
        }
    });

    // Add page number
    const totalPages = storesData.length + 1;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`-- 1 of ${totalPages} --`, pageWidth / 2, 200, { align: 'center' });

    // ===== PAGES 2-N: Individual Store Pages =====
    storesData.forEach((store, idx) => {
        doc.addPage();
        addPageHeader(doc, `${store.id} - ${store.name}`, store.manager ? `Manager: ${store.manager}` : '');

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.text(`Date: ${dateRange.start} to ${dateRange.end}`, 15, 28);

        // Calculate store totals
        const storeTotals = store.dailyData.reduce((acc, d) => ({
            sales: acc.sales + d.sales,
            salesPrev: acc.salesPrev + d.salesPrev,
            trans: acc.trans + d.trans,
            visitors: acc.visitors + d.visitors,
            visitorsPrev: acc.visitorsPrev + d.visitorsPrev,
        }), { sales: 0, salesPrev: 0, trans: 0, visitors: 0, visitorsPrev: 0 });

        const storeGrowth = storeTotals.salesPrev > 0 ? ((storeTotals.sales - storeTotals.salesPrev) / storeTotals.salesPrev * 100) : 0;
        const storeAvgInv = storeTotals.trans > 0 ? storeTotals.sales / storeTotals.trans : 0;
        const storeConv = storeTotals.visitors > 0 ? (storeTotals.trans / storeTotals.visitors * 100) : 0;
        const storeCustVal = storeTotals.visitors > 0 ? storeTotals.sales / storeTotals.visitors : 0;

        // Target info if available
        if (store.target && store.target > 0) {
            const achievement = (storeTotals.sales / store.target * 100);
            const endDateObj = new Date(dateRange.end);
            const targetM = getMarch2026TargetMetrics(endDateObj);
            const remainingDays = targetM.remainingKPIGridStyle;
            const dailyReq = remainingDays > 0 ? (store.target - storeTotals.sales) / remainingDays : 0;

            doc.setFontSize(9);
            doc.text(`الهدف: ${Math.round(store.target).toLocaleString()} | التحقيق: %${achievement.toFixed(1)} | اليومية المتبقية: ${Math.round(Math.max(0, dailyReq)).toLocaleString()}`, pageWidth - 15, 28, { align: 'right' });
        }

        // Prepare store table rows
        const storeRows = store.dailyData.map(d => [
            d.date,
            Math.round(d.sales).toLocaleString(),
            Math.round(d.salesPrev).toLocaleString(),
            `${d.growth >= 0 ? '' : ''}${d.growth.toFixed(1)}%`,
            d.trans.toLocaleString(),
            Math.round(d.avgInv).toLocaleString(),
            Math.round(d.customerValue).toLocaleString(),
            d.visitors.toLocaleString(),
            d.visitorsPrev.toLocaleString(),
            `${d.conversion.toFixed(1)}%`
        ]);

        // Add store totals row
        storeRows.push([
            'الإجمالي',
            Math.round(storeTotals.sales).toLocaleString(),
            Math.round(storeTotals.salesPrev).toLocaleString(),
            `${storeGrowth >= 0 ? '' : ''}${storeGrowth.toFixed(1)}%`,
            storeTotals.trans.toLocaleString(),
            Math.round(storeAvgInv).toLocaleString(),
            Math.round(storeCustVal).toLocaleString(),
            storeTotals.visitors.toLocaleString(),
            storeTotals.visitorsPrev.toLocaleString(),
            `${storeConv.toFixed(1)}%`
        ]);

        (doc as any).autoTable({
            startY: 33,
            head: [[
                'التاريخ',
                `مبيعات ${currentYear}`,
                `مبيعات ${prevYear}`,
                '% النمو',
                'عدد الفواتير',
                'متوسط الفاتورة',
                'قيمة العميل',
                `زوار ${currentYear}`,
                `زوار ${prevYear}`,
                '% التحويل'
            ]],
            body: storeRows,
            styles: { font: 'Amiri', halign: 'center', fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [254, 121, 0], textColor: 255 },
            alternateRowStyles: { fillColor: [250, 250, 250] },
            columnStyles: {
                0: { halign: 'center', cellWidth: 22 },
            },
            didParseCell: (data: any) => {
                if (data.row.index === storeRows.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [230, 230, 230];
                }
                if (data.column.index === 3 && data.row.index < storeRows.length - 1) {
                    const val = parseFloat(data.cell.raw);
                    data.cell.styles.textColor = val >= 0 ? [0, 128, 0] : [200, 50, 50];
                }
            }
        });

        // Page number
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`-- ${idx + 2} of ${totalPages} --`, pageWidth / 2, 200, { align: 'center' });
    });

    doc.save(`Sales_Report_all_${dateRange.end}.pdf`);
};

interface EmployeeData {
    name: string;
    ySales: number;
    yShare: number;
    yTrans: number;
    yAvgInv: number;
    mSales: number;
    mShare: number;
    mTrans: number;
    mAvgInv: number;
    target: number;
    achievement: number;
    remaining: number;
    dailyReq: number;
}

interface StoreEmployeeData {
    storeId: string;
    storeName: string;
    employees: EmployeeData[];
}

/**
 * Generates a multi-page PDF report for Employees grouped by store
 * One page per store with employee breakdown
 */
export const generateEmployeeReportByStore = async (
    storesData: StoreEmployeeData[],
    dateRange: { yesterday: string, monthStart: string }
) => {
    const doc = setupDoc('l');
    const pageWidth = 297;

    storesData.forEach((store, storeIdx) => {
        if (storeIdx > 0) doc.addPage();

        // Page header with store name
        addPageHeader(doc, `${store.storeId} - ${store.storeName}`, '');

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);

        // Sub-header showing date ranges
        const headerText = `(Employee) بيانات الموظف      الأمس (Yesterday) - ${dateRange.yesterday}      إلى      (MTD) الشهر الحالي - ${dateRange.monthStart} إلى ${dateRange.yesterday}`;
        doc.text(headerText, pageWidth / 2, 28, { align: 'center' });

        // Calculate store totals
        const storeTotals = store.employees.reduce((acc, e) => ({
            ySales: acc.ySales + e.ySales,
            yTrans: acc.yTrans + e.yTrans,
            mSales: acc.mSales + e.mSales,
            mTrans: acc.mTrans + e.mTrans,
            target: acc.target + e.target,
            remaining: acc.remaining + e.remaining,
        }), { ySales: 0, yTrans: 0, mSales: 0, mTrans: 0, target: 0, remaining: 0 });

        // Prepare employee rows
        const empRows = store.employees.map(e => [
            e.name,
            Math.round(e.ySales).toLocaleString(),
            `${Math.round(e.yShare)}%`,
            e.yTrans,
            Math.round(e.yAvgInv).toLocaleString(),
            Math.round(e.mSales).toLocaleString(),
            `${Math.round(e.mShare)}%`,
            e.mTrans,
            Math.round(e.mAvgInv).toLocaleString(),
            Math.round(e.target).toLocaleString(),
            `${e.achievement.toFixed(1)}%`,
            Math.round(e.remaining).toLocaleString(),
            Math.round(e.dailyReq).toLocaleString()
        ]);

        // Add totals row
        const totalAch = storeTotals.target > 0 ? (storeTotals.mSales / storeTotals.target * 100) : 0;
        empRows.push([
            'الإجمالي',
            Math.round(storeTotals.ySales).toLocaleString(),
            '100%',
            storeTotals.yTrans,
            storeTotals.yTrans > 0 ? Math.round(storeTotals.ySales / storeTotals.yTrans).toLocaleString() : '0',
            Math.round(storeTotals.mSales).toLocaleString(),
            '100%',
            storeTotals.mTrans,
            storeTotals.mTrans > 0 ? Math.round(storeTotals.mSales / storeTotals.mTrans).toLocaleString() : '0',
            Math.round(storeTotals.target).toLocaleString(),
            storeTotals.target > 0 ? `${totalAch.toFixed(1)}%` : '-',
            Math.round(storeTotals.remaining).toLocaleString(),
            '0'
        ]);

        (doc as any).autoTable({
            startY: 33,
            head: [
                [
                    { content: 'الموظف', rowSpan: 2, styles: { valign: 'middle', fillColor: [255, 255, 255], textColor: 0 } },
                    { content: `الأمس - ${dateRange.yesterday}`, colSpan: 4, styles: { halign: 'center', fillColor: [220, 220, 220], textColor: 0 } },
                    { content: `الشهر الحالي - ${dateRange.monthStart} إلى ${dateRange.yesterday}`, colSpan: 8, styles: { halign: 'center', fillColor: [200, 200, 200], textColor: 0 } }
                ],
                [
                    'المبيعات', '% مساهمة', 'العدد', 'م. فاتورة',
                    'المبيعات', '% مساهمة', 'العدد', 'م. فاتورة', 'الهدف', '% تحقيق', 'المتبقي', 'يومية متبقية'
                ]
            ],
            body: empRows,
            styles: { font: 'Amiri', halign: 'center', fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [254, 121, 0], textColor: 255 },
            columnStyles: {
                0: { halign: 'right', fontStyle: 'bold', cellWidth: 35 },
                10: { textColor: [0, 128, 0] }
            },
            alternateRowStyles: { fillColor: [250, 250, 250] },
            didParseCell: (data: any) => {
                if (data.row.index === empRows.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [240, 240, 240];
                }
            }
        });

        // Page number
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`-- ${storeIdx + 1} of ${storesData.length} --`, pageWidth / 2, 200, { align: 'center' });
    });

    doc.save(`Employees_Report_${dateRange.yesterday}.pdf`);
};

// ========== LEGACY FUNCTIONS (kept for backward compatibility) ==========

/**
 * Generates a PDF report for Stores (Sales, Visitors, Targets, etc.)
 */
export const generateStoreReport = async (data: any[], dateRange: { from: string, to: string }) => {
    const doc = setupDoc('l');
    addPageHeader(doc, 'تقرير أداء المعارض - Stores Performance', `الفترة: ${dateRange.from} إلى ${dateRange.to}`);

    const tableRows = data.map((item: any) => [
        item.name || item.id,
        Math.round(item.sales || 0).toLocaleString(),
        (item.visitors || 0).toLocaleString(),
        Math.round(item.avgBasket || 0).toLocaleString(),
        Math.round(item.customerValue || 0).toLocaleString(),
        Math.round(item.target || 0).toLocaleString(),
        `${(item.achievement || 0).toFixed(1)}%`,
        `${item.growth >= 0 ? '+' : ''}${(item.growth || 0).toFixed(1)}%`
    ]);

    (doc as any).autoTable({
        startY: 25,
        head: [['المعرض', 'المبيعات', 'الزوار', 'متوسط الفاتورة', 'قيمة العميل', 'الهدف', 'التحقيق %', 'النمو %']],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center', fontSize: 9 },
        headStyles: { fillColor: [254, 121, 0], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { fontStyle: 'bold', halign: 'right' }
        }
    });

    doc.save(`Stores_Report_${dateRange.to}.pdf`);
};

/**
 * Generates a PDF report for Employees (Performance, Targets, etc.)
 */
export const generateEmployeeReport = async (data: any[], dateRange: { from: string, to: string }) => {
    const doc = setupDoc('l');
    addPageHeader(doc, 'تقرير أداء الموظفين - Employee Performance', `الفترة: ${dateRange.from} إلى ${dateRange.to}`);

    const tableRows = data.map((item: any) => [
        item.name,
        item.store || '-',
        Math.round(item.sales || 0).toLocaleString(),
        Math.round(item.target || 0).toLocaleString(),
        `${(item.achievement || 0).toFixed(1)}%`,
        `${(item.contribution || 0).toFixed(1)}%`,
        item.rank || '-'
    ]);

    (doc as any).autoTable({
        startY: 25,
        head: [['الموظف', 'المعرض', 'المبيعات', 'الهدف', 'التحقيق %', 'المساهمة %', 'الترتيب']],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center', fontSize: 9 },
        headStyles: { fillColor: [254, 121, 0], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { fontStyle: 'bold', halign: 'right' }
        }
    });

    doc.save(`Employees_Report_${dateRange.to}.pdf`);
};

/**
 * Generates the Daily Report PDF (Yesterday vs Last Year)
 */
export const generateDailyReportPDF = async (data: any[], dates: { yesterday: string, lastYear: string }) => {
    const currentYear = new Date(dates.yesterday).getFullYear();
    const prevYear = currentYear - 1;
    const doc = setupDoc('l');
    addPageHeader(doc, 'التقرير اليومي - Daily Sales Report', `التاريخ: ${dates.yesterday} مقارنة بـ ${dates.lastYear}`);

    const tableRows = data.map((item: any) => [
        item.name,
        Math.round(item.sales || 0).toLocaleString(),
        Math.round(item.prevSales || 0).toLocaleString(),
        `${item.growth >= 0 ? '+' : ''}${item.growth?.toFixed(1) || '0.0'}%`,
        Math.round(item.dailyReq || 0).toLocaleString(),
        (item.trans || 0).toLocaleString(),
        Math.round(item.avgInv || 0).toLocaleString(),
        Math.round(item.customerValue || 0).toLocaleString(),
        (item.visitors || 0).toLocaleString(),
        (item.prevVisitors || 0).toLocaleString(),
        `${item.conversion?.toFixed(1) || '0.0'}%`
    ]);

    // Calculate totals for footer
    const totals = data.reduce((acc, curr) => ({
        sales: acc.sales + (curr.sales || 0),
        prevSales: acc.prevSales + (curr.prevSales || 0),
        dailyReq: acc.dailyReq + (curr.dailyReq || 0),
        trans: acc.trans + (curr.trans || 0),
        visitors: acc.visitors + (curr.visitors || 0),
        prevVisitors: acc.prevVisitors + (curr.prevVisitors || 0),
    }), { sales: 0, prevSales: 0, dailyReq: 0, trans: 0, visitors: 0, prevVisitors: 0 });

    const totalGrowth = totals.prevSales > 0 ? ((totals.sales - totals.prevSales) / totals.prevSales) * 100 : 0;
    const totalAvgInv = totals.trans > 0 ? totals.sales / totals.trans : 0;
    const totalConversion = totals.visitors > 0 ? (totals.trans / totals.visitors) * 100 : 0;
    const totalCustValue = totals.visitors > 0 ? totals.sales / totals.visitors : 0;

    tableRows.push([
        'الإجمالي',
        Math.round(totals.sales).toLocaleString(),
        Math.round(totals.prevSales).toLocaleString(),
        `${totalGrowth >= 0 ? '+' : ''}${totalGrowth.toFixed(1)}%`,
        Math.round(totals.dailyReq).toLocaleString(),
        totals.trans.toLocaleString(),
        Math.round(totalAvgInv).toLocaleString(),
        Math.round(totalCustValue).toLocaleString(),
        totals.visitors.toLocaleString(),
        totals.prevVisitors.toLocaleString(),
        `${totalConversion.toFixed(1)}%`
    ]);

    (doc as any).autoTable({
        startY: 25,
        head: [['المعرض', `مبيعات ${currentYear}`, `مبيعات ${prevYear}`, 'النمو %', 'اليومية المتبقية', 'عدد الفواتير', 'متوسط الفاتورة', 'قيمة العميل', `زوار ${currentYear}`, `زوار ${prevYear}`, 'التحويل %']],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center', fontSize: 8 },
        headStyles: { fillColor: [254, 121, 0], textColor: 255, halign: 'center' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { fontStyle: 'bold', halign: 'right' },
            3: { textColor: [0, 0, 0] },
            4: { textColor: [220, 50, 50] },
        },
        didParseCell: (data: any) => {
            if (data.row.index === tableRows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 230, 230];
            }
            if (data.column.index === 3) {
                const val = parseFloat(data.cell.raw);
                if (!isNaN(val)) {
                    data.cell.styles.textColor = val >= 0 ? [0, 128, 0] : [200, 50, 50];
                }
            }
        }
    });

    doc.save(`Daily_Report_${dates.yesterday}.pdf`);
};

/**
 * Generates the Global Sales Summary PDF
 */
export const generateGlobalSalesPDF = async (data: any[], dateRange: { start: string, end: string }) => {
    const currentYear = new Date(dateRange.start).getFullYear();
    const prevYear = currentYear - 1;
    const doc = setupDoc('l');
    addPageHeader(doc, 'ملخص عام - Global Summary', `الفترة: ${dateRange.start} إلى ${dateRange.end}`);

    const tableRows = data.map((item: any) => [
        item.date,
        Math.round(item.sales).toLocaleString(),
        Math.round(item.salesPrev).toLocaleString(),
        `${item.growth >= 0 ? '+' : ''}${item.growth?.toFixed(1) || '0.0'}%`,
        (item.trans || 0).toLocaleString(),
        item.avgInv ? Math.round(item.avgInv).toLocaleString() : '0',
        item.customerValue ? Math.round(item.customerValue).toLocaleString() : '0',
        (item.visitors || 0).toLocaleString(),
        (item.visitorsPrev || 0).toLocaleString(),
        `${item.conversion?.toFixed(1) || '0.0'}%`
    ]);

    // Calculate totals
    const totals = data.reduce((acc, curr) => ({
        sales: acc.sales + (curr.sales || 0),
        salesPrev: acc.salesPrev + (curr.salesPrev || 0),
        trans: acc.trans + (curr.trans || 0),
        visitors: acc.visitors + (curr.visitors || 0),
        visitorsPrev: acc.visitorsPrev + (curr.visitorsPrev || 0),
    }), { sales: 0, salesPrev: 0, trans: 0, visitors: 0, visitorsPrev: 0 });

    const totalGrowth = totals.salesPrev > 0 ? ((totals.sales - totals.salesPrev) / totals.salesPrev) * 100 : 0;
    const totalAvgInv = totals.trans > 0 ? totals.sales / totals.trans : 0;
    const totalCustVal = totals.visitors > 0 ? totals.sales / totals.visitors : 0;
    const totalConv = totals.visitors > 0 ? (totals.trans / totals.visitors) * 100 : 0;

    tableRows.push([
        'الإجمالي',
        Math.round(totals.sales).toLocaleString(),
        Math.round(totals.salesPrev).toLocaleString(),
        `${totalGrowth >= 0 ? '+' : ''}${totalGrowth.toFixed(1)}%`,
        totals.trans.toLocaleString(),
        Math.round(totalAvgInv).toLocaleString(),
        Math.round(totalCustVal).toLocaleString(),
        totals.visitors.toLocaleString(),
        totals.visitorsPrev.toLocaleString(),
        `${totalConv.toFixed(1)}%`
    ]);

    (doc as any).autoTable({
        startY: 25,
        head: [['التاريخ', `مبيعات ${currentYear}`, `مبيعات ${prevYear}`, 'النمو %', 'عدد الفواتير', 'متوسط الفاتورة', 'قيمة العميل', `زوار ${currentYear}`, `زوار ${prevYear}`, 'التحويل %']],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center', fontSize: 8 },
        headStyles: { fillColor: [254, 121, 0], textColor: 255, halign: 'center' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { cellWidth: 25, halign: 'center' },
        },
        didParseCell: (data: any) => {
            if (data.row.index === tableRows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 230, 230];
            }
            if (data.column.index === 3) {
                const val = parseFloat(data.cell.raw);
                if (!isNaN(val)) {
                    data.cell.styles.textColor = val >= 0 ? [0, 128, 0] : [200, 50, 50];
                }
            }
        }
    });

    doc.save(`Sales_Report_${dateRange.start}_${dateRange.end}.pdf`);
};

/**
 * Generates the Employee Performance PDF (Yesterday vs MTD)
 */
export const generateEmployeePerformancePDF = async (data: any[], dateRange: { yesterday: string, monthStart: string }) => {
    const doc = setupDoc('l');
    addPageHeader(doc, 'أداء الموظفين - Employee Performance', `الفترة: ${dateRange.monthStart} إلى ${dateRange.yesterday}`);

    // Calculate totals for footer
    const totals = data.reduce((acc, curr) => ({
        ySales: acc.ySales + (curr.ySales || 0),
        yTrans: acc.yTrans + (curr.yTrans || 0),
        mSales: acc.mSales + (curr.mSales || 0),
        mTrans: acc.mTrans + (curr.mTrans || 0),
        target: acc.target + (curr.target || 0),
        remaining: acc.remaining + (curr.remaining || 0),
    }), { ySales: 0, yTrans: 0, mSales: 0, mTrans: 0, target: 0, remaining: 0 });

    const tableRows = data.map((item: any) => [
        item.name,
        // Yesterday
        Math.round(item.ySales || 0).toLocaleString(),
        `${Math.round(item.yShare || 0)}%`,
        item.yTrans || 0,
        Math.round(item.yAvgInv || 0).toLocaleString(),
        // MTD
        Math.round(item.mSales || 0).toLocaleString(),
        `${Math.round(item.mShare || 0)}%`,
        item.mTrans || 0,
        Math.round(item.mAvgInv || 0).toLocaleString(),
        Math.round(item.target || 0).toLocaleString(),
        `${(item.achievement || 0).toFixed(1)}%`,
        Math.round(item.remaining || 0).toLocaleString(),
        Math.round(item.dailyReq || 0).toLocaleString()
    ]);

    // Add totals row
    const totalAch = totals.target > 0 ? (totals.mSales / totals.target * 100).toFixed(1) : '0.0';
    tableRows.push([
        'الإجمالي (Total)',
        Math.round(totals.ySales).toLocaleString(),
        '100%',
        totals.yTrans,
        totals.yTrans > 0 ? Math.round(totals.ySales / totals.yTrans).toLocaleString() : '0',
        Math.round(totals.mSales).toLocaleString(),
        '100%',
        totals.mTrans,
        totals.mTrans > 0 ? Math.round(totals.mSales / totals.mTrans).toLocaleString() : '0',
        Math.round(totals.target).toLocaleString(),
        `${totalAch}%`,
        Math.round(totals.remaining).toLocaleString(),
        '-'
    ]);

    (doc as any).autoTable({
        startY: 25,
        head: [
            [
                { content: 'الموظف', rowSpan: 2, styles: { valign: 'middle', fillColor: [255, 255, 255], textColor: 0, halign: 'center' } },
                { content: `نهاية الفترة - ${dateRange.yesterday}`, colSpan: 4, styles: { halign: 'center', fillColor: [220, 220, 220], textColor: 0 } },
                { content: `الفترة المحددة - ${dateRange.monthStart} إلى ${dateRange.yesterday}`, colSpan: 8, styles: { halign: 'center', fillColor: [200, 200, 200], textColor: 0 } }
            ],
            [
                'المبيعات', 'المساهمة %', 'العدد', 'متوسط الفاتورة',
                'المبيعات', 'المساهمة %', 'العدد', 'متوسط الفاتورة', 'الهدف', 'التحقيق %', 'المتبقي', 'اليومية المتبقية'
            ]
        ],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center', fontSize: 8, cellPadding: 1 },
        headStyles: { fillColor: [254, 121, 0], textColor: 255 },
        columnStyles: {
            0: { fontStyle: 'bold', halign: 'right', minCellWidth: 30 },
            10: { textColor: [0, 128, 0], fontStyle: 'bold' }
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didParseCell: (data: any) => {
            if (data.row.index === tableRows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [240, 240, 240];
            }
        }
    });

    doc.save(`Employees_Report_${new Date().toLocaleDateString('en-CA')}.pdf`);
};

/**
 * تقرير تحليل العروض (PDF) - مطابق للريبو الأصلي
 */
export const generateOffersPDF = async (
    offers: { name: string; start?: string; end?: string; periodSales: number; periodDisc: number; periodOps: number; periodEff: number; periodAvgBasket: number }[],
    dateRange: { start: string; end: string; label?: string }
) => {
    if (!offers.length) return;
    const doc = setupDoc('l');
    doc.setFontSize(18);
    doc.text('تقرير تحليل العروض', 148, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`الفترة: ${dateRange.start} إلى ${dateRange.end}`, 282, 15, { align: 'right' });
    const totalSales = offers.reduce((s, o) => s + (o.periodSales || 0), 0);
    const totalDisc = offers.reduce((s, o) => s + (o.periodDisc || 0), 0);
    const globalEff = totalSales > 0 ? ((totalDisc / totalSales) * 100).toFixed(1) : '0';
    doc.setFontSize(11);
    doc.text(`إجمالي العروض: ${offers.length} | المبيعات: ${Math.round(totalSales).toLocaleString()} | الخصم: ${Math.round(totalDisc).toLocaleString()} | الكفاءة: ${globalEff}%`, 15, 25);
    const tableData = offers.slice(0, 40).map((o, idx) => [
        (idx + 1).toString(),
        (o.name || '').substring(0, 35),
        (o.start || '-'),
        (o.end || '-'),
        (o.periodOps || 0).toLocaleString(),
        Math.round(o.periodDisc || 0).toLocaleString(),
        Math.round(o.periodSales || 0).toLocaleString(),
        (o.periodEff != null ? o.periodEff.toFixed(1) : '0') + '%',
        Math.round(o.periodAvgBasket || 0).toLocaleString()
    ]);
    (doc as any).autoTable({
        head: [['#', 'العرض', 'البداية', 'النهاية', 'العمليات', 'الخصم', 'المبيعات', 'الكفاءة', 'متوسط السلة']],
        body: tableData,
        startY: 30,
        styles: { font: 'Amiri', halign: 'center', fontSize: 8 },
        headStyles: { fillColor: [254, 121, 0], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    doc.save(`تحليل_العروض_${dateRange.start}_${dateRange.end}.pdf`);
};

/**
 * تقرير تحليل المنتجات (PDF) - ملخص
 */
export const generateProductSummaryPDF = async (
    rows: { name: string; category?: string; qty: number; amount: number }[],
    dateRange: { start: string; end: string }
) => {
    if (!rows.length) return;
    const doc = setupDoc('l');
    doc.setFontSize(18);
    doc.text('تقرير تحليل المنتجات', 148, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`الفترة: ${dateRange.start} إلى ${dateRange.end}`, 282, 15, { align: 'right' });
    const tableData = rows.slice(0, 50).map((r, idx) => [
        (idx + 1).toString(),
        (r.name || '').substring(0, 40),
        (r.category || '-'),
        (r.qty || 0).toLocaleString(),
        Math.round(r.amount || 0).toLocaleString()
    ]);
    (doc as any).autoTable({
        head: [['#', 'المنتج', 'الفئة', 'الكمية', 'المبيعات']],
        body: tableData,
        startY: 25,
        styles: { font: 'Amiri', halign: 'center', fontSize: 8 },
        headStyles: { fillColor: [254, 121, 0], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    doc.save(`تحليل_المنتجات_${dateRange.start}_${dateRange.end}.pdf`);
};

type TargetSplitPdfMetrics = {
    target: number;
    sales: number;
    achievement: number;
    avgInv: number;
    conversion?: number;
    customerValue: number;
    contributionPct?: number;
    items?: number;
    dailyTargetDynamic?: number;
};

type TargetSplitPdfBucket = {
    label: string;
    metrics: TargetSplitPdfMetrics;
};

type TargetSplitPdfBlock = {
    label: string;
    buckets: TargetSplitPdfBucket[];
};

type TargetSplitPdfEmployee = {
    id: string;
    name: string;
    monthTarget: number;
    monthSales: number;
    bucketBlocks: TargetSplitPdfBlock[];
};

type TargetSplitPdfStore = {
    sid: string;
    name: string;
    manager: string;
    monthTarget: number;
    monthSales: number;
    monthAch: number;
    bucketBlocks: TargetSplitPdfBlock[];
    employees: TargetSplitPdfEmployee[];
};

const fmtN = (v: number) => Math.round(v || 0).toLocaleString();

const periodNeed = (bucketLabel: string, shortfall: number, lastAvailableInMonth: string) => {
    const parts = String(bucketLabel || '').split('—').map(s => s.trim());
    const bucketStart = parts.length > 1 ? parts[0] : parts[0];
    const bucketEnd = parts.length > 1 ? parts[1] : parts[0];
    const d = new Date(lastAvailableInMonth + 'T12:00:00');
    d.setDate(d.getDate() + 1); // include "today" relative to data cutoff (yesterday)
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Active bucket: count from today to bucket end.
    // Future bucket: count full bucket days only (do not include current bucket leftovers).
    const fromYmd = todayStr < bucketStart ? bucketStart : todayStr;
    const a = new Date(fromYmd + 'T12:00:00').getTime();
    const b = new Date(bucketEnd + 'T12:00:00').getTime();
    const days = Math.max(1, Math.floor((b - a) / 86400000) + 1);
    return { days, daily: Math.max(0, shortfall) / days };
};

export const generateTargetSplitStorePDF = async (
    store: TargetSplitPdfStore,
    opts: { monthLabel: string; granularityLabel: string; lastAvailableInMonth: string }
) => {
    const doc = setupDoc('l');
    addPageHeader(doc, `تقسيمة التارجت - ${store.name}`, `Manager: ${store.manager || '-'}`);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`الشهر: ${opts.monthLabel} | التقسيم: ${opts.granularityLabel} | البيانات حتى: ${opts.lastAvailableInMonth}`, 15, 28);
    doc.text(
        `تارجت الشهر: ${fmtN(store.monthTarget)} | المبيعات: ${fmtN(store.monthSales)} | التحقيق: ${store.monthAch.toFixed(1)}%`,
        15,
        34
    );

    const storeRows: any[] = [];
    store.bucketBlocks.forEach((block) => {
        (block.buckets || []).forEach((b) => {
            const m = b.metrics || ({} as TargetSplitPdfMetrics);
            const expected = (m.dailyTargetDynamic ?? m.target) || 0;
            const shortfall = Math.max(0, expected - (m.sales || 0));
            const need = periodNeed(b.label, shortfall, opts.lastAvailableInMonth);
            storeRows.push([
                block.label || '-',
                b.label,
                fmtN(expected),
                fmtN(m.sales),
                `${(m.achievement || 0).toFixed(1)}%`,
                fmtN(m.avgInv),
                `${(m.conversion || 0).toFixed(1)}%`,
                fmtN(m.customerValue),
                fmtN(shortfall),
                String(need.days),
                fmtN(need.daily),
            ]);
        });
    });

    (doc as any).autoTable({
        startY: 40,
        head: [['المرحلة', 'الفترة', 'التارجت', 'المبيعات', 'التحقيق', 'معدل فاتورة', 'التحويل', 'قيمة عميل', 'متبقي الفترة', 'باقي أيام', 'مطلوب يومياً']],
        body: storeRows.length ? storeRows : [['-', '-', '0', '0', '0.0%', '0', '0.0%', '0', '0', '1', '0']],
        styles: { font: 'Amiri', halign: 'center', fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [254, 121, 0], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.addPage();
    addPageHeader(doc, `الموظفون - ${store.name}`, `${store.sid}`);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`الشهر: ${opts.monthLabel} | التقسيم: ${opts.granularityLabel}`, 15, 28);

    const empRows: any[] = [];
    const separatorRows = new Set<number>();
    const firstPeriodRows = new Map<number, boolean>();
    (store.employees || []).forEach((emp) => {
        const empAch = emp.monthTarget > 0 ? (emp.monthSales / emp.monthTarget) * 100 : 0;
        let markedFirstPeriod = false;
        const sepIndex = empRows.length;
        separatorRows.add(sepIndex);
        empRows.push([
            `الموظف: ${emp.name} (${emp.id})`,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            `تحقيق الشهر ${empAch.toFixed(1)}%`,
        ]);
        (emp.bucketBlocks || []).forEach((block) => {
            (block.buckets || []).forEach((b) => {
                const m = b.metrics || ({} as TargetSplitPdfMetrics);
                const expected = (m.dailyTargetDynamic ?? m.target) || 0;
                const shortfall = Math.max(0, expected - (m.sales || 0));
                const need = periodNeed(b.label, shortfall, opts.lastAvailableInMonth);
                const rowIndex = empRows.length;
                empRows.push([
                    `${emp.name} (${emp.id})`,
                    block.label || '-',
                    b.label,
                    fmtN(expected),
                    fmtN(m.sales),
                    `${(m.achievement || 0).toFixed(1)}%`,
                    fmtN(m.avgInv),
                    `${(m.contributionPct || 0).toFixed(1)}%`,
                    fmtN(m.items || 0),
                    fmtN(m.customerValue),
                    fmtN(shortfall),
                    String(need.days),
                    fmtN(need.daily),
                    `${empAch.toFixed(1)}%`,
                ]);
                if (!markedFirstPeriod) {
                    firstPeriodRows.set(rowIndex, (m.achievement || 0) >= 100);
                    markedFirstPeriod = true;
                }
            });
        });
    });

    (doc as any).autoTable({
        startY: 34,
        head: [['الموظف', 'المرحلة', 'الفترة', 'التارجت', 'المبيعات', 'التحقيق', 'ATV', 'المساهمة', 'القطع', 'قيمة عميل', 'متبقي الفترة', 'باقي أيام', 'مطلوب يومياً', 'تحقيق الشهر']],
        body: empRows.length ? empRows : [['-', '-', '-', '0', '0', '0.0%', '0', '0.0%', '0', '0', '0', '1', '0', '0.0%']],
        styles: { font: 'Amiri', halign: 'center', fontSize: 7.2, cellPadding: 1.2 },
        headStyles: { fillColor: [70, 85, 110], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { halign: 'right', cellWidth: 32 },
            2: { cellWidth: 30 },
        },
        didParseCell: (data: any) => {
            const r = data.row.index;
            if (separatorRows.has(r)) {
                data.cell.styles.fillColor = [232, 236, 244];
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [15, 23, 42];
            }
            if (firstPeriodRows.has(r)) {
                const ok = firstPeriodRows.get(r);
                data.cell.styles.fillColor = ok ? [220, 252, 231] : [254, 226, 226];
                data.cell.styles.textColor = ok ? [22, 101, 52] : [127, 29, 29];
            }
        },
    });

    const safeName = String(store.name || store.sid).replace(/[\\/:*?"<>|]/g, '_');
    doc.save(`TargetSplit_${safeName}_${opts.monthLabel}.pdf`);
};
