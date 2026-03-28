/**
 * آذار 2026 — تقسيم فترات التارجت (رمضان / رفع من الريبو):
 * - المرحلة 1: 1–19 آذار (19 يوماً) — التارجت الحالي
 * - المرحلة 2: 20–31 آذار (12 يوماً) — تارجت جديد من الريبو الأصلي
 *
 * أي شهر آخر: نفس منطق التقويم الميلادي العادي.
 *
 * بيانات management.targets: لكل فرع يُفضّل صفّان بتاريخ يحدد المرحلة (مثال):
 *   ["2026-03-01", "1001", 500000]  → مرحلة 1
 *   ["2026-03-20", "1001", 300000]  → مرحلة 2
 * لا تُجمع القيمتان في العرض؛ يُختار الصف حسب اليوم الحالي (1–19 vs 20–31).
 *
 * بيانات الموظفين (employees_data): نفس الفكرة — إما
 *   targets_by_month["2026-03_p1"] / ["2026-03_p2"]، أو monthly_targets[empId] بمفتاحين
 *   "2026-03-01" و "2026-03-20" (أي تاريخ في 1–19 = مرحلة 1، و20–31 = مرحلة 2)،
 *   أو "2026-03" / targets مسطّحة كـ fallback.
 */

export function isMarch2026TargetMonth(d: Date): boolean {
    return d.getFullYear() === 2026 && d.getMonth() === 2;
}

export type March2026TargetMetrics = {
    /** طول فترة التارجت الحالية (19 أو 12 لآذار 2026) */
    periodLength: number;
    /** اليوم داخل الفترة (1…19 أو 1…12) */
    dayOfPeriod: number;
    /** أيام متبقية تشمل اليوم — لمعادلات dailyReq التي تستخدم +1 */
    remainingDaysInclusive: number;
    /** أيام متبقية بدون +1 (نمط Dashboard PDF وغيره) */
    remainingDaysExclusive: number;
    /** نمط KPIGrid: periodLength - dayOfPeriod */
    remainingKPIGridStyle: number;
};

/**
 * مقاييس فترة التارجت لتاريخ مرجعي (يُفضّل «اليوم» أو «أمس» حسب الشاشة).
 */
export function getMarch2026TargetMetrics(ref: Date): March2026TargetMetrics {
    if (!isMarch2026TargetMonth(ref)) {
        const dim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        const day = ref.getDate();
        return {
            periodLength: dim,
            dayOfPeriod: day,
            remainingDaysInclusive: Math.max(0, dim - day + 1),
            remainingDaysExclusive: Math.max(0, dim - day),
            remainingKPIGridStyle: Math.max(0, dim - day),
        };
    }

    const day = ref.getDate();
    if (day <= 19) {
        return {
            periodLength: 19,
            dayOfPeriod: day,
            remainingDaysInclusive: Math.max(0, 19 - day + 1),
            remainingDaysExclusive: Math.max(0, 19 - day),
            remainingKPIGridStyle: Math.max(0, 19 - day),
        };
    }

    const dayP2 = day - 19;
    return {
        periodLength: 12,
        dayOfPeriod: dayP2,
        remainingDaysInclusive: Math.max(0, 12 - dayP2 + 1),
        remainingDaysExclusive: Math.max(0, 12 - dayP2),
        remainingKPIGridStyle: Math.max(0, 12 - dayP2),
    };
}

/** مرحلة التارجت لآذار 2026: 1 = أيام 1–19، 2 = 20–31 */
export function getMarch2026TargetPhase(effectiveDateStr: string): 1 | 2 | null {
    if (!effectiveDateStr.startsWith('2026-03')) return null;
    const day = parseInt(effectiveDateStr.slice(8, 10), 10);
    if (Number.isNaN(day)) return null;
    return day <= 19 ? 1 : 2;
}

/**
 * حدود مبيعات MTD ضمن نفس مرحلة التارجت (لا تخلط مبيعات 1–19 مع تارجت 20–31).
 */
