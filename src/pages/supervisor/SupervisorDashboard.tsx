import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import StatusBadge from '../../components/StatusBadge';
import ProgressBar from '../../components/ProgressBar';
import { useAuth } from '../../auth/AuthContext';
import { useProjects } from '../../store/ProjectsContext';
import { overallProgressPct, formatMeters, relativeTime } from '../../lib/progress';

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const { projects } = useProjects();

  const mySites = useMemo(
    () => projects.filter((p) => p.team.supervisor.name === user?.supervisorName),
    [projects, user?.supervisorName]
  );

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Hi {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {mySites.length === 1
            ? 'Your assigned site — tap to view and update progress.'
            : `Your ${mySites.length} assigned sites — tap one to update its progress.`}
        </p>
      </div>

      {mySites.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          No sites are assigned to you yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {mySites.map((p) => {
            const pct = overallProgressPct(p);
            return (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-bold text-slate-900">{p.name}</h3>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {p.client} · {p.location}
                    </p>
                  </div>
                  <StatusBadge status={p.status} size="sm" />
                </div>

                <div className="mb-3 flex items-center gap-2">
                  <ProgressBar value={pct} height={9} />
                  <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-slate-700">
                    {pct}%
                  </span>
                </div>

                <div className="mb-4 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-medium text-slate-500">
                    {formatMeters(p.totalLengthMeters)} route
                  </span>
                  <span>Updated {relativeTime(p.lastUpdate)}</span>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Link
                    to={`/my-sites/${p.id}`}
                    className="rounded-lg border border-slate-200 py-2 text-center text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    View site
                  </Link>
                  <Link
                    to={`/my-sites/${p.id}/update`}
                    className="rounded-lg bg-brand-700 py-2 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800"
                  >
                    ＋ Update
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
