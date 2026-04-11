/**
 * Seasonal Comparison Mode (مود المواسم)
 *
 * During Hijri seasons (Sha'ban, Ramadan, Eid al-Fitr, Eid al-Adha),
 * previous-year comparisons are adjusted to use the same Hijri date
 * from the previous Hijri year, rather than subtracting 1 Gregorian year.
 *
 * This ensures fair comparison: 19 Sha'ban 1447 vs 19 Sha'ban 1446,
 * instead of 3 Feb 2026 vs 3 Feb 2025 (which would be a different Hijri date).
 */
import { gregorianToHijri, hijriToGregorian } from '@tabby_ai/hijri-converter';

// ===== Season Definitions =====

interface HijriSeason {
  name: string;
  nameAr: string;
  icon: string;
  hijriMonth: number;
  startDay: number;
  endDay: number;
}

interface GregorianSeason {
  name: string;
  nameAr: string;
  icon: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}

const HIJRI_SEASONS: HijriSeason[] = [
  { name: 'Shaaban', nameAr: 'شعبان', icon: '🌙', hijriMonth: 8, startDay: 1, endDay: 29 },
  { name: 'Ramadan', nameAr: 'رمضان', icon: '🌙', hijriMonth: 9, startDay: 1, endDay: 30 },
  { name: 'Eid al-Fitr', nameAr: 'عيد الفطر', icon: '🎉', hijriMonth: 10, startDay: 1, endDay: 6 },
  { name: 'Eid al-Adha', nameAr: 'عيد الأضحى', icon: '🎉', hijriMonth: 12, startDay: 8, endDay: 13 },
];

const GREGORIAN_SEASONS: GregorianSeason[] = [
  { name: 'National Day', nameAr: 'اليوم الوطني', icon: '🇸🇦', startMonth: 9, startDay: 18, endMonth: 9, endDay: 28 },
  { name: 'Black Friday', nameAr: 'بلاك فرايدي', icon: '🏷️', startMonth: 11, startDay: 20, endMonth: 12, endDay: 5 },
];

// ===== Season Detection =====

export interface SeasonInfo {
  active: boolean;
  name: string;
  nameAr: string;
  icon: string;
  isHijri: boolean;
}

/**
 * Detect if a given date falls within a known season.
 * Returns season info or null if not in any season.
 */
export function detectCurrentSeason(date?: Date): SeasonInfo | null {
  const d = date || new Date();

  // Check Hijri seasons
  try {
    const hijri = gregorianToHijri({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    });

    for (const season of HIJRI_SEASONS) {
      if (
        hijri.month === season.hijriMonth &&
        hijri.day >= season.startDay &&
        hijri.day <= season.endDay
      ) {
        return {
          active: true,
          name: season.name,
          nameAr: season.nameAr,
          icon: season.icon,
          isHijri: true,
        };
      }
    }
  } catch {
    // If Hijri conversion fails, skip Hijri check
  }

  // Check Gregorian seasons
  const gMonth = d.getMonth() + 1;
  const gDay = d.getDate();

  for (const season of GREGORIAN_SEASONS) {
    const afterStart = gMonth > season.startMonth || (gMonth === season.startMonth && gDay >= season.startDay);
    const beforeEnd = gMonth < season.endMonth || (gMonth === season.endMonth && gDay <= season.endDay);

    if (season.startMonth <= season.endMonth) {
      // Same year range (e.g., Sep 18 - Sep 28)
      if (afterStart && beforeEnd) {
        return { active: true, name: season.name, nameAr: season.nameAr, icon: season.icon, isHijri: false };
      }
    } else {
      // Cross-year range (e.g., Nov 20 - Dec 5)
      if (afterStart || beforeEnd) {
        return { active: true, name: season.name, nameAr: season.nameAr, icon: season.icon, isHijri: false };
      }
    }
  }

  return null;
}

/** Shorthand: is seasonal mode currently active? */
export function isSeasonalModeActive(date?: Date): boolean {
  const s = detectCurrentSeason(date);
  return s !== null && s.isHijri;
}

