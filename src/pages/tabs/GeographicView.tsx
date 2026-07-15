import { useMemo, useState } from 'react';
import type { LatLng, Project, Task } from '../../types';
import { useProjects } from '../../store/ProjectsContext';
import { taskProgressPct, completedMeters, issueLabel } from '../../lib/progress';
import {
  buildRouteOverlays,
  STATE_COLORS,
  STATE_LABELS,
  HDD_COLOR,
} from '../../lib/routeState';
import {
  toLatLngPath,
  interpAtFraction,
  nearestChainage,
} from '../../lib/geo';
import { RouteMap } from '../../components/map/RouteMap';
import { useGoogleMaps, hasMapsKey } from '../../components/map/mapsApi';
import MapSetupCard from '../../components/map/MapSetupCard';
import type { MapMarker, RouteMapProps } from '../../components/map/types';
import type { DailyPulse } from '../../types';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Is a linear task complete at a given chainage? */
function linearDoneAt(task: Task, m: number): boolean {
  return (task.segments ?? []).some((s) => m >= s.start && m <= s.end);
}

/** The most recent pulse that reported the active task covering a chainage. */
function pulseAt(pulses: DailyPulse[], taskId: string, m: number): DailyPulse | undefined {
  return pulses.find((p) =>
    p.entries.some(
      (e) => e.taskId === taskId && e.fromM != null && e.toM != null && m >= e.fromM && m <= e.toM
    )
  );
}

