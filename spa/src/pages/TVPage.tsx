import { useState, useEffect, useMemo } from 'react';
import { loadManagementData } from '../services/upstreamData';
import { BranchesMap } from '../components/dashboard/BranchesMap';
import { getStoreLocation } from '../utils/coordinates';
import { UsersIcon, CurrencyDollarIcon, LightningBoltIcon } from '../components/Icons';

export default function TVPage() {
    const [raw, setRaw] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [slide, setSlide] = useState(0);

    useEffect(() => {
        loadManagementData().then(setRaw).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const iv = setInterval(() => setSlide(s => (s + 1) % 3), 15000);
        return () => clearInterval(iv);
    }, []);

    const stats = useMemo(() => {
        if (!raw) return null;
        let sales = 0, trans = 0, visitors = 0, target = 0;
        const byStore: any = {};

        const d = new Date(); d.setDate(d.getDate() - 1);
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const prefix = `${d.getFullYear()}-${m}`; // current month prefix
        // Just sum all for current month
        raw.sales?.forEach((row: any) => {
            if (String(row[0]).startsWith(prefix)) { sales += row[2]; byStore[row[1]] = (byStore[row[1]] || 0) + row[2]; }
        });
        raw.targets?.forEach((row: any) => {
            if (String(row[0]).startsWith(prefix)) target += row[2];
        });
        raw.visitors?.forEach((row: any) => {
            if (String(row[0]).startsWith(prefix)) visitors += row[2];
        });

        const topStores = Object.entries(byStore)
            .sort((a: any, b: any) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, s]: any) => ({
                id, name: raw.stores?.[id] || id, sales: s, achievement: target ? (s / (target / Object.keys(byStore).length)) * 100 : 0
            }));

        const mapData = topStores.map((store: any) => {
            const city = raw.store_meta?.[store.id]?.city || 'الرياض';
            const [lat, lng] = getStoreLocation(store.id, city);
            return { ...store, city, lat, lng, target: store.achievement };
        });

        return { sales, target, visitors, trans, topStores, mapData };
    }, [raw]);

    if (loading) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white text-3xl font-black">جاري التحميل...</div>;

    const slides = [
        // Slide 1: Main KPIs
        <div key="slide-1" className="flex flex-col h-full bg-slate-900 justify-center p-10 gap-10">
            <h1 className="text-6xl text-center text-white font-black mb-10">أداء الشهر الحالي المباشر</h1>
            <div className="grid grid-cols-2 gap-10">
                <div className="bg-slate-800 p-16 rounded-3xl border border-slate-700 shadow-2xl flex flex-col items-center justify-center text-center transform hover:scale-105 transition-transform">
                    <CurrencyDollarIcon className="w-32 h-32 text-emerald-400 mb-6" />
                    <div className="text-4xl text-slate-400 font-bold mb-4">المبيعات</div>
                    <div className="text-8xl text-white font-black dir-ltr">SAR {Math.round(stats?.sales || 0).toLocaleString()}</div>
                    <div className="text-2xl mt-6 font-bold text-emerald-400">الهدف: SAR {Math.round(stats?.target || 0).toLocaleString()}</div>
                </div>
                <div className="bg-slate-800 p-16 rounded-3xl border border-slate-700 shadow-2xl flex flex-col items-center justify-center text-center transform hover:scale-105 transition-transform">
                    <UsersIcon className="w-32 h-32 text-blue-400 mb-6" />
                    <div className="text-4xl text-slate-400 font-bold mb-4">الزوار</div>
                    <div className="text-8xl text-white font-black dir-ltr">{Math.round(stats?.visitors || 0).toLocaleString()}</div>
                </div>
            </div>
        </div>,

        // Slide 2: Top Stores
        <div key="slide-2" className="flex flex-col h-full bg-slate-900 p-10 justify-center overflow-hidden">
            <h1 className="text-6xl text-center text-white font-black mb-16 flex justify-center items-center gap-6"><LightningBoltIcon className="w-16 h-16 text-yellow-400" /> أفضل الفروع</h1>
            <div className="grid grid-cols-2 gap-8">
                {stats?.topStores.slice(0, 8).map((s: any, i: number) => (
                    <div key={s.id} className="bg-slate-800 p-8 rounded-2xl flex items-center justify-between border-l-8 border-orange-500">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-full bg-slate-700 text-white flex items-center justify-center text-3xl font-bold">{i + 1}</div>
                            <div className="text-4xl text-white font-bold">{s.name}</div>
                        </div>
                        <div className="text-5xl font-black text-orange-400 dir-ltr">SAR {Math.round(s.sales).toLocaleString()}</div>
                    </div>
                ))}
            </div>
        </div>,

        // Slide 3: Map View
        <div key="slide-3" className="flex flex-col h-full bg-slate-900 p-10">
            <h1 className="text-6xl text-center text-white font-black mb-10">توزيع الفروع المباشر (الذكاء الاصطناعي)</h1>
            <div className="flex-1 rounded-3xl overflow-hidden border-4 border-slate-700 shadow-2xl relative z-10">
                {stats && <BranchesMap branches={stats.mapData} formatSAR={v => `SAR ${v.toLocaleString()}`} />}
            </div>
        </div>
    ];

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-900 text-right dir-rtl animate-in fade-in duration-1000 relative">
            {slides[slide]}
            {/* Progress Bar Container */}
            <div className="absolute bottom-0 left-0 h-3 bg-slate-800 w-full overflow-hidden z-50">
                <div className="h-full bg-orange-500 transition-all ease-linear" style={{ width: '100%', animation: 'fillBar 15s linear infinite' }} key={slide} />
            </div>
            <style>{`
            @keyframes fillBar {
                from { transform: translateX(100%); width: 100%; }
                to { transform: translateX(0%); width: 0%; }
            }
        `}</style>
        </div>
    );
}
