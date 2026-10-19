import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import { Loader2 } from 'lucide-react';

// Auth pages (eager-load since they're shown first)
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

// App pages (lazy-loaded for performance)
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const AssetsPage = lazy(() => import('./pages/assets/AssetsPage'));
const AssetDetailPage = lazy(() => import('./pages/assets/AssetDetailPage'));
const AssetFormPage = lazy(() => import('./pages/assets/AssetFormPage'));
const AllocationsPage = lazy(() => import('./pages/allocations/AllocationsPage'));
const BookingsPage = lazy(() => import('./pages/bookings/BookingsPage'));
const MaintenancePage = lazy(() => import('./pages/maintenance/MaintenancePage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const AuditLogsPage = lazy(() => import('./pages/audit/AuditLogsPage'));
const DepartmentsPage = lazy(() => import('./pages/departments/DepartmentsPage'));
const UsersPage = lazy(() => import('./pages/users/UsersPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));

import { isSupabaseConfigured } from './lib/supabase';
import SupabaseSetupBanner from './components/common/SupabaseSetupBanner';

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
    <Loader2 size={32} className="animate-spin" style={{ color: '#6366f1' }} />
  </div>
);

function AuthRedirect() {
  const { session, loading } = useAuth();
  if (loading) return <PageLoader />;
  return session ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <>
      {!isSupabaseConfigured && <SupabaseSetupBanner />}
      <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected app routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="profile" element={<ProfilePage />} />

                  {/* Assets */}
                  <Route path="assets" element={<AssetsPage />} />
                  <Route path="assets/new" element={<AssetFormPage />} />
                  <Route path="assets/:id" element={<AssetDetailPage />} />
                  <Route path="assets/:id/edit" element={<AssetFormPage />} />

                  {/* Operations */}
                  <Route path="allocations" element={<AllocationsPage />} />
                  <Route path="bookings" element={<BookingsPage />} />
                  <Route path="maintenance" element={<MaintenancePage />} />

                  {/* Reporting & Admin */}
                  <Route path="reports" element={
                    <ProtectedRoute allowedRoles={['admin', 'asset_manager', 'department_head']}>
                      <ReportsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="audit-logs" element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <AuditLogsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="departments" element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <DepartmentsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="users" element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <UsersPage />
                    </ProtectedRoute>
                  } />
                  <Route path="settings" element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <SettingsPage />
                    </ProtectedRoute>
                  } />

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Root redirect */}
      <Route path="/" element={<AuthRedirect />} />
    </Routes>
    </>
  );
}
