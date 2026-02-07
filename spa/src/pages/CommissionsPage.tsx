import React, { useState, useEffect } from 'react';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';
import { useCommissions, getStoreCommissionRate } from '../hooks/useCommissions';
import { CommissionData } from '../types';
import { CalendarIcon, ChevronDownIcon, ChevronUpIcon, UserGroupIcon, CalculatorIcon, XIcon } from '../components/Icons';
import { DashboardSkeleton } from '../components/SkeletonComponents';

// Simulation Modal Component
const SimulationModal = ({ isOpen, onClose, employeeName, storeRate }: { isOpen: boolean; onClose: () => void; employeeName: string; storeRate: number }) => {
    const [sales, setSales] = useState<number>(0);
    const [achievement, setAchievement] = useState<number>(0);

    if (!isOpen) return null;

    const finalRate = storeRate * (Math.min(achievement, 1000) / 100);
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
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">المبيعات المتوقعة (SAR)</label>
                        <input
                            type="number"
                            value={sales}
                            onChange={(e) => setSales(Number(e.target.value))}
                            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                            placeholder="0"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">نسبة التحقيق المتوقعة (%)</label>
                        <input
                            type="number"
                            value={achievement}
                            onChange={(e) => setAchievement(Number(e.target.value))}
                            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                            placeholder="0"
                        />
                    </div>

                    <div className="bg-neutral-50 p-4 rounded-xl space-y-2 mt-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">نسبة الفرع الحالية:</span>
                            <span className="font-bold">{storeRate}%</span>
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
                </div>

                <button
                    onClick={onClose}
                    className="w-full mt-6 bg-neutral-900 text-white py-3 rounded-xl font-bold hover:bg-neutral-800 transition-colors"
                >
                    إغلاق
                </button>
            </div>
        </div>
    );
};

export default function CommissionsPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ mgmt: any; emp: any } | null>(null);
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
    const [expandedStore, setExpandedStore] = useState<string | null>(null);

    // Simulation State
    const [simModalOpen, setSimModalOpen] = useState(false);
    const [simEmployee, setSimEmployee] = useState<{ name: string; storeRate: number } | null>(null);

    useEffect(() => {
        Promise.all([loadManagementData(), loadEmployeesData()])
            .then(([mgmt, emp]) => {
                setData({ mgmt, emp });
            })
            .finally(() => setLoading(false));
    }, []);

    // Calculate Date Range for selected month
    const dateRange = React.useMemo(() => {
        const start = new Date(selectedYear, selectedMonth - 1, 1);
        const end = new Date(selectedYear, selectedMonth, 0);
        // Format YYYY-MM-DD
        const fmt = (d: Date) => d.toISOString().split('T')[0];
        return { start: fmt(start), end: fmt(end) };
    }, [selectedYear, selectedMonth]);

    const commissionData = useCommissions(data?.mgmt, data?.emp, dateRange);

    const handleOpenSim = (name: string, storeRate: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setSimEmployee({ name, storeRate });
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
            />

            {/* Header & Filter */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                        <span className="text-2xl">💰</span>
                        تقرير العمولات (Commissions)
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
            </div>

            {/* Commission Cards */}
            <div className="grid gap-4">
                {commissionData.length === 0 ? (
                    <div className="text-center p-12 text-neutral-400 bg-white rounded-2xl border border-dashed border-neutral-300">
                        لا توجد بيانات لهذه الفترة
                    </div>
                ) : (
                    commissionData.map((store) => (
                        <div key={store.storeName} className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden transition-all hover:shadow-md">
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
                                    <div>
                                        <h3 className="font-bold text-lg text-neutral-900">{store.storeName}</h3>
                                        <div className="flex items-center gap-2 text-sm">
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
                                    <table className="w-full text-sm">
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
                                                            onClick={(e) => handleOpenSim(emp.name, store.commissionRate, e)}
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
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
