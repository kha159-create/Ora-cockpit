/**
 * آذار 2026 — تقسيم فترات التارجت (رمضان / رفع من الريبو):
 * - المرحلة 1: 1–19 آذار (19 يوماً) — التارجت الحالي
 * - المرحلة 2: 20–31 آذار (12 يوماً) — تارجت جديد من الريبو الأصلي
 *
 * أي شهر آخر: نفس منطق التقويم الميلادي العادي.
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
