import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearCurrentUser, getCurrentUser } from '../auth/storage';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/reports', label: 'Reports' },
  { to: '/employees', label: 'Employees' },
  { to: '/stores', label: 'Stores' },
  { to: '/products', label: 'Products' },
];

export default function MainLayout() {
  const nav = useNavigate();
  const user = getCurrentUser();

  return (
    <div className="relative md:flex bg-neutral-50 min-h-screen">
      <aside className="w-64 bg-white border-r border-neutral-200 h-screen hidden md:flex md:flex-col fixed inset-y-0 rtl:right-0 ltr:left-0 shadow-xl">
        <div className="p-6 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">O</span>
            </div>
            <div>
              <div className="text-xl font-bold text-neutral-900">COCKPIT</div>
              <div className="text-sm text-neutral-500">Orange Dashboard</div>
            </div>
          </div>
        </div>

        <nav className="p-4 flex-1 overflow-y-auto">
          <ul className="space-y-2">
            {navItems.map((i) => (
              <li key={i.to}>
                <NavLink
                  to={i.to}
                  className={({ isActive }) =>
                    `block px-4 py-3 rounded-xl transition-all duration-200 font-semibold ${
                      isActive
                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg'
                        : 'text-neutral-600 hover:bg-orange-50 hover:text-orange-600'
                    }`
                  }
                >
                  {i.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-neutral-200">
          <div className="text-sm font-semibold text-neutral-900 truncate">{user?.name ?? 'User'}</div>
          <div className="text-xs text-neutral-500">{user?.role ?? '-'}</div>
          <button
            className="btn-secondary w-full mt-3"
            onClick={() => {
              clearCurrentUser();
              nav('/login');
            }}
          >
            خروج
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:ltr:ml-64 md:rtl:mr-64">
        <header className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xl font-bold text-neutral-900">Orange Cockpit</div>
            <button
              className="btn-secondary"
              onClick={() => {
                clearCurrentUser();
                nav('/login');
              }}
            >
              Logout
            </button>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}

