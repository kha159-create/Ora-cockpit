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
