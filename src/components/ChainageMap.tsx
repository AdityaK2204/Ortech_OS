import { useState } from 'react';
import type { Project, Task } from '../types';
import { taskProgressPct, taskProgressLabel, completedMeters } from '../lib/progress';

const LABEL_W = 'w-44'; // left gutter width for task names

/** Choose a "nice" ruler step so we get ~6–8 tick marks. */
function niceStep(length: number): number {
  const target = length / 7;
  const candidates = [50, 100, 200, 250, 500, 1000, 2000];
  return candidates.find((c) => c >= target) ?? candidates[candidates.length - 1];
}

function buildTicks(length: number): number[] {
  const step = niceStep(length);
  const ticks: number[] = [];
  for (let m = 0; m <= length; m += step) ticks.push(m);
  if (ticks[ticks.length - 1] !== length) ticks.push(length);
  return ticks;
}

function Ruler({ length }: { length: number }) {
  const ticks = buildTicks(length);
  return (
    <div className="flex items-end">
      <div className={`${LABEL_W} shrink-0`} />
      <div className="relative h-5 flex-1">
        {ticks.map((m) => {
          const pct = (m / length) * 100;
          const label = m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}k` : `${m}`;
          return (
            <div
              key={m}
              className="absolute bottom-0 flex flex-col items-center"
              style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
            >
              <span className="mb-0.5 text-[10px] font-medium tabular-nums text-slate-400">
                {label}
              </span>
              <span className="h-1.5 w-px bg-slate-300" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Hover {
  text: string;
  x: number;
  y: number;
}

function TaskRow({
  task,
  totalLength,
  onHover,
}: {
  task: Task;
  totalLength: number;
  onHover: (h: Hover | null) => void;
}) {
  const pct = Math.round(taskProgressPct(task, totalLength));

  return (
    <div className="flex items-center py-1.5">
      {/* Left gutter: name + progress */}
      <div className={`${LABEL_W} shrink-0 pr-3`}>
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: task.color }}
          />
          <span className="truncate text-[13px] font-semibold text-slate-700">
            {task.name}
          </span>
        </div>
        <div className="mt-0.5 pl-4 text-[11px] tabular-nums text-slate-400">
          {taskProgressLabel(task, totalLength)} · {pct}%
        </div>
      </div>

      {/* Right: the spatial track */}
      <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-slate-100 ring-1 ring-inset ring-slate-200">
        {/* faint gridline at each ruler tick */}
        {buildTicks(totalLength).slice(1, -1).map((m) => (
          <span
            key={m}
            className="absolute inset-y-0 w-px bg-slate-200/70"
            style={{ left: `${(m / totalLength) * 100}%` }}
          />
        ))}

        {task.type === 'linear'
          ? task.segments?.map((s, i) => {
              const left = (s.start / totalLength) * 100;
              const width = ((s.end - s.start) / totalLength) * 100;
              return (
                <div
                  key={i}
                  className="absolute inset-y-1 rounded-[3px] shadow-sm transition-[filter] hover:brightness-95"
                  style={{ left: `${left}%`, width: `${width}%`, backgroundColor: task.color }}
                  onMouseEnter={(e) =>
                    onHover({
                      text: `${task.name}: ${s.start}–${s.end} m (${s.end - s.start} m)`,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                  onMouseMove={(e) =>
                    onHover({
                      text: `${task.name}: ${s.start}–${s.end} m (${s.end - s.start} m)`,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                  onMouseLeave={() => onHover(null)}
                />
              );
            })
          : task.points?.map((p, i) => {
              const left = (p.chainage / totalLength) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-1/2"
                  style={{ left: `${left}%`, transform: 'translate(-50%,-50%)' }}
                  onMouseEnter={(e) =>
                    onHover({
                      text: `${task.name} @ ${p.chainage} m — ${p.done ? 'installed' : 'pending'}`,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                  onMouseLeave={() => onHover(null)}
                >
                  <span
                    className="block h-3 w-3 rounded-full ring-2 ring-white"
                    style={{
                      backgroundColor: p.done ? task.color : '#fff',
                      boxShadow: p.done ? 'none' : `inset 0 0 0 1.5px #cbd5e1`,
                    }}
                  />
                </div>
              );
            })}

        {/* HDD (trenchless) overlay — diagonal hatch on top of the span */}
        {task.type === 'linear' &&
          task.hddSegments?.map((s, i) => {
            const left = (s.start / totalLength) * 100;
            const width = ((s.end - s.start) / totalLength) * 100;
            return (
              <div
                key={`hdd-${i}`}
                className="absolute inset-y-1 rounded-[3px] ring-1 ring-slate-900/50"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(15,23,42,0.55) 0 2px, transparent 2px 5px)',
                }}
                onMouseEnter={(e) =>
                  onHover({
                    text: `HDD (trenchless): ${s.start}–${s.end} m`,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }
                onMouseMove={(e) =>
                  onHover({
                    text: `HDD (trenchless): ${s.start}–${s.end} m`,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }
                onMouseLeave={() => onHover(null)}
              />
            );
          })}
      </div>
    </div>
  );
}

export default function ChainageMap({ project }: { project: Project }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const { totalLengthMeters: len } = project;

  return (
    <div className="relative">
      {/* Route reference bar (the full "site length" Gantt anchor) */}
      <div className="mb-3 flex items-center">
        <div className={`${LABEL_W} shrink-0 pr-3`}>
          <div className="text-[13px] font-bold text-slate-800">Full Route</div>
          <div className="text-[11px] tabular-nums text-slate-400">
            0 → {len.toLocaleString()} m
          </div>
        </div>
        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-gradient-to-r from-brand-700 to-brand-400" />
      </div>

      <Ruler length={len} />

      <div className="mt-1 divide-y divide-slate-100">
        {project.tasks.map((task) => (
          <TaskRow key={task.id} task={task} totalLength={len} onHover={setHover} />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-600">Legend:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-[3px] bg-slate-400" /> completed span (linear)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-[3px] bg-slate-100 ring-1 ring-inset ring-slate-200" /> gap / pending
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-slate-400 ring-2 ring-white" /> installed (point)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-white ring-1 ring-slate-300" /> pending (point)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-5 rounded-[3px] ring-1 ring-slate-900/50"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(15,23,42,0.55) 0 2px, transparent 2px 5px)',
            }}
          />{' '}
          HDD (trenchless)
        </span>
      </div>

      {/* Floating tooltip */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}

// re-export for tabs that want the raw number
export { completedMeters };
