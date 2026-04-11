import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ComparisonCalendarMode } from '../utils/seasons';

const STORAGE_KEY = 'ora-comparison-calendar';

function readStored(): ComparisonCalendarMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'hijri' || v === 'gregorian') return v;
  } catch {
    /* ignore */
  }
  return 'gregorian';
}

type Ctx = {
  calendar: ComparisonCalendarMode;
  setCalendar: (m: ComparisonCalendarMode) => void;
  toggle: () => void;
};

const ComparisonCalendarContext = createContext<Ctx | null>(null);

export function ComparisonCalendarProvider({ children }: { children: React.ReactNode }) {
  const [calendar, setCalendarState] = useState<ComparisonCalendarMode>(() =>
    typeof window !== 'undefined' ? readStored() : 'gregorian',
  );

  const setCalendar = useCallback((m: ComparisonCalendarMode) => {
    setCalendarState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCalendar(calendar === 'gregorian' ? 'hijri' : 'gregorian');
  }, [calendar, setCalendar]);

  const value = useMemo(() => ({ calendar, setCalendar, toggle }), [calendar, setCalendar, toggle]);

  return (
    <ComparisonCalendarContext.Provider value={value}>{children}</ComparisonCalendarContext.Provider>
  );
}

export function useComparisonCalendar(): Ctx {
  const ctx = useContext(ComparisonCalendarContext);
  if (!ctx) {
    throw new Error('useComparisonCalendar must be used within ComparisonCalendarProvider');
  }
  return ctx;
}

/** For Storybook or tests outside provider — defaults to gregorian */
export function useComparisonCalendarOptional(): Ctx {
  const ctx = useContext(ComparisonCalendarContext);
  return (
    ctx ?? {
      calendar: 'gregorian',
      setCalendar: () => {},
      toggle: () => {},
    }
  );
}
