import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, homePathFor, type Role } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import CreateProjectPage from './pages/admin/CreateProjectPage';
import EditProjectPage from './pages/admin/EditProjectPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import SupervisorDashboard from './pages/supervisor/SupervisorDashboard';
import SupervisorProjectPage from './pages/supervisor/SupervisorProjectPage';
import UpdateProgressPage from './pages/supervisor/UpdateProgressPage';
import DailyMeasurementsPage from './pages/supervisor/DailyMeasurementsPage';
import AccountsPage from './pages/accounts/AccountsPage';
import AdminAccountsPage from './pages/admin/AdminAccountsPage';
import PwaManager from './components/PwaManager';
import type { JSX } from 'react';

function RequireRole({
  role,
  children,
}: {
  role: Role | Role[];
  children: JSX.Element;
}) {
  const { isAuthed, user, loading } = useAuth();
  const roles = Array.isArray(role) ? role : [role];
  if (loading) return <Splash />;
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (!user?.role || !roles.includes(user.role))
    return <Navigate to={homePathFor(user?.role)} replace />;
  return children;
}

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
        <span className="text-sm font-medium">Loading…</span>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthed, user, loading } = useAuth();
  const home = homePathFor(user?.role);

  if (loading) return <Splash />;

  return (
    <>
      <PwaManager />
      <Routes>
      <Route
        path="/login"
        element={isAuthed ? <Navigate to={home} replace /> : <LoginPage />}
      />

      {/* Admin / management */}
      <Route
        path="/dashboard"
        element={
          <RequireRole role="admin">
            <DashboardPage />
          </RequireRole>
        }
      />
      <Route
        path="/projects/new"
        element={
          <RequireRole role="admin">
            <CreateProjectPage />
          </RequireRole>
        }
      />
      <Route
        path="/project/:id"
        element={
          <RequireRole role="admin">
            <ProjectDetailPage />
          </RequireRole>
        }
      />
      <Route
        path="/project/:id/edit"
        element={
          <RequireRole role="admin">
            <EditProjectPage />
          </RequireRole>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireRole role="admin">
            <AdminUsersPage />
          </RequireRole>
        }
      />
      <Route
        path="/admin/accounts"
        element={
          <RequireRole role="admin">
            <AdminAccountsPage />
          </RequireRole>
        }
      />

      {/* Accounts — the Accountant's entire world; directors may also work it */}
      <Route
        path="/accounts"
        element={
          <RequireRole role={['accountant', 'admin']}>
            <AccountsPage />
          </RequireRole>
        }
      />

      {/* Supervisor */}
      <Route
        path="/my-sites"
        element={
          <RequireRole role="supervisor">
            <SupervisorDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/my-sites/:id"
        element={
          <RequireRole role="supervisor">
            <SupervisorProjectPage />
          </RequireRole>
        }
      />
      <Route
        path="/my-sites/:id/update"
        element={
          <RequireRole role="supervisor">
            <UpdateProgressPage />
          </RequireRole>
        }
      />
      <Route
        path="/my-sites/:id/measure"
        element={
          <RequireRole role="supervisor">
            <DailyMeasurementsPage />
          </RequireRole>
        }
      />

      <Route path="*" element={<Navigate to={isAuthed ? home : '/login'} replace />} />
    </Routes>
    </>
  );
}
