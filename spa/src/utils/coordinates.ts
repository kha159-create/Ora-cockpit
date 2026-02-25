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

// Exact known coordinates for major Ora stores in KSA
export const specificStoreCoords: Record<string, [number, number]> = {
    // Jeddah (10xx)
    '1001': [21.5037, 39.2155], // Andalos Mall
    '1002': [21.5169, 39.1824], // Haifa Mall
    '1003': [21.6267, 39.1121], // Red Sea Mall
    '1004': [21.6335, 39.1415], // Arab Mall
    '1005': [21.4983, 39.2201], // Al-Salam Mall
    '1006': [21.6033, 39.2017], // Al-Yasmin Mall
    '1007': [21.5458, 39.1558], // Al_Khayyat Center
    '1008': [21.5369, 39.1754], // Jeddah Park
    '1009': [21.6111, 39.1492], // Al Basateen Mall
    '1010': [21.4633, 39.2285], // THE VILLAGE (Al Khumra area/South)
    '1011': [21.5542, 39.1966], // Aziz Mall
    '1012': [21.4900, 39.2400], // Sauq7

    // Riyadh (11xx)
    '1101': [24.7865, 46.7570], // Al_Hamra Mall
    '1102': [24.7088, 46.8115], // Riyadh Othaim Mall (Khurais)
    '1103': [24.6970, 46.7562], // Rabwa Othaim Mall
    '1104': [24.7667, 46.7203], // Al Nakheel Mall Riyadh
    '1105': [24.7828, 46.6667], // Tala Mall Riyadh
    '1106': [24.8111, 46.7725], // Atyaf Mall Riyadh
    '1107': [24.7554, 46.6269], // Riyadh Park
    '1108': [24.5779, 46.6631], // Salam Mall Riyadh
    '1109': [24.7431, 46.6622], // Hayat Mall
    '1110': [24.7441, 46.6508], // Riyadh Gallery Mall
    '1111': [24.7645, 46.7729], // Khaleej Mall
    '1112': [24.7212, 46.6932], // Meem Plaza Riyadh
    '1113': [24.8188, 46.7118], // Park Avenue Riyadh
    '1114': [24.8322, 46.6114], // Malgha Mall
    '1115': [24.8083, 46.6433], // Alrabie Mall

    // Makkah (12xx)
    '1201': [21.4011, 39.8828], // Makkah Mall
    '1202': [21.4397, 39.8091], // Sitten Street
    '1203': [21.4206, 39.8222], // Jabl Omar

    // Taif (13xx)
    '1301': [21.2829, 40.4542], // Jouri Mall
    '1302': [21.2655, 40.4057], // Al Kamal Mall

    // Madinah (14xx)
    '1401': [24.4534, 39.5888], // Alia Mall
    '1402': [24.5028, 39.5888], // Al-Noor Mall

    // East Coast (21xx)
    '2101': [26.3106, 50.1770], // Dhahran Mall khobar
    '2102': [26.4340, 50.0888], // Al Nakheel Mall Dammam
    '2103': [26.4673, 50.1030], // Dareen Mall Dammam

    // Others
    '1601': [25.3524, 49.5891], // Ehsa Othaim Mall
    '1602': [25.3340, 49.5932], // AlAhsa Mall
    '1801': [27.5020, 41.7150], // Hail Othaim Mall
    '1901': [18.2323, 42.5310], // Abha Al_Rashid
    '1902': [18.3150, 42.7410], // Khamis Avenue
    '1903': [18.2778, 42.7667], // Mujan Park (Khamis Mushait)
    '1904': [20.0129, 41.4677], // Al_Baha Mall
    '1906': [20.0200, 41.4700], // LAVANDA PARK (Al Bahah)
    '2001': [28.3840, 36.5740], // Tabuk Park
    '2201': [27.0250, 49.6380], // Jubail Mall
    '2301': [29.9678, 40.2015], // Al-Jouf Center
    '2401': [26.3533, 43.9458], // Al-Nakheel Plaza Buraidah
    '1701': [30.9833, 41.0167], // Arar Othaim Mall
};

export function getStoreLocation(storeId: string, city: string): [number, number] {
    // 1. Direct hit with known coordinate
    if (specificStoreCoords[storeId]) return specificStoreCoords[storeId];

    // 2. City Center with deterministic offset if not explicitly mapped
    const center = cityCoords[city] || [23.8859, 45.0792]; // KSA center default

    let hash = 0;
    const strId = String(storeId);
    for (let i = 0; i < strId.length; i++) {
        hash = (hash << 5) - hash + strId.charCodeAt(i);
        hash |= 0;
    }

    const latOffset = ((Math.sin(hash) * 0.03));
    const lngOffset = ((Math.cos(hash) * 0.03));

    return [center[0] + latOffset, center[1] + lngOffset];
}
