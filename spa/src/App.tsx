import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getCurrentUser } from './auth/storage';
import MainLayout from './layout/MainLayout';
import LoginPage from './pages/LoginPage';
import { Suspense } from 'react';
import { DashboardSkeleton } from './components/SkeletonComponents';

// Lazy Load Pages
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const EmployeesPage = React.lazy(() => import('./pages/EmployeesPage'));
const StoresPage = React.lazy(() => import('./pages/StoresPage'));
const ProductsPage = React.lazy(() => import('./pages/ProductsPage'));
const OffersPage = React.lazy(() => import('./pages/OffersPage'));
const TargetSettingPage = React.lazy(() => import('./pages/TargetSettingPage'));
const CommissionsPage = React.lazy(() => import('./pages/CommissionsPage'));
const ComparisonPage = React.lazy(() => import('./pages/ComparisonPage'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const u = getCurrentUser();
  if (!u) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Suspense fallback={<DashboardSkeleton />}><DashboardPage /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<DashboardSkeleton />}><ReportsPage /></Suspense>} />
        <Route path="employees" element={<Suspense fallback={<DashboardSkeleton />}><EmployeesPage /></Suspense>} />
        <Route path="stores" element={<Suspense fallback={<DashboardSkeleton />}><StoresPage /></Suspense>} />
        <Route path="products" element={<Suspense fallback={<DashboardSkeleton />}><ProductsPage /></Suspense>} />
        <Route path="offers" element={<Suspense fallback={<DashboardSkeleton />}><OffersPage /></Suspense>} />

        <Route path="targets" element={<Suspense fallback={<DashboardSkeleton />}><TargetSettingPage /></Suspense>} />
        <Route path="commissions" element={<Suspense fallback={<DashboardSkeleton />}><CommissionsPage /></Suspense>} />
        <Route path="comparison" element={<Suspense fallback={<DashboardSkeleton />}><ComparisonPage /></Suspense>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
