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
    const doc = setupDoc('Stores Performance Report', `Period: ${dateRange.from} to ${dateRange.to}`);

    const tableRows = data.map((item: any) => [
        item.name || item.id,
        item.sales?.toLocaleString() || '0',
        item.visitors?.toLocaleString() || '0',
        item.avgBasket?.toLocaleString() || '0',
        item.customerValue?.toLocaleString() || '0',
        item.target?.toLocaleString() || '0',
        `${item.achievement || 0}%`,
        item.growth >= 0 ? `+${item.growth}%` : `${item.growth}%`
    ]);

    (doc as any).autoTable({
        startY: 25,
        head: [['Store Name', 'Sales', 'Visitors', 'Avg Basket', 'Cust Value', 'Target', 'Achieve', 'Growth']],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center' },
        headStyles: { fillStyle: [20, 20, 20] },
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    doc.save(`Stores_Report_${dateRange.to}.pdf`);
};

/**
 * Generates a PDF report for Employees (Performance, Targets, etc.)
 */
export const generateEmployeeReport = async (data: any[], dateRange: { from: string, to: string }) => {
    const doc = setupDoc('Employees Performance Report', `Period: ${dateRange.from} to ${dateRange.to}`);

    const tableRows = data.map((item: any) => [
        item.name,
        item.store,
        item.sales?.toLocaleString() || '0',
        item.target?.toLocaleString() || '0',
        `${item.achievement || 0}%`,
        item.contribution?.toLocaleString() || '0',
        item.rank || '-'
    ]);

    (doc as any).autoTable({
        startY: 25,
        head: [['Employee Name', 'Store', 'Sales', 'Target', 'Achieve', 'Contribution', 'Rank']],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center' },
        headStyles: { fillStyle: [20, 20, 20] },
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    doc.save(`Employees_Report_${dateRange.to}.pdf`);
};

/**
 * Generates the Daily Report PDF (Yesterday vs Last Year)
 * Matches layout from DashboardPage.tsx modal and styling from original pdf_export.js
 */
export const generateDailyReportPDF = async (data: any[], dates: { yesterday: string, lastYear: string }) => {
    const doc = setupDoc('Daily Sales Report - التقرير اليومي', `Date: ${dates.yesterday} vs ${dates.lastYear}`);

    const tableRows = data.map((item: any) => [
        item.name,
        item.sales?.toLocaleString() || '0',
        item.prevSales?.toLocaleString() || '0',
        `${item.growth >= 0 ? '+' : ''}${item.growth?.toFixed(1) || '0.0'}%`,
        item.dailyReq?.toLocaleString() || '0',
        item.trans?.toLocaleString() || '0',
        Math.round(item.avgInv || 0).toLocaleString(),
        item.visitors?.toLocaleString() || '0',
        item.prevVisitors?.toLocaleString() || '0',
        `${item.conversion?.toFixed(1) || '0.0'}%`,
        Math.round(item.customerValue || 0).toLocaleString()
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
        'الإجمالي / Total',
        totals.sales.toLocaleString(),
        totals.prevSales.toLocaleString(),
        `${totalGrowth >= 0 ? '+' : ''}${totalGrowth.toFixed(1)}%`,
        totals.dailyReq.toLocaleString(),
        totals.trans.toLocaleString(),
        Math.round(totalAvgInv).toLocaleString(),
        totals.visitors.toLocaleString(),
        totals.prevVisitors.toLocaleString(),
        `${totalConversion.toFixed(1)}%`,
        Math.round(totalCustValue).toLocaleString()
    ]);

    (doc as any).autoTable({
        startY: 25,
        head: [['Store', 'Sales (Yst)', 'Sales (LY)', 'Growth', 'Daily Req', 'Bills', 'Avg Bill', 'Visitors', 'Vis (LY)', 'Conv %', 'Cust Val']],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center', fontSize: 9 },
        headStyles: { fillStyle: [254, 121, 0], textColor: 255, halign: 'center' }, // Orange header like original
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { fontStyle: 'bold', halign: 'right' }, // Store Name
            3: { textColor: (data: any) => data.cell.raw.includes('-') ? [220, 50, 50] : [0, 150, 0] }, // Growth Color
            4: { textColor: [220, 50, 50] }, // Daily Req Red
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
    const doc = setupDoc('Global Summary - ملخص عام', `Period: ${dateRange.start} to ${dateRange.end}`);

    const tableRows = data.map((item: any) => [
        item.date,
        Math.round(item.sales).toLocaleString(),
        Math.round(item.salesPrev).toLocaleString(),
        `${item.growth >= 0 ? '+' : ''}${item.growth?.toFixed(1) || '0.0'}%`,
        item.trans?.toLocaleString() || '0',
        item.avgInv ? Math.round(item.avgInv).toLocaleString() : '0',
        item.customerValue ? Math.round(item.customerValue).toLocaleString() : '0',
        item.visitors?.toLocaleString() || '0',
        item.visitorsPrev?.toLocaleString() || '0',
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
        'الإجمالي / Total',
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
        startY: 35,
        head: [['Date', 'Sales (Curr)', 'Sales (Prev)', 'Growth', 'Bills', 'Avg Bill', 'Cust Val', 'Visitors', 'Vis (Prev)', 'Conv %']],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center', fontSize: 8 },
        headStyles: { fillStyle: [254, 121, 0], textColor: 255, halign: 'center' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { cellWidth: 25 }, // Date
            3: { textColor: (data: any) => data.cell.raw.includes('-') ? [220, 50, 50] : [0, 150, 0] }, // Growth
        },
        didParseCell: (data: any) => {
            if (data.row.index === tableRows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 230, 230];
            }
        }
    });

    doc.save(`Sales_Report_all_${new Date().toLocaleDateString('en-CA')}.pdf`);
};

/**
 * Generates the Employee Performance PDF (Yesterday vs MTD)
 * Matches 'Employees_Report' logic from original repo.
 */
export const generateEmployeePerformancePDF = async (data: any[], dateRange: { yesterday: string, monthStart: string }) => {
    const doc = setupDoc('Employees Performance - أداء الموظفين', `Ref: ${dateRange.monthStart} to ${dateRange.yesterday}`);

    const tableRows = data.map((item: any) => [
        item.name,
        // Yesterday
        Math.round(item.ySales).toLocaleString(),
        `${Math.round(item.yShare)}%`,
        item.yTrans,
        Math.round(item.yAvgInv).toLocaleString(),
        // MTD
        Math.round(item.mSales).toLocaleString(),
        `${Math.round(item.mShare)}%`,
        item.mTrans,
        Math.round(item.mAvgInv).toLocaleString(),
        Math.round(item.target).toLocaleString(),
        `${item.achievement?.toFixed(1)}%`,
        Math.round(item.remaining).toLocaleString(),
        Math.round(item.dailyReq).toLocaleString()
    ]);

    // Header with ColSpans requires generic 'head' manipulation usually, but autoTable supports complex headers.
    // We will use a simplified robust approach matching the visual structure.

    (doc as any).autoTable({
        startY: 30,
        head: [
            [
                { content: 'Employee', rowSpan: 2, styles: { valign: 'middle' } },
                { content: `Yesterday (${dateRange.yesterday})`, colSpan: 4, styles: { halign: 'center', fillColor: [220, 220, 220], textColor: 0 } },
                { content: `Month to Date (${dateRange.monthStart} - ${dateRange.yesterday})`, colSpan: 8, styles: { halign: 'center', fillColor: [200, 200, 200], textColor: 0 } }
            ],
            [
                'Sales', 'Share %', 'Bills', 'Avg Bill',
                'Sales', 'Share %', 'Bills', 'Avg Bill', 'Target', 'Ach %', 'Rem', 'Daily Req'
            ]
        ],
        body: tableRows,
        styles: { font: 'Amiri', halign: 'center', fontSize: 8, cellPadding: 2 },
        headStyles: { fillStyle: [254, 121, 0], textColor: 255 },
        columnStyles: {
            0: { fontStyle: 'bold', halign: 'right', minCellWidth: 30 }, // Name
            9: { textColor: [0, 128, 0], fontStyle: 'bold' } // Achievement
        },
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    doc.save(`Employees_Report_${new Date().toLocaleDateString('en-CA')}.pdf`);
};
