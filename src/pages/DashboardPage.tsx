import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import { useProjects } from '../store/ProjectsContext';
import MissionMap from '../components/map/MissionMap';
import {
  overallProgressPct,
  leadLag,
  formatMeters,
  relativeTime,
  STATUS_META,
} from '../lib/progress';
import type { SiteStatus } from '../types';

type Filter = 'all' | SiteStatus;

const STATUS_ORDER: Record<SiteStatus, number> = {
  behind: 0,
  at_risk: 1,
  on_hold: 2,
  on_track: 3,
};

export default function DashboardPage() {
  const { projects: allProjects } = useProjects();
  const [filter, setFilter] = useState<Filter>('all');
  const [mode, setMode] = useState<'grid' | 'map'>('grid');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allProjects.length };
    for (const p of allProjects) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [allProjects]);

  const projects = useMemo(() => {
    const list = filter === 'all' ? allProjects : allProjects.filter((p) => p.status === filter);
    // "most behind first" — sort by status severity, then by lowest progress.
    return [...list].sort((a, b) => {
      const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      return s !== 0 ? s : overallProgressPct(a) - overallProgressPct(b);
    });
  }, [filter, allProjects]);

  const chips: Filter[] = ['all', 'behind', 'at_risk', 'on_track', 'on_hold'];

  return (
    <Layout>
      {/* Heading */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {mode === 'grid' ? 'Active Sites' : 'Mission Map'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {allProjects.length} sites across {new Set(allProjects.map((p) => p.cluster)).size} clusters ·
            live execution status
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setMode('grid')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                mode === 'grid' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              ▦ Grid
            </button>
            <button
              onClick={() => setMode('map')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                mode === 'map' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              🌍 Map
            </button>
          </div>
          <Link
            to="/projects/new"
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99]"
          >
            ＋ New Project
          </Link>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Behind" value={counts['behind'] ?? 0} accent="text-rose-600" ring="ring-rose-100" />
        <SummaryTile label="At Risk" value={counts['at_risk'] ?? 0} accent="text-amber-600" ring="ring-amber-100" />
        <SummaryTile label="On Track" value={counts['on_track'] ?? 0} accent="text-emerald-600" ring="ring-emerald-100" />
        <SummaryTile label="On Hold" value={counts['on_hold'] ?? 0} accent="text-slate-500" ring="ring-slate-100" />
      </div>

      {mode === 'map' ? (
        <MissionMap projects={projects} />
      ) : (
        <>
      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((c) => {
          const active = filter === c;
          const label = c === 'all' ? 'All' : STATUS_META[c].label;
          return (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                active
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
              <span className={`ml-1.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                {counts[c] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Site cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const pct = overallProgressPct(p);
          const ll = leadLag(p.schedule);
          return (
            <Link
              key={p.id}
              to={`/project/${p.id}`}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-bold text-slate-900 group-hover:text-brand-700">
                    {p.name}
                  </h3>
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

              <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                <span className="font-medium text-slate-500">
                  {formatMeters(p.totalLengthMeters)} route
                </span>
                {p.status !== 'on_hold' && (
                  <span
                    className={`font-semibold ${
                      ll.state === 'lead'
                        ? 'text-emerald-600'
                        : ll.state === 'lag'
                          ? 'text-rose-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {ll.state === 'lead' ? '▲ Lead' : ll.state === 'lag' ? '▼ Lag' : '● On plan'}{' '}
                    {ll.variancePct > 0 ? '+' : ''}
                    {ll.variancePct}%
                  </span>
                )}
                <span>{relativeTime(p.lastUpdate)}</span>
              </div>
            </Link>
          );
        })}
      </div>
        </>
      )}
    </Layout>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  ring,
}: {
  label: string;
  value: number;
  accent: string;
  ring: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm ring-1 ${ring}`}>
      <div className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}
