import React, { useEffect, useMemo, useState } from 'react';
import { loadOffersData, loadManagementData } from '../services/upstreamData';
import { getCurrentUser } from '../auth/storage';
import { DownloadIcon } from '../components/Icons';
import * as XLSX from 'xlsx';

function formatSAR(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
}

function isAdminOrAuditor(role?: string) {
  return role === 'Admin' || role === 'Auditor';
}

type PeriodKey = 'mtd' | '7d' | '14d' | '30d' | 'yest';

export default function OffersPage() {
  const user = getCurrentUser();
  const [data, setData] = useState<any>(null);
  const [mgmt, setMgmt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manager, setManager] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodKey>('mtd');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all | Enabled | Disabled

  useEffect(() => {
    loadOffersData()
      .then(setData)
      .catch((e) => setErr(e?.message || String(e)));
    loadManagementData().then(setMgmt).catch(() => { });
  }, []);

  const effectiveManager = useMemo(() => {
    if (isAdminOrAuditor(user?.role)) return manager;
    return user?.name || manager;
  }, [manager, user?.name, user?.role]);

  const { managers, branches, cities, allowedStoreIds } = useMemo(() => {
    const meta: Record<string, { manager?: string; city?: string }> = mgmt?.store_meta || {};
    const stores = mgmt?.stores || {};
    const managersSet = new Set<string>();
    const citiesSet = new Set<string>();
    Object.values(meta).forEach((m: any) => {
      if (m?.manager) managersSet.add(String(m.manager));
      if (m?.city) citiesSet.add(String(m.city));
    });
    const managers = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const cities = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ar'));
    const branches = Object.keys(stores)
      .filter((sid) => {
        const m = meta[sid];
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return false;
        if (city !== 'all' && String(m?.city || '') !== city) return false;
        return true;
      })
      .sort((a, b) => (stores[a] || a).localeCompare(stores[b] || b, 'ar'));
    const allowed = new Set<string>();
    if (branch === 'all' && effectiveManager === 'all' && city === 'all') {
      Object.keys(stores).forEach((sid) => allowed.add(sid));
    } else {
      Object.keys(meta).forEach((sid) => {
        const m = meta[sid];
        if (branch !== 'all' && sid !== branch) return;
        if (effectiveManager !== 'all' && String(m?.manager || '') !== effectiveManager) return;
        if (city !== 'all' && String(m?.city || '') !== city) return;
        allowed.add(sid);
      });
      if (allowed.size === 0) Object.keys(stores).forEach((sid) => allowed.add(sid));
    }
    return { managers, branches, cities, allowedStoreIds: allowed };
  }, [mgmt, branch, city, effectiveManager]);

  const rawOffers = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : (Array.isArray(data?.offers) ? data.offers : []);
  }, [data]);

  const today = useMemo(() => new Date('2026-02-04'), []); // Using metadata time

  // No dateRange needed anymore

  // No periodSuf needed anymore

  const offers = useMemo(() => {
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(today.getDate() - 1);
    const yesterdayYMD = yesterdayDate.toISOString().split('T')[0];

    const mtdStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const mtdStartYMD = mtdStart.toISOString().split('T')[0];

    return rawOffers.map((o: any) => {
      let yestSales = 0, yestDisc = 0, yestOps = 0;
      let mtdSales = 0, mtdDisc = 0, mtdOps = 0;

      const statsArray = o.stats || [];
      statsArray.forEach((s: any) => {
        const d = s.d;
        const sid = String(s.s);
        if (!allowedStoreIds.has(sid)) return;

        // MTD
        if (d >= mtdStartYMD && d <= yesterdayYMD) {
          mtdSales += Number(s.bill ?? s.sale ?? 0);
          mtdDisc += Number(s.disc ?? 0);
          mtdOps += Number(s.cnt ?? 0);
        }
        // Yesterday
        if (d === yesterdayYMD) {
          yestSales += Number(s.bill ?? s.sale ?? 0);
          yestDisc += Number(s.disc ?? 0);
          yestOps += Number(s.cnt ?? 0);
        }
      });

      // Legacy/Fallback check
      if (mtdSales === 0 && mtdOps === 0 && o.stores) {
        Object.keys(o.stores).forEach(sid => {
          if (allowedStoreIds.has(String(sid))) {
            const sObj = o.stores[sid] || {};
            mtdSales += Number(sObj.s_m ?? 0);
            mtdDisc += Number(sObj.d_m ?? 0);
            mtdOps += Number(sObj.t_m ?? 0);
            yestSales += Number(sObj.s_y ?? 0);
            yestDisc += Number(sObj.d_y ?? 0);
            yestOps += Number(sObj.t_y ?? 0);
          }
        });
      }

      return {
        ...o,
        yestSales, yestDisc, yestOps,
        mtdSales, mtdDisc, mtdOps,
        yestEff: yestSales > 0 ? (yestSales / (yestSales + yestDisc)) * 100 : 100,
        mtdEff: mtdSales > 0 ? (mtdSales / (mtdSales + mtdDisc)) * 100 : 100,
      };
    }).filter((o: any) => {
      if (statusFilter === 'Enabled' && (o.status === 'Disabled' || o.enabled === false)) return false;
      if (statusFilter === 'Disabled' && (o.status !== 'Disabled' && o.enabled !== false)) return false;
      return o.mtdSales > 0 || o.mtdOps > 0 || o.yestSales > 0;
    });
  }, [rawOffers, allowedStoreIds, today, statusFilter]);

  const stats = useMemo(() => {
    const res = offers.reduce((acc: any, o: any) => {
      acc.totalYest += o.yestSales;
      acc.totalMTD += o.mtdSales;
      acc.totalYestOps += o.yestOps;
      acc.totalMTDOps += o.mtdOps;
      acc.totalMTDDisc += o.mtdDisc;
      return acc;
    }, { totalYest: 0, totalMTD: 0, totalYestOps: 0, totalMTDOps: 0, totalMTDDisc: 0 });

    return {
      ...res,
      totalOffers: offers.length,
      mtdEff: res.totalMTD > 0 ? (res.totalMTD / (res.totalMTD + res.totalMTDDisc)) * 100 : 0
    };
  }, [offers]);

  const exportToExcel = () => {
    const rows = offers.map((o: any) => ({
      'كود العرض': o.code,
      'اسم العرض': o.name,
      'الحالة': o.status === 'Enabled' ? 'مفعل' : 'معطل',
      'مبيعات أمس': o.yestSales,
      'مبيعات MTD': o.mtdSales,
      'عمليات أمس': o.yestOps,
      'عمليات MTD': o.mtdOps,
      'خصم MTD': o.mtdDisc,
      'كفاءة MTD %': o.mtdEff.toFixed(1) + '%'
    }));

    const mtdStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const mtdStartYMD = mtdStart.toISOString().split('T')[0];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Offers Report');
    XLSX.writeFile(wb, `Offers_Report_MTD_${mtdStartYMD}.xlsx`);
  };

  const top5 = useMemo(() => {
    return [...offers]
      .sort((a: any, b: any) => b.mtdSales - a.mtdSales)
      .slice(0, 5);
  }, [offers]);

  const filteredOffers = useMemo(() => {
    return offers.filter((o: any) => o.mtdEff > 0 && o.mtdEff < 50);
  }, [offers]);

  const weakOffers = useMemo(() => {
    return [...filteredOffers]
      .sort((a: any, b: any) => a.mtdEff - b.mtdEff)
      .slice(0, 5);
  }, [offers]);

  if (err) return <div className="p-6 bg-white rounded-2xl border border-neutral-200 text-red-600 font-semibold">{err}</div>;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  const periodLabels: Record<PeriodKey, string> = { mtd: 'الشهر الحالي', '7d': '7 أيام', '14d': '14 يوم', '30d': '30 يوم', yest: 'أمس' };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">تحليل العروض</h1>
          <p className="text-neutral-500 mt-1">أداء العروض والخصومات حسب الفترة والمعرض</p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-bold shadow-md"
        >
          <DownloadIcon />
          تصدير Excel
        </button>
      </header>

      {/* شريط الفلاتر — هوية التطبيق */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-sm font-semibold text-neutral-600">الفترة (للمقارنة):</span>
          <div className="flex flex-wrap gap-2">
            <PeriodButton active={period === 'yest'} label="أمس" onClick={() => setPeriod('yest')} />
            <PeriodButton active={period === 'mtd'} label="الشهر الحالي" onClick={() => setPeriod('mtd')} />
          </div>
          <span className="text-xs text-neutral-400 mr-auto">يتم عرض بيانات "أمس" و "تراكمي الشهر" جنباً إلى جنب تلقائياً.</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {isAdminOrAuditor(user?.role) && (
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">مدير المنطقة</label>
              <select className="input w-full" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="all">الكل</option>
                {managers.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">الفرع</label>
            <select className="input w-full" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="all">كافة الفروع</option>
              {branches.map((code) => (
                <option key={code} value={code}>{mgmt?.stores?.[code] || code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">المدينة</label>
            <select className="input w-full" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">الكل</option>
              {(cities || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">الحالة</label>
            <select className="input w-full" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">الكل</option>
              <option value="Enabled">فعال (Enabled)</option>
              <option value="Disabled">معطل (Disabled)</option>
            </select>
          </div>
        </div>
      </div>

      {/* بطاقات المؤشرات — 6 كروت مثل الريبو الأصلي */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center identity-card">
          <div className="text-xs font-semibold text-neutral-500">إجمالي العروض</div>
          <div className="text-xl font-bold text-orange-600 mt-1">{stats.totalOffers}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: '4px solid #10b981' }}>
          <div className="text-xs font-semibold text-neutral-500">مبعيات أمس</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{formatSAR(stats.totalYest)}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: '4px solid #10b981' }}>
          <div className="text-xs font-semibold text-neutral-500">مبيعات MTD</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{formatSAR(stats.totalMTD)}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: '4px solid #3b82f6' }}>
          <div className="text-xs font-semibold text-neutral-500">عمليات MTD</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{stats.totalMTDOps.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 text-center" style={{ borderRight: '4px solid #8b5cf6' }}>
          <div className="text-xs font-semibold text-neutral-500">كفاءة MTD</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{stats.mtdEff.toFixed(1)}%</div>
        </div>
      </div>

      {/* أفضل 5 عروض */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
        <h2 className="text-lg font-bold text-neutral-900 mb-4 border-r-4 border-orange-500 pr-2">🏆 أفضل 5 عروض (Top 5 Offers)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {top5.length === 0 ? (
            <p className="text-neutral-500 col-span-full">لا توجد عروض لعرضها.</p>
          ) : (
            top5.map((o: any, i: number) => {
              const sales = o.mtdSales;
              const discount = o.mtdDisc;
              const ops = o.mtdOps;
              const pct = stats.totalMTD > 0 ? (sales / stats.totalMTD) * 100 : 0;
              return (
                <div key={i} className="rounded-xl border border-neutral-200 p-4 border-r-4 border-r-orange-500 bg-neutral-50/50 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-orange-600">#{i + 1}</span>
                    <span className="text-sm font-bold text-neutral-700">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="font-semibold text-neutral-900 text-sm mb-3 line-clamp-2">{o.name || o.offer_name || o.id || '-'}</div>
                  <div className="text-xs space-y-1 text-neutral-600">
                    <div>مبيعات MTD: {formatSAR(sales)}</div>
                    <div>مبيعات أمس: {formatSAR(o.yestSales)}</div>
                    <div>العمليات: {ops.toLocaleString()}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* عروض ضعيفة الأداء */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
        <h2 className="text-lg font-bold text-neutral-900 mb-4 border-r-4 border-red-500 pr-2">⚠️ عروض ضعيفة الأداء (Low Performance Offers)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {weakOffers.length === 0 ? (
            <p className="text-neutral-500 col-span-full">لا توجد عروض ضعيفة الأداء حسب معيار الكفاءة.</p>
          ) : (
            weakOffers.map((o: any, i: number) => {
              const sales = Number(o.filteredSales ?? o.sales ?? 0) || 0;
              const discount = Number(o.discount ?? 0) || 0;
              const ops = Number(o.operations ?? 0) || 0;
              const eff = Number(o.efficiency ?? 0) || 0;
              return (
                <div key={i} className="rounded-xl border border-red-200 p-4 bg-red-50/50 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-red-600">⚠️</span>
                    <span className="text-sm font-bold text-red-700">{eff.toFixed(1)}%</span>
                  </div>
                  <div className="font-semibold text-neutral-900 text-sm mb-3 line-clamp-2">{o.name || o.offer_name || o.id || '-'}</div>
                  <div className="text-xs space-y-1 text-neutral-600">
                    <div>المبيعات: {formatSAR(sales)}</div>
                    <div>الخصم: {discount.toLocaleString()}</div>
                    <div>العمليات: {ops.toLocaleString()}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* قائمة العروض */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-l from-orange-50 to-white">
          <h3 className="text-lg font-bold text-neutral-900">📋 قائمة العروض (Offers List)</h3>
        </div>
        <div className="overflow-x-auto">
          {offers.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">لا توجد عروض بعد تطبيق الفلاتر.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-800 text-white">
                  <th className="py-3 px-4 text-right">#</th>
                  <th className="py-3 px-4 text-right">اسم العرض</th>
                  <th className="py-3 px-4 text-center bg-neutral-700/50">مبيعات أمس</th>
                  <th className="py-3 px-4 text-center bg-neutral-700/50">فواتير أمس</th>
                  <th className="py-3 px-4 text-center">مبيعات MTD</th>
                  <th className="py-3 px-4 text-center">فواتير MTD</th>
                  <th className="py-3 px-4 text-center">خصم MTD</th>
                  <th className="py-3 px-4 text-center">كفاءة MTD</th>
                </tr>
              </thead>
              <tbody>
                {offers.slice(0, 100).map((o: any, i: number) => (
                  <tr key={i} className="border-b border-neutral-100 hover:bg-orange-50 transition-colors">
                    <td className="py-3 px-4 text-neutral-500">{i + 1}</td>
                    <td className="py-3 px-4 font-bold text-neutral-900">{o.name || o.offer_name || o.id || '-'}</td>
                    <td className="py-3 px-4 text-center font-bold text-green-600 bg-green-50/30">{formatSAR(o.yestSales)}</td>
                    <td className="py-3 px-4 text-center text-neutral-600 bg-green-50/30">{o.yestOps.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center font-bold text-blue-700">{formatSAR(o.mtdSales)}</td>
                    <td className="py-3 px-4 text-center font-medium">{o.mtdOps.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center text-red-500 font-mono">{o.mtdDisc.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center font-black text-orange-600">{o.mtdEff.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${active ? 'bg-orange-600 text-white shadow-md' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
        }`}
    >
      {label}
    </button>
  );
}
