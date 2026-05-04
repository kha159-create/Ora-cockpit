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

type ProductValuePdfSection = {
    title: string;
    rows: { label: string; qty: number; amount?: number; percentage: number }[];
    totalQty: number;
};

type ProductValuePdfBlock = {
    title: string;
    subtitle?: string;
    sections: ProductValuePdfSection[];
};

export const generateProductValueAnalysisPDF = async (
    summary: ProductValuePdfBlock,
    dateRange: { start: string; end: string },
    storeBlocks: ProductValuePdfBlock[] = []
) => {
    const doc = setupDoc('l');
    const addBlock = (block: ProductValuePdfBlock, pageIndex: number) => {
        if (pageIndex > 0) doc.addPage();
        addPageHeader(doc, block.title, block.subtitle);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.text(`الفترة: ${dateRange.start} إلى ${dateRange.end}`, 282, 28, { align: 'right' });

        let startY = 35;
        block.sections.forEach((section) => {
            doc.setFontSize(11);
            doc.text(`${section.title} - إجمالي الوحدات: ${Math.round(section.totalQty).toLocaleString()}`, 282, startY, { align: 'right' });
            const tableRows = section.rows.map((r) => [
                r.label,
                Math.round(r.qty || 0).toLocaleString(),
                `${(r.percentage || 0).toFixed(1)}%`,
                Math.round(r.amount || 0).toLocaleString(),
            ]);
            (doc as any).autoTable({
                head: [['الشريحة', 'الوحدات', 'النسبة', 'القيمة']],
                body: tableRows,
                startY: startY + 4,
                styles: { font: 'Amiri', halign: 'center', fontSize: 8 },
                headStyles: { fillColor: [254, 121, 0], textColor: 255 },
                alternateRowStyles: { fillColor: [245, 245, 245] },
                margin: { left: 14, right: 14 },
            });
            startY = ((doc as any).lastAutoTable?.finalY || startY + 22) + 10;
            if (startY > 190) {
                doc.addPage();
                addPageHeader(doc, block.title, block.subtitle);
                startY = 30;
            }
        });
    };

    [summary, ...storeBlocks].forEach((block, idx) => addBlock(block, idx));
    doc.save(`تحليل_المبيعات_حسب_القيمة_${dateRange.start}_${dateRange.end}.pdf`);
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
    if (todayStr > bucketEnd) {
        return { days: 0, daily: 0 };
    }
    const fromYmd = todayStr < bucketStart ? bucketStart : todayStr;
    const a = new Date(fromYmd + 'T12:00:00').getTime();
    const b = new Date(bucketEnd + 'T12:00:00').getTime();
    const days = Math.max(1, Math.floor((b - a) / 86400000) + 1);
    return { days, daily: days > 0 ? Math.max(0, shortfall) / days : 0 };
};

const parseBucketRange = (bucketLabel: string) => {
    const parts = String(bucketLabel || '').split('—').map(s => s.trim());
    return {
        start: parts[0] || '',
        end: parts.length > 1 ? parts[1] : parts[0] || '',
    };
};

const flattenTargetBuckets = (blocks: TargetSplitPdfBlock[]) => {
    return (blocks || []).flatMap((block) =>
        (block.buckets || []).map((bucket) => ({
            blockLabel: block.label || '-',
            bucket,
            range: parseBucketRange(bucket.label),
            metrics: bucket.metrics || ({} as TargetSplitPdfMetrics),
        })),
    );
};

const pickActiveTargetBucket = (blocks: TargetSplitPdfBlock[], lastAvailableInMonth: string) => {
    const rows = flattenTargetBuckets(blocks);
    const activeIndex = rows.findIndex((row) => row.range.start <= lastAvailableInMonth && row.range.end >= lastAvailableInMonth);
    if (activeIndex >= 0) return { rows, activeIndex };
    const nextIndex = rows.findIndex((row) => row.range.start > lastAvailableInMonth);
    return { rows, activeIndex: nextIndex >= 0 ? nextIndex : Math.max(0, rows.length - 1) };
};

