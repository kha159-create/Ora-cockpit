import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getCurrentUser } from './auth/storage';
import MainLayout from './layout/MainLayout';
import LoginPage from './pages/LoginPage';
import { Suspense } from 'react';
import { DashboardSkeleton } from './components/SkeletonComponents';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy Load Pages
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const EmployeesPage = React.lazy(() => import('./pages/EmployeesPage'));
const WatchSalesPage = React.lazy(() => import('./pages/WatchSalesPage'));
const StoresPage = React.lazy(() => import('./pages/StoresPage'));
const ProductsPage = React.lazy(() => import('./pages/ProductsPage'));
const OffersPage = React.lazy(() => import('./pages/OffersPage'));
const TargetSettingPage = React.lazy(() => import('./pages/TargetSettingPage'));
const CommissionsPage = React.lazy(() => import('./pages/CommissionsPage'));
const ComparisonPage = React.lazy(() => import('./pages/ComparisonPage'));
const HourlyPage = React.lazy(() => import('./pages/HourlyPage'));
const TVPage = React.lazy(() => import('./pages/TVPage'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const u = getCurrentUser();
  if (!u) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<DashboardSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/watch" element={<PageWrap><WatchSalesPage /></PageWrap>} />
      <Route path="/tv" element={<RequireAuth><PageWrap><TVPage /></PageWrap></RequireAuth>} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<PageWrap><DashboardPage /></PageWrap>} />
        <Route path="reports" element={<PageWrap><ReportsPage /></PageWrap>} />
        <Route path="employees" element={<PageWrap><EmployeesPage /></PageWrap>} />
        <Route path="stores" element={<PageWrap><StoresPage /></PageWrap>} />
        <Route path="products" element={<PageWrap><ProductsPage /></PageWrap>} />
        <Route path="offers" element={<PageWrap><OffersPage /></PageWrap>} />
        <Route path="targets" element={<PageWrap><TargetSettingPage /></PageWrap>} />
        <Route path="commissions" element={<PageWrap><CommissionsPage /></PageWrap>} />
        <Route path="comparison" element={<PageWrap><ComparisonPage /></PageWrap>} />
        <Route path="hourly" element={<PageWrap><HourlyPage /></PageWrap>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
