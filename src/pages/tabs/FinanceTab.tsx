import type { Project, FinanceBucket } from '../../types';
import { formatCurrency } from '../../lib/progress';

export default function FinanceTab({ project }: { project: Project }) {
  const { finance } = project;
  return (
    <div className="space-y-5">
      {/* Contract header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Total Contract Value
        </div>
        <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
          {formatCurrency(finance.contractValue)}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Assigned targets & achieved work-value by period. Actual is derived from
          verified daily progress.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PeriodCard title="Today" bucket={finance.day} />
        <PeriodCard title="This Week" bucket={finance.week} />
        <PeriodCard title="This Month" bucket={finance.month} />
      </div>
    </div>
  );
}

function PeriodCard({ title, bucket }: { title: string; bucket: FinanceBucket }) {
  const valuePct =
    bucket.projectedValue === 0
      ? 0
      : Math.round((bucket.actualValue / bucket.projectedValue) * 100);
  const variance = bucket.actualValue - bucket.projectedValue;
  const ahead = variance >= 0;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
            ahead
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-rose-50 text-rose-700 ring-rose-200'
          }`}
        >
          {ahead ? '+' : ''}
          {formatCurrency(variance)}
        </span>
      </div>

      <Row label="Assigned / Projected" value={formatCurrency(bucket.projectedValue)} muted />
      <Row label="Achieved / Actual" value={formatCurrency(bucket.actualValue)} bold />

      {/* achievement bar */}
      <div className="mt-3">
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${ahead ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(100, valuePct)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>{valuePct}% of target</span>
          <span className="tabular-nums">
            {bucket.actualQty.toLocaleString()} / {bucket.projectedQty.toLocaleString()}{' '}
            {bucket.unit}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`tabular-nums ${
          bold ? 'text-base font-bold text-slate-900' : muted ? 'text-sm text-slate-500' : 'text-sm'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