const drawTargetKpi = (
    doc: any,
    x: number,
    y: number,
    w: number,
    title: string,
    value: string,
    accent: [number, number, number] = [254, 121, 0],
) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(x, y, w, 18, 3, 3, 'FD');
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.roundedRect(x + w - 3, y, 3, 18, 1.5, 1.5, 'F');
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.text(title, x + w - 7, y + 6, { align: 'right' });
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(13);
    doc.text(value, x + w - 7, y + 14, { align: 'right' });
};

const drawPeriodMetricCard = (
    doc: any,
    x: number,
    y: number,
    w: number,
    label: string,
    acquisition: number,
    avgInv: number,
    customerValue: number,
    achieved: boolean,
) => {
    const tone: [number, number, number] = achieved ? [22, 163, 74] : [220, 38, 38];
    const fill: [number, number, number] = achieved ? [240, 253, 244] : [254, 242, 242];
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(x + 1.2, y + 1.2, w, 22, 3, 3, 'S');
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.roundedRect(x, y, w, 22, 3, 3, 'FD');
    doc.setFillColor(tone[0], tone[1], tone[2]);
    doc.roundedRect(x + w - 3, y, 3, 22, 1.5, 1.5, 'F');
    doc.setTextColor(tone[0], tone[1], tone[2]);
    doc.setFontSize(8);
    doc.text(label, x + w - 7, y + 6, { align: 'right' });
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(7.2);
    doc.text(`استحواذ ${acquisition.toFixed(1)}%`, x + w - 7, y + 12, { align: 'right' });
    doc.text(`معدل فاتورة ${fmtN(avgInv)}`, x + w - 7, y + 17, { align: 'right' });
    doc.text(`قيمة عميل ${fmtN(customerValue)}`, x + w - 7, y + 21, { align: 'right' });
};

