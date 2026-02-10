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
} from '../components/Icons';
import { loadManagementData, loadProductAnalysisData } from '../services/upstreamData';
import { ProductInquiryModal } from '../components/products/ProductInquiryModal';
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
] as const;

const targetsNavItem = { to: '/targets', label: 'تحديد الأهداف', icon: <TargetIcon /> } as const;

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
    const canTargets = user?.role === 'Admin' || user?.name === 'Sales Manager';
    return canTargets ? [...baseNavItems, targetsNavItem] : baseNavItems;
  }, [user?.role, user?.name]);
  const activeLabel = useMemo(() => {
    const hit = navItems.find((i) => i.to === loc.pathname);
    return hit?.label ?? 'لوحة التحكم';
  }, [loc.pathname, navItems]);

  const openInquiry = async () => {
    setIsInquiryOpen(true);
    if (globalProducts.length > 0) return;

    try {
      const [mgmtRaw, prodRaw] = await Promise.all([loadManagementData(), loadProductAnalysisData()]);
      setGlobalMeta(mgmtRaw);
      const pData = prodRaw.periods?.['mtd'] || null;
      if (!pData) return;

      const history = prodRaw.product_daily_history || {};
      setGlobalHistory(history);

      const catalog: Record<string, any[]> = (pData?.catalog || {}) as any;
      const rows: any[] = [];
      Object.entries(catalog).forEach(([catName, items]) => {
        if (!Array.isArray(items)) return;
        for (const it of items) {
          const id = String(it?.id || '');
          const name = String(it?.name || id);
          const alias = String(it?.alias || '');
          const stores = it?.stores || {};
          let qty = 0;
          let amount = 0;
          const salesByStore: Record<string, { q: number; a: number }> = {};
          for (const [sid, stData] of Object.entries(stores)) {
            qty += Number((stData as any)?.q) || 0;
            amount += Number((stData as any)?.a) || 0;
            salesByStore[sid] = {
              q: Number((stData as any)?.q) || 0,
              a: Number((stData as any)?.a) || 0
            };
          }
          rows.push({ id, name, alias: String(alias), category: String(catName), qty, amount, salesByStore });
        }
      });
      setGlobalProducts(rows);
    } catch (err) {
      console.error('Failed to load inquiry data:', err);
    }
  };

  const sidebarHidden = !isSidebarOpen;
  return (
    <div className="relative flex bg-neutral-50 min-h-screen">
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

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

            <div className="flex items-center gap-3 flex-shrink-0">
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
        />

        <SeasonBanner />

        <Outlet />
      </main>
    </div>
  );
}