export function getMarch2026PhaseSalesBounds(effectiveDateStr: string): { start: string; end: string } | null {
    const phase = getMarch2026TargetPhase(effectiveDateStr);
    if (phase === null) return null;
    if (phase === 1) {
        return { start: '2026-03-01', end: effectiveDateStr };
    }
    return { start: '2026-03-20', end: effectiveDateStr };
}

/** هل تاريخ المبيعات ضمن نفس مرحلة التارجت لآذار 2026 (للموظفين/الفروع) */
export function dateWithinMarchPhaseSalesBounds(dNorm: string, referenceEndDateStr: string): boolean {
    const b = getMarch2026PhaseSalesBounds(referenceEndDateStr);
    if (!b) return true;
    return dNorm >= b.start && dNorm <= b.end;
}

/**
 * يجمع تارجت الفروع من `management.targets` [[date, storeId, value], ...]
 * بدون جمع صفّي المرحلتين لآذار 2026.
 * - صف بتاريخ اليوم 1–19 → يُحسب للمرحلة 1 فقط عندما نحن في 1–19
 * - صف بتاريخ 20–31 → للمرحلة 2 فقط عندما نحن في 20–31
 */
export function sumManagementTargetsForMonth(
    targetRows: any[] | undefined,
    monthKeyYYYY_MM: string,
    effectiveDateStr: string
): Record<string, number> {
    const out: Record<string, number> = {};
    if (!targetRows?.length) return out;

    const phase = getMarch2026TargetPhase(effectiveDateStr);

    for (const row of targetRows) {
        const d = row[0];
        const sid = String(row[1] ?? '');
        const v = Number(row[2]) || 0;
        const dateStr = String(d).substring(0, 10);
        if (!dateStr.startsWith(monthKeyYYYY_MM)) continue;

        if (phase === null) {
            out[sid] = (out[sid] || 0) + v;
            continue;
        }

        const rowDay = parseInt(dateStr.slice(8, 10), 10);
        if (Number.isNaN(rowDay)) continue;
        const rowPhase: 1 | 2 = rowDay <= 19 ? 1 : 2;
        if (rowPhase !== phase) continue;
        out[sid] = (out[sid] || 0) + v;
    }
    return out;
}

/**
 * تارجت موظف للتاريخ المرجعي (نهاية الفترة / اليوم):
 * 1) monthly_targets بمفاتيح مؤرخة لآذار 2026 (مثال 2026-03-01 vs 2026-03-20) حسب المرحلة
 * 2) targets_by_month['2026-03_p1'] / ['2026-03_p2']
 * 3) targets_by_month['2026-03']
 * 4) targets مسطّحة
 * 5) monthly_targets بمفتاح شهر فقط (legacy)
 */
export function getEmployeeTargetForEffectiveDate(empRaw: any, empId: string, effectiveDateStr: string): number {
    const id = String(empId || '').trim().split('-')[0].trim();
    if (!id) return 0;
    const padded = id.padStart(4, '0');
    const monthKey = effectiveDateStr.substring(0, 7);
    const tbm = empRaw?.targets_by_month;

    const monthlyMap = empRaw?.monthly_targets?.[id] || empRaw?.monthly_targets?.[padded];
    if (monthlyMap && typeof monthlyMap === 'object' && effectiveDateStr.startsWith('2026-03')) {
        const day = +effectiveDateStr.slice(8, 10);
        const wantP1 = day <= 19;
        for (const [mStart, val] of Object.entries(monthlyMap as Record<string, number>)) {
            const ds = String(mStart).substring(0, 10);
            if (!ds.startsWith('2026-03')) continue;
            const rowDay = parseInt(ds.slice(8, 10), 10);
            if (Number.isNaN(rowDay)) continue;
            const rowIsP1 = rowDay <= 19;
            if (wantP1 === rowIsP1) return Number(val) || 0;
        }
    }

    if (effectiveDateStr.startsWith('2026-03') && tbm && typeof tbm === 'object') {
        const day = +effectiveDateStr.slice(8, 10);
        const phaseKey = `${monthKey}${day <= 19 ? '_p1' : '_p2'}`;
        const pk = tbm[phaseKey];
        if (pk && typeof pk === 'object') {
            if (pk[id] != null) return Number(pk[id]) || 0;
            if (pk[padded] != null) return Number(pk[padded]) || 0;
        }
    }

    if (tbm?.[monthKey] && typeof tbm[monthKey] === 'object') {
        const mk = tbm[monthKey];
        if (mk[id] != null) return Number(mk[id]) || 0;
        if (mk[padded] != null) return Number(mk[padded]) || 0;
    }

    // مفاتيح monthly_targets المؤرّقة لنفس الشهر (مثلاً 2026-02-01) قبل targets المسطّحة —
    // وإلا قيمة flat غالباً تكون آخر تارجت مُزامَن (مثل آذار المرحلة 1) وتُطبَّق على شهور أخرى بالخطأ.
    if (monthlyMap && typeof monthlyMap === 'object') {
        for (const [mStart, val] of Object.entries(monthlyMap as Record<string, number>)) {
            if (String(mStart).startsWith(monthKey)) return Number(val) || 0;
        }
    }

    const flat = empRaw?.targets || {};
    if (flat[id] != null) return Number(flat[id]) || 0;
    if (flat[padded] != null) return Number(flat[padded]) || 0;

    return 0;
}

