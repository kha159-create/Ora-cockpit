import { getStoreLocation } from './coordinates';
import { sumManagementTargetsForDateRange } from './march2026Targets';
import type { StoreData } from '../components/dashboard/CustomerValueInsights';

export type TopStoreRankRow = {
  id: string;
  name: string;
  sales: number;
  trans: number;
  visitors: number;
  target: number;
  growth: number;
  achievement: number;
  avg_inv: number;
  prevYearSales: number;
  prevYearVisitors: number;
  customerValue: number;
  prevCustomerValue: number;
};

/**
 * تجميع مبيعات/زوار/السنة الماضية لكل فرع — نفس منطق لوحة التحكم.
 */
export function buildTopStoresRankForPeriod(
  raw: any,
  opts: {
    allowedStoreIds: Set<string>;
    range: { start: string; end: string };
    prevYearRange: { start: string; end: string };
    mode: string;
  },
): TopStoreRankRow[] {
  const { allowedStoreIds, range, prevYearRange, mode } = opts;
  const inRange = (d: string) => {
    const x = String(d).substring(0, 10);
    return x >= range.start && x <= range.end;
  };
  const inPrevYearRange = (d: string) => {
    const x = String(d).substring(0, 10);
    return x >= prevYearRange.start && x <= prevYearRange.end;
  };

  const byStore: Record<string, { sales: number; trans: number; visitors: number; target: number; prevYearSales: number; prevYearVisitors: number }> = {};
  const isOnlineStore = (sid: string) => raw?.store_meta?.[sid]?.type === 'online';

  (raw.sales || []).forEach(([d, s, v]: any[]) => {
    if (!allowedStoreIds.has(s) || isOnlineStore(s)) return;
    if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevYearSales: 0, prevYearVisitors: 0 };
    if (inRange(d)) byStore[s].sales += v || 0;
    if (inPrevYearRange(d)) byStore[s].prevYearSales += v || 0;
  });
  (raw.transactions || []).forEach(([d, s, v]: any[]) => {
    if (!allowedStoreIds.has(s) || isOnlineStore(s)) return;
    if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevYearSales: 0, prevYearVisitors: 0 };
    if (inRange(d)) byStore[s].trans += v || 0;
  });
  (raw.visitors || []).forEach(([d, s, v]: any[]) => {
    if (!allowedStoreIds.has(s) || isOnlineStore(s)) return;
    if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevYearSales: 0, prevYearVisitors: 0 };
    if (inRange(d)) byStore[s].visitors += v || 0;
    if (inPrevYearRange(d)) byStore[s].prevYearVisitors += v || 0;
  });

  if (mode === 'custom' && range.start && range.end) {
    const summed = sumManagementTargetsForDateRange(raw.targets, range.start, range.end);
    Object.entries(summed).forEach(([sid, t]) => {
      if (!allowedStoreIds.has(sid) || isOnlineStore(sid)) return;
      if (!byStore[sid]) byStore[sid] = { sales: 0, trans: 0, visitors: 0, target: 0, prevYearSales: 0, prevYearVisitors: 0 };
      byStore[sid].target = t || 0;
    });
  } else {
    (raw.targets || []).forEach(([d, s, v]: any[]) => {
      if (!allowedStoreIds.has(s) || isOnlineStore(s)) return;
      if (!byStore[s]) byStore[s] = { sales: 0, trans: 0, visitors: 0, target: 0, prevYearSales: 0, prevYearVisitors: 0 };
      if (inRange(d)) byStore[s].target += v || 0;
    });
  }

  const storesMap: Record<string, string> = raw?.stores || {};

  return Object.entries(byStore).map(([sid, v]) => {
    const growth = v.prevYearSales > 0 ? ((v.sales - v.prevYearSales) / v.prevYearSales) * 100 : 0;
    const achievement = v.target > 0 ? (v.sales / v.target) * 100 : 0;
    const avgInv = v.trans > 0 ? v.sales / v.trans : 0;
    const customerValue = v.visitors > 0 ? v.sales / v.visitors : 0;
    const prevCustomerValue = v.prevYearVisitors > 0 ? v.prevYearSales / v.prevYearVisitors : 0;
    return {
      id: sid,
      name: storesMap[sid] || sid,
      sales: v.sales,
      trans: v.trans,
      visitors: v.visitors,
      target: v.target,
      growth,
      achievement,
      avg_inv: avgInv,
      prevYearSales: v.prevYearSales,
      prevYearVisitors: v.prevYearVisitors,
      customerValue,
      prevCustomerValue,
    };
  });
}

export function mapBranchesDataWithLocations(
  rows: TopStoreRankRow[],
  storeMeta: Record<string, { city?: string }> | undefined,
): StoreData[] {
  return rows.map((store) => {
    const city = storeMeta?.[store.id]?.city || 'الرياض';
    const [lat, lng] = getStoreLocation(store.id, city);
    return {
      id: store.id,
      name: store.name,
      city,
      lat,
      lng,
      sales: store.sales,
      trans: store.trans,
      visitors: store.visitors,
      target: store.target,
      avg_inv: store.avg_inv,
      growth: store.growth,
      achievement: store.achievement,
      customerValue: store.customerValue ?? (store.visitors > 0 ? store.sales / store.visitors : 0),
      prevCustomerValue: store.prevCustomerValue,
      prevYearSales: store.prevYearSales,
      prevYearVisitors: store.prevYearVisitors,
    };
  });
}
