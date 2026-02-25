// Saudi Arabia main cities approximate coordinates
export const cityCoords: Record<string, [number, number]> = {
    'الرياض': [24.7136, 46.6753],
    'جدة': [21.4858, 39.1925],
    'مكة المكرمة': [21.3891, 39.8579],
    'المدينة المنورة': [24.5247, 39.5692],
    'الدمام': [26.4207, 50.0888],
    'الخبر': [26.2172, 50.1971],
    'تبوك': [28.3835, 36.5662],
    'بريدة': [26.3260, 43.9390],
    'خميس مشيط': [18.3063, 42.7393],
    'أبها': [18.2164, 42.5053],
    'الطائف': [21.2703, 40.4158],
    'حائل': [27.5219, 41.6907],
    'نجران': [17.4933, 44.1277],
    'ينبع': [24.0249, 38.0606],
    'الجبيل': [27.0112, 49.6583],
    'الخرج': [24.1550, 47.3346],
    'حفر الباطن': [28.4328, 45.9708]
};

// Generate a slightly randomized coordinate around the city center to spread markers
export function getStoreLocation(storeId: string, city: string): [number, number] {
    const center = cityCoords[city] || [23.8859, 45.0792]; // KSA center default

    // Use storeId to make the scatter deterministic
    let hash = 0;
    const strId = String(storeId);
    for (let i = 0; i < strId.length; i++) {
        hash = (hash << 5) - hash + strId.charCodeAt(i);
        hash |= 0;
    }

    // Spread by roughly +/- 0.05 degrees (~5km)
    const latOffset = ((Math.sin(hash) * 0.05));
    const lngOffset = ((Math.cos(hash) * 0.05));

    return [center[0] + latOffset, center[1] + lngOffset];
}