export default function GeographicView({
  project,
  showLocateMe = false,
}: {
  project: Project;
  showLocateMe?: boolean;
}) {
  const { pulsesForSite } = useProjects();
  const pulses = pulsesForSite(project.id);
  const today = todayISO();

  const firstLinear = project.tasks.find((t) => t.type === 'linear') ?? project.tasks[0];
  const [activeId, setActiveId] = useState(firstLinear.id);
  const activeTask = project.tasks.find((t) => t.id === activeId) ?? firstLinear;

  const [clickM, setClickM] = useState<number | null>(null);

  const path = useMemo(() => toLatLngPath(project.route), [project.route]);
  const total = project.totalLengthMeters;

  const render = useMemo(
    () => buildRouteOverlays(project, activeTask, pulses, today),
    [project, activeTask, pulses, today]
  );

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [
      { id: 'start', position: path[0], kind: 'start', label: `Start · 0 m` },
      {
        id: 'end',
        position: path[path.length - 1],
        kind: 'end',
        label: `End · ${total} m`,
      },
    ];
    if (activeTask.type === 'point') {
      (activeTask.points ?? []).forEach((p, i) =>
        out.push({
          id: `pt-${i}`,
          position: interpAtFraction(path, p.chainage / total),
          kind: p.done ? 'point_done' : 'point_pending',
          label: `${activeTask.name} @ ${p.chainage} m — ${p.done ? 'installed' : 'pending'}`,
        })
      );
    } else if (render.workFrontM && render.workFrontM > 0 && render.workFrontM < total) {
      out.push({
        id: 'front',
        position: interpAtFraction(path, render.workFrontM / total),
        kind: 'work_front',
        label: `Current work front · ${Math.round(render.workFrontM)} m`,
      });
    }
    return out;
  }, [path, total, activeTask, render.workFrontM]);

  const onMapClick = (coord: LatLng) => {
    setClickM(Math.round(nearestChainage(path, coord, total)));
  };

  const mapProps: RouteMapProps = {
    path,
    overlays: render.overlays,
    markers,
    onMapClick,
    showLocateMe,
  };

  return (
    <div className="space-y-4">
      {/* Task layer chips */}
      <div className="flex flex-wrap gap-2">
        {project.tasks.map((t) => {
          const active = t.id === activeId;
          const pct = Math.round(taskProgressPct(t, total));
          return (
            <button
              key={t.id}
              onClick={() => {
                setActiveId(t.id);
                setClickM(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                active
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
              {t.name}
              <span className={active ? 'text-slate-300' : 'text-slate-400'}>{pct}%</span>
            </button>
          );
        })}
      </div>

      {/* Map + floating inspect card */}
      <div className="relative">
        {hasMapsKey ? <MapCanvas {...mapProps} /> : <MapSetupCard />}

        {clickM != null && (
          <InspectCard
            project={project}
            activeTask={activeTask}
            pulses={pulses}
            chainage={clickM}
            onClose={() => setClickM(null)}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-600">
          {activeTask.type === 'point' ? 'Installations:' : 'Route state:'}
        </span>
        {activeTask.type === 'point' ? (
          <>
            <LegendDot color={STATE_COLORS.completed} label="Installed" round />
            <LegendDot color="#ffffff" ring label="Pending" round />
          </>
        ) : (
          <>
            {(['completed', 'worked_today', 'awaiting', 'blocked', 'not_started'] as const).map(
              (s) => (
                <LegendDot key={s} color={STATE_COLORS[s]} label={STATE_LABELS[s]} />
              )
            )}
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-6 rounded"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, ${HDD_COLOR} 0 3px, transparent 3px 6px)`,
                }}
              />
              HDD
            </span>
          </>
        )}
        <span className="ml-auto text-slate-400">Tap the route to inspect a point</span>
      </div>
    </div>
  );
}

/** Isolates the Google loader so it only mounts when a key exists. */
function MapCanvas(props: RouteMapProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  if (loadError)
    return (
      <div className="flex h-[460px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-600">
        Failed to load Google Maps — check that the API key is valid and the Maps JavaScript API is enabled.
      </div>
    );
  if (!isLoaded)
    return (
      <div className="flex h-[460px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400">
        Loading map…
      </div>
    );
  return <RouteMap {...props} />;
}

function InspectCard({
  project,
  activeTask,
  pulses,
  chainage,
  onClose,
}: {
  project: Project;
  activeTask: Task;
  pulses: DailyPulse[];
  chainage: number;
  onClose: () => void;
}) {
  const linearTasks = project.tasks.filter((t) => t.type === 'linear');
  const pulse = pulseAt(pulses, activeTask.id, chainage);
  const entry = pulse?.entries.find((e) => e.taskId === activeTask.id);

  return (
    <div className="absolute left-3 top-3 z-10 w-64 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-bold text-slate-900 tabular-nums">
          Chainage {chainage} m
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1">
        {linearTasks.map((t) => {
          const done = linearDoneAt(t, chainage);
          return (
            <div key={t.id} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
              </span>
              <span className={done ? 'font-bold text-emerald-600' : 'text-slate-400'}>
                {done ? '✔' : '✖'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        {pulse ? (
          <>
            <div>
              <span className="font-semibold text-slate-700">{activeTask.name}</span> logged by{' '}
              {pulse.supervisorName}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3">
              <span>📅 {new Date(pulse.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
              {entry?.fromM != null && entry.toM != null && (
                <span className="tabular-nums">+{entry.toM - entry.fromM} m</span>
              )}
              {pulse.photoNames.length > 0 && <span>📷 {pulse.photoNames.length}</span>}
              <span className={pulse.issueFlag !== 'none' ? 'font-semibold text-amber-600' : ''}>
                {issueLabel(pulse.issueFlag)}
              </span>
            </div>
          </>
        ) : (
          <span className="text-slate-400">
            No {activeTask.name.toLowerCase()} logged at this point yet
            {activeTask.type === 'linear' &&
              ` (${completedMeters(activeTask)} m done overall).`}
          </span>
        )}
      </div>
    </div>
  );
}

function LegendDot({
  color,
  label,
  round,
  ring,
}: {
  color: string;
  label: string;
  round?: boolean;
  ring?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`${round ? 'h-3 w-3 rounded-full' : 'h-1.5 w-6 rounded'} ${
          ring ? 'ring-1 ring-slate-300' : ''
        }`}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
