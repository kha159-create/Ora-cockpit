import React from 'react';
import { Link } from 'react-router-dom';
import { FireIcon, TagIcon, UserGroupIcon, OfficeBuildingIcon } from '../Icons';

interface QuickAccessProps {
    onOpenDailyReport: () => void;
}

export const QuickAccess: React.FC<QuickAccessProps> = ({ onOpenDailyReport }) => {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <button
                type="button"
                onClick={onOpenDailyReport}
                className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card text-right w-full"
            >
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><FireIcon /></div>
                <div>
                    <div className="font-bold text-neutral-900">التقرير اليومي</div>
                    <div className="text-xs text-neutral-500">تقرير الأمس</div>
                </div>
            </button>
            <Link to="/offers" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><TagIcon /></div>
                <div>
                    <div className="font-bold text-neutral-900">تحليل العروض</div>
                    <div className="text-xs text-neutral-500">عروض ومبيعات</div>
                </div>
            </Link>
            <Link to="/employees" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><UserGroupIcon /></div>
                <div>
                    <div className="font-bold text-neutral-900">الموظفين</div>
                    <div className="text-xs text-neutral-500">تحليل الأداء</div>
                </div>
            </Link>
            <Link to="/stores" className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 flex items-center gap-3 hover:border-orange-400 hover:shadow-xl transition-all identity-card">
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><OfficeBuildingIcon /></div>
                <div>
                    <div className="font-bold text-neutral-900">المعارض</div>
                    <div className="text-xs text-neutral-500">تفاصيل الفروع</div>
                </div>
            </Link>
        </div>
    );
};
