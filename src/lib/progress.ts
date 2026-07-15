import type { Project, Task, SchedulePoint, SiteStatus, Segment, IssueFlag } from '../types';

/** Merge overlapping or adjacent spans into a minimal, sorted set. */
export function mergeSegments(segs: Segment[]): Segment[] {
  const clean = segs
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const s of clean) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end); // overlap / touch → extend
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

export const ISSUE_FLAGS: { value: IssueFlag; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'manpower', label: 'Manpower shortage' },
  { value: 'machine', label: 'Machine breakdown' },
  { value: 'material', label: 'Material shortage' },
  { value: 'weather', label: 'Weather' },
  { value: 'client', label: 'Client-side delay' },
  { value: 'other', label: 'Other' },
];

export function issueLabel(flag: IssueFlag): string {
  return ISSUE_FLAGS.find((f) => f.value === flag)?.label ?? 'None';
}

/** Meters completed for a linear task (sum of its segment spans). */
export function completedMeters(task: Task): number {
  if (!task.segments) return 0;
  return task.segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
}

/** Percentage complete for a single task (0–100), against the route length. */
export function taskProgressPct(task: Task, totalLength: number): number {
  if (task.type === 'point') {
    const done = task.points?.filter((p) => p.done).length ?? 0;
    const target = task.targetCount ?? task.points?.length ?? 0;
    return target === 0 ? 0 : clamp((done / target) * 100);
  }
  return totalLength === 0 ? 0 : clamp((completedMeters(task) / totalLength) * 100);
}

/** Human-readable "done / total" for a task. */
export function taskProgressLabel(task: Task, totalLength: number): string {
  if (task.type === 'point') {
    const done = task.points?.filter((p) => p.done).length ?? 0;
    const target = task.targetCount ?? task.points?.length ?? 0;
    return `${done} / ${target} ${task.unit}`;
  }
  return `${completedMeters(task).toLocaleString()} / ${totalLength.toLocaleString()} ${task.unit}`;
}

/** Overall project completion — simple mean across all tasks. */
export function overallProgressPct(project: Project): number {
  if (project.tasks.length === 0) return 0;
  const sum = project.tasks.reduce(
    (acc, t) => acc + taskProgressPct(t, project.totalLengthMeters),
    0
  );
  return Math.round(sum / project.tasks.length);
}

export interface LeadLag {
  /** actual − projected, in percentage points. Positive = ahead (lead). */
  variancePct: number;
  /** Approximate calendar days ahead/behind, derived from the schedule slope. */
  days: number;
  state: 'lead' | 'lag' | 'on_plan';
}

/** Compare the latest actual vs projected cumulative progress. */
export function leadLag(schedule: SchedulePoint[]): LeadLag {
  if (schedule.length === 0) {
    return { variancePct: 0, days: 0, state: 'on_plan' };
  }
  const latest = schedule[schedule.length - 1];
  const variancePct = Math.round(latest.actualPct - latest.projectedPct);

  // Estimate days ahead/behind: how far back/forward on the PROJECTED curve the
  // current actual value sits, scaled by the average per-interval slope.
  const span = schedule.length - 1 || 1;
  const slopePerInterval =
    (schedule[schedule.length - 1].projectedPct - schedule[0].projectedPct) / span;
  const intervalsOff = slopePerInterval === 0 ? 0 : variancePct / slopePerInterval;
  // Assume ~7 days per schedule interval (weekly points) for the day estimate.
  const days = Math.round(intervalsOff * 7);

  const state: LeadLag['state'] =
    variancePct > 1 ? 'lead' : variancePct < -1 ? 'lag' : 'on_plan';
  return { variancePct, days, state };
}

export function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

// --- presentation helpers ---------------------------------------------------

export const STATUS_META: Record<
  SiteStatus,
  { label: string; dot: string; text: string; bg: string; ring: string }
> = {
  on_track: {
    label: 'On Track',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
  },
  at_risk: {
    label: 'At Risk',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
  },
  behind: {
    label: 'Behind',
    dot: 'bg-rose-500',
    text: 'text-rose-700',
    bg: 'bg-rose-50',
    ring: 'ring-rose-200',
  },
  on_hold: {
    label: 'On Hold',
    dot: 'bg-slate-400',
    text: 'text-slate-600',
    bg: 'bg-slate-100',
    ring: 'ring-slate-200',
  },
};

export function formatCurrency(value: number, currency = '₹'): string {
  if (Math.abs(value) >= 10_000_000)
    return `${currency}${(value / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(value) >= 100_000)
    return `${currency}${(value / 100_000).toFixed(2)} L`;
  if (Math.abs(value) >= 1_000)
    return `${currency}${(value / 1_000).toFixed(1)}k`;
  return `${currency}${value.toLocaleString('en-IN')}`;
}

export function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
