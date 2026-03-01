import React, { useMemo, useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearCurrentUser, getCurrentUser } from '../auth/storage';
import GlobalSearch from '../components/GlobalSearch';
import SeasonBanner from '../components/SeasonBanner';
import {
  CashIcon,
  ClipboardListIcon,
  CubeIcon,
  HomeIcon,
  LogoutIcon,
  MenuIcon,
  OfficeBuildingIcon,
  SwitchHorizontalIcon,
  TagIcon,
  TargetIcon,
  UserGroupIcon,
  SearchIcon,
  FireIcon, // Added
  XIcon, // For modal close if needed
} from '../components/Icons';
import { loadManagementData, loadProductAnalysisData, loadStockData } from '../services/upstreamData';
import { ProductInquiryModal } from '../components/products/ProductInquiryModal';
import { LiveSalesModal } from '../components/dashboard/LiveSalesModal';
import { formatSAR } from '../utils/formatting';

const baseNavItems = [
  { to: '/', label: 'لوحة التحكم', icon: <HomeIcon /> },
  { to: '/stores', label: 'المعارض', icon: <OfficeBuildingIcon /> },
  { to: '/comparison', label: 'المقارنات', icon: <SwitchHorizontalIcon /> },
  { to: '/employees', label: 'الموظفين', icon: <UserGroupIcon /> },
  { to: '/commissions', label: 'العمولات', icon: <CashIcon /> },
  { to: '/products', label: 'المنتجات', icon: <CubeIcon /> },
  { to: '/offers', label: 'قائمة العروض', icon: <TagIcon /> },
  { to: '/reports', label: 'التقارير', icon: <ClipboardListIcon /> },
];

const targetsNavItem = { to: '/targets', label: 'تحديد الأهداف', icon: <TargetIcon /> };

function NavItem({ to, label, icon, onClick }: { to: string; label: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <li>
      <NavLink
        to={to}
        onClick={onClick}
        className={({ isActive }) =>
          `group relative flex items-center p-3 rounded-xl cursor-pointer transition-all duration-300 ${isActive ? 'active' : ''} ${isActive
            ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold shadow-lg'
            : 'text-neutral-600 hover:bg-orange-50 hover:text-orange-600 hover:shadow-md'
          }`
        }
      >
        <div className="relative z-10 flex items-center w-full">
          <div className="p-2 rounded-lg transition-all duration-200 flex-shrink-0 bg-neutral-100 group-hover:bg-orange-100 group-[.active]:bg-white/20">
            {icon}
          </div>
          <span className="ms-3 font-medium text-sm whitespace-nowrap">{label}</span>
        </div>

        {/* Active Indicator */}
        <div className="absolute right-3 w-2 h-2 bg-white rounded-full shadow-sm opacity-0 group-[.active]:opacity-100 transition-opacity" />
      </NavLink>
    </li>
  );
}

