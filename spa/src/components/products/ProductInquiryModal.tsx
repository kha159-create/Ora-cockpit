import React, { useState, useMemo } from 'react';
import { SearchIcon, XIcon, CubeIcon, SalesIcon, CubeIcon as QtyIcon } from '../Icons';

interface Product {
    id: string;
    name: string;
    category: string;
    qty: number;
    amount: number;
    alias?: string;
    old_code?: string;
    salesByStore?: Record<string, { q: number; a: number }>;
    [key: string]: any;
}

interface ProductInquiryModalProps {
    isOpen: boolean;
    onClose: () => void;
    products: Product[];
    history: Record<string, any[]>;
    formatSAR: (val: number) => string;
    mgmtData?: any;
}

export const ProductInquiryModal: React.FC<ProductInquiryModalProps> = ({ isOpen, onClose, products, history, formatSAR, mgmtData }) => {
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [period, setPeriod] = useState<'yesterday' | '7d' | 'mtd' | '30d' | 'last_month'>('mtd');

    // Filter states
    const [manager, setManager] = useState('all');
    const [city, setCity] = useState('all');
    const [branch, setBranch] = useState('all');

    // Derived Filter Options
    const { filterOptions, allowedStoreIds } = useMemo(() => {
        const meta: Record<string, any> = mgmtData?.store_meta || {};
        const stores = mgmtData?.stores || {};
        const mgrs = new Set<string>();
        const cts = new Set<string>();

        Object.values(meta).forEach((m: any) => {
            if (m?.manager) mgrs.add(String(m.manager));
            if (manager === 'all' || String(m?.manager) === manager) {
                if (m?.city) cts.add(String(m.city));
            }
        });

        const brList = Object.keys(stores)
            .filter(sid => {
                const m = meta[sid];
                if (manager !== 'all' && String(m?.manager || '') !== manager) return false;
                if (city !== 'all' && String(m?.city || '') !== city) return false;
                return true;
            })
            .map(sid => ({ id: sid, name: stores[sid] || sid }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

        const allowed = new Set<string>();
        Object.keys(meta).forEach(sid => {
            const m = meta[sid];
            if (manager !== 'all' && String(m?.manager || '') !== manager) return;
            if (city !== 'all' && String(m?.city || '') !== city) return;
            if (branch !== 'all' && sid !== branch) return;
            allowed.add(sid);
        });

        return {
            filterOptions: {
                managers: Array.from(mgrs).sort((a, b) => a.localeCompare(b, 'ar')),
                cities: Array.from(cts).sort((a, b) => a.localeCompare(b, 'ar')),
                branches: brList
            },
            allowedStoreIds: allowed
        };
    }, [mgmtData, manager, city, branch]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];

        const isFilteringStores = manager !== 'all' || city !== 'all' || branch !== 'all';

        return products.map(p => {
            if (!isFilteringStores) return p;

            // Re-calculate totals based on allowed stores
            let qTotal = 0;
            let aTotal = 0;
            const sMap = p.salesByStore || {};

            allowedStoreIds.forEach(sid => {
                const sData = sMap[sid];
                if (sData) {
                    qTotal += sData.q;
                    aTotal += sData.a;
                }
            });

            return { ...p, qty: qTotal, amount: aTotal };
        }).filter((p) => {
            const id = (p.id || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            const alias = (p.alias || '').toLowerCase();
            const oldCode = (p.old_code || '').toLowerCase();
            const qLower = q.toLowerCase();

            // Search across ALL identifiers
            return id.includes(qLower) ||
                name.includes(qLower) ||
                alias.includes(qLower) ||
                oldCode.includes(qLower) ||
                (p.id && String(p.id).includes(qLower));
        }).slice(0, 100);
    }, [search, products, manager, city, branch, allowedStoreIds]);

    const selectedProduct = useMemo(() => {
        if (!selectedId) return null;
        return products.find(p => p.id === selectedId) || null;
    }, [selectedId, products]);

    const productStats = useMemo(() => {
        if (!selectedId || !history[selectedId]) return null;
        const hist = history[selectedId];

        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        const pad2 = (n: number) => String(n).padStart(2, '0');
        const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        let startStr = '';
        let endStr = toYMD(today);

        if (period === 'yesterday') {
            startStr = toYMD(yesterday);
            endStr = toYMD(yesterday);
        } else if (period === '7d') {
            const d = new Date(today); d.setDate(today.getDate() - 7);
            startStr = toYMD(d);
        } else if (period === 'mtd') {
            const d = new Date(today.getFullYear(), today.getMonth(), 1);
            startStr = toYMD(d);
        } else if (period === '30d') {
            const d = new Date(today); d.setDate(today.getDate() - 30);
            startStr = toYMD(d);
        } else if (period === 'last_month') {
            const dStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const dEnd = new Date(today.getFullYear(), today.getMonth(), 0);
            startStr = toYMD(dStart);
            endStr = toYMD(dEnd);
        }

        const periodHist = hist.filter(h => {
            const d = String(h.date);
            return d >= startStr && d <= endStr;
        });

        const totalQty = periodHist.reduce((s, h) => s + (Number(h.qty) || 0), 0);
        const totalAmt = periodHist.reduce((s, h) => s + (Number(h.amount) || 0), 0);
        const sorted = [...periodHist].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        return { totalQty, totalAmt, recent: sorted, start: startStr, end: endStr };
    }, [selectedId, history, period]);

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
                                {selectedId ? 'تفاصيل المنتج' : 'استعلام عن منتج'}
                            </h2>
                            <p className="text-xs text-neutral-500">
                                {selectedId ? selectedProduct?.name : 'البحث بالاسم، الكود الجديد، أو الكود القديم'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedId && (
                            <button
                                onClick={() => setSelectedId(null)}
                                className="px-3 py-1.5 text-sm font-bold text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            >
                                عودة للبحث
                            </button>
                        )}
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
                        {/* Filters Row */}
                        {mgmtData && (
                            <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-neutral-400 mb-1">مدير المنطقة</label>
                                    <select
                                        className="w-full text-xs font-bold bg-neutral-100 border-none rounded-lg p-2 outline-none focus:ring-1 focus:ring-orange-500"
                                        value={manager}
                                        onChange={(e) => { setManager(e.target.value); setCity('all'); setBranch('all'); }}
                                    >
                                        <option value="all">الكل</option>
                                        {filterOptions.managers.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-neutral-400 mb-1">المدينة</label>
                                    <select
                                        className="w-full text-xs font-bold bg-neutral-100 border-none rounded-lg p-2 outline-none focus:ring-1 focus:ring-orange-500"
                                        value={city}
                                        onChange={(e) => { setCity(e.target.value); setBranch('all'); }}
                                    >
                                        <option value="all">الكل</option>
                                        {filterOptions.cities.map(c => <option key={c} value={c}>{c}</option>)}
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
                            </div>
                        )}

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
                ) : (
                    /* Details View */
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
                                    <span className="text-sm font-bold">إجمالي المبيعات</span>
                                </div>
                                <div className="text-2xl font-black text-orange-700" dir="ltr">
                                    {formatSAR(productStats?.totalAmt || 0)}
                                </div>
                                <div className="text-[10px] text-orange-400 mt-1 font-bold">
                                    للفترة من {productStats?.start} إلى {productStats?.end}
                                </div>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                                <div className="flex items-center gap-2 mb-2 text-blue-600">
                                    <QtyIcon className="h-5 w-5" />
                                    <span className="text-sm font-bold">إجمالي الكمية</span>
                                </div>
                                <div className="text-2xl font-black text-blue-700" dir="ltr">
                                    {(productStats?.totalQty || 0).toLocaleString()} <span className="text-xs">قطعة</span>
                                </div>
                            </div>
                        </div>

                        {/* Recent History Table */}
                        <div>
                            <h3 className="text-sm font-bold text-neutral-700 mb-3 flex items-center gap-2">
                                <span>📈</span> تفاصيل المبيعات خلال الفترة الاختيارية
                            </h3>
                            <div className="overflow-hidden border border-neutral-100 rounded-xl">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-50 text-neutral-500">
                                        <tr className="border-b border-neutral-100">
                                            <th className="py-2 px-3 text-right">التاريخ</th>
                                            <th className="py-2 px-3 text-center">الكمية</th>
                                            <th className="py-2 px-3 text-left">المبلغ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-50">
                                        {productStats?.recent.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="py-8 text-center text-neutral-400">لا توجد حركات مبيعات مسجلة في هذه الفترة</td>
                                            </tr>
                                        ) : (
                                            productStats?.recent.map((h, i) => (
                                                <tr key={i} className="hover:bg-neutral-50">
                                                    <td className="py-2 px-3 font-mono text-neutral-600">{h.date}</td>
                                                    <td className="py-2 px-3 text-center font-bold text-neutral-900">{h.qty}</td>
                                                    <td className="py-2 px-3 text-left font-bold text-orange-600" dir="ltr">{formatSAR(h.amount)}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
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

