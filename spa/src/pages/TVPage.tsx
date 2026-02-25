import { useState, useEffect, useMemo } from 'react';
import { loadManagementData, loadEmployeesData } from '../services/upstreamData';
import { BranchesMap } from '../components/dashboard/BranchesMap';
import { getStoreLocation } from '../utils/coordinates';
import { UsersIcon, CurrencyDollarIcon, LightningBoltIcon, UserGroupIcon, OfficeBuildingIcon, TrendingUpIcon } from '../components/Icons';

export default function TVPage() {
    const [raw, setRaw] = useState<any>(null);
    const [empRaw, setEmpRaw] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [slide, setSlide] = useState(0);

    useEffect(() => {
        Promise.all([
            loadManagementData(),
            loadEmployeesData()
        ]).then(([m, e]) => {
            setRaw(m);
            setEmpRaw(e);
        }).catch(err => console.error("TV Load Err:", err))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const iv = setInterval(() => setSlide(s => (s + 1) % 3), 15000);
        return () => clearInterval(iv);
    }, []);

    const stats = useMemo(() => {
        if (!raw) return null;
        let sales = 0, trans = 0, visitors = 0, target = 0;
        const byStore: any = {};

        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const prefix = `${d.getFullYear()}-${m}`;

        raw.sales?.forEach((row: any) => {
            if (String(row[0]).startsWith(prefix)) {
                sales += row[2];
                trans += (row[3] || 1);
                byStore[row[1]] = (byStore[row[1]] || 0) + row[2];
            }
        });
        raw.targets?.forEach((row: any) => {
            if (String(row[0]).startsWith(prefix)) target += row[2];
        });
        raw.visitors?.forEach((row: any) => {
            if (String(row[0]).startsWith(prefix)) visitors += row[2];
        });

        const totalStores = Object.keys(raw.stores || {}).length || 1;
        const topStores = Object.entries(byStore)
            .sort((a: any, b: any) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, s]: any) => ({
                id,
                name: raw.stores?.[id] || id,
                sales: s,
                achievement: target ? (s / (target / totalStores)) * 100 : 0
            }));

        const topEmployees = (empRaw?.employees || [])
            .sort((a: any, b: any) => b.sales - a.sales)
            .slice(0, 5);

        const mapData = topStores.map((store: any) => {
            const city = raw.store_meta?.[store.id]?.city || 'الرياض';
            const [lat, lng] = getStoreLocation(store.id, city);
            return {
                id: store.id,
                name: store.name,
                city,
                lat,
                lng,
                sales: store.sales,
                trans: 0,
                visitors: 0,
                target: target / totalStores,
                achievement: store.achievement,
                avg_inv: trans > 0 ? (sales / trans) : 0,
                growth: 0
            };
        });

        return { sales, target, visitors, trans, topStores, topEmployees, mapData };
    }, [raw, empRaw]);

    if (loading) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white text-3xl font-black">جاري التحميل...</div>;

    const achieve = stats?.target ? (stats.sales / stats.target) * 100 : 0;
    const formatK = (v: number) => Math.round(v).toLocaleString();

    const slideTitle = [
        "نبض الأداء المباشر - الشهر الحالي",
        "لوحة الصدارة والتميز",
        "الذكاء الجغرافي للفروع"
    ][slide];

    const slides = [
        // Slide 1: Pulse Dash
        <div key="slide-1" className="flex flex-col h-full bg-slate-950 p-12 overflow-hidden">
            <div className="grid grid-cols-3 gap-12 flex-1 items-center">
                <div className="col-span-1 flex flex-col items-center justify-center p-12 bg-white/[0.03] backdrop-blur-xl rounded-[60px] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] h-full relative group">
                    <div className="absolute -top-6 bg-orange-500 text-white px-8 py-2 rounded-2xl font-black text-xl shadow-lg shadow-orange-500/20">الإنجاز الكلي</div>
                    <div className="relative w-80 h-80 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90 filter drop-shadow-[0_0_15px_rgba(249,115,22,0.3)] text-orange-500">
                            <circle cx="160" cy="160" r="140" stroke="currentColor" strokeWidth="24" fill="transparent" className="text-slate-900" />
                            <circle cx="160" cy="160" r="140" stroke="currentColor" strokeWidth="24" fill="transparent" className="text-orange-500"
                                strokeDasharray={880} strokeDashoffset={880 - (880 * Math.min(1, achieve / 100))} strokeLinecap="round" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="text-[100px] font-black text-white leading-none">{achieve.toFixed(1)}%</div>
                        </div>
                    </div>
                    <div className="mt-12 text-center">
                        <div className="text-2xl text-slate-400 font-bold mb-2">المتبقي للمستهدف</div>
                        <div className="text-4xl text-white font-black font-mono" dir="ltr">SAR {formatK(Math.max(0, (stats?.target || 0) - (stats?.sales || 0)))}</div>
                    </div>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-8 h-full">
                    {[
                        { label: 'إجمالي المبيعات', val: formatK(stats?.sales || 0), sub: 'SAR', icon: <CurrencyDollarIcon className="w-full h-full" />, color: 'emerald' },
                        { label: 'المستهدف الشهري', val: formatK(stats?.target || 0), sub: 'SAR', icon: <OfficeBuildingIcon className="w-full h-full" />, color: 'amber' },
                        { label: 'إجمالي الزوار', val: formatK(stats?.visitors || 0), sub: 'زائر', icon: <UsersIcon className="w-full h-full" />, color: 'blue' },
                        { label: 'متوسط الفاتورة', val: formatK(stats?.sales && stats?.trans ? stats.sales / stats.trans : 0), sub: 'SAR', icon: <TrendingUpIcon className="w-full h-full" />, color: 'purple' }
                    ].map((k, i) => (
                        <div key={i} className="bg-white/[0.03] backdrop-blur-md p-10 rounded-[40px] border border-white/5 flex flex-col justify-between hover:bg-white/[0.05] transition-all">
                            <div className={`w-20 h-20 rounded-2xl bg-${k.color}-500/20 text-${k.color}-400 p-5 flex items-center justify-center text-4xl mb-6 shadow-lg shadow-${k.color}-500/10`}>
                                {k.icon}
                            </div>
                            <div>
                                <div className="text-2xl text-slate-400 font-bold mb-2">{k.label}</div>
                                <div className="text-6xl text-white font-black font-mono flex items-baseline gap-3" dir="ltr">
                                    {k.val} <span className="text-xl text-slate-500 font-bold">{k.sub}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>,

        // Slide 2: Leaderboard
        <div key="slide-2" className="flex flex-col h-full bg-slate-950 p-12">
            <div className="grid grid-cols-2 gap-12 flex-1">
                <div className="bg-white/[0.02] rounded-[40px] border border-white/10 p-10 flex flex-col">
                    <h2 className="text-4xl font-black text-white mb-10 flex items-center gap-4">
                        <OfficeBuildingIcon className="w-12 h-12 text-orange-500" /> عمالقة الفروع
                    </h2>
                    <div className="flex-1 space-y-4">
                        {stats?.topStores.slice(0, 5).map((s: any, i: number) => (
                            <div key={s.id} className="group bg-white/[0.03] p-6 rounded-3xl flex items-center justify-between border-r-8 border-orange-500 hover:bg-white/[0.06] transition-all">
                                <div className="flex items-center gap-6">
                                    <div className={`w-14 h-14 rounded-2xl ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-slate-300 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-white'} flex items-center justify-center text-2xl font-black shadow-lg shadow-black/20`}>{i + 1}</div>
                                    <div>
                                        <div className="text-2xl text-white font-black">{s.name}</div>
                                        <div className="text-lg text-emerald-400 font-bold">{s.achievement.toFixed(1)}% تحقيق</div>
                                    </div>
                                </div>
                                <div className="text-4xl font-black text-white font-mono" dir="ltr">{formatK(s.sales)}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white/[0.02] rounded-[40px] border border-white/10 p-10 flex flex-col">
                    <h2 className="text-4xl font-black text-white mb-10 flex items-center gap-4">
                        <UserGroupIcon className="w-12 h-12 text-blue-500" /> نجوم المبيعات
                    </h2>
                    <div className="flex-1 space-y-4">
                        {stats?.topEmployees?.length ? stats.topEmployees.map((e: any, i: number) => (
                            <div key={i} className="bg-white/[0.03] p-6 rounded-3xl flex items-center justify-between border-r-8 border-blue-500 hover:bg-white/[0.06] transition-all">
                                <div className="flex items-center gap-6">
                                    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-xl font-bold text-blue-400 border-2 border-blue-500/20 shadow-lg">{(e.name?.[0] || 'E').toUpperCase()}</div>
                                    <div>
                                        <div className="text-2xl text-white font-black">{e.name}</div>
                                        <div className="text-sm text-slate-400">#{e.id}</div>
                                    </div>
                                </div>
                                <div className="text-4xl font-black text-blue-400 font-mono" dir="ltr">{formatK(e.sales)}</div>
                            </div>
                        )) : <div className="h-full flex items-center justify-center text-slate-600 font-bold text-2xl">لا تتوفر بيانات موظفين حالياً</div>}
                    </div>
                </div>
            </div>
        </div>,

        // Slide 3: Live Map
        <div key="slide-3" className="flex flex-col h-full bg-slate-950 p-12">
            <div className="flex-1 rounded-[50px] overflow-hidden border-8 border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.8)] relative z-10">
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none z-20" />
                {stats && <BranchesMap branches={stats.mapData} formatSAR={v => `SAR ${v.toLocaleString()}`} />}
            </div>
        </div>
    ];

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-950 text-right dir-rtl animate-in fade-in duration-1000 relative">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />

            <div className="absolute top-0 right-0 left-0 p-12 z-50 flex justify-between items-center bg-gradient-to-b from-slate-950 to-transparent">
                <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-3xl bg-orange-600 flex items-center justify-center text-white text-5xl font-black shadow-[0_10px_30px_rgba(249,115,22,0.4)]">O</div>
                    <div className="text-5xl font-black text-white tracking-widest uppercase">Ora <span className="text-orange-500">Dashboard</span></div>
                </div>
                <div className="flex flex-col items-end">
                    <div className="text-5xl font-black text-white mb-2">{slideTitle}</div>
                    <div className="text-2xl text-slate-500 font-bold font-mono text-left" dir="ltr">{new Date().toLocaleDateString('en-GB')} | {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
            </div>

            <div className="h-full pt-44 pb-12">
                {slides[slide]}
            </div>

            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-4 z-50">
                {slides.map((_, i) => (
                    <div key={i} className={`h-4 rounded-full transition-all duration-500 ${slide === i ? 'w-16 bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]' : 'w-4 bg-white/10'}`} />
                ))}
            </div>

            <div className="absolute bottom-0 left-0 h-2 bg-white/5 w-full overflow-hidden z-50">
                <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all ease-linear shadow-[0_0_10px_rgba(249,115,22,0.5)]" style={{ width: '100%', animation: 'fillBar 15s linear infinite' }} key={slide} />
            </div>
            <style>{`
                @keyframes fillBar {
                    from { transform: translateX(100%); width: 100%; }
                    to { transform: translateX(0%); width: 0%; }
                }
                .dir-ltr { direction: ltr; }
            `}</style>
        </div>
    );
}
