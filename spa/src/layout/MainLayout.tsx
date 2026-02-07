import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearCurrentUser, getCurrentUser } from '../auth/storage';
import {
  ClipboardListIcon,
  CubeIcon,
  HomeIcon,
  LogoutIcon,
  MenuIcon,
  OfficeBuildingIcon,
  PauseIcon,
  TagIcon,
  TargetIcon,
  UserGroupIcon,
  XIcon,
} from '../components/Icons';

const baseNavItems = [
  { to: '/', label: 'لوحة التحكم', icon: <HomeIcon /> },
  { to: '/reports', label: 'التقارير', icon: <ClipboardListIcon /> },
  { to: '/employees', label: 'الموظفين', icon: <UserGroupIcon /> },
  { to: '/stores', label: 'المعارض', icon: <OfficeBuildingIcon /> },
  { to: '/products', label: 'المنتجات', icon: <CubeIcon /> },
  { to: '/offers', label: 'تحليل العروض', icon: <TagIcon /> },
  { to: '/commissions', label: 'العمولات', icon: <CurrencyDollarIcon /> }, // Added Commissions
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
  const [isSearchOpen, setIsSearchOpen] = useState(false); // Added isSearchOpen state

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
        <div className="p-4 sm:p-6 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">O</span>
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
        </div>
      </aside>

      <main className="main-layout-main p-2 sm:p-4 md:p-6 bg-neutral-50">
        <header className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-3 sm:p-6 mb-3 sm:mb-6">
          <div className="flex justify-between items-center flex-wrap gap-3">
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

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-2 sm:p-2.5 rounded-xl text-neutral-500 hover:bg-neutral-100 hover:text-orange-600 transition-colors"
                title="بحث (Ctrl+K)"
              >
                <SearchIcon />
              </button>

              {isSidebarOpen && (
                <button className="md:hidden p-2 rounded-lg hover:bg-neutral-100" onClick={() => setIsSidebarOpen(false)}>
                  <XIcon />
                </button>
              )}
              <button
                className="btn-secondary py-2 px-4"
                onClick={() => {
                  clearCurrentUser();
                  nav('/login');
                }}
              >
                خروج
              </button>
            </div>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}

