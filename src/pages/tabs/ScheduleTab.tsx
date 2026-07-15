import type { Project, SchedulePoint } from '../../types';
import { leadLag } from '../../lib/progress';

export default function ScheduleTab({ project }: { project: Project }) {
  const ll = leadLag(project.schedule);
  const latest = project.schedule[project.schedule.length - 1];

  return (
    <div className="space-y-5">
      {/* Lead / Lag callout */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Projected (to date)"
          value={`${latest?.projectedPct ?? 0}%`}
          tone="text-slate-900"
        />
        <StatCard
          label="Actual (to date)"
          value={`${latest?.actualPct ?? 0}%`}
          tone="text-slate-900"
        />
        <div
          className={`rounded-2xl border p-5 shadow-sm ${
            ll.state === 'lead'
              ? 'border-emerald-200 bg-emerald-50'
              : ll.state === 'lag'
                ? 'border-rose-200 bg-rose-50'
                : 'border-slate-200 bg-white'
          }`}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {ll.state === 'lead' ? 'Ahead of Schedule (Lead)' : ll.state === 'lag' ? 'Behind Schedule (Lag)' : 'On Plan'}
          </div>
          <div
            className={`mt-1 text-3xl font-bold tabular-nums ${
              ll.state === 'lead'
                ? 'text-emerald-700'
                : ll.state === 'lag'
                  ? 'text-rose-700'
                  : 'text-slate-700'
            }`}
          >
            {ll.variancePct > 0 ? '+' : ''}
            {ll.variancePct}%
          </div>
          <div className="mt-0.5 text-xs font-medium text-slate-500">
            ≈ {Math.abs(ll.days)} days {ll.days >= 0 ? 'ahead' : 'behind'}
          </div>
        </div>
      </div>

      {/* Chart */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Cumulative Progress — Actual vs Projected
          </h2>
          <div className="flex items-center gap-4 text-xs">
            <LegendDot color="#94a3b8" label="Projected" dashed />
            <LegendDot color="#0d9488" label="Actual" />
          </div>
        </div>
        <TrendChart data={project.schedule} />
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-slate-500">
      <svg width="18" height="8">
        <line
          x1="0"
          y1="4"
          x2="18"
          y2="4"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

/** Hand-rolled responsive SVG line chart (no chart lib). */
function TrendChart({ data }: { data: SchedulePoint[] }) {
  const W = 720;
  const H = 260;
  const pad = { top: 16, right: 16, bottom: 28, left: 34 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const n = data.length;
  const x = (i: number) => pad.left + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.top + ih - (v / 100) * ih;

  const path = (key: 'projectedPct' | 'actualPct') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');

  const actualArea =
    `M ${x(0)} ${y(0)} ` +
    data.map((d, i) => `L ${x(i)} ${y(d.actualPct)}`).join(' ') +
    ` L ${x(n - 1)} ${y(0)} Z`;

  const gridY = [0, 25, 50, 75, 100];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]">
        {/* horizontal gridlines + y labels */}
        {gridY.map((g) => (
          <g key={g}>
            <line x1={pad.left} y1={y(g)} x2={W - pad.right} y2={y(g)} stroke="#eef2f6" strokeWidth="1" />
            <text x={pad.left - 8} y={y(g) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
              {g}
            </text>
          </g>
        ))}

        {/* x labels */}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {d.day}
          </text>
        ))}

        {/* actual area fill */}
        <path d={actualArea} fill="#0d9488" opacity="0.08" />

        {/* projected line (dashed) */}
        <path d={path('projectedPct')} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />

        {/* actual line */}
        <path d={path('actualPct')} fill="none" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* actual point markers */}
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.actualPct)} r="3.5" fill="#0d9488" stroke="#fff" strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
}