/**
 * لدمج صفوف targets مع فترة عرض: لا تجمع صف مرحلة 1 مع مرحلة 2.
 * المرجع = تاريخ نهاية الفترة (أو «اليوم») لتحديد المرحلة النشطة.
 */
export function march2026TargetRowMatchesReference(rowDateStr: string, referenceDateStr: string): boolean {
    const phRef = getMarch2026TargetPhase(referenceDateStr);
    if (phRef === null) return true;
    const rd = String(rowDateStr).substring(0, 10);
    if (!rd.startsWith('2026-03')) return true;
    const rowDay = parseInt(rd.slice(8, 10), 10);
    if (Number.isNaN(rowDay)) return true;
    const phRow: 1 | 2 = rowDay <= 19 ? 1 : 2;
    return phRow === phRef;
}

function maxYMD(a: string, b: string): string {
    return a >= b ? a : b;
}
function minYMD(a: string, b: string): string {
    return a <= b ? a : b;
}

/** عدد الأيام بين تاريخين YYYY-MM-DD (شامل). */
function daysInclusiveYMD(start: string, end: string): number {
    if (!start || !end || start > end) return 0;
    const t = new Date(start + 'T12:00:00').getTime();
    const u = new Date(end + 'T12:00:00').getTime();
    return Math.floor((u - t) / 86400000) + 1;
}

/**
 * جمع تارجت موظف على فترة مخصصة (شهور متعددة): لكل شهر نسبة من التارجت الشهري،
 * وآذار 2026 يُقسَّم إلى مرحلتين (1–19 و 20–31) مثل باقي المنطق.
 */
export function sumEmployeeTargetForDateRange(empRaw: any, empId: string, rangeStart: string, rangeEnd: string): number {
    if (!empRaw || !rangeStart || !rangeEnd || rangeStart > rangeEnd) return 0;
    let total = 0;
    const rs = new Date(rangeStart + 'T12:00:00');
    const re = new Date(rangeEnd + 'T12:00:00');
    let cur = new Date(rs.getFullYear(), rs.getMonth(), 1);
    const endMonth = new Date(re.getFullYear(), re.getMonth(), 1);

    while (cur.getTime() <= endMonth.getTime()) {
        const y = cur.getFullYear();
        const m0 = cur.getMonth();
        const monthEnd = new Date(y, m0 + 1, 0);
        const dim = monthEnd.getDate();
        const ms = `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
        const me = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(dim).padStart(2, '0')}`;
        const overlapS = maxYMD(rangeStart, ms);
        const overlapE = minYMD(rangeEnd, me);
        if (overlapS <= overlapE) {
            const daysOverlap = daysInclusiveYMD(overlapS, overlapE);
            if (y === 2026 && m0 === 2) {
                const p1s = maxYMD(overlapS, '2026-03-01');
                const p1e = minYMD(overlapE, '2026-03-19');
                if (p1s <= p1e && p1s <= '2026-03-19' && p1e >= '2026-03-01') {
                    const d1 = daysInclusiveYMD(p1s, p1e);
                    const t1 = getEmployeeTargetForEffectiveDate(empRaw, empId, '2026-03-10');
                    total += t1 * (d1 / 19);
                }
                const p2s = maxYMD(overlapS, '2026-03-20');
                const p2e = minYMD(overlapE, '2026-03-31');
                if (p2s <= p2e && p2s >= '2026-03-20') {
                    const d2 = daysInclusiveYMD(p2s, p2e);
                    const t2 = getEmployeeTargetForEffectiveDate(empRaw, empId, '2026-03-25');
                    total += t2 * (d2 / 12);
                }
            } else {
                const refEff = overlapE;
                const monthTarget = getEmployeeTargetForEffectiveDate(empRaw, empId, refEff);
                total += monthTarget * (daysOverlap / dim);
            }
        }
        cur.setMonth(cur.getMonth() + 1);
    }
    return total;
}

