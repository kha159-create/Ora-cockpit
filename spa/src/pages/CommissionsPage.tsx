import React, { useState, useEffect, useMemo } from 'react';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';
import { useCommissions, getStoreCommissionRate } from '../hooks/useCommissions';
import { CalendarIcon, ChevronDownIcon, ChevronUpIcon, CalculatorIcon, XIcon } from '../components/Icons';
import { DashboardSkeleton } from '../components/SkeletonComponents';
import { getCurrentUser } from '../auth/storage';

function isAdminOrAuditor(role?: string) { return role === 'Admin' || role === 'Auditor'; }

// Simulation Modal Component
const SimulationModal = ({ isOpen, onClose, employeeName, storeRate, target }: { isOpen: boolean; onClose: () => void; employeeName: string; storeRate: number; target: number }) => {
    const [sales, setSales] = useState<number>(0);
    const [storeAchMode, setStoreAchMode] = useState<number | 'custom'>(100);
    const [customStoreAch, setCustomStoreAch] = useState<number>(100);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setSales(0);
            setStoreAchMode(100);
            setCustomStoreAch(100);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const getSimStoreRate = () => {
        let ach = storeAchMode === 'custom' ? customStoreAch : storeAchMode;
        if (ach >= 100) return 2;
        if (ach >= 90) return 1;
        if (ach >= 80) return 0.5;
        return 0;
    };

    const simulatedStoreRate = getSimStoreRate();
    // Calculate achievement based on entered sales and ACTUAL target
    const simulatedAchievement = target > 0 ? (sales / target) * 100 : 0;

    // New Formula: (Personal Achievement % / 100) * Store Rate
    const finalRate = (simulatedAchievement / 100) * simulatedStoreRate;
    const commissionAmount = sales * (finalRate / 100);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
                <button onClick={onClose} className="absolute top-4 left-4 text-neutral-400 hover:text-neutral-600">
                    <XIcon />
                </button>

                <h2 className="text-xl font-bold text-neutral-900 mb-1 flex items-center gap-2">
                    <CalculatorIcon />
                    محاكاة العمولة
                </h2>
                <p className="text-neutral-500 text-sm mb-6">للموظف: <span className="font-semibold text-neutral-700">{employeeName}</span></p>

                <div className="space-y-4">
                    {/* Store Achievement Setting */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-2">نسبة تحقيق المعرض</label>
                        <div className="flex gap-2">
                            {[80, 90, 100].map(rate => (
                                <button
                                    key={rate}
                                    onClick={() => setStoreAchMode(rate)}
                                    className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-colors ${storeAchMode === rate
                                        ? 'bg-neutral-800 text-white border-neutral-800'
                                        : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                                        }`}
                                >
                                    {rate}%
                                </button>
                            ))}
                            <button
                                onClick={() => setStoreAchMode('custom')}
                                className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-colors ${storeAchMode === 'custom'
                                    ? 'bg-neutral-800 text-white border-neutral-800'
                                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                                    }`}
                            >
                                مخصص
                            </button>
                        </div>
                        {storeAchMode === 'custom' && (
                            <input
                                type="number"
                                value={customStoreAch}
                                onChange={(e) => setCustomStoreAch(Number(e.target.value))}
                                className="w-full mt-2 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-right"
                                placeholder="أدخل النسبة"
                            />
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">المبيعات المتوقعة (SAR)</label>
                        <input
                            type="number"
                            value={sales}
                            onChange={(e) => setSales(Number(e.target.value))}
                            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                            placeholder="0"
                        />
                        <div className="mt-1 flex justify-between px-1">
                            <span className="text-[10px] text-neutral-400">الهدف الفعلي لهذا الموظف: {Math.round(target).toLocaleString()} SAR</span>
                            <span className="text-[10px] font-bold text-orange-600">نسبة التحقيق: {simulatedAchievement.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div className="bg-neutral-50 p-4 rounded-xl space-y-2 mt-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">نسبة المعرض (المحاكاة):</span>
                            <span className="font-bold">{simulatedStoreRate}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">نسبة العمولة النهائية:</span>
                            <span className="font-bold text-blue-600">{finalRate.toFixed(2)}%</span>
                        </div>
                        <div className="pt-2 border-t border-neutral-200 mt-2 flex justify-between items-center">
                            <span className="font-bold text-neutral-900">العمولة المتوقعة:</span>
                            <span className="font-bold text-xl text-green-600">{Math.round(commissionAmount).toLocaleString()} SAR</span>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-6 bg-neutral-900 text-white py-3 rounded-xl font-bold hover:bg-neutral-800 transition-colors"
                    >
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function CommissionsPage() {
    const user = getCurrentUser();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ mgmt: any; emp: any } | null>(null);
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
    const [expandedStore, setExpandedStore] = useState<string | null>(null);
    const [manager, setManager] = useState<string>('all');
    const [storeFilter, setStoreFilter] = useState<string>(user?.storeId || 'all');

    // Simulation State
    const [simModalOpen, setSimModalOpen] = useState(false);
    const [simEmployee, setSimEmployee] = useState<{ name: string; storeRate: number; target: number } | null>(null);

    useEffect(() => {
        Promise.all([loadManagementData(), loadEmployeesData()])
            .then(([mgmt, emp]) => {
                setData({ mgmt, emp });
            })
            .finally(() => setLoading(false));
    }, []);

    const effectiveManager = useMemo(() => {
        if (isAdminOrAuditor(user?.role)) return manager;
        return user?.name || manager;
    }, [manager, user?.name, user?.role]);

    const { managers, storeOptions } = useMemo(() => {
        const meta: Record<string, any> = data?.mgmt?.store_meta || {};
        const stores = data?.mgmt?.stores || {};
        const managersSet = new Set<string>();
        Object.values(meta).forEach((m: any) => { if (m?.manager) managersSet.add(String(m.manager)); });
        const managersList = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
        const storeList = Object.keys(stores)
            .filter(sid => {
                const m = meta[sid];
                if (user?.role === 'BranchManager' && sid !== user?.storeId) return false;
                if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
                return true;
            })
            .map(sid => ({ id: sid, name: stores[sid] || sid }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        return { managers: managersList, storeOptions: storeList };
    }, [data?.mgmt, effectiveManager]);

    // Calculate Date Range for selected month (use local date to avoid UTC timezone shift)
    const dateRange = React.useMemo(() => {
        const pad = (n: number) => String(n).padStart(2, '0');
        if (selectedYear === 2026 && selectedMonth === 3) {
            if (marchPhase === '1') {
                return { start: '2026-03-01', end: '2026-03-19' };
            }
            return { start: '2026-03-20', end: '2026-03-31' };
        }
        const startStr = `${selectedYear}-${pad(selectedMonth)}-01`;
        const endDate = new Date(selectedYear, selectedMonth, 0); // last day of month
        const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
        return { start: startStr, end: endStr };
    }, [selectedYear, selectedMonth, marchPhase]);

    const commissionData = useCommissions(data?.mgmt, data?.emp, dateRange);

    // Filter commission data by manager and store
    const filteredCommissionData = useMemo(() => {
        const meta: Record<string, any> = data?.mgmt?.store_meta || {};
        const stores = data?.mgmt?.stores || {};
        return commissionData.filter(store => {
            // Find store ID by name
            const sid = Object.keys(stores).find(k => stores[k] === store.storeName) || '';
            const m = meta[sid];
            if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
            if (storeFilter !== 'all' && sid !== storeFilter) return false;
            return true;
        });
    }, [commissionData, effectiveManager, storeFilter, data?.mgmt]);

    const handleOpenSim = (name: string, storeRate: number, target: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setSimEmployee({ name, storeRate, target });
        setSimModalOpen(true);
    };

    if (loading) return <DashboardSkeleton />;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <SimulationModal
                isOpen={simModalOpen}
                onClose={() => setSimModalOpen(false)}
                employeeName={simEmployee?.name || ''}
                storeRate={simEmployee?.storeRate || 0}
                target={simEmployee?.target || 0}
            />

            {/* Header & Filters */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                            تقرير العمولات
                        </h1>
                        <p className="text-neutral-500 text-sm mt-1">حساب العمولات بناءً على تحقيق الهدف للفرع والموظف</p>
                    </div>

                    <div className="flex items-center gap-2 bg-neutral-50 p-2 rounded-xl border border-neutral-200">
                        <CalendarIcon />
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="bg-transparent font-bold text-neutral-700 outline-none"
                        >
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <span className="text-neutral-300">|</span>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            className="bg-transparent font-bold text-neutral-700 outline-none"
                        >
                            {['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'].map((m, i) => (
                                <option key={i} value={i + 1}>{m}</option>
                            ))}
                        </select>
                    </div>
                    {selectedYear === 2026 && selectedMonth === 3 && (
                        <div className="flex items-center gap-2 bg-orange-50/80 p-2 rounded-xl border border-orange-200">
                            <span className="text-xs font-semibold text-orange-800 whitespace-nowrap">فترة آذار</span>
                            <select
                                value={marchPhase}
                                onChange={(e) => setMarchPhase(e.target.value as '1' | '2')}
                                className="bg-white font-bold text-neutral-800 outline-none rounded-lg border border-orange-200 px-2 py-1 text-sm min-w-[200px]"
                            >
                                <option value="1">الفترة الأولى (1–19 آذار)</option>
                                <option value="2">الفترة الثانية (20–31 آذار)</option>
                            </select>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {isAdminOrAuditor(user?.role) && (
                        <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</label>
                            <select className="input w-full" value={manager} onChange={(e) => setManager(e.target.value)}>
                                <option value="all">الكل</option>
                                {managers.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    )}
                    <div className={`${user?.role === 'BranchManager' ? 'pointer-events-none opacity-60' : ''}`}>
                        <label className="block text-xs font-semibold text-neutral-500 mb-1">المعرض</label>
                        <select className="input w-full" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
                            <option value="all">كافة المعارض</option>
                            {storeOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Commission Cards */}
            <div className="grid gap-4">
                {filteredCommissionData.length === 0 ? (
                    <div className="text-center p-12 text-neutral-400 bg-white rounded-2xl border border-dashed border-neutral-300">
                        لا توجد بيانات لهذه الفترة
                    </div>
                ) : (
                    filteredCommissionData.map((store) => (
                        <div key={store.storeName} className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-x-auto overflow-y-hidden transition-all hover:shadow-md">
                            <div
                                className="p-4 flex flex-col md:flex-row items-center justify-between cursor-pointer hover:bg-neutral-50"
                                onClick={() => setExpandedStore(expandedStore === store.storeName ? null : store.storeName)}
                            >
                                <div className="flex items-center gap-4 w-full md:w-auto">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-lg ${store.achievement >= 100 ? 'bg-gradient-to-br from-green-500 to-green-600' :
                                        store.achievement >= 90 ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                                            store.achievement >= 80 ? 'bg-gradient-to-br from-orange-400 to-orange-500' :
                                                'bg-gradient-to-br from-red-500 to-red-600'
                                        }`}>
                                        {Math.round(store.achievement)}%
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2 sm:gap-4">
                                            <h3 className="font-bold text-lg text-neutral-900">{store.storeName}</h3>
                                            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1 border border-neutral-200/80">
                                                    <span className="text-neutral-500">المبيعات</span>
                                                    <span className="font-mono font-bold text-neutral-900 tabular-nums">
                                                        {Math.round(store.storeSales).toLocaleString()} <span className="text-[10px] font-normal text-neutral-500">SAR</span>
                                                    </span>
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 border border-blue-100">
                                                    <span className="text-blue-700/80">التارجت</span>
                                                    <span className="font-mono font-bold text-blue-900 tabular-nums">
                                                        {Math.round(store.storeTarget).toLocaleString()} <span className="text-[10px] font-normal text-blue-600/70">SAR</span>
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm mt-1">
                                            <span className="text-neutral-500">نسبة الفرع:</span>
                                            <span className={`font-bold px-2 py-0.5 rounded text-xs ${store.commissionRate > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                {store.commissionRate}%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 mt-3 md:mt-0 w-full md:w-auto justify-between md:justify-end">
                                    <div className="text-center">
                                        <div className="text-xs text-neutral-400">إجمالي العمولة</div>
                                        <div className="font-bold text-green-600">
                                            {Math.round(store.employees.reduce((sum, e) => sum + e.commissionAmount, 0)).toLocaleString()} SAR
                                        </div>
                                    </div>
                                    {expandedStore === store.storeName ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                </div>
                            </div>

                            {/* Employee Table */}
                            {expandedStore === store.storeName && (
                                <div className="border-t border-neutral-100 bg-neutral-50/50 p-4 animate-in slide-in-from-top-2">
                                    <div className="overflow-x-auto -mx-4 px-4">
                                        <table className="w-full min-w-[600px] text-sm">
                                            <thead>
                                                <tr className="text-neutral-500 border-b border-neutral-200">
                                                    <th className="font-normal p-2 text-right">الموظف</th>
                                                    <th className="font-normal p-2 text-right">المبيعات</th>
                                                    <th className="font-normal p-2 text-right">الهدف</th>
                                                    <th className="font-normal p-2 text-center">تحقيق</th>
                                                    <th className="font-normal p-2 text-center">نسبة</th>
                                                    <th className="font-normal p-2 text-left">العمولة</th>
                                                    <th className="font-normal p-2 text-center">محاكاة</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {store.employees.map((emp) => (
                                                    <tr key={emp.id} className="border-b border-neutral-100 last:border-0 hover:bg-white transition-colors">
                                                        <td className="p-3 font-semibold text-neutral-700 flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs text-neutral-600">
                                                                {emp.name.charAt(0)}
                                                            </div>
                                                            {emp.name}
                                                        </td>
                                                        <td className="p-3 font-mono text-neutral-600">{Math.round(emp.totalSales).toLocaleString()}</td>
                                                        <td className="p-3 text-neutral-400">{Math.round(emp.target).toLocaleString()}</td>
                                                        <td className="p-3 text-center">
                                                            <span className={`px-2 py-1 rounded text-xs font-bold ${emp.achievement >= 100 ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-600'
                                                                }`}>
                                                                {emp.achievement.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-center text-blue-600 font-bold">{emp.commissionRate.toFixed(2)}%</td>
                                                        <td className="p-3 text-left font-bold text-green-600">
                                                            {Math.round(emp.commissionAmount).toLocaleString()} SAR
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <button
                                                                onClick={(e) => handleOpenSim(emp.name, store.commissionRate, emp.target, e)}
                                                                className="p-2 hover:bg-orange-50 text-orange-600 rounded-lg transition-colors"
                                                                title="محاكاة العمولة"
                                                            >
                                                                <CalculatorIcon />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