// ===== Seasonal Date Conversion =====

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * For a Gregorian date string (YYYY-MM-DD), find the equivalent date
 * from the previous HIJRI year.
 *
 * Example: "2026-02-03" = 19 Sha'ban 1447
 *          -> 19 Sha'ban 1446 = "2025-02-14"
 */
export function getSeasonalPrevDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const hijri = gregorianToHijri({ year: y, month: m, day: d });
    const prevYear = hijri.year - 1;
    // Keep Hijri alignment even when previous Hijri month has fewer days (29 vs 30).
    // Try same Hijri day first, then step down until valid.
    for (let candidateDay = Math.min(hijri.day, 30); candidateDay >= 1; candidateDay--) {
      try {
        const prevHijri = hijriToGregorian({ year: prevYear, month: hijri.month, day: candidateDay });
        return `${prevHijri.year}-${pad(prevHijri.month)}-${pad(prevHijri.day)}`;
      } catch {
        // Try previous day
      }
    }
  } catch {
    // Handled below by Gregorian fallback
  }
  // Fallback: subtract 1 Gregorian year (only if Hijri conversion is entirely unavailable)
  return dateStr.replace(/^\d{4}/, (yr) => String(Number(yr) - 1));
}

export function formatHijriDate(dateStr: string): string {
  try {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const hijri = gregorianToHijri({ year: y, month: m, day: d });
    return `${hijri.day} / ${hijri.month} / ${hijri.year}`;
  } catch {
    return '';
  }
}

/**
 * For a Gregorian date range, compute the corresponding previous-Hijri-year range.
 */
export function getSeasonalPrevRange(start: string, end: string): { start: string; end: string } {
  return {
    start: getSeasonalPrevDate(start),
    end: getSeasonalPrevDate(end),
  };
}

// ===== Smart Prev-Year Functions (auto-detect mode) =====

/**
 * Get previous-year date: if in a Hijri season, use Hijri alignment;
 * otherwise, subtract 1 Gregorian year.
 */
export function getPrevYearDate(dateStr: string, forceGregorian = false): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  const season = detectCurrentSeason(targetDate);
  if (season?.isHijri && !forceGregorian) {
    return getSeasonalPrevDate(dateStr);
  }
  // Default: subtract 1 Gregorian year
  return dateStr.replace(/^\d{4}/, (yr) => String(Number(yr) - 1));
}

/**
 * Get previous-year range: if in a Hijri season, use Hijri alignment;
 * otherwise, subtract 1 Gregorian year from both dates.
 */
export function getPrevYearRange(start: string, end: string, forceGregorian = false): { start: string; end: string } {
  const [y, m, d] = start.split('-').map(Number);
  const startDate = new Date(y, m - 1, d);
  const season = detectCurrentSeason(startDate);
  if (season?.isHijri && !forceGregorian) {
    return getSeasonalPrevRange(start, end);
  }
  return {
    start: start.replace(/^\d{4}/, (yr) => String(Number(yr) - 1)),
    end: end.replace(/^\d{4}/, (yr) => String(Number(yr) - 1)),
  };
}

/** مقارنة صريحة: ميلادي −١ سنة تقويمية | هجري نفس التاريخ الهجري من العام الهجري السابق */
export type ComparisonCalendarMode = 'gregorian' | 'hijri';

export function getComparisonPrevRange(
  start: string,
  end: string,
  mode: ComparisonCalendarMode,
): { start: string; end: string } {
  if (mode === 'hijri') {
    return getSeasonalPrevRange(start, end);
  }
  return {
    start: start.replace(/^\d{4}/, (yr) => String(Number(yr) - 1)),
    end: end.replace(/^\d{4}/, (yr) => String(Number(yr) - 1)),
  };
}

export function getComparisonPrevDate(dateStr: string, mode: ComparisonCalendarMode): string {
  if (mode === 'hijri') {
    return getSeasonalPrevDate(dateStr);
  }
  return dateStr.replace(/^\d{4}/, (yr) => String(Number(yr) - 1));
}

/**
 * Get the current Hijri date info string for display.
 * Returns e.g. "19 شعبان 1447"
 */
