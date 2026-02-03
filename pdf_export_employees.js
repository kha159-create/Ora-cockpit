/* PDF Export Logic for Employees - Final Array Fix - Ver 1.2 */

async function generateEmployeePDF(targetEmps = null) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    // --- Font Loading ---
    const fontFileName = "Amiri-Regular.ttf";
    const fontName = "Amiri";

    try {
        if (typeof amiriFontBase64 === 'undefined') {
            throw new Error("ملف الخط العربي غير موجود");
        }

        doc.addFileToVFS(fontFileName, amiriFontBase64);
        doc.addFont(fontFileName, fontName, "normal");
        doc.setFont(fontName);
    } catch (e) {
        console.error("Font Error:", e);
        doc.setFont("helvetica");
    }

    const historyData = window.historyData;
    const storeMeta = window.storeMeta;
    const targetsData = window.targetsData;
    const storesData = window.storesData;
    const employeeNames = window.employeeNames;
    const currentUser = window.currentUser || JSON.parse(localStorage.getItem('currentUser') || '{}');

    if (!historyData || typeof historyData !== 'object') {
        alert("البيانات غير جاهزة بعد.");
        return;
    }

    if (!storeMeta || typeof storeMeta !== 'object') {
        alert("بيانات الفروع غير جاهزة");
        return;
    }

    // --- Filter Stores (use same filters as Reports page when available) ---
    const mfEl = document.getElementById('managerFilter');
    const cfEl = document.getElementById('cityFilter');
    const tfEl = document.getElementById('typeFilter');
    const bfEl = document.getElementById('branchFilter');
    const selManager = mfEl ? mfEl.value : 'all';
    const selCity = cfEl ? cfEl.value : 'all';
    const selType = tfEl ? tfEl.value : 'all';
    const selBranch = bfEl ? bfEl.value : 'all';

    const passesStoreFilter = (sid) => {
        const meta = storeMeta[sid];
        if (!meta) return false;
        // Permission
        if (currentUser.role !== 'Admin' && meta.manager !== currentUser.name) return false;
        // Filters
        if (selManager !== 'all' && meta.manager !== selManager) return false;
        if (selCity !== 'all' && meta.city !== selCity) return false;
        if (selType !== 'all' && meta.type !== selType) return false;
        if (selBranch !== 'all' && sid !== selBranch) return false;
        return true;
    };

    const storeIds = Object.keys(historyData);
    let targetStores = storeIds.filter(sid => passesStoreFilter(sid));

    targetStores.sort();

    const formatDate = (d) => {
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - (offset * 60 * 1000));
        return local.toISOString().split('T')[0];
    }

    // --- Date range ---
    let today = new Date();
    let yestDate = new Date(today);
    yestDate.setDate(today.getDate() - 1);

    // Default: month start -> yesterday
    let rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
    let rangeEnd = new Date(yestDate);
    rangeEnd.setHours(23, 59, 59, 999);

    // If filter inputs exist (Reports page), use them
    const startVal = document.getElementById('startDate')?.value;
    const endVal = document.getElementById('endDate')?.value;
    if (startVal && endVal) {
        rangeStart = new Date(startVal);
        rangeEnd = new Date(endVal);
        rangeEnd.setHours(23, 59, 59, 999);
    }

    // Use end of selected range (not necessarily "yesterday")
    const yestStrFinal = formatDate(rangeEnd);
    const monthStartStr = formatDate(rangeStart);

    // Prev Period Dates (for Share Growth)
    const prevEnd = new Date(rangeEnd);
    prevEnd.setMonth(prevEnd.getMonth() - 1);
    const prevMonthEndStr = formatDate(prevEnd);

    const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
    const prevMonthStartStr = formatDate(prevStart);

    let pageIndex = 0;

    // 1. Pre-process GLOBAL data to find Primary Store and Consolidated Stats
    const processGlobalData = () => {
        const globalEmps = {};

        Object.entries(historyData).forEach(([sCode, records]) => {
            records.forEach(r => {
                const rDateStr = r[0];
                const isCurrent = (rDateStr >= monthStartStr && rDateStr <= yestStrFinal);
                const isPrev = (rDateStr >= prevMonthStartStr && rDateStr <= prevMonthEndStr);

                if (isCurrent || isPrev) {
                    const rawKey = r[1];
                    let empId = rawKey;
                    let empName = rawKey;

                    if (rawKey.includes('-')) {
                        const parts = rawKey.split('-');
                        empId = parts[0].trim();
                        empName = parts[1].trim();
                    } else if (rawKey.toLowerCase().startsWith('unknown')) {
                        empId = rawKey;
                        empName = rawKey.toLowerCase().replace('unknown', '').trim();
                    }

                    if (empName === 'مرتجع') return;
                    const key = empId;

                    if (!globalEmps[key]) {
                        globalEmps[key] = {
                            id: key,
                            name: empName,
                            storeStats: {},
                            globalMtd: { sales: 0, trans: 0, items: 0 },
                            globalYest: { sales: 0, trans: 0, items: 0 },
                            globalPrev: { sales: 0 },
                            lastStore: sCode,
                            latestActiveStore: sCode,
                            latestActiveDate: ""
                        };
                    }

                    const sales = r[2] || 0;
                    if (isCurrent) {
                        globalEmps[key].globalMtd.sales += sales;
                        globalEmps[key].globalMtd.trans += r[3] || 0;
                        globalEmps[key].globalMtd.items += r[4] || 0;

                        if (sales > 0) {
                            if (rDateStr > globalEmps[key].latestActiveDate) {
                                globalEmps[key].latestActiveDate = rDateStr;
                                globalEmps[key].latestActiveStore = sCode;
                            }
                        }

                        if (rDateStr === yestStrFinal) {
                            globalEmps[key].globalYest.sales += r[2] || 0;
                            globalEmps[key].globalYest.trans += r[3] || 0;
                            globalEmps[key].globalYest.items += r[4] || 0;
                        }
                    }

                    if (isPrev) {
                        globalEmps[key].globalPrev.sales += sales;
                    }

                    if (!globalEmps[key].storeStats[sCode]) globalEmps[key].storeStats[sCode] = 0;
                    globalEmps[key].storeStats[sCode] += sales;
                }
            });
        });

        Object.values(globalEmps).forEach(e => {
            if (e.latestActiveDate) {
                e.primaryStore = e.latestActiveStore;
            } else {
                let bestStore = e.lastStore;
                let maxVal = -Infinity;
                Object.entries(e.storeStats).forEach(([s, val]) => {
                    if (val > maxVal) { maxVal = val; bestStore = s; }
                });
                e.primaryStore = bestStore;
            }
            if (employeeNames && employeeNames[e.id]) {
                e.name = employeeNames[e.id];
            }
        });
        return globalEmps;
    };

    const globalEmpMap = processGlobalData();

    // Loop through stores
    for (const storeId of targetStores) {

        // 2. Calculate Store-Specific Totals for contribution mapping
        const storeTotals = { yest: 0, mtd: 0, prev: 0 };
        (historyData[storeId] || []).forEach(r => {
            const d = r[0];
            const s = r[2] || 0;
            if (d === yestStrFinal) storeTotals.yest += s;
            if (d >= monthStartStr && d <= yestStrFinal) storeTotals.mtd += s;
            if (d >= prevMonthStartStr && d <= prevMonthEndStr) storeTotals.prev += s;
        });

        // 3. Filter employees assigned to THIS store
        const empKeys = [];
        Object.values(globalEmpMap).forEach(e => {
            // Filter by Allowed IDs (if provided)
            if (targetEmps && !targetEmps.includes(e.id)) return;

            if (e.primaryStore === storeId && (e.globalMtd.sales > 0 || e.globalMtd.trans > 0)) {
                empKeys.push(e.id);
            }
        });

        if (empKeys.length === 0) continue;

        if (pageIndex > 0) doc.addPage();
        pageIndex++;

        doc.setFont(fontName);
        doc.setFontSize(14);
        let sName = storeId;
        if (storesData && storesData[storeId]) {
            sName = storesData[storeId];
        }
        doc.text(`${storeId} - ${sName}`, 14, 15);

        const tableRows = [];
        let yestTotalSales = 0, yestTotalTrans = 0;
        let mtdTotalSales = 0, mtdTotalTrans = 0, mtdTotalTarget = 0;

        empKeys.sort((a, b) => globalEmpMap[b].globalMtd.sales - globalEmpMap[a].globalMtd.sales);

        empKeys.forEach(key => {
            const emp = globalEmpMap[key];
            const yest = emp.globalYest;
            const mtd = emp.globalMtd;
            const target = (targetsData && targetsData[key]) ? targetsData[key] : 0;

            const yestContrib = storeTotals.yest > 0 ? (yest.sales / storeTotals.yest) * 100 : 0;
            const yestAvgInv = yest.trans > 0 ? Math.round(yest.sales / yest.trans) : 0;

            const mtdContrib = storeTotals.mtd > 0 ? (mtd.sales / storeTotals.mtd) * 100 : 0;
            const mtdAvgInv = mtd.trans > 0 ? Math.round(mtd.sales / mtd.trans) : 0;

            const prevContrib = storeTotals.prev > 0 ? (emp.globalPrev.sales / storeTotals.prev) * 100 : 0;
            const ach = target > 0 ? (mtd.sales / target) * 100 : 0;
            const remaining = Math.max(0, target - mtd.sales);

            const daysInMonthLabel = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const daysPassedLabel = yestDate.getDate();
            const daysLeftLabel = daysInMonthLabel - daysPassedLabel;
            const dailyReq = daysLeftLabel > 0 ? remaining / daysLeftLabel : 0;

            yestTotalSales += yest.sales;
            yestTotalTrans += yest.trans;
            mtdTotalSales += mtd.sales;
            mtdTotalTarget += target;
            mtdTotalTrans += mtd.trans;

            tableRows.push([
                emp.name,
                Math.round(yest.sales).toLocaleString(),
                yestContrib.toFixed(0) + '%',
                yest.trans,
                yestAvgInv,
                Math.round(mtd.sales).toLocaleString(),
                mtdContrib.toFixed(0) + '%',
                mtd.trans,
                mtdAvgInv,
                Math.round(target).toLocaleString(),
                ach.toFixed(1) + '%',
                Math.round(remaining).toLocaleString(),
                Math.round(dailyReq).toLocaleString()
            ]);
        });

        // Totals Row
        const mtdTotalAch = mtdTotalTarget > 0 ? (mtdTotalSales / mtdTotalTarget * 100).toFixed(1) + '%' : '-';
        const mtdRem = Math.max(0, mtdTotalTarget - mtdTotalSales);
        const daysInMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const daysPassedEnd = yestDate.getDate();
        const daysLeftEnd = daysInMonthEnd - daysPassedEnd;
        const mtdDaily = daysLeftEnd > 0 ? mtdRem / daysLeftEnd : 0;

        tableRows.push([
            "الإجمالي (Total)",
            Math.round(yestTotalSales).toLocaleString(),
            "100%",
            yestTotalTrans,
            yestTotalTrans > 0 ? Math.round(yestTotalSales / yestTotalTrans) : 0,

            Math.round(mtdTotalSales).toLocaleString(),
            "100%",
            mtdTotalTrans,
            mtdTotalTrans > 0 ? Math.round(mtdTotalSales / mtdTotalTrans) : 0,
            Math.round(mtdTotalTarget).toLocaleString(),
            mtdTotalAch,
            Math.round(mtdRem).toLocaleString(),
            Math.round(mtdDaily).toLocaleString()
        ]);

        doc.autoTable({
            startY: 25,
            head: [
                [
                    { content: 'بيانات الموظف (Employee)', colSpan: 1, styles: { fillColor: [255, 255, 255], textColor: 0, halign: 'center' } },
                    { content: `نهاية الفترة - ${yestStrFinal}`, colSpan: 4, styles: { fillColor: [220, 220, 220], textColor: 0, halign: 'center' } },
                    { content: `الفترة المحددة - ${monthStartStr} إلى ${yestStrFinal}`, colSpan: 9, styles: { fillColor: [200, 200, 200], textColor: 0, halign: 'center' } }
                ],
                [
                    'الموظف',
                    'المبيعات', 'المساهمة %', 'العدد', 'متوسط الفاتورة',
                    'المبيعات', 'المساهمة %', 'العدد', 'متوسط الفاتورة', 'الهدف', 'التحقيق %', 'المتبقي', 'اليومية المتبقية'
                ]
            ],
            body: tableRows,
            theme: 'grid',
            styles: { font: fontName, fontSize: 8, cellPadding: 1, halign: 'center' },
            columnStyles: {
                0: { halign: 'right', fontStyle: 'bold', minCellWidth: 30 },
                10: { textColor: [0, 128, 0], fontStyle: 'bold' }
            },
            didParseCell: function (data) {
                if (data.row.raw[0] && data.row.raw[0].toString().includes('Total')) {
                    data.cell.styles.fillColor = [240, 240, 240];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });
    }

    doc.save(`Employees_Report_${new Date().toLocaleDateString('en-CA')}.pdf`);
}
