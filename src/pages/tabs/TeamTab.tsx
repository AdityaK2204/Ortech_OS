import type { Project } from '../../types';

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function TeamTab({ project }: { project: Project }) {
  const { team } = project;
  const totalWorkers = team.workers.reduce((s, w) => s + w.count, 0);

  return (
    <div className="space-y-5">
      {/* Leadership */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <LeaderCard
          role="Site Supervisor"
          name={team.supervisor.name}
          phone={team.supervisor.phone}
          badge={`${team.supervisor.adherencePct}% adherence`}
          badgeTone={
            team.supervisor.adherencePct >= 85
              ? 'text-emerald-700 bg-emerald-50 ring-emerald-200'
              : team.supervisor.adherencePct >= 70
                ? 'text-amber-700 bg-amber-50 ring-amber-200'
                : 'text-rose-700 bg-rose-50 ring-rose-200'
          }
        />
        <LeaderCard
          role="Site Engineer"
          name={team.siteEngineer.name}
          phone={team.siteEngineer.phone}
        />
      </div>

      {/* Crew */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Crew on Site</h2>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
            {totalWorkers} workers
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          {team.workers.map((w, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">{w.name}</div>
                <div className="text-xs text-slate-500">{w.trade}</div>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold tabular-nums text-slate-700">
                {w.count}
                <span className="text-xs font-normal text-slate-400">nos</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LeaderCard({
  role,
  name,
  phone,
  badge,
  badgeTone,
}: {
  role: string;
  name: string;
  phone: string;
  badge?: string;
  badgeTone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {role}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">{name}</div>
          <div className="text-xs text-slate-500">{phone}</div>
        </div>
        {badge && (
          <span
            className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${badgeTone}`}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
