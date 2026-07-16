import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, homePathFor } from '../auth/AuthContext';

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 shadow-sm">
        <svg viewBox="0 0 32 32" className="h-5 w-5">
          <path d="M6 20h6v3H6zM14 14h8v3h-8zM10 8h14v3H10z" fill="#5eead4" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight text-slate-900">
          ORTECH <span className="text-brand-700">OS</span>
        </div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
          Mission Control
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const home = homePathFor(user?.role);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-5">
            <Link to={home} className="transition-opacity hover:opacity-80">
              <BrandMark />
            </Link>
            {user?.role === 'admin' && (
              <nav className="hidden items-center gap-1 sm:flex">
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-800'
                    }`
                  }
                >
                  Sites
                </NavLink>
                <NavLink
                  to="/admin/accounts"
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-800'
                    }`
                  }
                >
                  Accounts
                </NavLink>
                <NavLink
                  to="/accounts"
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-800'
                    }`
                  }
                >
                  Review Queue
                </NavLink>
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-800'
                    }`
                  }
                >
                  Users
                </NavLink>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold leading-tight text-slate-800">
                {user?.name}
              </div>
              <div className="text-[11px] leading-tight text-slate-400">
                {user?.roleLabel}
              </div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {user?.name?.charAt(0) ?? 'A'}
            </div>
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