/**
 * جمع تارجت الفروع من management.targets على فترة مخصصة (شهور متعددة)، مع نفس منطق آذار 2026.
 */
export function sumManagementTargetsForDateRange(
    targetRows: any[] | undefined,
    rangeStart: string,
    rangeEnd: string,
): Record<string, number> {
    const out: Record<string, number> = {};
    if (!targetRows?.length || !rangeStart || !rangeEnd || rangeStart > rangeEnd) return out;

    const rs = new Date(rangeStart + 'T12:00:00');
    const re = new Date(rangeEnd + 'T12:00:00');
    let cur = new Date(rs.getFullYear(), rs.getMonth(), 1);
    const endMonth = new Date(re.getFullYear(), re.getMonth(), 1);

    while (cur.getTime() <= endMonth.getTime()) {
        const y = cur.getFullYear();
        const m0 = cur.getMonth();
        const monthEnd = new Date(y, m0 + 1, 0);
        const dim = monthEnd.getDate();
        const ms = `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
        const me = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(dim).padStart(2, '0')}`;
        const overlapS = maxYMD(rangeStart, ms);
        const overlapE = minYMD(rangeEnd, me);
        if (overlapS <= overlapE) {
            const daysOverlap = daysInclusiveYMD(overlapS, overlapE);
            if (y === 2026 && m0 === 2) {
                const p1s = maxYMD(overlapS, '2026-03-01');
                const p1e = minYMD(overlapE, '2026-03-19');
                if (p1s <= p1e && p1s <= '2026-03-19' && p1e >= '2026-03-01') {
                    const d1 = daysInclusiveYMD(p1s, p1e);
                    const t1 = sumManagementTargetsForMonth(targetRows, '2026-03', '2026-03-10');
                    const f = d1 / 19;
                    for (const [sid, v] of Object.entries(t1)) {
                        out[sid] = (out[sid] || 0) + v * f;
                    }
                }
                const p2s = maxYMD(overlapS, '2026-03-20');
                const p2e = minYMD(overlapE, '2026-03-31');
                if (p2s <= p2e && p2s >= '2026-03-20') {
                    const d2 = daysInclusiveYMD(p2s, p2e);
                    const t2 = sumManagementTargetsForMonth(targetRows, '2026-03', '2026-03-25');
                    const f2 = d2 / 12;
                    for (const [sid, v] of Object.entries(t2)) {
                        out[sid] = (out[sid] || 0) + v * f2;
                    }
                }
            } else {
                const monthKey = `${y}-${String(m0 + 1).padStart(2, '0')}`;
                const tm = sumManagementTargetsForMonth(targetRows, monthKey, overlapE);
                const frac = daysOverlap / dim;
                for (const [sid, v] of Object.entries(tm)) {
                    out[sid] = (out[sid] || 0) + v * frac;
                }
            }
        }
        cur.setMonth(cur.getMonth() + 1);
    }
    return out;
}
