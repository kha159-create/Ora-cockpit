import React from 'react';

interface EmployeeReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    empFilterStatus: Set<string>;
    setEmpFilterStatus: (val: Set<string>) => void;
    selectedEmployees: Set<string>;
    setSelectedEmployees: (val: Set<string>) => void;
    employeeList: any[];
    yesterdayStr: string;
    onGenerate: () => void;
    isGenerating?: boolean;
}

export const EmployeeReportModal: React.FC<EmployeeReportModalProps> = ({
    isOpen,
    onClose,
    empFilterStatus,
    setEmpFilterStatus,
    selectedEmployees,
    setSelectedEmployees,
    employeeList,
    yesterdayStr,
    onGenerate,
    isGenerating = false
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">👤</span>
                            <div>
                                <h2 className="text-lg font-bold">اختيار الموظفين (PDF)</h2>
                                <p className="text-orange-100 text-sm">اختر الموظفين للتقرير وازل المستقيلين</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="bg-white/20 hover:bg-white/30 p-2 rounded-lg">✕</button>
                    </div>
                </div>

                {/* Filters */}
                <div className="p-3 sm:p-4 bg-gray-50 border-b">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={empFilterStatus.has('active')}
                                    onChange={(e) => {
                                        const newSet = new Set(empFilterStatus);
                                        e.target.checked ? newSet.add('active') : newSet.delete('active');
                                        setEmpFilterStatus(newSet);
                                    }}
                                    className="w-4 h-4 text-orange-600 rounded"
                                />
                                <span className="text-orange-600 font-medium">✓ موظف نشط</span>
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={empFilterStatus.has('review')}
                                    onChange={(e) => {
                                        const newSet = new Set(empFilterStatus);
                                        e.target.checked ? newSet.add('review') : newSet.delete('review');
                                        setEmpFilterStatus(newSet);
                                    }}
                                    className="w-4 h-4 text-orange-600 rounded"
                                />
                                <span className="text-orange-600 font-medium">□ مراجعة (معيار واحد)</span>
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={empFilterStatus.has('resigned')}
                                    onChange={(e) => {
                                        const newSet = new Set(empFilterStatus);
                                        e.target.checked ? newSet.add('resigned') : newSet.delete('resigned');
                                        setEmpFilterStatus(newSet);
                                    }}
                                    className="w-4 h-4 text-red-600 rounded"
                                />
                                <span className="text-red-600 font-medium">□ مستقيل (معياران)</span>
                            </label>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            المحددين: <strong>{selectedEmployees.size}</strong> من <strong>{employeeList.length}</strong>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                        <button
                            onClick={() => setSelectedEmployees(new Set(employeeList.map(e => e.id)))}
                            className="text-sm bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg hover:bg-orange-200 transition-colors"
                        >
                            ✓ تحديد الكل
                        </button>
                        <button
                            onClick={() => setSelectedEmployees(new Set())}
                            className="text-sm bg-neutral-100 text-neutral-700 px-3 py-1.5 rounded-lg hover:bg-neutral-200 transition-colors"
                        >
                            ✗ إلغاء الكل
                        </button>
                        <button
                            onClick={() => {
                                const activeEmps = employeeList.filter(e => e.sales > 0).map(e => e.id);
                                setSelectedEmployees(new Set(activeEmps));
                            }}
                            className="text-sm bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors"
                        >
                            👤 النشطين فقط
                        </button>
                    </div>
                </div>

                {/* Employee List */}
                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="p-3 text-right w-10">
                                    <input
                                        type="checkbox"
                                        checked={selectedEmployees.size === employeeList.length && employeeList.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedEmployees(new Set(employeeList.map(emp => emp.id)));
                                            } else {
                                                setSelectedEmployees(new Set());
                                            }
                                        }}
                                        className="w-4 h-4"
                                    />
                                </th>
                                <th className="p-3 text-right font-semibold text-gray-700">الموظف</th>
                                <th className="p-3 text-right font-semibold text-gray-700">الفرع</th>
                                <th className="p-3 text-left font-semibold text-gray-700">المبيعات</th>
                                <th className="p-3 text-center font-semibold text-gray-700">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employeeList.map((emp, idx) => (
                                <tr key={emp.id} className={`border-b hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                    <td className="p-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedEmployees.has(emp.id)}
                                            onChange={(e) => {
                                                const newSet = new Set(selectedEmployees);
                                                e.target.checked ? newSet.add(emp.id) : newSet.delete(emp.id);
                                                setSelectedEmployees(newSet);
                                            }}
                                            className="w-4 h-4"
                                        />
                                    </td>
                                    <td className="p-3">
                                        <div className="font-medium text-gray-800">{emp.name}</div>
                                        <div className="text-xs text-gray-400">{emp.id}</div>
                                    </td>
                                    <td className="p-3 text-gray-600 text-xs">{emp.storeName}</td>
                                    <td className="p-3 font-bold text-gray-800" dir="ltr">{Math.round(emp.sales).toLocaleString()}</td>
                                    <td className="p-3 text-center">
                                        <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold">نشط</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {employeeList.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <div className="text-4xl mb-2">👥</div>
                            <div>لا توجد بيانات موظفين للفترة المحددة</div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 sm:p-4 border-t flex justify-end gap-3 bg-gray-50">
                    <div className="text-sm text-gray-500">
                        الفترة: من {yesterdayStr.substring(0, 8)}01 إلى {yesterdayStr}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            إلغاء
                        </button>
                        <button
                            onClick={onGenerate}
                            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-md font-bold flex items-center gap-2"
                            disabled={selectedEmployees.size === 0 || isGenerating}
                        >
                            {isGenerating ? '...جاري إنشاء التقرير' : '📄 إنشاء التقرير'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