export const generateTargetSplitStorePDF = async (
    store: TargetSplitPdfStore,
    opts: { monthLabel: string; granularityLabel: string; lastAvailableInMonth: string }
) => {
    const doc = setupDoc('l');
    addPageHeader(doc, `تقرير تقسيمة التارجت - ${store.name}`, `Manager: ${store.manager || '-'}`);

    const { rows: storeFlatRows, activeIndex: storeActiveIndex } = pickActiveTargetBucket(store.bucketBlocks, opts.lastAvailableInMonth);
    const activeStore = storeFlatRows[storeActiveIndex];
    const activeStoreMetrics = activeStore?.metrics || ({} as TargetSplitPdfMetrics);
    const activeExpected = (activeStoreMetrics.dailyTargetDynamic ?? activeStoreMetrics.target) || 0;
    const activeSales = activeStoreMetrics.sales || 0;
    const activeShortfall = Math.max(0, activeExpected - activeSales);
    const activeNeed = periodNeed(activeStore?.bucket.label || '', activeShortfall, opts.lastAvailableInMonth);
    const prevStore = storeActiveIndex > 0 ? storeFlatRows[storeActiveIndex - 1] : null;
    const prevExpected = prevStore ? (prevStore.metrics.dailyTargetDynamic ?? prevStore.metrics.target) || 0 : 0;
    const prevCarry = prevStore ? prevExpected - (prevStore.metrics.sales || 0) : 0;

    doc.setFillColor(248, 250, 252);
    doc.rect(0, 20, 297, 190, 'F');
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(9);
    doc.text(`الشهر: ${opts.monthLabel} | التقسيم: ${opts.granularityLabel} | البيانات حتى: ${opts.lastAvailableInMonth}`, 282, 29, { align: 'right' });

    drawTargetKpi(doc, 218, 37, 58, 'تارجت الفترة الحالية', fmtN(activeExpected), [254, 121, 0]);
    drawTargetKpi(doc, 156, 37, 58, 'مبيعات الفترة', fmtN(activeSales), [16, 185, 129]);
    drawTargetKpi(doc, 94, 37, 58, 'تحقيق الفترة', `${(activeExpected > 0 ? (activeSales / activeExpected) * 100 : 0).toFixed(1)}%`, [59, 130, 246]);
    drawTargetKpi(doc, 32, 37, 58, 'المتبقي', fmtN(activeShortfall), [239, 68, 68]);

    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(15, 63, 267, 30, 4, 4, 'FD');
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(12);
    doc.text('الفترة الحالية', 272, 73, { align: 'right' });
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(10);
    doc.text(`${activeStore?.blockLabel || '-'} | ${activeStore?.bucket.label || '-'}`, 272, 84, { align: 'right' });
    doc.text(`ترحيل من الفترة السابقة: ${prevCarry >= 0 ? '+' : '-'}${fmtN(Math.abs(prevCarry))}`, 158, 74, { align: 'right' });
    doc.text(`مطلوب يومياً: ${fmtN(activeNeed.daily)} (${activeNeed.days} أيام)`, 158, 84, { align: 'right' });
    doc.text(`كسر السابقة: ${fmtN(Math.max(0, prevCarry))}`, 58, 74, { align: 'center' });
    doc.text(`نقص بسبب زيادة: ${fmtN(Math.max(0, -prevCarry))}`, 58, 84, { align: 'center' });

    const metricCardRows = storeFlatRows.slice(0, 4);
    const cardGap = 5;
    const cardW = metricCardRows.length > 0 ? (267 - cardGap * (metricCardRows.length - 1)) / metricCardRows.length : 78;
    metricCardRows.forEach((row, idx) => {
        const m = row.metrics;
        const expected = (m.dailyTargetDynamic ?? m.target) || 0;
        const sales = m.sales || 0;
        const acquisition = m.conversion || 0;
        drawPeriodMetricCard(
            doc,
            15 + idx * (cardW + cardGap),
            98,
            cardW,
            row.bucket.label,
            acquisition,
            m.avgInv || 0,
            m.customerValue || 0,
            sales >= expected && expected > 0,
        );
    });

    const storeRows: any[] = [];
    storeFlatRows.forEach((row, idx) => {
        const m = row.metrics;
        const expected = (m.dailyTargetDynamic ?? m.target) || 0;
        const sales = m.sales || 0;
        const carry = idx > 0 ? ((storeFlatRows[idx - 1].metrics.dailyTargetDynamic ?? storeFlatRows[idx - 1].metrics.target) || 0) - (storeFlatRows[idx - 1].metrics.sales || 0) : 0;
        const shortfall = Math.max(0, expected - sales);
        const need = periodNeed(row.bucket.label, shortfall, opts.lastAvailableInMonth);
        storeRows.push([
            row.blockLabel,
            row.bucket.label,
            fmtN(Math.max(0, carry)),
            carry < 0 ? fmtN(Math.abs(carry)) : '0',
            fmtN(expected),
            fmtN(sales),
            `${(expected > 0 ? (sales / expected) * 100 : 0).toFixed(1)}%`,
            fmtN(m.avgInv || 0),
            fmtN(shortfall),
            fmtN(need.daily),
        ]);
    });

    (doc as any).autoTable({
        startY: 125,
        head: [['المرحلة', 'الفترة', 'كسر مرحل', 'نقص من زيادة', 'تارجت الفترة', 'مبيعات', 'تحقيق', 'معدل فاتورة', 'المتبقي', 'مطلوب يومياً']],
        body: storeRows.length ? storeRows : [['-', '-', '0', '0', '0', '0', '0.0%', '0', '0', '0']],
        styles: { font: 'Amiri', halign: 'center', fontSize: 8.7, cellPadding: 2.1, lineColor: [226, 232, 240], lineWidth: 0.25, valign: 'middle' },
        headStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.35 },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        bodyStyles: { fillColor: [249, 250, 251], textColor: [31, 41, 55] },
        columnStyles: {
            0: { cellWidth: 24 },
            1: { cellWidth: 36, fontStyle: 'bold' },
            4: { fontStyle: 'bold', textColor: [17, 24, 39] },
            5: { fontStyle: 'bold', textColor: [17, 24, 39] },
            6: { fontStyle: 'bold', textColor: [30, 64, 175] },
        },
        didParseCell: (data: any) => {
            if (data.section === 'body' && Array.isArray(data.row.raw)) {
                const expected = Number(String(data.row.raw[4] || '0').replace(/[^\d.-]/g, ''));
                const sales = Number(String(data.row.raw[5] || '0').replace(/[^\d.-]/g, ''));
                if (Number.isFinite(expected) && expected > 0) {
                    data.cell.styles.fillColor = sales >= expected ? [240, 253, 244] : [254, 242, 242];
                }
            }
            if (data.column.index === 2 || data.column.index === 8 || data.column.index === 9) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [153, 27, 27];
            }
            if (data.column.index === 3) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [22, 101, 52];
            }
        },
    });
    doc.addPage();
    addPageHeader(doc, `تفصيل الموظفين - ${store.name}`, `${store.sid}`);
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 20, 297, 190, 'F');
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(9);
    doc.text(`الشهر: ${opts.monthLabel} | التقسيم: ${opts.granularityLabel} | البيانات حتى: ${opts.lastAvailableInMonth}`, 282, 29, { align: 'right' });

    const empRows: any[] = [];
    const separatorRows = new Set<number>();
    const firstPeriodRows = new Map<number, boolean>();
    const EMP_COLS = 10;
    (store.employees || []).forEach((emp) => {
        const { rows: empFlatRows, activeIndex: empActiveIndex } = pickActiveTargetBucket(emp.bucketBlocks, opts.lastAvailableInMonth);
        const empActive = empFlatRows[empActiveIndex];
        const empActiveMetrics = empActive?.metrics || ({} as TargetSplitPdfMetrics);
        const empExpected = (empActiveMetrics.dailyTargetDynamic ?? empActiveMetrics.target) || 0;
        const empSales = empActiveMetrics.sales || 0;
        const empAch = empExpected > 0 ? (empSales / empExpected) * 100 : 0;
        const empPrev = empActiveIndex > 0 ? empFlatRows[empActiveIndex - 1] : null;
        const empPrevExpected = empPrev ? (empPrev.metrics.dailyTargetDynamic ?? empPrev.metrics.target) || 0 : 0;
        const empCarry = empPrev ? empPrevExpected - (empPrev.metrics.sales || 0) : 0;
        let markedFirstPeriod = false;
        const sepIndex = empRows.length;
        separatorRows.add(sepIndex);
        const sepText =
            `الموظف: ${emp.name} (${emp.id}) — الفترة الحالية: ${empActive?.bucket.label || '-'} — تارجت الفترة: ${fmtN(empExpected)} — تحقيق الفترة: ${empAch.toFixed(1)}% — ترحيل سابق: ${empCarry >= 0 ? '+' : '-'}${fmtN(Math.abs(empCarry))}`;
        empRows.push([
            {
                content: sepText,
                colSpan: EMP_COLS,
                styles: {
                    fillColor: [232, 236, 244],
                    fontStyle: 'bold',
                    textColor: [15, 23, 42],
                    fontSize: 8.5,
                    halign: 'right',
                    valign: 'middle',
                    cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
                },
            },
        ]);
        let firstRowForEmployee = true;
        empFlatRows.forEach((row, idx) => {
            const m = row.metrics;
            const expected = (m.dailyTargetDynamic ?? m.target) || 0;
            const sales = m.sales || 0;
            const carry = idx > 0 ? ((empFlatRows[idx - 1].metrics.dailyTargetDynamic ?? empFlatRows[idx - 1].metrics.target) || 0) - (empFlatRows[idx - 1].metrics.sales || 0) : 0;
            const shortfall = Math.max(0, expected - sales);
            const need = periodNeed(row.bucket.label, shortfall, opts.lastAvailableInMonth);
            const achPeriodPct = expected > 0 ? (sales / expected) * 100 : 0;
            const rowIndex = empRows.length;
            empRows.push([
                firstRowForEmployee ? `${emp.name} (${emp.id})` : '↳',
                row.bucket.label,
                fmtN(Math.max(0, carry)),
                carry < 0 ? fmtN(Math.abs(carry)) : '0',
                fmtN(expected),
                fmtN(sales),
                `${achPeriodPct.toFixed(1)}%`,
                fmtN(m.avgInv || 0),
                fmtN(shortfall),
                fmtN(need.daily),
            ]);
            firstRowForEmployee = false;
            if (!markedFirstPeriod) {
                firstPeriodRows.set(rowIndex, achPeriodPct >= 100);
                markedFirstPeriod = true;
            }
        });
    });

    (doc as any).autoTable({
        startY: 36,
        head: [['الموظف', 'الفترة', 'كسر مرحل', 'نقص من زيادة', 'تارجت الفترة', 'مبيعات', 'تحقيق', 'معدل فاتورة', 'المتبقي', 'مطلوب يومياً']],
        body: empRows.length ? empRows : [['-', '-', '0', '0', '0', '0', '0.0%', '0', '0', '0']],
        styles: { font: 'Amiri', halign: 'center', fontSize: 7.7, cellPadding: 1.75, lineColor: [226, 232, 240], lineWidth: 0.25, valign: 'middle' },
        headStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.35 },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        bodyStyles: { fillColor: [249, 250, 251], textColor: [31, 41, 55] },
        columnStyles: {
            0: { halign: 'right', cellWidth: 38 },
            1: { cellWidth: 30, fontStyle: 'bold' },
            4: { fontStyle: 'bold', textColor: [17, 24, 39] },
            5: { fontStyle: 'bold', textColor: [17, 24, 39] },
            6: { fontStyle: 'bold', textColor: [30, 64, 175] },
        },
        didParseCell: (data: any) => {
            const r = data.row.index;
            const cellRaw = data.row.raw;
            const isSep =
                separatorRows.has(r) ||
                (Array.isArray(cellRaw) &&
                    cellRaw.length === 1 &&
                    typeof cellRaw[0] === 'object' &&
                    (cellRaw[0] as { colSpan?: number }).colSpan === EMP_COLS);
            if (isSep && data.column.index === 0) {
                data.cell.styles.fillColor = [232, 236, 244];
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [15, 23, 42];
                data.cell.styles.fontSize = 8.5;
                data.cell.styles.halign = 'right';
            }
            if (!isSep && data.section === 'body' && Array.isArray(data.row.raw)) {
                const expected = Number(String(data.row.raw[4] || '0').replace(/[^\d.-]/g, ''));
                const sales = Number(String(data.row.raw[5] || '0').replace(/[^\d.-]/g, ''));
                if (Number.isFinite(expected) && expected > 0) {
                    data.cell.styles.fillColor = sales >= expected ? [240, 253, 244] : [254, 242, 242];
                }
            }
            if (firstPeriodRows.has(r)) {
                const ok = firstPeriodRows.get(r);
                data.cell.styles.fillColor = ok ? [220, 252, 231] : [254, 226, 226];
                data.cell.styles.textColor = ok ? [22, 101, 52] : [127, 29, 29];
            }
            if (data.column.index === 2 || data.column.index === 8 || data.column.index === 9) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [153, 27, 27];
            }
            if (data.column.index === 3) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [22, 101, 52];
            }
        },
    });

    const safeName = String(store.name || store.sid).replace(/[\\/:*?"<>|]/g, '_');
    doc.save(`TargetSplit_${safeName}_${opts.monthLabel}.pdf`);
};
