import { useMemo } from 'react';
import { detectCurrentSeason, getCurrentHijriDisplay } from '../utils/seasons';

/**
 * Banner that auto-shows when a business season is active.
 * Displays season name in Arabic with the current Hijri date.
 */
export default function SeasonBanner() {
  const season = useMemo(() => detectCurrentSeason(), []);
  const hijriDate = useMemo(() => getCurrentHijriDisplay(), []);

  if (!season) return null;

  return (
    <div className="mb-3 sm:mb-4 rounded-2xl overflow-hidden shadow-lg border border-amber-200/60">
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{season.icon}</span>
          <div>
            <div className="text-white font-bold text-sm sm:text-base flex items-center gap-2">
              <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-bold tracking-wide">
                فترة المواسم
              </span>
              <span>{season.nameAr}</span>
            </div>
            {season.isHijri && hijriDate && (
              <div className="text-white/80 text-xs mt-0.5">
                {hijriDate} - المقارنة بنفس الفترة الهجرية من العام الماضي
              </div>
            )}
            {!season.isHijri && (
              <div className="text-white/80 text-xs mt-0.5">
                المقارنة بنفس الفترة الميلادية من العام الماضي
              </div>
            )}
          </div>
        </div>
        <div className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-xl">
          <span className="text-white text-xs font-bold">
            {season.isHijri ? '📅 مقارنة هجرية' : '📅 مقارنة ميلادية'}
          </span>
        </div>
      </div>
    </div>
  );
}
