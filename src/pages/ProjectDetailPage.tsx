import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import { useProjects } from '../store/ProjectsContext';
import {
  overallProgressPct,
  formatMeters,
  formatCurrency,
  relativeTime,
} from '../lib/progress';
import ProgressTab from './tabs/ProgressTab';
import TeamTab from './tabs/TeamTab';
import MachinesTab from './tabs/MachinesTab';
import FinanceTab from './tabs/FinanceTab';
import ScheduleTab from './tabs/ScheduleTab';
import MeasurementsTab from './tabs/MeasurementsTab';

const TABS = [
  { id: 'progress', label: 'Progress' },
  { id: 'measurements', label: 'Measurements' },
  { id: 'team', label: 'Team' },
  { id: 'machines', label: 'Machines' },
  { id: 'finance', label: 'Finance' },
  { id: 'schedule', label: 'Schedule' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getProject } = useProjects();
  const project = id ? getProject(id) : undefined;
  const [tab, setTab] = useState<TabId>('progress');

  if (!project) {
    return (
      <Layout>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-600">Site not found.</p>
          <Link to="/dashboard" className="mt-2 inline-block text-sm font-semibold text-brand-700">
            ← Back to dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  const pct = overallProgressPct(project);

  return (
    <Layout>
      {/* Breadcrumb */}
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700"
      >
        ← All sites
      </Link>

      {/* Header */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {project.name}
              </h1>
              <StatusBadge status={project.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {project.client} · {project.location} · {project.cluster}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums text-slate-900">{pct}%</div>
              <div className="text-xs text-slate-400">overall complete</div>
            </div>
            <Link
              to={`/project/${project.id}/edit`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-brand-700"
            >
              ✎ Edit
            </Link>
          </div>
        </div>

        {/* meta strip */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <Meta label="Route length" value={formatMeters(project.totalLengthMeters)} />
          <Meta label="Contract value" value={formatCurrency(project.finance.contractValue)} />
          <Meta
            label="Timeline"
            value={`${fmtDate(project.startDate)} → ${fmtDate(project.endDate)}`}
          />
          <Meta label="Last update" value={relativeTime(project.lastUpdate)} />
        </div>
      </div>

      {/* Tab strip */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative shrink-0 px-4 py-2.5 text-sm font-semibold transition ${
                active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-700" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      {tab === 'progress' && <ProgressTab project={project} />}
      {tab === 'measurements' && <MeasurementsTab project={project} />}
      {tab === 'team' && <TeamTab project={project} />}
      {tab === 'machines' && <MachinesTab project={project} />}
      {tab === 'finance' && <FinanceTab project={project} />}
      {tab === 'schedule' && <ScheduleTab project={project} />}
    </Layout>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
