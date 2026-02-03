import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getCurrentUser } from './auth/storage';
import MainLayout from './layout/MainLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import StoresPage from './pages/StoresPage';
import ProductsPage from './pages/ProductsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const u = getCurrentUser();
  if (!u) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const Placeholder = ({ title }: { title: string }) => (
  <div className="p-6 bg-white rounded-2xl shadow-lg border border-neutral-200">
    <div className="text-xl font-bold text-neutral-900">{title}</div>
    <div className="text-sm text-neutral-500 mt-2">سيتم نقل هذه الصفحة بالكامل من تصميم cockpit مع ربط بيانات JSON.</div>
  </div>
);

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
        <Route path="reports" element={<Placeholder title="Reports" />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="stores" element={<StoresPage />} />
        <Route path="products" element={<ProductsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

