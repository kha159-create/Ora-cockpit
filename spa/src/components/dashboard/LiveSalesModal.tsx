import React, { useState } from 'react';


interface LiveSalesModalProps {
    isOpen: boolean;
    onClose: () => void;
    liveData: {
        totals: { sales: number; trans: number; target: number };
        stores: Array<{
            sid: string;
            name: string;
            sales: number;
            trans: number;
            visitors: number;
            target: number;
            monthSales: number;
            monthTarget: number;
            dailyReq: number;
            remainingDays: number;
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
                            <h2 className="text-xl font-bold">🛒 مبيعات اليوم</h2>
                            <p className="text-orange-100 text-sm mt-1">
                                🕒 تحديث: {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
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
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 border-b">
                    <div className="bg-white rounded-xl p-4 border shadow-sm">
                        <div className="text-xs font-bold text-gray-500 mb-1">إجمالي المبيعات</div>
                        <div className="text-2xl font-black text-orange-600" dir="ltr">{formatSAR(liveData.totals.sales)}</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border shadow-sm">
                        <div className="text-xs font-bold text-gray-500 mb-1">عدد الفواتير</div>
                        <div className="text-2xl font-black text-blue-600">{liveData.totals.trans}</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border shadow-sm">
                        <div className="text-xs font-bold text-gray-500 mb-1">نسبة التحويل</div>
                        <div className="text-2xl font-black text-green-600">
                            {(() => {
                                const v = liveData.stores.reduce((acc, s) => acc + (s.visitors || 0), 0);
                                return v > 0 ? ((liveData.totals.trans / v) * 100).toFixed(1) : '0';
                            })()}%
                        </div>
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
                                            className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100"
                                            onClick={() => setExpandedStoreId(isExpanded ? null : store.sid)}
                                            dir="rtl"
                                        >
                                            <div className={`w-8 h-8 sm:w-10 sm:h-10 text-white rounded-full flex items-center justify-center font-bold text-sm sm:text-base flex-shrink-0 shadow-sm ${idx === 0 ? 'bg-orange-400' : 'bg-gray-400'}`}>
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="font-bold text-gray-800 text-base sm:text-lg truncate">{storeName}</div>
                                                    <div className="flex flex-col items-start px-2">
                                                        <div className="font-black text-orange-600 text-lg sm:text-2xl" dir="ltr">{formatSAR(store.sales)}</div>
                                                        <div className="text-[10px] text-gray-400 font-bold">{store.trans} فاتورة</div>
                                                    </div>
                                                </div>

                                                {/* Daily Required Progress Bar */}
                                                <div className="mt-4 mb-3 space-y-5 px-1">
                                                    <div>
                                                        <div className="flex justify-between items-center text-[11px] mb-1.5 font-bold">
                                                            <div className="flex items-center gap-1.5 text-gray-500">
                                                                <span className="text-base">📝</span>
                                                                <span>المطلوب اليوم ({store.remainingDays} يوم متبقي)</span>
                                                            </div>
                                                            <div className="text-gray-500 font-black" dir="ltr">
                                                                {formatSAR(store.dailyReq)} / {formatSAR(store.sales)}
                                                            </div>
                                                        </div>
                                                        <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden shadow-inner relative">
                                                            <div
                                                                className={`h-full transition-all duration-1000 shadow-sm ${store.sales >= store.dailyReq ? 'bg-green-500' : 'bg-red-500'}`}
                                                                style={{ width: `${Math.min(100, store.dailyReq > 0 ? (store.sales / store.dailyReq) * 100 : 0)}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="flex justify-between items-center text-[11px] mb-1.5 font-bold">
                                                            <div className="flex items-center gap-1.5 text-gray-500">
                                                                <span className="text-base">🎯</span>
                                                                <span>الهدف الشهري</span>
                                                            </div>
                                                            <div className="text-gray-500 font-black" dir="ltr">
                                                                {formatSAR(store.monthTarget)} / {formatSAR(store.monthSales)}
                                                            </div>
                                                        </div>
                                                        <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden shadow-inner relative">
                                                            <div
                                                                className={`h-full transition-all duration-1000 shadow-sm ${store.monthSales >= store.monthTarget ? 'bg-green-600' : 'bg-orange-500'}`}
                                                                style={{ width: `${Math.min(100, store.monthTarget > 0 ? (store.monthSales / store.monthTarget) * 100 : 0)}%` }}
                                                            />
                                                        </div>
                                                        <div className="text-center text-[10px] text-gray-400 mt-2 font-black">
                                                            تحقيق {store.monthTarget > 0 ? ((store.monthSales / store.monthTarget) * 100).toFixed(1) : 0}% من المدى الشهري
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 px-1">
                                                    <span className="flex items-center gap-1">
                                                        <span>👥</span>
                                                        <span className="font-bold">{store.employees?.length || 0} موظفين</span>
                                                    </span>
                                                    {store.trans > 0 && (
                                                        <span className="flex items-center gap-1 font-bold">
                                                            <span>💰</span>
                                                            <span dir="ltr">{formatSAR(store.sales / store.trans)}</span>
                                                        </span>
                                                    )}
                                                    {store.visitors > 0 && (
                                                        <span className="flex items-center gap-1 font-bold">
                                                            <span>👣</span>
                                                            <span dir="ltr">{((store.trans / store.visitors) * 100).toFixed(1)}%</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className={`text-gray-300 transition-transform text-xl ${isExpanded ? 'rotate-90' : ''} flex-shrink-0`}>
                                                {isExpanded ? '▼' : '◀'}
                                            </div>
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
