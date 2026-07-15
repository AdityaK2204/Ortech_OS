import { useState } from 'react';
import type { Project } from '../../types';
import ChainageMap from '../../components/ChainageMap';
import GeographicView from './GeographicView';
import { taskProgressPct } from '../../lib/progress';

type View = 'chainage' | 'map';

export default function ProgressTab({
  project,
  showLocateMe = false,
}: {
  project: Project;
  showLocateMe?: boolean;
}) {
  const [view, setView] = useState<View>('chainage');

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {view === 'chainage' ? 'Chainage — Engineering View' : 'Map — Geographic View'}
            </h2>
            <p className="text-sm text-slate-500">
              {view === 'chainage'
                ? 'Each task plotted against the physical route length. Filled spans are completed metres; gaps are pending.'
                : 'The same progress on the real route. Colors show operational state; tap the route to inspect a point.'}
            </p>
          </div>

          {/* Two representations of the SAME progress */}
          <div className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1">
            <ViewToggle active={view === 'chainage'} onClick={() => setView('chainage')}>
              📏 Chainage
            </ViewToggle>
            <ViewToggle active={view === 'map'} onClick={() => setView('map')}>
              🌍 Map
            </ViewToggle>
          </div>
        </div>

        {view === 'chainage' ? (
          <ChainageMap project={project} />
        ) : (
          <GeographicView project={project} showLocateMe={showLocateMe} />
        )}
      </section>

      {/* Compact per-task summary bars */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-bold text-slate-900">Task Completion</h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {project.tasks.map((t) => {
            const pct = Math.round(taskProgressPct(t, project.totalLengthMeters));
            return (
              <div key={t.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm font-medium text-slate-600">
                  {t.name}
                </span>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: t.color }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-slate-700">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
