import React, { useState, useMemo, useEffect } from 'react';
import { SearchIcon, XIcon, CubeIcon, SalesIcon, CubeIcon as QtyIcon, InvoicesIcon } from '../Icons';

interface Product {
    id: string;
    name: string;
    category: string;
    qty: number;
    amount: number;
    alias?: string;
    old_code?: string;
    salesByStore?: Record<string, { q: number; a: number }>;
    stockByStore?: Record<string, number>;
    totalStock?: number;
    [key: string]: any;
}

interface ProductInquiryModalProps {
    isOpen: boolean;
    onClose: () => void;
    products: Product[];
    history: Record<string, any[]>;
    formatSAR: (val: number) => string;
    mgmtData?: any;
    user?: any;
}

export const ProductInquiryModal: React.FC<ProductInquiryModalProps> = ({ isOpen, onClose, products, history, formatSAR, mgmtData, user }) => {
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [period, setPeriod] = useState<'yesterday' | '7d' | 'mtd' | '30d' | 'last_month'>('mtd');

    // Filter states
    const [manager, setManager] = useState('all');
    const [branch, setBranch] = useState('all');

    // Product Mapping State
    const [mapping, setMapping] = useState<Record<string, { alias?: string; dCode?: string; name?: string }>>({});

    useEffect(() => {
        import('../../services/upstreamData').then(({ loadProductMapping }) => {
            loadProductMapping().then((data) => {
                if (data) {
                    const map: Record<string, any> = {};
                    data.forEach((item: any) => {
                        map[item.id] = item;
                    });
                    setMapping(map);
                }
            });
        });
    }, []);

    const [selectedStore, setSelectedStore] = useState<string | null>(null);
    const [filteredPeriod, setFilteredPeriod] = useState<'today' | 'yesterday' | '7d' | '30d' | 'mtd' | 'last_month'>('mtd');
    const [isFamilyMode, setIsFamilyMode] = useState(false);

    // Helper to get date range for filtering
    const getDateRange = (p: string) => {
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        const pad2 = (n: number) => String(n).padStart(2, '0');
        const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        let startStr = '';
        let endStr = toYMD(today);

        if (p === 'today') {
            startStr = toYMD(today);
            endStr = toYMD(today);
        } else if (p === 'yesterday') {
            startStr = toYMD(yesterday);
            endStr = toYMD(yesterday);
        } else if (p === '7d') {
            const d = new Date(today); d.setDate(today.getDate() - 7);
            startStr = toYMD(d);
        } else if (p === '30d') {
            const d = new Date(today); d.setDate(today.getDate() - 30);
            startStr = toYMD(d);
        } else if (p === 'mtd') {
            const d = new Date(today.getFullYear(), today.getMonth(), 1);
            startStr = toYMD(d);
        } else if (p === 'last_month') {
            const dStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const dEnd = new Date(today.getFullYear(), today.getMonth(), 0);
            startStr = toYMD(dStart);
            endStr = toYMD(dEnd);
        }
        return { startStr, endStr };
    };

    // Derived Filter Options (Internal to Detail View now)
    const { filterOptions, allowedStoreIds, storeNameMap } = useMemo(() => {
        const meta: Record<string, any> = mgmtData?.store_meta || {};
        const stores = mgmtData?.stores || {};
        const mgrs = new Set<string>();

        Object.values(meta).forEach((m: any) => {
            if (m?.manager) mgrs.add(String(m.manager));
        });

        const isManager = user?.role === 'Manager' || (user?.role !== 'Admin' && user?.role !== 'Auditor' && user?.name && user?.name !== 'Sales Manager');
        const effectiveManager = isManager ? user.name : manager;

        // Current scope stores (for dropdowns)
        const brList = Object.keys(stores)
            .filter(sid => {
                const m = meta[sid];
                if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
                return true;
            })
            .map(sid => ({ id: sid, name: stores[sid] || sid }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

        // Allowed IDs for data filtering
        const allowed = new Set<string>();
        Object.keys(meta).forEach(sid => {
            const m = meta[sid];
            if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return;
            if (branch !== 'all' && sid !== branch) return;
            allowed.add(sid);
        });

        return {
            filterOptions: {
                managers: isManager ? [user.name] : Array.from(mgrs).sort((a, b) => a.localeCompare(b, 'ar')),
                branches: brList
            },
            allowedStoreIds: allowed,
            storeNameMap: stores
        };
    }, [mgmtData, manager, branch, user]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        return products.map(p => {
            const m = mapping[p.id];
            const merged = { ...p };
            if (m) {
                if (m.alias) merged.alias = m.alias;
                if (m.dCode) merged.dCode = m.dCode;
            }
            return merged;
        }).filter((p) => {
            const id = (p.id || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            const alias = (p.alias || '').toLowerCase();
            const oldCode = (p.old_code || '').toLowerCase();
            const dCode = (p.dCode || '').toLowerCase();
            const qLower = q.toLowerCase();

            return id.includes(qLower) ||
                name.includes(qLower) ||
                alias.includes(qLower) ||
                oldCode.includes(qLower) ||
                dCode.includes(qLower) ||
                (p.id && String(p.id).includes(qLower));
        }).slice(0, 100);
    }, [search, products, mapping]);

    const selectedProduct = useMemo(() => {
        if (!selectedId) return null;
        return products.find(p => p.id === selectedId) || null;
    }, [selectedId, products]);

    // MASTER VIEW DATA: Branch List (Dynamic Calculation)
    const pidToAliasMap = useMemo(() => {
        const map: Record<string, string> = {};
        products.forEach(p => { map[p.id] = p.alias || ""; });
        Object.entries(mapping).forEach(([id, m]) => {
            if (m.alias) map[id] = m.alias;
        });
        return map;
    }, [products, mapping]);

    const branchList = useMemo(() => {
        if (!selectedProduct) return [];
        const list: { id: string; name: string; qty: number; amount: number; stock: number }[] = [];
        const stMap = selectedProduct.stockByStore || {};

        // Calculate Sales from History based on filteredPeriod
        const salesMap: Record<string, { q: number; a: number }> = {};
        const { startStr, endStr } = getDateRange(filteredPeriod);

        // ALIAS PREFIX LOGIC for Family Tree
        const targetAlias = selectedProduct.alias || mapping[selectedProduct.id]?.alias || "";
        // NEW LOGIC: Alias minus last 2 chars (e.g. 4489610 -> 44896)
        const prefix = (isFamilyMode && targetAlias && targetAlias.length > 2)
            ? targetAlias.slice(0, -2)
            : (isFamilyMode ? targetAlias : "");

        Object.entries(history).forEach(([pid, hist]) => {
            if (isFamilyMode && prefix) {
                const currentAlias = pidToAliasMap[pid] || "";
                if (!currentAlias.startsWith(prefix)) return;
            } else {
                if (pid !== selectedProduct.id) return;
            }

            hist.forEach(h => {
                const d = String(h.date);
                if (d >= startStr && d <= endStr) {
                    const sid = String(h.store_id || h.store);
                    if (!salesMap[sid]) salesMap[sid] = { q: 0, a: 0 };
                    salesMap[sid].q += Number(h.qty) || 0;
                    salesMap[sid].a += Number(h.amount) || 0;
                }
            });
        });

        // Combine Sales and Stock keys
        const allStoreIds = new Set([...Object.keys(salesMap), ...Object.keys(stMap)]);

        allStoreIds.forEach(sid => {
            if (!allowedStoreIds.has(sid)) return; // Apply filters

            const sales = salesMap[sid] || { q: 0, a: 0 };
            const stock = stMap[sid] || 0;

            if (sales.q > 0 || sales.a > 0 || stock > 0) {
                list.push({
                    id: sid,
                    name: storeNameMap[sid] || sid,
                    qty: sales.q,
                    amount: sales.a,
                    stock: stock
                });
            }
        });
        return list.sort((a, b) => b.qty - a.qty);
    }, [selectedProduct, allowedStoreIds, storeNameMap, history, filteredPeriod, isFamilyMode, pidToAliasMap]);

    const handleExport = async () => {
        if (!selectedProduct) return;

        try {
            const XLSX = await import('xlsx');

            const headers = ['المعرض', 'المنطقة', 'المخزون', 'الكمية المباعة', 'قيمة المبيعات'];

            // Prepare data with formatting
            const data = branchList.map(b => {
                const meta = mgmtData?.store_meta?.[b.id] || {};
                const region = meta.manager || '-';

                return [
                    b.name,
                    region,
                    b.stock,
                    b.qty,
                    Number(b.amount.toFixed(2))
                ];
            });

            // Add totals
            const totStock = branchList.reduce((a, c) => a + c.stock, 0);
            const totQty = branchList.reduce((a, c) => a + c.qty, 0);
            const totAmt = branchList.reduce((a, c) => a + c.amount, 0);

            data.push(['الإجمالي', '--', totStock, totQty, Number(totAmt.toFixed(2))]);
            data.push(['الفترة:', filteredPeriod === 'today' ? 'اليوم' :
                filteredPeriod === 'yesterday' ? 'أمس' :
                    filteredPeriod === '7d' ? 'آخر 7 أيام' :
                        filteredPeriod === '30d' ? 'آخر 30 يوم' :
                            filteredPeriod === 'mtd' ? 'الشهر الحالي' : 'الشهر الماضي', '', '', '']);

            // Create worksheet
            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

            // Apply column widths (approximate)
            ws['!cols'] = [
                { wch: 20 }, // Store
                { wch: 15 }, // Region
                { wch: 10 }, // Stock
                { wch: 12 }, // Qty
                { wch: 15 }, // Amount
            ];

            // Create workbook and download
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "تقرير المنتج");
            XLSX.writeFile(wb, `Product_Report_${selectedProduct.id}_${new Date().toISOString().slice(0, 10)}.xlsx`);

        } catch (e) {
            console.error("Export failed:", e);
            alert("حدث خطأ أثناء التصدير. يرجى المحاولة مرة أخرى.");
        }
    };

    // DETAIL VIEW DATA: Store Variant Breakdown (Tree Mode) OR Daily History (Single Mode)
    const storeDetailView = useMemo(() => {
        if (!selectedId || !selectedStore) return null;
        const { startStr, endStr } = getDateRange(period);
        const targetAlias = selectedProduct?.alias || mapping[selectedId]?.alias || "";

        // Tree Mode Prefix
        const prefix = (isFamilyMode && targetAlias && targetAlias.length > 2)
            ? targetAlias.slice(0, -2)
            : (isFamilyMode ? targetAlias : "");

        // 1. If Tree Mode: Aggregate distinct products (variants)
        if (isFamilyMode && prefix) {
            const variantMap = new Map<string, { name: string; alias: string; qty: number; amount: number; dates: Set<string> }>();

            Object.entries(history).forEach(([pid, hist]) => {
                const currentAlias = pidToAliasMap[pid] || "";
                if (!currentAlias.startsWith(prefix)) return;

                // Filter for THIS store
                const storeHist = hist.filter(h => {
                    const sid = String(h.store_id || h.store);
                    const d = String(h.date);
                    return sid === selectedStore && d >= startStr && d <= endStr;
                });

                if (storeHist.length > 0) {
                    let vEntry = variantMap.get(pid);
                    if (!vEntry) {
                        try {
                            const pName = products.find(np => String(np.id) === String(pid))?.name || `Product ${pid}`;
                            vEntry = { name: pName, alias: currentAlias, qty: 0, amount: 0, dates: new Set() };
                            variantMap.set(pid, vEntry);
                        } catch (e) { console.warn(e); }
                    }
                    if (vEntry) {
                        storeHist.forEach(h => {
                            vEntry!.qty += Number(h.qty) || 0;
                            vEntry!.amount += Number(h.amount) || 0;
                            vEntry!.dates.add(h.date);
                        });
                    }
                }
            });

            const variants = Array.from(variantMap.entries()).map(([pid, data]) => {
                // Lookup stock for this specific PID in the selected store
                // We need to find the product object first
                const pObj = products.find(p => p.id === pid);
                const stockVal = pObj?.stockByStore?.[selectedStore] || 0;

                return {
                    id: pid,
                    ...data,
                    dateCount: data.dates.size,
                    stock: stockVal
                };
            }).sort((a, b) => b.qty - a.qty);

            const totalQty = variants.reduce((acc, v) => acc + v.qty, 0);
            const totalAmt = variants.reduce((acc, v) => acc + v.amount, 0);

            return {
                mode: 'tree',
                variants,
                totalQty,
                totalAmt,
                start: startStr,
                end: endStr,
                storeName: storeNameMap[selectedStore] || selectedStore
            };
        }

        // 2. If Single Mode: Daily History for ONE product
        else {
            const hist = history[selectedId] || [];
            const storeHist = hist.filter(h => {
                if (String(h.store_id) !== selectedStore && String(h.store) !== selectedStore) return false;
                const d = String(h.date);
                return d >= startStr && d <= endStr;
            });

            const totalQty = storeHist.reduce((s, h) => s + (Number(h.qty) || 0), 0);
            const totalAmt = storeHist.reduce((s, h) => s + (Number(h.amount) || 0), 0);
            const sorted = [...storeHist].sort((a, b) => String(b.date).localeCompare(String(a.date)));

            return {
                mode: 'daily',
                recent: sorted,
                totalQty,
                totalAmt,
                start: startStr,
                end: endStr,
                storeName: storeNameMap[selectedStore] || selectedStore
            };
        }
    }, [selectedId, selectedStore, history, period, isFamilyMode, products, pidToAliasMap, storeNameMap]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                            {selectedId ? <CubeIcon /> : <SearchIcon />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-neutral-900">
                                {selectedStore ? `تفاصيل الفرع: ${storeDetailView?.storeName}` : selectedId ? 'تفاصيل المنتج (بالفروع)' : 'استعلام عن منتج'}
                            </h2>
                            <p className="text-xs text-neutral-500">
                                {selectedId ? selectedProduct?.name : 'البحث بالاسم، الكود الجديد، أو الكود القديم'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedStore ? (
                            <button
                                onClick={() => setSelectedStore(null)}
                                className="px-3 py-1.5 text-sm font-bold text-neutral-600 hover:bg-neutral-200 rounded-lg transition-colors"
                            >
                                عودة للقائمة
                            </button>
                        ) : selectedId ? (
                            <button
                                onClick={() => { setSelectedId(null); setManager('all'); setBranch('all'); }}
                                className="px-3 py-1.5 text-sm font-bold text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            >
                                عودة للبحث
                            </button>
                        ) : null}
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-neutral-200 rounded-lg transition-colors text-neutral-400"
                        >
                            <XIcon />
                        </button>
                    </div>
                </div>

                {!selectedId ? (
                    <>
                        {/* Search Input */}
                        <div className="p-4 bg-white sticky top-0 z-10 flex-shrink-0">
                            <div className="relative">
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="ابحث هنا..."
                                    className="w-full pl-12 pr-4 py-3 bg-neutral-100 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all outline-none font-semibold text-right"
                                    dir="rtl"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
                                    <SearchIcon />
                                </div>
                            </div>
                        </div>

                        {/* Results List */}
                        <div className="flex-1 overflow-y-auto p-2">
                            {search.trim() === '' ? (
                                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                                    <div className="w-16 h-16 rounded-full bg-neutral-50 flex items-center justify-center mb-4 text-neutral-300">
                                        <SearchIcon className="h-8 w-8" />
                                    </div>
                                    <p className="font-medium">ابدأ البحث بإدخال اسم المنتج أو الكود</p>
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                                    <p className="font-medium">لا توجد نتائج مطابقة لـ "{search}"</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {filtered.map((product) => (
                                        <div
                                            key={product.id}
                                            onClick={() => setSelectedId(product.id)}
                                            className="p-3 rounded-xl hover:bg-orange-50 transition-colors border border-transparent hover:border-orange-100 group cursor-pointer"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-start gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-500 group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors">
                                                        <CubeIcon />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-neutral-900 group-hover:text-orange-900">{product.name}</div>
                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                            <span className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded font-mono">
                                                                #{product.id}
                                                            </span>
                                                            {(product.alias || product.old_code) && (
                                                                <span className="text-[10px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded">
                                                                    قديم: {product.alias || product.old_code}
                                                                </span>
                                                            )}
                                                            {product.dCode && (
                                                                <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                                                                    DC: {product.dCode}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] text-neutral-400">{product.category}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-left flex-shrink-0">
                                                    <div className="font-bold text-orange-600">
                                                        {product.qty > 0 ? formatSAR(product.amount / product.qty) : '-'}
                                                    </div>
                                                    <div className="text-[10px] text-neutral-400">سعر الوحدة</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : !selectedStore ? (
                    /* MASTER VIEW: Branch List */
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Filters */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-2 border-b border-neutral-100">
                            <div>
                                <label className="block text-[10px] font-bold text-neutral-400 mb-1">مدير المنطقة</label>
                                <select
                                    className="w-full text-xs font-bold bg-neutral-100 border-none rounded-lg p-2 outline-none focus:ring-1 focus:ring-orange-500"
                                    value={manager}
                                    onChange={(e) => { setManager(e.target.value); setBranch('all'); }}
                                >
                                    <option value="all">الكل</option>
                                    {filterOptions.managers.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-neutral-400 mb-1">المعرض</label>
                                <select
                                    className="w-full text-xs font-bold bg-neutral-100 border-none rounded-lg p-2 outline-none focus:ring-1 focus:ring-orange-500"
                                    value={branch}
                                    onChange={(e) => setBranch(e.target.value)}
                                >
                                    <option value="all">الكل</option>
                                    {filterOptions.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-neutral-400 mb-1">الفترة الزمنية</label>
                                <select
                                    className="w-full text-xs font-bold bg-neutral-100 border-none rounded-lg p-2 outline-none focus:ring-1 focus:ring-orange-500"
                                    value={filteredPeriod}
                                    onChange={(e) => setFilteredPeriod(e.target.value as any)}
                                >
                                    <option value="today">اليوم</option>
                                    <option value="yesterday">أمس</option>
                                    <option value="7d">آخر 7 أيام</option>
                                    <option value="30d">آخر 30 يوم</option>
                                    <option value="mtd">الشهر الحالي</option>
                                    <option value="last_month">الشهر الماضي</option>
                                </select>
                            </div>
                        </div>

                        {/* Export & Family Toggle */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsFamilyMode(!isFamilyMode)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isFamilyMode
                                        ? 'bg-orange-500 text-white border-orange-500'
                                        : 'bg-white text-neutral-600 border-neutral-200 hover:bg-orange-50'
                                        }`}
                                >
                                    {isFamilyMode ? '✨ عرض مبيعات الصنف فقط' : '🌴 عرض مبيعات الشجرة كاملة'}
                                </button>
                                {isFamilyMode && (
                                    <span className="text-[10px] text-orange-600 font-bold bg-orange-50 px-2 py-1 rounded">
                                        يتم عرض المنتجات في الشجرة: {(selectedProduct?.alias || selectedId || '').length > 2 ? (selectedProduct?.alias || selectedId || '').slice(0, -2) : (selectedProduct?.alias || selectedId || '')}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold transition-colors"
                            >
                                <InvoicesIcon className="h-4 w-4" /> تصدير تقرير (XLSX)
                            </button>
                        </div>

                        {/* Totals Summary */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-orange-50 p-3 rounded-xl border border-orange-100">
                                <div className="flex items-center gap-2 mb-1 text-orange-600">
                                    <SalesIcon className="h-4 w-4" />
                                    <span className="text-xs font-bold">إجمالي المبيعات</span>
                                </div>
                                <div className="text-lg font-black text-orange-700" dir="ltr">
                                    {formatSAR(branchList.reduce((acc, curr) => acc + curr.amount, 0))}
                                </div>
                            </div>
                            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                                <div className="flex items-center gap-2 mb-1 text-blue-600">
                                    <QtyIcon className="h-4 w-4" />
                                    <span className="text-xs font-bold">إجمالي الكمية</span>
                                </div>
                                <div className="text-lg font-black text-blue-700" dir="ltr">
                                    {branchList.reduce((acc, curr) => acc + curr.qty, 0).toLocaleString()} <span className="text-[10px]">قطعة</span>
                                </div>
                            </div>
                            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                <div className="flex items-center gap-2 mb-1 text-emerald-600">
                                    <CubeIcon className="h-4 w-4" />
                                    <span className="text-xs font-bold">إجمالي المخزون</span>
                                </div>
                                <div className="text-lg font-black text-emerald-700" dir="ltr">
                                    {branchList.reduce((acc, curr) => acc + curr.stock, 0).toLocaleString()} <span className="text-[10px]">قطعة</span>
                                </div>
                            </div>
                        </div>

                        {/* List */}
                        <div className="space-y-2">
                            <div className="text-xs text-neutral-400 font-semibold mb-2">اضغط على الفرع لعرض التفاصيل</div>
                            {branchList.length === 0 ? (
                                <div className="text-center py-10 text-neutral-400">
                                    لا توجد مبيعات لهذا المنتج في النطاق المحدد.
                                </div>
                            ) : (
                                branchList.map(b => (
                                    <button
                                        key={b.id}
                                        onClick={() => setSelectedStore(b.id)}
                                        className="w-full flex items-center justify-between p-3 rounded-xl border border-neutral-100 hover:bg-orange-50 hover:border-orange-200 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-500 flex items-center justify-center font-bold text-xs group-hover:bg-white group-hover:text-orange-600">
                                                {b.name.charAt(0)}
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-neutral-900 group-hover:text-orange-800">{b.name}</div>
                                                <div className="text-[10px] text-neutral-400">ID: {b.id}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 text-left">
                                            <div>
                                                <div className="text-sm font-bold text-emerald-600">{b.stock}</div>
                                                <div className="text-[10px] text-neutral-400">مخزون</div>
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-neutral-900">{b.qty}</div>
                                                <div className="text-[10px] text-neutral-400">مباع</div>
                                            </div>
                                            <div className="min-w-[70px]">
                                                <div className="text-sm font-bold text-orange-600">{formatSAR(b.amount)}</div>
                                                <div className="text-[10px] text-neutral-400">القيمة</div>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    /* DETAIL VIEW: Daily History OR Variant Breakdown */
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* Period Selection */}
                        <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-xl">
                            {[
                                { id: 'yesterday', label: 'أمس' },
                                { id: '7d', label: '7 أيام' },
                                { id: 'mtd', label: 'الشهر الحالي' },
                                { id: '30d', label: '30 يوم' },
                                { id: 'last_month', label: 'الشهر الماضي' },
                            ].map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => setPeriod(p.id as any)}
                                    className={`flex-1 px-2 py-1.5 text-xs font-bold rounded-lg transition-all ${period === p.id
                                        ? 'bg-white text-orange-600 shadow-sm'
                                        : 'text-neutral-500 hover:text-neutral-700'
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                                <div className="flex items-center gap-2 mb-2 text-orange-600">
                                    <SalesIcon className="h-5 w-5" />
                                    <span className="text-sm font-bold">مبيعات الفرع</span>
                                </div>
                                <div className="text-2xl font-black text-orange-700" dir="ltr">
                                    {formatSAR(storeDetailView?.totalAmt || 0)}
                                </div>
                                <div className="text-[10px] text-orange-400 mt-1 font-bold">
                                    للفترة من {storeDetailView?.start} إلى {storeDetailView?.end}
                                </div>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                                <div className="flex items-center gap-2 mb-2 text-blue-600">
                                    <QtyIcon className="h-5 w-5" />
                                    <span className="text-sm font-bold">الكمية المباعة</span>
                                </div>
                                <div className="text-2xl font-black text-blue-700" dir="ltr">
                                    {(storeDetailView?.totalQty || 0).toLocaleString()} <span className="text-xs">قطعة</span>
                                </div>
                            </div>
                        </div>

                        {/* Recent History Table OR Variant Breakdown */}
                        <div>
                            {storeDetailView?.mode === 'tree' ? (
                                <>
                                    <h3 className="text-sm font-bold text-neutral-700 mb-3 flex items-center gap-2">
                                        <span>🌴</span> تحليل أصناف الشجرة
                                    </h3>
                                    <div className="overflow-hidden border border-neutral-100 rounded-xl">
                                        <table className="w-full text-sm">
                                            <thead className="bg-neutral-50 text-neutral-500">
                                                <tr className="border-b border-neutral-100">
                                                    <th className="py-2 px-3 text-right">الصنف</th>
                                                    <th className="py-2 px-3 text-center">المخزون</th>
                                                    <th className="py-2 px-3 text-center">الكمية</th>
                                                    <th className="py-2 px-3 text-left">المبلغ</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-50">
                                                {(storeDetailView.variants || []).length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className="py-8 text-center text-neutral-400">لا توجد حركات مبيعات للشجرة في هذا الفرع</td>
                                                    </tr>
                                                ) : (
                                                    (storeDetailView.variants || []).map((v: any, i: number) => (
                                                        <tr key={i} className="hover:bg-neutral-50">
                                                            <td className="py-2 px-3">
                                                                <div className="font-bold text-neutral-800">{v.name}</div>
                                                                <div className="flex gap-2 text-xs text-neutral-400 font-mono">
                                                                    <span>#{v.id}</span>
                                                                    <span>• {v.alias}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-3 text-center font-bold text-emerald-600 dir-ltr">{v.stock}</td>
                                                            <td className="py-2 px-3 text-center font-bold text-neutral-900">{v.qty}</td>
                                                            <td className="py-2 px-3 text-left font-bold text-orange-600" dir="ltr">{formatSAR(v.amount)}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 flex flex-col gap-5">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                                <span className="text-lg">📊</span> تحليل حركة المخزون (Sell-Through)
                                            </h3>
                                            {(() => {
                                                const stVal = selectedProduct?.stockByStore?.[selectedStore!] || 0;
                                                const health = stVal === 0 ? { l: 'نفذ المخزون', c: 'text-red-600', b: 'bg-red-50' } :
                                                    stVal < 5 ? { l: 'مخزون حرج', c: 'text-orange-600', b: 'bg-orange-50' } :
                                                        stVal > 50 ? { l: 'مخزون مرتفع', c: 'text-blue-600', b: 'bg-blue-50' } :
                                                            { l: 'مخزون مستقر', c: 'text-emerald-600', b: 'bg-emerald-50' };
                                                return <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${health.b} ${health.c}`}>{health.l}</div>;
                                            })()}
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                                <div className="text-[10px] text-slate-400 font-bold mb-1">نسبة المبيعات للمخزون</div>
                                                {(() => {
                                                    const sls = storeDetailView?.totalQty || 0;
                                                    const st = selectedProduct?.stockByStore?.[selectedStore!] || 0;
                                                    const total = sls + st;
                                                    const ratio = total > 0 ? (sls / total) * 100 : 0;
                                                    return (
                                                        <>
                                                            <div className="text-2xl font-black text-slate-800">{ratio.toFixed(1)}%</div>
                                                            <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${ratio}%` }} />
                                                            </div>
                                                        </>
                                                    );
                                                })()}\
                                            </div>
                                            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                                <div className="text-[10px] text-slate-400 font-bold mb-1">المخزون الحالي</div>
                                                <div className="text-2xl font-black text-slate-800">{(selectedProduct?.stockByStore?.[selectedStore!] || 0).toLocaleString()}</div>
                                                <div className="text-[10px] text-slate-400 mt-1 truncate">متوفر في الفرع</div>
                                            </div>
                                        </div>

                                        <div className="space-y-2.5">
                                            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
                                                <span className="text-slate-500 font-bold">سرعة البيع اليومية (MTD Velocity)</span>
                                                {(() => {
                                                    const days = Math.max(1, (new Date(storeDetailView?.end!).getTime() - new Date(storeDetailView?.start!).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                                                    return <span className="text-slate-800 font-black">{(storeDetailView?.totalQty! / days).toFixed(2)} قطعة / يوم</span>;
                                                })()}
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-slate-500 font-bold">إجمالي التدفق (مبيعات + مخزون)</span>
                                                <span className="text-slate-800 font-black">{(storeDetailView?.totalQty! + (selectedProduct?.stockByStore?.[selectedStore!] || 0)).toLocaleString()} قطعة</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Footer */}
                {!selectedId && (
                    <div className="p-3 bg-neutral-50 border-t border-neutral-100 text-center flex-shrink-0">
                        <p className="text-[10px] text-neutral-400">
                            عرض {filtered.length} نتيجة من إجمالي {products.length} منتج
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

