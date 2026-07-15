import { clamp } from '../lib/progress';

export default function ProgressBar({
  value,
  color = '#0d9488',
  height = 8,
  showLabel = false,
  trackClass = 'bg-slate-100',
}: {
  value: number;
  color?: string;
  height?: number;
  showLabel?: boolean;
  trackClass?: string;
}) {
  const pct = clamp(value);
  return (
    <div className="flex items-center gap-2">
      <div
        className={`relative w-full overflow-hidden rounded-full ${trackClass}`}
        style={{ height }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
