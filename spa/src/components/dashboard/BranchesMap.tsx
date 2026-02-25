import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet marker icons in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// A custom SVG marker icon generator that colors the pin based on status
const createCustomIcon = (status: 'excellent' | 'good' | 'poor') => {
    let color = '#f97316'; // orange default (good)
    if (status === 'excellent') color = '#10b981'; // green
    if (status === 'poor') color = '#ef4444'; // red

    const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="feather feather-map-pin">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3" fill="white"></circle>
    </svg>`;

    return L.divIcon({
        className: 'custom-leaflet-icon',
        html: `<div style="width: 30px; height: 30px; drop-shadow(0 4px 6px rgba(0,0,0,0.1));">${svgIcon}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30],
    });
};

interface BranchMapData {
    id: string;
    name: string;
    city: string;
    lat: number;
    lng: number;
    sales: number;
    trans: number;
    visitors: number;
    target: number;
    achievement: number;
    avg_inv: number;
    growth: number;
}

interface BranchesMapProps {
    branches: BranchMapData[];
    formatSAR: (val: number) => string;
}

// Map center of Saudi Arabia roughly
const KSA_CENTER: [number, number] = [23.8859, 45.0792];
const KSA_ZOOM = 5;

// Component to handle auto-fitting bounds if needed
const MapController = ({ branches }: { branches: BranchMapData[] }) => {
    const map = useMap();

    React.useEffect(() => {
        if (branches.length > 0) {
            const bounds = L.latLngBounds(branches.map(b => [b.lat, b.lng]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        } else {
            map.setView(KSA_CENTER, KSA_ZOOM);
        }
    }, [branches, map]);

    return null;
};

const KpiBox = ({ label, val, cls }: { label: string, val: string | number, cls: string }) => (
    <div className="bg-slate-50/80 border border-slate-100/80 p-1.5 rounded-lg text-center shadow-sm">
        <div className="text-[9px] text-slate-500 mb-0.5 font-bold">{label}</div>
        <div className={`font-bold text-xs tabular-nums ${cls}`} dir="ltr">{val}</div>
    </div>
);

const generateAIInsight = (branch: BranchMapData, allBranches: BranchMapData[], formatSAR: (v: number) => string): React.ReactNode => {
    const peers = allBranches.filter(b => b.city === branch.city && b.id !== branch.id);
    const conversion = branch.visitors > 0 ? (branch.trans / branch.visitors) * 100 : 0;

    let peerConvAvg = 0, peerAchieveAvg = 0;
    if (peers.length > 0) {
        let totalPVis = 0, totalPTrans = 0, totalPAch = 0;
        peers.forEach(p => { totalPVis += p.visitors; totalPTrans += p.trans; totalPAch += p.achievement; });
        peerConvAvg = totalPVis > 0 ? (totalPTrans / totalPVis) * 100 : 0;
        peerAchieveAvg = totalPAch / peers.length;
    }

    const tMiss = branch.target - branch.sales;
    let text = `🎯 المطلوب لليوم: ${formatSAR(branch.target)}.\n`;

    if (branch.achievement > 100) text += `✨ أداء مبهر! تجاوزت الهدف بقيمة ${formatSAR(-tMiss)}. `;
    else if (branch.achievement >= 80) text += `👍 أداء جيد، استمر لتعويض ${formatSAR(tMiss)}. `;
    else text += `⚠️ متأخر عن الهدف المُتوقع لليوم بـ ${formatSAR(tMiss)}. `;

    if (peers.length > 0) {
        text += branch.achievement > peerAchieveAvg
            ? `أداؤك يتفوق على متوسط ${branch.city} (${peerAchieveAvg.toFixed(1)}%). `
            : `الفروع المشابهة بـ ${branch.city} تتفوق بتحقيق (${peerAchieveAvg.toFixed(1)}%). `;

        if (conversion < peerConvAvg && branch.visitors > 0) text += `\n🚨 نسبة التحويل لديك (${conversion.toFixed(1)}%) أقل من متوسط المدينة (${peerConvAvg.toFixed(1)}%)، ركز على اقناع الزوار.`;
        else if (conversion > peerConvAvg) text += `\n🌟 استغلال ممتاز ومقنع للزوار بنسبة (${conversion.toFixed(1)}%).`;
    }

    return (
        <div className="flex flex-col gap-1 text-[11px] font-medium text-indigo-950/80 leading-relaxed font-sans pt-1">
            {text.split('\n').map((ln, i) => <span key={i}>{ln}</span>)}
        </div>
    );
};

export const BranchesMap: React.FC<BranchesMapProps> = ({ branches, formatSAR }) => {

    return (
        <div className="w-full h-full min-h-[400px] relative rounded-2xl overflow-hidden border border-neutral-200 shadow-sm z-0">
            <MapContainer
                center={KSA_CENTER}
                zoom={KSA_ZOOM}
                scrollWheelZoom={false}
                className="w-full h-full min-h-[400px]"
                style={{ height: '100%', minHeight: '400px', width: '100%' }}
                attributionControl={false}
            >
                {/* Clean, fast, modern map tiles */}
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={19}
                />

                <MapController branches={branches} />

                <MarkerClusterGroup
                    chunkedLoading
                    maxClusterRadius={40}
                // Custome spiderfy options can be added here if needed to spread overlapping pins
                >
                    {branches.map(branch => {
                        const status = (branch.achievement || 0) >= 100 ? 'excellent' : (branch.achievement || 0) >= 80 ? 'good' : 'poor';
                        const icon = createCustomIcon(status);

                        return (
                            <Marker
                                key={branch.id}
                                position={[branch.lat, branch.lng]}
                                icon={icon}
                            >
                                <Popup className="branch-popup min-w-[340px]">
                                    <div className="text-right p-1" dir="rtl">
                                        <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-3">
                                            <div className="flex gap-2">
                                                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 font-black flex items-center justify-center border border-orange-100">{branch.id}</div>
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-[13px] leading-tight max-w-[130px] truncate" title={branch.name}>{branch.name}</h3>
                                                    <span className="text-[10px] text-slate-500 font-semibold">📍 {branch.city} | المركز: {[...branches].sort((a, b) => b.achievement - a.achievement).findIndex(b => b.id === branch.id) + 1}</span>
                                                </div>
                                            </div>
                                            <div className="bg-slate-50 px-2 py-1.5 rounded-lg text-center border border-slate-100 shadow-sm">
                                                <div className="text-[9px] text-slate-500 font-bold mb-0.5">التحقيق</div>
                                                <div className={`font-black text-[13px] dir-ltr flex items-center gap-1 ${status === 'excellent' ? 'text-emerald-600' : status === 'poor' ? 'text-red-500' : 'text-orange-500'}`}>
                                                    {status === 'excellent' && '✨'} {(branch.achievement || 0).toFixed(1)}%
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 mb-3">
                                            <KpiBox label="المبيعات" val={formatSAR(branch.sales)} cls="text-emerald-600" />
                                            <KpiBox label="الزوار" val={branch.visitors} cls="text-blue-600" />
                                            <KpiBox label="التحويل" val={(branch.visitors > 0 ? (branch.trans / branch.visitors) * 100 : 0).toFixed(1) + '%'} cls="text-purple-600" />
                                            <KpiBox label="م. الفاتورة" val={formatSAR(branch.avg_inv)} cls="text-amber-600" />
                                            <KpiBox label="النمو" val={(branch.growth > 0 ? '+' : '') + branch.growth.toFixed(1) + '%'} cls={branch.growth > 0 ? 'text-emerald-600' : branch.growth < 0 ? 'text-red-500' : 'text-slate-600'} />
                                        </div>

                                        <div className="bg-gradient-to-br from-indigo-50 to-blue-50/30 p-2.5 rounded-xl border border-indigo-100/50 shadow-inner">
                                            <div className="text-[11px] font-black text-indigo-800 mb-1 flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div> المحرك الذكي:
                                            </div>
                                            {generateAIInsight(branch, branches, formatSAR)}
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MarkerClusterGroup>
            </MapContainer>

            {/* Map Legends Overlay */}
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-md p-2 rounded-xl shadow-lg border border-slate-100 flex flex-col gap-1.5 text-[10px] font-bold text-slate-600 pointer-events-none">
                <div className="flex items-center gap-2 justify-end"><span>أداء ممتاز (+100%)</span><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm" /></div>
                <div className="flex items-center gap-2 justify-end"><span>أداء جيد (+80%)</span><div className="w-3 h-3 rounded-full bg-orange-500 shadow-sm" /></div>
                <div className="flex items-center gap-2 justify-end"><span>أداء ضعيف</span><div className="w-3 h-3 rounded-full bg-red-500 shadow-sm" /></div>
            </div>
        </div>
    );
};
