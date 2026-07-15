import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/AuthContext';
import { useProjects } from '../../store/ProjectsContext';
import {
  ISSUE_FLAGS,
  completedMeters,
  formatMeters,
} from '../../lib/progress';
import type { DailyPulseEntry, IssueFlag, Task } from '../../types';

interface EntryDraft {
  key: string;
  taskId: string;
  fromM: string;
  toM: string;
  count: string;
  usedHdd: boolean;
  hddFromM: string;
  hddToM: string;
}

let keySeed = 0;
const newKey = () => `e${keySeed++}`;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Furthest completed metre for a linear task (good default "from"). */
function furthestEnd(task: Task): number {
  return (task.segments ?? []).reduce((m, s) => Math.max(m, s.end), 0);
}

function remainingPoints(task: Task): number {
  const done = task.points?.filter((p) => p.done).length ?? 0;
  return (task.targetCount ?? task.points?.length ?? 0) - done;
}

export default function UpdateProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getProject, addPulse } = useProjects();
  const project = id ? getProject(id) : undefined;

  const firstLinear = project?.tasks.find((t) => t.type === 'linear') ?? project?.tasks[0];

  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState<EntryDraft[]>(() => [
    {
      key: newKey(),
      taskId: firstLinear?.id ?? '',
      fromM: firstLinear ? String(furthestEnd(firstLinear)) : '',
      toM: '',
      count: '',
      usedHdd: false,
      hddFromM: '',
      hddToM: '',
    },
  ]);
  const [dieselL, setDieselL] = useState('');
  const [issueFlag, setIssueFlag] = useState<IssueFlag>('none');
  const [note, setNote] = useState('');
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    project?.tasks.forEach((t) => m.set(t.id, t));
    return m;
  }, [project]);

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

  const total = project.totalLengthMeters;

  const patch = (key: string, p: Partial<EntryDraft>) =>
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...p } : e)));

  const onTaskChange = (key: string, taskId: string) => {
    const t = taskById.get(taskId);
    patch(key, {
      taskId,
      fromM: t && t.type === 'linear' ? String(furthestEnd(t)) : '',
      toM: '',
      count: '',
      usedHdd: false,
      hddFromM: '',
      hddToM: '',
    });
  };

  const addRow = () => {
    const t = firstLinear;
    setEntries((prev) => [
      ...prev,
      {
        key: newKey(),
        taskId: t?.id ?? '',
        fromM: t && t.type === 'linear' ? String(furthestEnd(t)) : '',
        toM: '',
        count: '',
        usedHdd: false,
        hddFromM: '',
        hddToM: '',
      },
    ]);
  };

  const removeRow = (key: string) =>
    setEntries((prev) => (prev.length > 1 ? prev.filter((e) => e.key !== key) : prev));

  const onPhotos = (files: FileList | null) => {
    if (!files) return;
    setPhotoNames(Array.from(files).map((f) => f.name));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const built: DailyPulseEntry[] = [];
    for (const d of entries) {
      const task = taskById.get(d.taskId);
      if (!task) return setError('Please choose a work type for every row.');

      if (task.type === 'linear') {
        const from = Number(d.fromM);
        const to = Number(d.toM);
        if (d.fromM === '' || d.toM === '' || Number.isNaN(from) || Number.isNaN(to))
          return setError(`Enter a From and To metre for "${task.name}".`);
        if (from < 0 || to > total)
          return setError(`"${task.name}" range must be within 0–${total} m.`);
        if (to <= from)
          return setError(`"${task.name}": To must be greater than From.`);

        const entry: DailyPulseEntry = {
          taskId: task.id,
          taskName: task.name,
          fromM: from,
          toM: to,
        };

        if (d.usedHdd) {
          const hf = Number(d.hddFromM);
          const ht = Number(d.hddToM);
          if (d.hddFromM === '' || d.hddToM === '' || Number.isNaN(hf) || Number.isNaN(ht))
            return setError(`Enter the HDD From/To metres for "${task.name}".`);
          if (ht <= hf) return setError(`"${task.name}" HDD: To must be greater than From.`);
          if (hf < from || ht > to)
            return setError(`"${task.name}" HDD range must sit inside ${from}–${to} m.`);
          entry.usedHdd = true;
          entry.hddFromM = hf;
          entry.hddToM = ht;
        }
        built.push(entry);
      } else {
        const count = Number(d.count);
        if (d.count === '' || Number.isNaN(count) || count < 1)
          return setError(`Enter how many "${task.name}" were installed.`);
        const remaining = remainingPoints(task);
        if (count > remaining)
          return setError(`Only ${remaining} "${task.name}" remaining to install.`);
        built.push({ taskId: task.id, taskName: task.name, count });
      }
    }

    if (built.length === 0) return setError('Add at least one work entry.');

    try {
      await addPulse({
        projectId: project.id,
        date,
        supervisorName: user?.supervisorName ?? user?.name ?? 'Supervisor',
        entries: built,
        dieselL: dieselL === '' ? undefined : Number(dieselL),
        issueFlag,
        note: note.trim() || undefined,
        photoNames,
      });
    } catch (err) {
      return setError((err as Error).message || 'Failed to submit update.');
    }

    navigate(`/my-sites/${project.id}`);
  };

  return (
    <Layout>
      <Link
        to={`/my-sites/${project.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700"
      >
        ← {project.name}
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Update Today's Progress
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Log the work completed. Progress updates instantly for management.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5 pb-24">
        {/* Date */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Work date</label>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:w-56"
          />
        </section>

        {/* Work entries */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Work completed</h2>
            <span className="text-xs text-slate-400">Route length {formatMeters(total)}</span>
          </div>

          <div className="space-y-4">
            {entries.map((d, idx) => {
              const task = taskById.get(d.taskId);
              const isLinear = !task || task.type === 'linear';
              const meters =
                d.fromM !== '' && d.toM !== '' && Number(d.toM) > Number(d.fromM)
                  ? Number(d.toM) - Number(d.fromM)
                  : 0;
              return (
                <div
                  key={d.key}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Work #{idx + 1}
                    </span>
                    {entries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(d.key)}
                        className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* task select */}
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Type of work
                  </label>
                  <select
                    value={d.taskId}
                    onChange={(e) => onTaskChange(d.key, e.target.value)}
                    className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  >
                    {project.tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  {isLinear ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="From (m)">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={d.fromM}
                            min={0}
                            max={total}
                            onChange={(e) => patch(d.key, { fromM: e.target.value })}
                            className="num-input"
                          />
                        </Field>
                        <Field label="To (m)">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={d.toM}
                            min={0}
                            max={total}
                            onChange={(e) => patch(d.key, { toM: e.target.value })}
                            className="num-input"
                          />
                        </Field>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {meters > 0 ? (
                          <>
                            = <span className="font-bold text-slate-700">{meters} m</span> today
                          </>
                        ) : (
                          <>Enter the metre range completed today.</>
                        )}
                        {task && (
                          <span className="ml-2 text-slate-400">
                            (done so far: {completedMeters(task)} m)
                          </span>
                        )}
                      </div>

                      {/* HDD */}
                      <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={d.usedHdd}
                          onChange={(e) => patch(d.key, { usedHdd: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        Used HDD (trenchless drilling) for part of this
                      </label>
                      {d.usedHdd && (
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          <Field label="HDD From (m)">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={d.hddFromM}
                              onChange={(e) => patch(d.key, { hddFromM: e.target.value })}
                              className="num-input"
                            />
                          </Field>
                          <Field label="HDD To (m)">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={d.hddToM}
                              onChange={(e) => patch(d.key, { hddToM: e.target.value })}
                              className="num-input"
                            />
                          </Field>
                        </div>
                      )}
                    </>
                  ) : (
                    <Field label={`How many installed? (${remainingPoints(task!)} remaining)`}>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={d.count}
                        min={1}
                        max={remainingPoints(task!)}
                        onChange={(e) => patch(d.key, { count: e.target.value })}
                        className="num-input"
                      />
                    </Field>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-4 w-full rounded-lg border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
          >
            ＋ Add another work item
          </button>
        </section>

        {/* Extras */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">Site notes (optional)</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Diesel used today (L)">
              <input
                type="number"
                inputMode="numeric"
                value={dieselL}
                min={0}
                onChange={(e) => setDieselL(e.target.value)}
                placeholder="e.g. 45"
                className="num-input"
              />
            </Field>
            <Field label="Issue to report">
              <select
                value={issueFlag}
                onChange={(e) => setIssueFlag(e.target.value as IssueFlag)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                {ISSUE_FLAGS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <Field label={`Note (${note.length}/200)`}>
              <textarea
                value={note}
                maxLength={200}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything management should know…"
                className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </Field>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Photos (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onPhotos(e.target.files)}
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            {photoNames.length > 0 && (
              <p className="mt-1.5 text-xs text-slate-500">
                {photoNames.length} photo(s) attached
              </p>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        {/* Sticky submit bar */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link
              to={`/my-sites/${project.id}`}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-brand-700 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99] sm:flex-none sm:px-8"
            >
              Submit daily update
            </button>
          </div>
        </div>
      </form>
    </Layout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}
