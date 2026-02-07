import React from 'react';
import { XIcon } from '../Icons';

interface StoreReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedBranch: string;
    setSelectedBranch: (val: string) => void;
    allowedStoreIds: Set<string>;
    storesMap: Record<string, string>;
    includeAllPages: boolean;
    setIncludeAllPages: (val: boolean) => void;
    onGenerate: () => void;
}

export const StoreReportModal: React.FC<StoreReportModalProps> = ({
    isOpen,
    onClose,
    selectedBranch,
    setSelectedBranch,
    allowedStoreIds,
    storesMap,
    includeAllPages,
    setIncludeAllPages,
    onGenerate,
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-center-screen" onClick={onClose}>
            <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">تصدير التقرير PDF</h3>
                    <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700">
                        <XIcon />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-2">اختر الفرع:</label>
                        <select
                            className="input w-full"
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                        >
                            <option value="all">الكل (ملخص عام)</option>
                            {Array.from(allowedStoreIds).map(sid => (
                                <option key={sid} value={sid}>{storesMap?.[sid] || sid}</option>
                            ))}
                        </select>
                    </div>

                    {selectedBranch === 'all' && (
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="includeAllPages"
                                checked={includeAllPages}
                                onChange={(e) => setIncludeAllPages(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <label htmlFor="includeAllPages" className="text-sm text-neutral-600">
                                إنشاء صفحة تفصيلية لكل فرع (عند اختيار الكل)
                            </label>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="btn-secondary py-2 px-4"
                    >
                        إلغاء
                    </button>
                    <button
                        onClick={onGenerate}
                        className="btn-primary py-2 px-4"
                    >
                        تصدير
                    </button>
                </div>
            </div>
        </div>
    );
};
