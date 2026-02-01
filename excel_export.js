/**
 * excel_export.js
 * Handles Excel export for both Store Sales and Employee Sales (Sales Manager only).
 */

let excelModal = null;

// Initialize Modal
function showExcelModal() {
    if (!excelModal) {
        excelModal = new bootstrap.Modal(document.getElementById('excelDateModal'));
    }

    // 1. Pre-fill Dates (from Dashboard filters if custom, else standard month)
    const startDateVal = document.getElementById('startDate').value;
    const endDateVal = document.getElementById('endDate').value;

    document.getElementById('excelStartDate').value = startDateVal;
    document.getElementById('excelEndDate').value = endDateVal;

    // 2. Check Permissions for Employee Request
    const user = JSON.parse(localStorage.getItem('currentUser'));
    const reportTypeGroup = document.getElementById('excelReportTypeGroup');

    // Explicitly check for "Sales Manager" as requested
    if (user && (user.name === 'Sales Manager' || user.role === 'Admin')) {
        reportTypeGroup.style.display = 'block';
    } else {
        reportTypeGroup.style.display = 'none';
        // Reset to Store default just in case
        document.getElementById('typeStore').checked = true;
    }

    excelModal.show();
}

async function generateExcelReport() {
    const startDate = document.getElementById('excelStartDate').value;
    const endDate = document.getElementById('excelEndDate').value;
    const reportType = document.querySelector('input[name="excelReportType"]:checked').value;

    if (!startDate || !endDate) {
        alert("الرجاء اختيار الفترة الزمنية");
        return;
    }

    const btn = document.querySelector('#excelDateModal .btn-success');
    const originalText = btn.textContent;
    btn.textContent = 'جاري التصدير...';
    btn.disabled = true;

    try {
        if (reportType === 'employee') {
            await exportEmployeeSales(startDate, endDate);
        } else {
            await exportStoreSales(startDate, endDate);
        }

        // Close Modal on success
        excelModal.hide();

    } catch (e) {
        console.error(e);
        alert("حدث خطأ أثناء التصدير: " + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// --- OPTION 1: Store Sales Export (Corrected for Flat List Structure) ---
async function exportStoreSales(startDate, endDate) {
    if (!window.rawData) {
        throw new Error("لا توجد بيانات (Data not loaded yet)");
    }

    const managerFilter = document.getElementById('managerFilter').value;
    const cityFilter = document.getElementById('cityFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const branchFilter = document.getElementById('branchFilter').value;

    // Helper: Check filters
    const passFilter = (storeId) => {
        if (branchFilter !== 'all' && storeId !== branchFilter) return false;

        const meta = window.rawData.store_meta ? window.rawData.store_meta[storeId] : {};
        if (managerFilter !== 'all' && meta.manager !== managerFilter) return false;
        if (cityFilter !== 'all' && meta.city !== cityFilter) return false;
        if (typeFilter !== 'all' && meta.type !== typeFilter) return false;

        return true;
    };

    // Helper: Date Check
    // Dates in JSON are YYYY-MM-DD string. Inputs are same. String comparison works perfectly for ISO dates.
    const inRange = (dStr) => dStr >= startDate && dStr <= endDate;

    // Aggregation Map: "Date_StoreId" -> { date, storeId, sales, trans, visitors }
    let dataMap = {};

    const getKey = (d, s) => `${d}_${s}`;
    const ensureEntry = (d, s) => {
        const k = getKey(d, s);
        if (!dataMap[k]) {
            dataMap[k] = {
                date: d,
                storeId: s,
                sales: 0,
                trans: 0,
                visitors: 0
            };
        }
        return dataMap[k];
    };

    // 1. Process Sales
    if (window.rawData.sales) {
        window.rawData.sales.forEach(([d, s, v]) => {
            if (inRange(d) && passFilter(s)) {
                let entry = ensureEntry(d, s);
                entry.sales += v;
            }
        });
    }

    // 2. Process Transactions
    if (window.rawData.transactions) {
        window.rawData.transactions.forEach(([d, s, v]) => {
            if (inRange(d) && passFilter(s)) {
                let entry = ensureEntry(d, s);
                entry.trans += v;
            }
        });
    }

    // 3. Process Visitors
    if (window.rawData.visitors) {
        window.rawData.visitors.forEach(([d, s, v]) => {
            if (inRange(d) && passFilter(s)) {
                let entry = ensureEntry(d, s);
                entry.visitors += v;
            }
        });
    }

    // Convert Map to Rows
    let rows = Object.values(dataMap);

    if (rows.length === 0) {
        alert("لا توجد بيانات للفترة المحددة (No data found)");
        return;
    }

    // Sort: Date asc, then Store Name asc
    rows.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        const nameA = window.rawData.stores[a.storeId] || '';
        const nameB = window.rawData.stores[b.storeId] || '';
        return nameA.localeCompare(nameB);
    });

    // Format for Excel
    let excelRows = rows.map(r => {
        const meta = window.rawData.store_meta ? window.rawData.store_meta[r.storeId] : {};
        return {
            "التاريخ": r.date,
            "المعرض": window.rawData.stores[r.storeId] || r.storeId,
            "المدينة": meta.city || '-',
            "مدير المنطقة": meta.manager || '-',
            "المبيعات": r.sales,
            "عدد الفواتير": r.trans,
            "الزوار": r.visitors,
            "متوسط الفاتورة": r.trans > 0 ? (r.sales / r.trans).toFixed(0) : 0,
            "نسبة التحويل": r.visitors > 0 ? ((r.trans / r.visitors) * 100).toFixed(1) + '%' : '0%'
        };
    });

    // Create Worksheet
    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Auto-width columns roughly
    const wscols = [
        { wch: 12 }, // Date
        { wch: 25 }, // Store
        { wch: 10 }, // City
        { wch: 15 }, // Manager
        { wch: 10 }, // Sales
        { wch: 10 }, // Trans
        { wch: 10 }, // Visitors
        { wch: 10 }, // Avg
        { wch: 10 }  // Conv
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Store Sales");

    // Export
    XLSX.writeFile(wb, `Store_Sales_${startDate}_${endDate}.xlsx`);
}

// --- OPTION 2: Employee Sales Export (Sales Manager Only) ---
async function exportEmployeeSales(startDate, endDate) {
    // 1. Fetch employees_data.json
    const res = await fetch('employees_data.json?t=' + Date.now());
    if (!res.ok) throw new Error("Could not fetch employee data (employees_data.json missing)");
    const empData = await res.json();

    // empData struct: { history: { storeId: [ [date, empId, sales, trans, items, ?], ... ] } }

    const managerFilter = document.getElementById('managerFilter').value;
    const cityFilter = document.getElementById('cityFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const branchFilter = document.getElementById('branchFilter').value;

    let rows = [];
    const empNames = empData.employee_names || {};

    // Get List of Store IDs we care about (from Emp Data)
    let targetStoreIds = Object.keys(empData.history || {});

    // Filter Stores based on Metadata in rawData
    if (window.rawData && window.rawData.store_meta) {
        targetStoreIds = targetStoreIds.filter(sid => {
            if (branchFilter !== 'all' && sid !== branchFilter) return false;

            const meta = rawData.store_meta[sid] || {};
            if (managerFilter !== 'all' && meta.manager !== managerFilter) return false;
            if (cityFilter !== 'all' && meta.city !== cityFilter) return false;
            if (typeFilter !== 'all' && meta.type !== typeFilter) return false;

            return true;
        });
    }

    // Iterate Filtered Stores
    targetStoreIds.forEach(sid => {
        const records = empData.history[sid] || [];
        const storeName = (window.rawData && window.rawData.stores[sid]) || sid;

        records.forEach(rec => {
            // rec format: [Date, EmpID, Sales, Trans, Items, ?]
            const [date, empId, sales, trans] = rec;

            // Date Check
            if (date >= startDate && date <= endDate) {

                // Resolve Name & ID
                let name = empId;
                let employeeNumber = empId;

                if (empNames[empId]) {
                    name = empNames[empId];
                    // empId is the key, so it's the ID
                    employeeNumber = empId;
                } else if (empId && empId.includes('-')) {
                    // Fallback parse if format is "ID - Name"
                    let parts = empId.split('-');
                    employeeNumber = parts[0].trim();
                    name = parts.slice(1).join('-').trim();
                }

                rows.push({
                    "التاريخ": date,
                    "المعرض": storeName,
                    "الرقم الوظيفي": employeeNumber,
                    "اسم الموظف": name,
                    "المبيعات": sales,
                    "عدد الفواتير": trans
                });
            }
        });
    });

    if (rows.length === 0) {
        alert("لا توجد بيانات موظفين للفترة المحددة");
        return;
    }

    // Sort: Date, Store, Name
    rows.sort((a, b) => {
        if (a["التاريخ"] !== b["التاريخ"]) return a["التاريخ"].localeCompare(b["التاريخ"]);
        if (a["المعرض"] !== b["المعرض"]) return a["المعرض"].localeCompare(b["المعرض"]);
        return a["اسم الموظف"].localeCompare(b["اسم الموظف"]);
    });

    // Create Worksheet
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee Sales");

    // Export
    XLSX.writeFile(wb, `Employee_Sales_${startDate}_${endDate}.xlsx`);
}
