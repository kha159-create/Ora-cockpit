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
    target: number;
    achievement: number;
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

// Extremely basic AI prompt simulator for demo
const generateAIInsight = (branch: BranchMapData): string => {
    if (branch.achievement > 100) {
        return "✨ أداء ممتاز! مبيعات الفرع تتجاوز الهدف بشكل ملحوظ. يحافظ الفريق على زخم مبيعات عالي.";
    } else if (branch.achievement >= 80) {
        return "👍 أداء جيد. الفرع يسير بخطى ثابتة نحو تحقيق الهدف، يمكن تحسين معدل التحويل لزيادة المبيعات.";
    } else if (branch.achievement > 0) {
        return "⚠️ أداء يحتاج إلى تدخل. نسبة تحقيق الهدف منخفضة ويُنصح بعمل عروض ترويجية محلية لرفع المبيعات.";
    }
    return "لا تتوفر مبيعات كافية لتقييم الفرع حالياً.";
};

export const BranchesMap: React.FC<BranchesMapProps> = ({ branches, formatSAR }) => {

    return (
        <div className="w-full h-full min-h-[400px] relative rounded-2xl overflow-hidden border border-neutral-200 shadow-sm z-0">
            <MapContainer
                center={KSA_CENTER}
                zoom={KSA_ZOOM}
                scrollWheelZoom={false}
                className="w-full h-full"
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
                                <Popup className="branch-popup min-w-[260px]">
                                    <div className="text-right p-1" dir="rtl">
                                        <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500 font-bold shrink-0">
                                                {branch.id}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-800 text-sm leading-tight">{branch.name}</h3>
                                                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">📍 {branch.city}</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 mb-3">
                                            <div className="bg-slate-50 p-2 rounded-lg">
                                                <div className="text-[10px] text-slate-500 mb-0.5">المبيعات</div>
                                                <div className="font-bold text-slate-800 text-sm tabular-nums" dir="ltr">{formatSAR(branch.sales)}</div>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded-lg">
                                                <div className="text-[10px] text-slate-500 mb-0.5">التحقيق</div>
                                                <div className={`font-bold text-sm tabular-nums flex items-center gap-1 ${status === 'excellent' ? 'text-emerald-600' : status === 'poor' ? 'text-red-500' : 'text-orange-600'}`} dir="ltr">
                                                    {status === 'excellent' && '✨'}
                                                    {(branch.achievement || 0).toFixed(1)}%
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-blue-50/50 p-2 rounded-lg border border-blue-100 relative">
                                            <div className="absolute top-2 left-2 text-xl opacity-20">🤖</div>
                                            <div className="text-[10px] font-bold text-blue-800 mb-1 flex items-center gap-1">المحرك الذكي:</div>
                                            <p className="text-[11px] text-blue-900 leading-snug">
                                                {generateAIInsight(branch)}
                                            </p>
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
