import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getCurrentUser } from './auth/storage';
import MainLayout from './layout/MainLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import StoresPage from './pages/StoresPage';
import ProductsPage from './pages/ProductsPage';
import ReportsPage from './pages/ReportsPage';
import OffersPage from './pages/OffersPage';

import TargetSettingPage from './pages/TargetSettingPage';

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
        <Route index element={<DashboardPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="stores" element={<StoresPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="offers" element={<OffersPage />} />

        <Route path="targets" element={<TargetSettingPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

