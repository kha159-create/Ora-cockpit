import { amiriFontBase64 } from './amiriFont';

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

const setupDoc = (title: string, subtitle?: string) => {
    const jsPDF = getJsPDF();
    const doc = new jsPDF('l', 'mm', 'a4');

    // Register Arabic Font
    doc.addFileToVFS('Amiri-Regular.ttf', amiriFontBase64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    doc.setFont('Amiri');

    // Add Logo or Header Branding
    doc.setFillColor(20, 20, 20); // Dark theme
    doc.rect(0, 0, 297, 20, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(title, 15, 13);

    if (subtitle) {
        doc.setFontSize(10);
        doc.text(subtitle, 280, 13, { align: 'right' });
    }

    return doc;
};

/**
 * Generates a PDF report for Stores (Sales, Visitors, Targets, etc.)
 */
export const generateStoreReport = async (data: any[], dateRange: { from: string, to: string }) => {
    const doc = setupDoc('تقرير أداء المعارض - Stores Performance', `الفترة: ${dateRange.from} إلى ${dateRange.to}`);

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
    const doc = setupDoc('تقرير أداء الموظفين - Employee Performance', `الفترة: ${dateRange.from} إلى ${dateRange.to}`);

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
 * Matches layout from DashboardPage.tsx modal and styling from original pdf_export.js
 */
export const generateDailyReportPDF = async (data: any[], dates: { yesterday: string, lastYear: string }) => {
    const currentYear = new Date(dates.yesterday).getFullYear();
    const prevYear = currentYear - 1;
    const doc = setupDoc('التقرير اليومي - Daily Sales Report', `التاريخ: ${dates.yesterday} مقارنة بـ ${dates.lastYear}`);

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
            3: { textColor: (data: any) => data.cell.raw.includes('-') ? [220, 50, 50] : [0, 150, 0] },
            4: { textColor: [220, 50, 50] },
        },
        didParseCell: (data: any) => {
            if (data.row.index === tableRows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 230, 230];
            }
        }
    });

    doc.save(`Daily_Report_${dates.yesterday}.pdf`);
};

/**
 * Generates the Global Sales Summary PDF (Time Series: Sales, Growth, Visitors, etc.)
 * Matches 'Sales_Report_all' logic from original repo.
 */
export const generateGlobalSalesPDF = async (data: any[], dateRange: { start: string, end: string }) => {
    const currentYear = new Date(dateRange.start).getFullYear();
    const prevYear = currentYear - 1;
    const doc = setupDoc('ملخص عام - Global Summary', `الفترة: ${dateRange.start} إلى ${dateRange.end}`);

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
            3: { textColor: (data: any) => data.cell.raw.includes('-') ? [220, 50, 50] : [0, 150, 0] },
        },
        didParseCell: (data: any) => {
            if (data.row.index === tableRows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 230, 230];
            }
        }
    });

    doc.save(`Sales_Report_${dateRange.start}_${dateRange.end}.pdf`);
};

/**
 * Generates the Employee Performance PDF (Yesterday vs MTD)
 * Matches 'Employees_Report' logic from original repo.
 */
export const generateEmployeePerformancePDF = async (data: any[], dateRange: { yesterday: string, monthStart: string }) => {
    const doc = setupDoc('أداء الموظفين - Employee Performance', `الفترة: ${dateRange.monthStart} إلى ${dateRange.yesterday}`);

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