export default function MainLayout() {
  const nav = useNavigate();
  const user = getCurrentUser();
  const loc = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isInquiryOpen, setIsInquiryOpen] = useState(false);
  const [globalProducts, setGlobalProducts] = useState<any[]>([]);
  const [globalHistory, setGlobalHistory] = useState<Record<string, any[]>>({});
  const [globalMeta, setGlobalMeta] = useState<any>(null);

  // Live Sales Modal State
  const [liveModalOpen, setLiveModalOpen] = useState(false);


  // Global Keyboard Shortcut for Search (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems = useMemo(() => {
    const isBranchManager = user?.role === 'BranchManager';
    const canTargets = user?.role === 'Admin' || user?.name === 'Sales Manager';

    let items = [...baseNavItems];

    // Hide Reports for BranchManager
    if (isBranchManager) {
      items = items.filter(i => i.to !== '/reports');
    }

    if (canTargets) {
      items = [...items, targetsNavItem];
    }

    return items;
  }, [user?.role, user?.name]);
  const activeLabel = useMemo(() => {
    const hit = navItems.find((i) => i.to === loc.pathname);
    return hit?.label ?? 'لوحة التحكم';
  }, [loc.pathname, navItems]);

  // Helper to load/refresh data
  const loadInquiryData = async () => {
    try {
      const [mgmtRaw, prodRaw, stockRaw] = await Promise.all([
        loadManagementData(),
        loadProductAnalysisData(),
        loadStockData()
      ]);
      setGlobalMeta(mgmtRaw);
      const getP = (p: string) => prodRaw.periods?.[p]?.catalog && Object.keys(prodRaw.periods[p].catalog).length > 0 ? prodRaw.periods[p] : null;
      const pData = getP('mtd') || getP('30d') || getP('14d') || getP('7d') || null;
      if (!pData) return;

      const history = prodRaw.product_daily_history || {};
      setGlobalHistory(history);

      // --- STOCK PROCESSING LOGIC ---
      const storesMap: Record<string, string> = mgmtRaw.stores || {};
      // Invert storesMap for Name -> ID lookup
      const storeNameTokId: Record<string, string> = {};
      Object.entries(storesMap).forEach(([id, name]) => {
        if (name) storeNameTokId[name.trim().toLowerCase()] = id;
      });

      // [NEW] Explicit Mappings for data consistency
      storeNameTokId['warehouse riyadh'] = '0'; // Map Riyadh Warehouse to Main Warehouse (ID 0)
      storeNameTokId['transit'] = '0';          // Map Transit to Main Warehouse or ignore
      storeNameTokId['warehouse'] = '0';        // Ensure generic Warehouse is mapped

      const stockMap = new Map<string, { total: number; byStore: Record<string, number> }>();
      const safeNum = (x: any) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

      if (Array.isArray(stockRaw)) {
        stockRaw.forEach((item: any) => {
          const code = String(item.code || '').trim();
          const alias = String(item.alias || '').trim();
          const totalQty = safeNum(item.stock);

          if (!code && !alias) return;

          let entry = (code ? stockMap.get(code) : undefined) || (alias ? stockMap.get(alias) : undefined);
          if (!entry) {
            entry = { total: 0, byStore: {} };
            if (code) stockMap.set(code, entry);
            if (alias) stockMap.set(alias, entry);
          } else {
            if (code && !stockMap.has(code)) stockMap.set(code, entry);
            if (alias && !stockMap.has(alias)) stockMap.set(alias, entry);
          }

          // Update Total
          entry.total += totalQty;

          // Process Branches
          if (item.branches && typeof item.branches === 'object') {
            Object.entries(item.branches).forEach(([brName, brQty]) => {
              const qty = safeNum(brQty);
              if (qty !== 0) {
                const cleanName = brName.trim();
                const normalizedParams = cleanName.toLowerCase();
                const sid = storeNameTokId[normalizedParams] || storeNameTokId[cleanName] || null;

                // If we found a store ID, map it. 
                if (sid) {
                  entry.byStore[sid] = (entry.byStore[sid] || 0) + qty;
                } else {
                  // Fallback: If no ID found, keep name as key (though UI might not show it)
                  // useful for debugging or future features
                  entry.byStore[cleanName] = (entry.byStore[cleanName] || 0) + qty;
                }
              }
            });
          } else {
            // Fallback for flat structure if branches is missing 
            const outlet = String(item.outlet || '').trim();
            const sid = storeNameTokId[outlet] || outlet;
            if (totalQty !== 0 && sid) {
              entry.byStore[sid] = (entry.byStore[sid] || 0) + totalQty;
            }
          }
        });
      }
      // -----------------------------

      const catalog: Record<string, any[]> = (pData?.catalog || {}) as any;
      const rows: any[] = [];
      Object.entries(catalog).forEach(([catName, items]) => {
        if (!Array.isArray(items)) return;
        for (const it of items) {
          const id = String(it?.id || '');
          const name = String(it?.name || id);
          const alias = String(it?.alias || '').trim();
          const dCode = String(it?.dCode || '').trim(); // dCode usually matches code in stock
          const stores = it?.stores || {};
          let qty = 0;
          let amount = 0;
          const salesByStore: Record<string, { q: number; a: number }> = {};

          for (const [sid, stData] of Object.entries(stores)) {
            const q = Number((stData as any)?.q) || 0;
            const a = Number((stData as any)?.a) || 0;
            qty += q;
            amount += a;
            salesByStore[sid] = { q, a };
          }

          // Stock Lookup
          // Try Alias or dCode (ID) or just ID
          let stockEntry = stockMap.get(alias) || stockMap.get(dCode) || stockMap.get(id);

          rows.push({
            id,
            name,
            alias,
            category: String(catName),
            qty,
            amount,
            salesByStore,
            stockByStore: stockEntry?.byStore || {},
            stock: stockEntry?.total || 0
          });
        }
      });
      setGlobalProducts(rows);
    } catch (err) {
      console.error('Failed to load inquiry data:', err);
    }
  };

  // Auto-refresh inquiry data every 15 minutes
  useEffect(() => {
    // Initial load
    loadInquiryData();

    const interval = setInterval(() => {
      loadInquiryData();
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, []);

  const openInquiry = async () => {
    setIsInquiryOpen(true);
    if (globalProducts.length === 0) {
      await loadInquiryData();
    }
  };

  const sidebarHidden = !isSidebarOpen;
  return (
    <div className="relative flex bg-neutral-50 min-h-screen">
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} user={user} mgmtData={globalMeta} />

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* القائمة الجانبية - هوية أسود وبرتقالي */}
      <aside
        className={`main-layout-sidebar w-64 sm:w-72 bg-white border-neutral-200 h-screen flex flex-col fixed top-0 bottom-0 z-30 shadow-2xl transition-transform duration-300 ease-in-out
          ${sidebarHidden ? 'main-layout-sidebar--closed' : ''}
        `}
      >
        <div className="p-4 sm:p-6 border-b border-neutral-200" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex-shrink-0">
              <img src="./icon-192.png" alt="Orange" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-xl font-bold text-neutral-900">COCKPIT</div>
              <div className="text-sm text-orange-600">Orange Dashboard</div>
            </div>
          </div>
        </div>

        {/* Today's Sales Button (Global) */}


        <nav className="flex-grow overflow-y-auto p-3 sm:p-4">
          <ul className="space-y-2">
            {navItems.map((i) => (
              <NavItem key={i.to} to={i.to} label={i.label} icon={i.icon} onClick={() => setIsSidebarOpen(false)} />
            ))}
          </ul>
        </nav>

        <div className="p-3 sm:p-4 border-t border-neutral-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
              <span className="text-sm font-bold">{(user?.name?.[0] || 'U').toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-900 truncate">{user?.name ?? 'User'}</p>
              <p className="text-xs text-neutral-500">{user?.role ?? '-'}</p>
            </div>
          </div>
          <button
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm bg-neutral-100 hover:bg-red-50 text-neutral-600 hover:text-red-600 border border-neutral-200 transition-colors"
            onClick={() => {
              clearCurrentUser();
              nav('/login');
            }}
          >
            <LogoutIcon /> خروج
          </button>
          <p className="text-[10px] text-neutral-400 text-center mt-3">Developed By Khaleel Alsani</p>
        </div>
      </aside>

      <main className="main-layout-main p-2 sm:p-4 md:p-6 bg-neutral-50 pt-safe">
        <header className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-3 sm:p-5 mb-3 sm:mb-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <button
                className="md:hidden p-3 text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all duration-200"
                onClick={() => setIsSidebarOpen(true)}
              >
                <MenuIcon />
              </button>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 truncate max-w-[65vw] sm:max-w-none">{activeLabel}</h2>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              {/* Target div for Dashboard's Daily Report Button Portal */}
              <div id="daily-report-portal-target"></div>

              <button
                onClick={() => window.open('#/tv', '_blank')}
                className="hidden md:flex bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-md items-center gap-2 hover:scale-105 transition-transform"
                title="شاشة العرض (TV Mode)"
              >
                <span className="text-lg leading-none">📺</span>
                <span className="font-bold text-xs sm:text-sm whitespace-nowrap">وضع الشاشة</span>
              </button>

              <button
                onClick={() => setLiveModalOpen(true)}
                className="flex bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl shadow-md items-center gap-2 animate-pulse hover:scale-105 transition-transform border border-orange-400"
              >
                <div className="w-5 h-5"><FireIcon /></div>
                <span className="font-bold text-xs sm:text-sm whitespace-nowrap">مبيعات اليوم</span>
              </button>

              <div className="flex bg-neutral-100 p-1 rounded-2xl gap-1">
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-neutral-600 hover:bg-white hover:text-orange-600 hover:shadow-sm transition-all group border border-transparent"
                  title="بحث النظام (Ctrl+K)"
                >
                  <SearchIcon className="h-5 w-5" />
                  <span className="hidden lg:inline font-bold text-sm">بحث النظام</span>
                </button>

                <button
                  onClick={openInquiry}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-neutral-600 hover:bg-white hover:text-orange-600 hover:shadow-sm transition-all group border border-transparent"
                >
                  <CubeIcon className="h-5 w-5" />
                  <span className="hidden lg:inline font-bold text-sm">استعلام منتج</span>
                </button>
              </div>

              <button
                className="btn-secondary py-2.5 px-5 flex items-center gap-2"
                onClick={() => {
                  clearCurrentUser();
                  nav('/login');
                }}
              >
                <LogoutIcon className="h-4 w-4" />
                <span className="hidden sm:inline">خروج</span>
              </button>
            </div>
          </div>
        </header>

        <ProductInquiryModal
          isOpen={isInquiryOpen}
          onClose={() => setIsInquiryOpen(false)}
          products={globalProducts}
          history={globalHistory}
          formatSAR={formatSAR}
          mgmtData={globalMeta}
          user={user}
        />

        <SeasonBanner />

        <Outlet />
      </main>

      {/* Global Live Sales Modal */}
      <LiveSalesModal
        isOpen={liveModalOpen}
        onClose={() => setLiveModalOpen(false)}
        formatSAR={formatSAR}
      />
    </div>
  );
}

