import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import StatusBadge from '../../components/StatusBadge';
import { useProjects } from '../../store/ProjectsContext';
import {
  overallProgressPct,
  formatMeters,
  relativeTime,
  issueLabel,
} from '../../lib/progress';
import type { DailyPulse } from '../../types';
import ProgressTab from '../tabs/ProgressTab';
import TeamTab from '../tabs/TeamTab';
import MachinesTab from '../tabs/MachinesTab';
import FinanceTab from '../tabs/FinanceTab';
import ScheduleTab from '../tabs/ScheduleTab';
import ExpensesTab from '../tabs/ExpensesTab';

const TABS = [
  { id: 'progress', label: 'Progress' },
  { id: 'updates', label: 'My Updates' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'team', label: 'Team' },
  { id: 'machines', label: 'Machines' },
  { id: 'finance', label: 'Finance' },
  { id: 'schedule', label: 'Schedule' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SupervisorProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { getProject, pulsesForSite } = useProjects();
  const project = id ? getProject(id) : undefined;
  const [tab, setTab] = useState<TabId>('progress');

  if (!project) {
    return (
      <Layout>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-600">Site not found.</p>
          <Link to="/my-sites" className="mt-2 inline-block text-sm font-semibold text-brand-700">
            ← Back to my sites
          </Link>
        </div>
      </Layout>
    );
  }

  const pct = overallProgressPct(project);
  const pulses = pulsesForSite(project.id);

  return (
    <Layout>
      <Link
        to="/my-sites"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700"
      >
        ← My sites
      </Link>

      {/* Header with prominent Update button */}
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
              {project.client} · {project.location}
            </p>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="font-bold tabular-nums text-slate-900">{pct}% complete</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{formatMeters(project.totalLengthMeters)} route</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">Updated {relativeTime(project.lastUpdate)}</span>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2">
            <Link
              to={`/my-sites/${project.id}/measure`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99]"
            >
              📒 Daily Measurements
            </Link>
            <Link
              to={`/my-sites/${project.id}/update`}
              className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition hover:text-brand-700"
            >
              quick update (legacy form)
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
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
              {t.id === 'updates' && pulses.length > 0 && (
                <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                  {pulses.length}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-700" />
              )}
            </button>
          );
        })}
      </div>

      {tab === 'progress' && <ProgressTab project={project} showLocateMe />}
      {tab === 'updates' && <UpdatesList pulses={pulses} />}
      {tab === 'expenses' && <ExpensesTab project={project} />}
      {tab === 'team' && <TeamTab project={project} />}
      {tab === 'machines' && <MachinesTab project={project} />}
      {tab === 'finance' && <FinanceTab project={project} />}
      {tab === 'schedule' && <ScheduleTab project={project} />}
    </Layout>
  );
}

function UpdatesList({ pulses }: { pulses: DailyPulse[] }) {
  if (pulses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm text-slate-500">
          No updates submitted yet. Tap <span className="font-semibold">Update Today's Progress</span> to file your first daily report.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {pulses.map((p) => (
        <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900">
              {new Date(p.date).toLocaleDateString('en-IN', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
              })}
            </div>
            <div className="text-[11px] text-slate-400">
              by {p.supervisorName} · {relativeTime(p.submittedAt)}
            </div>
          </div>

          <div className="space-y-1">
            {p.entries.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                <span className="font-medium text-slate-700">{e.taskName}</span>
                {e.fromM != null && e.toM != null ? (
                  <span className="tabular-nums">
                    {e.fromM}–{e.toM} m ({e.toM - e.fromM} m)
                  </span>
                ) : (
                  <span className="tabular-nums">{e.count} nos</span>
                )}
                {e.usedHdd && (
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    HDD {e.hddFromM}–{e.hddToM} m
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            {p.dieselL != null && p.dieselL > 0 && (
              <span>⛽ {p.dieselL} L diesel</span>
            )}
            <span
              className={
                p.issueFlag !== 'none' ? 'font-semibold text-amber-600' : 'text-slate-400'
              }
            >
              Issue: {issueLabel(p.issueFlag)}
            </span>
            {p.photoNames.length > 0 && <span>📷 {p.photoNames.length} photo(s)</span>}
            {p.note && <span className="italic text-slate-500">"{p.note}"</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