export function getCurrentHijriDisplay(date?: Date): string {
  const d = date || new Date();
  try {
    const hijri = gregorianToHijri({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    });

    const hijriMonths = [
      '', 'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
      'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
      'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
    ];

    return `${hijri.day} ${hijriMonths[hijri.month]} ${hijri.year}`;
  } catch {
    return '';
  }
}

// ===== Season List & Range Helpers =====

export interface SeasonListItem {
  id: string;
  name: string;
  nameAr: string;
  icon: string;
  isHijri: boolean;
}

/**
 * Returns a list of all defined seasons (Hijri and Gregorian) to be used in dropdowns.
 */
export function getAvailableSeasonsList(): SeasonListItem[] {
  const list: SeasonListItem[] = [];

  HIJRI_SEASONS.forEach(s => {
    list.push({ id: `hijri_${s.name}`, name: s.name, nameAr: s.nameAr, icon: s.icon, isHijri: true });
  });

  GREGORIAN_SEASONS.forEach(s => {
    list.push({ id: `greg_${s.name}`, name: s.name, nameAr: s.nameAr, icon: s.icon, isHijri: false });
  });

  return list;
}

/**
 * Calculates the start and end dates (YYYY-MM-DD) for a specific season in the current year.
 */
export function getSeasonDateRange(seasonId: string, currentGregorianYear?: number): { start: string; end: string } | null {
  const year = currentGregorianYear || new Date().getFullYear();

  if (seasonId.startsWith('hijri_')) {
    const name = seasonId.replace('hijri_', '');
    const season = HIJRI_SEASONS.find(s => s.name === name);
    if (!season) return null;

    try {
      // Select the Hijri year by anchoring to the selected Gregorian year, not today's date.
      // This keeps Hijri season matching stable even when the current season changes.
      const jan1Hijri = gregorianToHijri({ year, month: 1, day: 1 });
      const candidateHijriYears = [jan1Hijri.year - 1, jan1Hijri.year, jan1Hijri.year + 1, jan1Hijri.year + 2];

      const candidates = candidateHijriYears.map((hy) => {
        const startGreg = hijriToGregorian({ year: hy, month: season.hijriMonth, day: season.startDay });
        let endGreg;
        try {
          endGreg = hijriToGregorian({ year: hy, month: season.hijriMonth, day: season.endDay });
        } catch {
          // Fallback for months that might be 29 days instead of 30
          endGreg = hijriToGregorian({ year: hy, month: season.hijriMonth, day: season.endDay - 1 });
        }
        return {
          start: `${startGreg.year}-${pad(startGreg.month)}-${pad(startGreg.day)}`,
          end: `${endGreg.year}-${pad(endGreg.month)}-${pad(endGreg.day)}`,
        };
      });

      // Prefer season ranges that start inside the selected Gregorian year.
      const startsInTargetYear = candidates.filter((c) => Number(c.start.slice(0, 4)) === year);
      if (startsInTargetYear.length > 0) {
        return startsInTargetYear[0];
      }

      // Fallback: choose the closest start date to mid-year anchor.
      const midYearTs = new Date(year, 6, 1).getTime();
      candidates.sort((a, b) => {
        const da = Math.abs(new Date(a.start).getTime() - midYearTs);
        const db = Math.abs(new Date(b.start).getTime() - midYearTs);
        return da - db;
      });
      return candidates[0];
    } catch (e) {
      console.error("Error calculating Hijri season date", e);
      return null;
    }
  }

  if (seasonId.startsWith('greg_')) {
    const name = seasonId.replace('greg_', '');
    const season = GREGORIAN_SEASONS.find(s => s.name === name);
    if (!season) return null;

    let startYear = year;
    let endYear = year;
    // Handle cross-year seasons (e.g. November to January)
    if (season.endMonth < season.startMonth) {
      endYear = year + 1;
    }

    return {
      start: `${startYear}-${pad(season.startMonth)}-${pad(season.startDay)}`,
      end: `${endYear}-${pad(season.endMonth)}-${pad(season.endDay)}`,
    };
  }

  return null;
}
