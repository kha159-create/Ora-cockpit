import React, { useState } from 'react';
import { toYMD } from '../../utils/dateUtils'; // We'll need to assume or create this, or just copy helper
// Since I can't easily check for utils, I'll copy the helper locally or pass it. 
// Actually toYMD is simple, I'll just redefine it or use native if possible. 
// Better to pass formatted dates or keep simple helpers.

interface LiveSalesModalProps {
    isOpen: boolean;
    onClose: () => void;
    liveData: {
        totals: { sales: number; trans: number };
        stores: Array<{
            sid: string;
            name: string;
            sales: number;
            trans: number;
            visitors: number;
            employees: Array<{
                id: string;
                name: string;
                sales: number;
                trans: number;
                avgInv: number;
            }>;
        }>;
    };
    formatSAR: (val: number) => string;
    isAdminOrAuditor: boolean;
    manager: string;
    setManager: (m: string) => void;
    managers: string[];
}

export const LiveSalesModal: React.FC<LiveSalesModalProps> = ({
    isOpen,
    onClose,
    liveData,
    formatSAR,
    isAdminOrAuditor,
    manager,
    setManager,
    managers,
}) => {
    const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold">🛒 مبيعات اليوم — لايف</h2>
                            <p className="text-orange-100 text-sm mt-1">
                                📅 {new Date().toISOString().slice(0, 10)} • 🕒 {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors"
                            onClick={onClose}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Manager Filter */}
                    {isAdminOrAuditor && (
                        <div className="mt-3 flex items-center gap-2">
                            <span className="text-sm text-orange-100">مدير المنطقة:</span>
                            <select
                                className="bg-white/20 border border-white/30 text-white rounded-lg py-1 px-3 text-sm"
                                value={manager}
                                onChange={(e) => setManager(e.target.value)}
                            >
                                <option value="all" className="text-black">الكل</option>
                                {managers.map((m) => (
                                    <option key={m} value={m} className="text-black">{m}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* KPIs Summary */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 border-b">
                    <div className="bg-white rounded-xl p-4 border shadow-sm">
                        <div className="text-sm text-gray-500">إجمالي المبيعات</div>
                        <div className="text-2xl font-bold text-orange-600" dir="ltr">{formatSAR(liveData.totals.sales)}</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border shadow-sm">
                        <div className="text-sm text-gray-500">عدد الفواتير</div>
                        <div className="text-2xl font-bold text-blue-600">{liveData.totals.trans}</div>
                        <div className="text-xs text-gray-400">متوسط: {formatSAR(liveData.totals.trans > 0 ? liveData.totals.sales / liveData.totals.trans : 0)}</div>
                    </div>
                </div>

                {/* Store List */}
                <div className="flex-1 overflow-y-auto p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">المعارض ({liveData.stores.length})</h3>

                    {liveData.stores.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <div className="text-4xl mb-2">📊</div>
                            <div>لا توجد بيانات مبيعات لهذا اليوم</div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {liveData.stores.map((store, idx) => {
                                const isExpanded = expandedStoreId === store.sid;
                                const storeName = store.name || store.sid;
                                return (
                                    <div key={store.sid} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                                        {/* Store Row */}
                                        <div
                                            className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-orange-50 transition-colors border-b border-gray-100"
                                            onClick={() => setExpandedStoreId(isExpanded ? null : store.sid)}
                                        >
                                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-500 text-white rounded-lg flex items-center justify-center font-bold text-sm sm:text-base flex-shrink-0">
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="font-bold text-gray-900 text-base sm:text-lg truncate">{storeName}</div>
                                                    <div className="font-bold text-orange-600 text-base sm:text-xl flex-shrink-0" dir="ltr">{formatSAR(store.sales)}</div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
                                                    <span className="flex items-center gap-1">
                                                        <span>👥</span>
                                                        <span className="font-medium">{store.employees?.length || 0} موظفين</span>
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span>🧾</span>
                                                        <span className="font-medium">{store.trans || 0} فاتورة</span>
                                                    </span>
                                                    {store.trans > 0 && (
                                                        <span className="flex items-center gap-1 text-orange-600">
                                                            <span className="font-semibold">معدل:</span>
                                                            <span className="font-bold" dir="ltr">{formatSAR(store.sales / store.trans)}</span>
                                                        </span>
                                                    )}
                                                    {store.visitors > 0 && (
                                                        <>
                                                            <span className="flex items-center gap-1 text-blue-600">
                                                                <span>👣</span>
                                                                <span className="font-medium">{store.visitors.toLocaleString()} زائر</span>
                                                            </span>
                                                            <span className="flex items-center gap-1 text-green-600">
                                                                <span className="font-semibold">تحويل:</span>
                                                                <span className="font-bold" dir="ltr">{((store.trans / store.visitors) * 100).toFixed(1)}%</span>
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className={`text-gray-400 transition-transform text-xl ${isExpanded ? 'rotate-90' : ''} flex-shrink-0`}>▶</div>
                                        </div>

                                        {/* Employees Dropdown */}
                                        {isExpanded && store.employees && store.employees.length > 0 && (
                                            <div className="bg-gray-50 p-3 sm:p-4 overflow-x-auto">
                                                <table className="w-full text-xs sm:text-sm">
                                                    <thead>
                                                        <tr className="bg-white border-b-2 border-gray-200">
                                                            <th className="text-right py-2 px-2 font-bold text-gray-700">#</th>
                                                            <th className="text-right py-2 px-2 font-bold text-gray-700">الموظف</th>
                                                            <th className="text-left py-2 px-2 font-bold text-gray-700">المبيعات</th>
                                                            <th className="text-left py-2 px-2 font-bold text-gray-700">الفواتير</th>
                                                            <th className="text-left py-2 px-2 font-bold text-gray-700">معدل</th>
                                                            <th className="text-left py-2 px-2 font-bold text-gray-700">%</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {store.employees.sort((a, b) => b.sales - a.sales).map((emp, empIdx) => {
                                                            const avgInv = emp.avgInv || (emp.trans > 0 ? emp.sales / emp.trans : 0);
                                                            return (
                                                                <tr key={emp.id} className={`border-b border-gray-100 hover:bg-white transition-colors ${empIdx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                                                                    <td className="py-2 px-2 text-gray-500 font-medium text-center">{empIdx + 1}</td>
                                                                    <td className="py-2 px-2 font-semibold text-gray-900">{emp.name || emp.id}</td>
                                                                    <td className="py-2 px-2 font-bold text-orange-600" dir="ltr">{formatSAR(emp.sales)}</td>
                                                                    <td className="py-2 px-2 text-gray-700 font-medium">{emp.trans}</td>
                                                                    <td className="py-2 px-2 font-bold text-blue-600" dir="ltr">{formatSAR(avgInv)}</td>
                                                                    <td className="py-2 px-2">
                                                                        <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-md text-xs font-bold">
                                                                            {store.sales > 0 ? ((emp.sales / store.sales) * 100).toFixed(0) : 0}%
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div >
            </div >
        </div >
    );
};
