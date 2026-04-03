/**
 * تقسيم شهر إلى فترات لعرض «تقسيمة التارجت»
 * - يوم: كل يوم صفاً مستقلاً (مع منطق اليومية الديناميكي في الصفحة)
 * - 10 / 15: نوافذ متتابعة تغطي الشهر
 */

export type SplitGranularity = 'day' | '10' | '15';

export type TargetBucket = {
  id: string;
  label: string;
  start: string;
  end: string;
  /** عدد أيام التقويم في الفترة */
  dayCount: number;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function maxYMD(a: string, b: string): string {
  return a >= b ? a : b;
}

/** عدد الأيام بين تاريخين (شامل) */
export function daysInclusiveYMD(startYmd: string, endYmd: string): number {
  if (!startYmd || !endYmd || startYmd > endYmd) return 0;
  const a = new Date(startYmd + 'T12:00:00').getTime();
  const b = new Date(endYmd + 'T12:00:00').getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

/**
 * فترات «تقسيمة التارجت»: آذار 2026 = مرحلتان (1–19 و 20–31) مثل باقي الشاشات.
 * غير ذلك: شهر واحد كامل.
 */
export function getTargetSplitPhases(
  selYear: number,
  selMonth: number,
  monthStart: string,
  monthEnd: string,
): { key: string; label: string; start: string; end: string }[] {
  if (selYear === 2026 && selMonth === 3) {
    return [
      { key: 'm26-p1', label: 'المرحلة الأولى (1–19 آذار)', start: '2026-03-01', end: '2026-03-19' },
      { key: 'm26-p2', label: 'المرحلة الثانية (20–31 آذار)', start: '2026-03-20', end: '2026-03-31' },
    ];
  }
  return [{ key: 'month', label: '', start: monthStart, end: monthEnd }];
}

/** نوافذ يوم/10/15 ضمن [rangeStart, rangeEnd] فقط — ترحيل النوافذ لا يعبر بين مرحلتي آذار */
export function buildBucketsForDateRange(
  rangeStart: string,
  rangeEnd: string,
  g: SplitGranularity,
  idPrefix = '',
): TargetBucket[] {
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return [];
  const days: string[] = [];
  for (
    let t = new Date(rangeStart + 'T12:00:00'), end = new Date(rangeEnd + 'T12:00:00');
    t <= end;
    t.setDate(t.getDate() + 1)
  ) {
    days.push(`${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`);
  }
  if (days.length === 0) return [];
  const dim = days.length;
  if (g === 'day') {
    return days.map((ds) => ({
      id: `${idPrefix}d-${ds}`,
      label: ds,
      start: ds,
      end: ds,
      dayCount: 1,
    }));
  }
  const step = g === '10' ? 10 : 15;
  const ranges = buildMergedTailWindows(dim, step);
  return ranges.map(({ start, end }) => {
    const i = start - 1;
    const j = end - 1;
    const s = days[i];
    const e = days[j];
    return {
      id: `${idPrefix}b-${s}-${e}`,
      label: `${s} — ${e}`,
      start: s,
      end: e,
      dayCount: j - i + 1,
    };
  });
}

/** بناء فترات الشهر حسب نوع التقسيم */
export function buildTargetBuckets(year: number, month: number, g: SplitGranularity): TargetBucket[] {
  const dim = daysInMonth(year, month);
  if (g === 'day') {
    return Array.from({ length: dim }, (_, i) => {
      const d = i + 1;
      const ds = ymd(year, month, d);
      return { id: `d-${d}`, label: ds, start: ds, end: ds, dayCount: 1 };
    });
  }
  const step = g === '10' ? 10 : 15;
  /** باقي أيام الشهر بعد قسمة كاملة على step تُضاف لآخر فترة (مثلاً 31 يوماً بخطوة 10 → 10 + 10 + 11) */
  const ranges = buildMergedTailWindows(dim, step);
  return ranges.map(({ start, end }) => {
    const startStr = ymd(year, month, start);
    const endStr = ymd(year, month, end);
    return {
      id: `b-${start}-${end}`,
      label: `${startStr} — ${endStr}`,
      start: startStr,
      end: endStr,
      dayCount: end - start + 1,
    };
  });
}

/** نوافذ بعرض `step` مع دمج الباقي في آخر نافذة */
export function buildMergedTailWindows(dim: number, step: number): { start: number; end: number }[] {
  const nFull = Math.floor(dim / step);
  const rem = dim % step;
  if (rem === 0) {
    return Array.from({ length: nFull }, (_, i) => ({
      start: i * step + 1,
      end: (i + 1) * step,
    }));
  }
  if (nFull === 0) {
    return [{ start: 1, end: dim }];
  }
  const out: { start: number; end: number }[] = [];
  for (let i = 0; i < nFull - 1; i++) {
    const s = i * step + 1;
    out.push({ start: s, end: s + step - 1 });
  }
  const lastStart = (nFull - 1) * step + 1;
  out.push({ start: lastStart, end: dim });
  return out;
}

/**
 * تقييد نهاية الفترة لما لا تتجاوز «آخر يوم متاح» (مثلاً أمس للشهر الحالي)
 */
export function clampBucketEnd(bucketEnd: string, lastAvailable: string): string {
  if (!lastAvailable) return bucketEnd;
  return bucketEnd <= lastAvailable ? bucketEnd : lastAvailable;
}

export function clampBucket(bucket: TargetBucket, lastAvailable: string): TargetBucket | null {
  if (!lastAvailable || bucket.start > lastAvailable) return null;
  const end = clampBucketEnd(bucket.end, lastAvailable);
  if (bucket.start > end) return null;
  const dayCount =
    Math.floor((new Date(end + 'T12:00:00').getTime() - new Date(bucket.start + 'T12:00:00').getTime()) / 86400000) + 1;
  return {
    ...bucket,
    end,
    dayCount: Math.max(1, dayCount),
    label: bucket.start === end ? bucket.start : `${bucket.start} — ${end}`,
  };
}
