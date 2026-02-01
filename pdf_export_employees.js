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

    // --- Ensure Data ---
    if (typeof historyData === 'undefined' || !historyData) {
        alert("البيانات غير جاهزة بعد.");
        return;
    }

    // --- Permissions ---
    if (typeof storeMeta === 'undefined' || !storeMeta) {
        alert("بيانات الفروع غير جاهزة");
        return;
    }

    let targetStores = [];
    const storeIds = Object.keys(historyData);

    if (currentUser.role === 'Admin') {
        targetStores = storeIds;
    } else {
        targetStores = storeIds.filter(sid => {
            const meta = storeMeta[sid];
            return meta && meta.manager === currentUser.name;
        });
    }

    targetStores.sort();

    const formatDate = (d) => {
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - (offset * 60 * 1000));
        return local.toISOString().split('T')[0];
    }

    // Today
    let today = new Date();
    // Yesterday
    let yestDate = new Date(today);
    yestDate.setDate(today.getDate() - 1);

    const yestStrFinal = formatDate(yestDate);

    // MTD Start (1st of Current Month)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartStr = formatDate(monthStart);

    // Previous Month Logic (Robust)
    // 1. Get 1st of Previous Month
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthStartStr = formatDate(prevStart);

    // 2. Get Last Day of Previous Month (Day 0 of Current Month)
    const prevEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const prevMonthEndStr = formatDate(prevEnd);

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
                            globalPrev: { sales: 0, trans: 0, items: 0 },
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
                        globalEmps[key].globalPrev.trans += r[3] || 0;
                        globalEmps[key].globalPrev.items += r[4] || 0;
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
            if (typeof employeeNames !== 'undefined' && employeeNames[e.id]) {
                e.name = employeeNames[e.id];
            }
        });
        return globalEmps;
    };

    const globalEmpMap = processGlobalData();

    // Check Filter Mode
    const filterVal = document.getElementById('periodFilter') ? document.getElementById('periodFilter').value : 'mtd';
    const isPrevMode = filterVal === 'prev_month';

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

            // Check Activity based on Mode
            const hasActivity = isPrevMode
                ? (e.globalPrev.sales > 0 || e.globalPrev.trans > 0)
                : (e.globalMtd.sales > 0 || e.globalMtd.trans > 0);

            if (e.primaryStore === storeId && hasActivity) {
                empKeys.push(e.id);
            }
        });

        if (empKeys.length === 0) continue;

        if (pageIndex > 0) doc.addPage();
        pageIndex++;

        doc.setFont(fontName);
        doc.setFontSize(14);
        let sName = storeId;
        if (typeof storesData !== 'undefined' && storesData[storeId]) {
            sName = storesData[storeId];
        }

        let headerTitle = `${storeId} - ${sName}`;
        if (isPrevMode) headerTitle += " (الشهر السابق)";
        doc.text(headerTitle, 14, 15);

        const tableRows = [];
        let col1TotalSales = 0, col1TotalTrans = 0; // Was Yest, now dynamic
        let col2TotalSales = 0, col2TotalTrans = 0, col2TotalTarget = 0; // Was MTD, now dynamic (Prev or MTD)

        // Sort based on Mode
        empKeys.sort((a, b) => {
            if (isPrevMode) return globalEmpMap[b].globalPrev.sales - globalEmpMap[a].globalPrev.sales;
            return globalEmpMap[b].globalMtd.sales - globalEmpMap[a].globalMtd.sales;
        });

        empKeys.forEach(empKey => {
            const emp = globalEmpMap[empKey];

            // Robust Target Lookup:
            // 1. Try window.targetsData if targetsData is not in scope.
            // 2. Try the exact key (string).
            // 3. Try the key as number (if mismatch).
            // 4. Fallback to 0.
            let relevantTargets = (typeof targetsData !== 'undefined') ? targetsData : (window.targetsData || {});
            let target = relevantTargets[empKey];

            if (target === undefined) {
                // Try converting key to int or string
                // keys in JSON might be integers
                target = relevantTargets[parseInt(empKey)] || relevantTargets[empKey.toString()] || 0;
            }

            // Define Data Sources based on Mode
            let dataCol1, dataCol2; // Col1 = Small Period (Yest), Col2 = Main Period (MTD/Prev)
            let storeTotalCol1, storeTotalCol2;

            if (isPrevMode) {
                // For Previous Month, we don't really have a "Yesterday". 
                // We can either leave Col1 empty or put something else. 
                // Let's leave it zero/dash for clarity, or maybe show last available day?
                // For simplicity: Zero out Col1 in Prev Mode to focus on the Month.
                dataCol1 = { sales: 0, trans: 0, items: 0 };
                storeTotalCol1 = 0;

                dataCol2 = emp.globalPrev;
                storeTotalCol2 = storeTotals.prev;
            } else {
                dataCol1 = emp.globalYest;
                storeTotalCol1 = storeTotals.yest;

                dataCol2 = emp.globalMtd;
                storeTotalCol2 = storeTotals.mtd;
            }

            // Col 1 (Yest / Empty) calculations
            const col1Contrib = storeTotalCol1 > 0 ? (dataCol1.sales / storeTotalCol1) * 100 : 0;
            const col1AvgInv = dataCol1.trans > 0 ? Math.round(dataCol1.sales / dataCol1.trans) : 0;

            // Col 2 (Main) calculations
            const col2Contrib = storeTotalCol2 > 0 ? (dataCol2.sales / storeTotalCol2) * 100 : 0;
            const col2AvgInv = dataCol2.trans > 0 ? Math.round(dataCol2.sales / dataCol2.trans) : 0;

            // Achievement & Req
            const ach = target > 0 ? (dataCol2.sales / target) * 100 : 0;
            const remaining = Math.max(0, target - dataCol2.sales);

            // Daily Req Logic
            let dailyReq = 0;
            if (!isPrevMode) {
                // Only relevant for MTD
                const daysInMonthLabel = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
                const daysPassedLabel = yestDate.getDate();
                const daysLeftLabel = daysInMonthLabel - daysPassedLabel;
                dailyReq = daysLeftLabel > 0 ? remaining / daysLeftLabel : 0;
            }

            // Aggregation
            col1TotalSales += dataCol1.sales;
            col1TotalTrans += dataCol1.trans;

            col2TotalSales += dataCol2.sales;
            col2TotalTrans += dataCol2.trans;
            col2TotalTarget += target;

            // Row Building
            tableRows.push([
                emp.name,
                isPrevMode ? '-' : Math.round(dataCol1.sales).toLocaleString(),
                isPrevMode ? '-' : col1Contrib.toFixed(0) + '%',
                isPrevMode ? '-' : dataCol1.trans,
                isPrevMode ? '-' : col1AvgInv,
                Math.round(dataCol2.sales).toLocaleString(),
                col2Contrib.toFixed(0) + '%',
                dataCol2.trans,
                col2AvgInv,
                Math.round(target).toLocaleString(),
                ach.toFixed(1) + '%',
                Math.round(remaining).toLocaleString(),
                isPrevMode ? '-' : Math.round(dailyReq).toLocaleString()
            ]);
        });

        // Totals Row
        const col2TotalAch = col2TotalTarget > 0 ? (col2TotalSales / col2TotalTarget * 100).toFixed(1) + '%' : '-';
        const col2Rem = Math.max(0, col2TotalTarget - col2TotalSales);
        let col2Daily = 0;
        if (!isPrevMode) {
            const daysInMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const daysPassedEnd = yestDate.getDate();
            const daysLeftEnd = daysInMonthEnd - daysPassedEnd;
            col2Daily = daysLeftEnd > 0 ? col2Rem / daysLeftEnd : 0;
        }

        tableRows.push([
            "الإجمالي",
            isPrevMode ? '-' : Math.round(col1TotalSales).toLocaleString(),
            isPrevMode ? '-' : "100%",
            isPrevMode ? '-' : col1TotalTrans,
            isPrevMode ? '-' : (col1TotalTrans > 0 ? Math.round(col1TotalSales / col1TotalTrans) : 0),

            Math.round(col2TotalSales).toLocaleString(),
            "100%",
            col2TotalTrans,
            col2TotalTrans > 0 ? Math.round(col2TotalSales / col2TotalTrans) : 0,
            Math.round(col2TotalTarget).toLocaleString(),
            col2TotalAch,
            Math.round(col2Rem).toLocaleString(),
            isPrevMode ? '-' : Math.round(col2Daily).toLocaleString()
        ]);

        // Dynamic Headers
        let col1Header = `الأمس (Yesterday) - ${yestStrFinal}`;
        let col2Header = `الشهر الحالي (MTD) - ${monthStartStr} إلى ${yestStrFinal}`;

        if (isPrevMode) {
            col1Header = "---";
            col2Header = `الشهر السابق (Previous Month) - ${prevMonthStartStr} إلى ${prevMonthEndStr}`;
        }

        doc.autoTable({
            startY: 25,
            head: [
                [
                    { content: 'بيانات الموظف (Employee)', colSpan: 1, styles: { fillColor: [255, 255, 255], textColor: 0, halign: 'center' } },
                    { content: col1Header, colSpan: 4, styles: { fillColor: [220, 220, 220], textColor: 0, halign: 'center' } },
                    { content: col2Header, colSpan: 9, styles: { fillColor: [200, 200, 200], textColor: 0, halign: 'center' } }
                ],
                [
                    'الموظف',
                    'المبيعات', 'مساهمة %', 'العدد', 'م. فاتورة',
                    'المبيعات', 'مساهمة %', 'العدد', 'م. فاتورة', 'الهدف', 'تحقيق %', 'المتبقي', 'يومية متبقية'
                ]
            ],
            body: tableRows,
            theme: 'grid',
            styles: { font: fontName, fontSize: 9, cellPadding: 1, halign: 'center', overflow: 'ellipsize' },
            columnStyles: {
                0: { halign: 'right', fontStyle: 'bold', minCellWidth: 35 },
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
