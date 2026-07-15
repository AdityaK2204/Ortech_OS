import { useState } from 'react';
import { Link } from 'react-router-dom';
import RouteDrawMap from '../../components/map/RouteDrawMap';
import { formatCurrency, formatMeters } from '../../lib/progress';
import type { MachineAssignment, Project, TeamRole } from '../../types';

// ---------------------------------------------------------------------------
// One form, two uses (create + edit). It owns all field state and hands the
// collected values back on submit; the pages translate those into either a
// NewProjectInput (create) or a ProjectPatch (edit).
// ---------------------------------------------------------------------------

let seq = 0;
const nextKey = () => `k${seq++}`;

export interface MemberDraft {
  key: string;
  role: TeamRole;
  name: string;
  trade: string;
  count: number;
}

export interface MachineDraft {
  key: string;
  id: string;
  type: string;
  status: MachineAssignment['status'];
  dieselTodayL: string;
  dieselBaselineL: string;
  utilizationPct: string;
  assignedSince: string;
}

export interface ProjectFormValues {
  name: string;
  client: string;
  location: string;
  cluster: string;
  difficulty: 'easy' | 'medium' | 'hard';
  status: Project['status'];
  lengthM: string;
  startDate: string;
  endDate: string;
  routeCoords: [number, number][];
  chamber: string;
  splice: string;
  marker: string;
  supName: string;
  supPhone: string;
  engName: string;
  engPhone: string;
  members: MemberDraft[];
  machines: MachineDraft[];
  contract: string;
  dayBudget: string;
  weekBudget: string;
  monthBudget: string;
  dayTarget: string;
  weekTarget: string;
  monthTarget: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
const n = (s: string) => (s === '' ? 0 : Number(s));

export function emptyValues(): ProjectFormValues {
  return {
    name: '',
    client: '',
    location: '',
    cluster: '',
    difficulty: 'medium',
    status: 'on_track',
    lengthM: '',
    startDate: todayISO(),
    endDate: '',
    routeCoords: [],
    chamber: '',
    splice: '',
    marker: '',
    supName: '',
    supPhone: '',
    engName: '',
    engPhone: '',
    members: [{ key: nextKey(), role: 'Labour', name: '', trade: '', count: 1 }],
    machines: [],
    contract: '',
    dayBudget: '',
    weekBudget: '',
    monthBudget: '',
    dayTarget: '',
    weekTarget: '',
    monthTarget: '',
  };
}

/** Build editable form values from an existing project. */
export function valuesFromProject(p: Project): ProjectFormValues {
  const pointTarget = (id: string) =>
    String(p.tasks.find((t) => t.id === id)?.targetCount ?? '');
  const roleOf = (trade: string): TeamRole =>
    trade === 'Supervisor' ? 'Supervisor' : trade === 'Site Engineer' ? 'Site Engineer' : 'Labour';

  return {
    name: p.name,
    client: p.client,
    location: p.location,
    cluster: p.cluster,
    difficulty: p.difficulty,
    status: p.status,
    lengthM: String(p.totalLengthMeters),
    startDate: p.startDate,
    endDate: p.endDate,
    routeCoords: p.route.geometry.coordinates.map(([lng, lat]) => [lng, lat]),
    chamber: pointTarget('t5'),
    splice: pointTarget('t6'),
    marker: pointTarget('t7'),
    supName: p.team.supervisor.name,
    supPhone: p.team.supervisor.phone,
    engName: p.team.siteEngineer.name,
    engPhone: p.team.siteEngineer.phone,
    members: p.team.workers.map((w) => ({
      key: nextKey(),
      role: roleOf(w.trade),
      name: w.name,
      trade: roleOf(w.trade) === 'Labour' ? w.trade : '',
      count: w.count,
    })),
    machines: p.machines.map((m) => ({
      key: nextKey(),
      id: m.id,
      type: m.type,
      status: m.status,
      dieselTodayL: String(m.dieselTodayL),
      dieselBaselineL: String(m.dieselBaselineL),
      utilizationPct: String(m.utilizationPct),
      assignedSince: m.assignedSince,
    })),
    contract: String(p.finance.contractValue),
    dayBudget: String(p.finance.day.projectedValue),
    weekBudget: String(p.finance.week.projectedValue),
    monthBudget: String(p.finance.month.projectedValue),
    dayTarget: String(p.finance.day.projectedQty),
    weekTarget: String(p.finance.week.projectedQty),
    monthTarget: String(p.finance.month.projectedQty),
  };
}

/** Convert draft machines into the domain type (used by both pages). */
export function toMachines(drafts: MachineDraft[], fallbackDate: string): MachineAssignment[] {
  return drafts
    .filter((m) => m.id.trim() || m.type.trim())
    .map((m) => ({
      id: m.id.trim() || 'MC-000',
      type: m.type.trim() || 'Machine',
      status: m.status,
      dieselTodayL: n(m.dieselTodayL),
      dieselBaselineL: n(m.dieselBaselineL),
      utilizationPct: n(m.utilizationPct),
      assignedSince: m.assignedSince || fallbackDate,
    }));
}

export default function ProjectForm({
  initial,
  submitLabel,
  showStatus = false,
  onSubmit,
  onDelete,
}: {
  initial: ProjectFormValues;
  submitLabel: string;
  showStatus?: boolean;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
  onDelete?: () => void;
}) {
  const [v, setV] = useState<ProjectFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const up = (patch: Partial<ProjectFormValues>) => setV((s) => ({ ...s, ...patch }));

  const patchMember = (key: string, p: Partial<MemberDraft>) =>
    up({ members: v.members.map((m) => (m.key === key ? { ...m, ...p } : m)) });
  const patchMachine = (key: string, p: Partial<MachineDraft>) =>
    up({ machines: v.machines.map((m) => (m.key === key ? { ...m, ...p } : m)) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!v.name.trim()) return setError('Give the project a name.');
    if (n(v.lengthM) <= 0) return setError('Enter the total route length (chainage) in metres.');
    if (!v.endDate) return setError('Set an expected deadline.');
    if (v.endDate < v.startDate) return setError('Deadline must be after the start date.');
    if (!v.supName.trim())
      return setError('A primary supervisor name is required (they are the login identity).');
    onSubmit(v);
  };

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      {/* 1. Details */}
      <Section title="Project details" step={1}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Project name *">
            <input className="ip" value={v.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. ORR Phase-4 Fiber Backbone" />
          </Field>
          <Field label="Client">
            <input className="ip" value={v.client} onChange={(e) => up({ client: e.target.value })} placeholder="e.g. Jio Digital Infra" />
          </Field>
          <Field label="Location">
            <input className="ip" value={v.location} onChange={(e) => up({ location: e.target.value })} placeholder="e.g. Whitefield, Bengaluru" />
          </Field>
          <Field label="Cluster">
            <input className="ip" value={v.cluster} onChange={(e) => up({ cluster: e.target.value })} placeholder="e.g. Bengaluru East" />
          </Field>
          <Field label="Difficulty">
            <select className="ip" value={v.difficulty} onChange={(e) => up({ difficulty: e.target.value as ProjectFormValues['difficulty'] })}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </Field>
          <Field label="Total length / chainage (m) *">
            <input className="ip" type="number" inputMode="numeric" min={0} value={v.lengthM} onChange={(e) => up({ lengthM: e.target.value })} placeholder="e.g. 1500" />
          </Field>
          <Field label="Start date">
            <input className="ip" type="date" value={v.startDate} onChange={(e) => up({ startDate: e.target.value })} />
          </Field>
          <Field label="Expected deadline *">
            <input className="ip" type="date" min={v.startDate} value={v.endDate} onChange={(e) => up({ endDate: e.target.value })} />
          </Field>
          {showStatus && (
            <Field label="Status">
              <select className="ip" value={v.status} onChange={(e) => up({ status: e.target.value as ProjectFormValues['status'] })}>
                <option value="on_track">On Track</option>
                <option value="at_risk">At Risk</option>
                <option value="behind">Behind</option>
                <option value="on_hold">On Hold</option>
              </select>
            </Field>
          )}
        </div>
      </Section>

      {/* 2. Route */}
      <Section title="Route on map" step={2} hint="Click along the road to trace the site. Chainage is measured proportionally along this line.">
        <RouteDrawMap value={v.routeCoords} onChange={(routeCoords) => up({ routeCoords })} />
        {v.routeCoords.length < 2 && (
          <p className="mt-2 text-xs text-amber-600">
            Optional but recommended — if left blank, a placeholder line is used.
          </p>
        )}
      </Section>

      {/* 3. Point tasks */}
      <Section title="Planned installations (point tasks)" step={3} hint="Linear tasks (trenching, pipe, refilling, cable) grow from supervisor updates. Set target counts for point tasks.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Chambers (nos)">
            <input className="ip" type="number" min={0} value={v.chamber} onChange={(e) => up({ chamber: e.target.value })} placeholder="e.g. 12" />
          </Field>
          <Field label="Splices (nos)">
            <input className="ip" type="number" min={0} value={v.splice} onChange={(e) => up({ splice: e.target.value })} placeholder="e.g. 10" />
          </Field>
          <Field label="Route markers (nos)">
            <input className="ip" type="number" min={0} value={v.marker} onChange={(e) => up({ marker: e.target.value })} placeholder="e.g. 30" />
          </Field>
        </div>
      </Section>

      {/* 4. Team */}
      <Section title="Team assigned" step={4}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Primary supervisor — name * (login identity)">
            <input className="ip" value={v.supName} onChange={(e) => up({ supName: e.target.value })} placeholder="e.g. Manoj Reddy" />
          </Field>
          <Field label="Primary supervisor — phone">
            <input className="ip" value={v.supPhone} onChange={(e) => up({ supPhone: e.target.value })} placeholder="+91 …" />
          </Field>
          <Field label="Site engineer — name">
            <input className="ip" value={v.engName} onChange={(e) => up({ engName: e.target.value })} placeholder="e.g. Anjali Verma" />
          </Field>
          <Field label="Site engineer — phone">
            <input className="ip" value={v.engPhone} onChange={(e) => up({ engPhone: e.target.value })} placeholder="+91 …" />
          </Field>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-slate-600">
            Additional members (extra supervisors, engineers, labour crews)
          </div>
          <div className="space-y-2">
            {v.members.map((m) => (
              <div key={m.key} className="grid grid-cols-[130px_1fr_90px_auto] items-center gap-2">
                <select className="ip" value={m.role} onChange={(e) => patchMember(m.key, { role: e.target.value as TeamRole })}>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Site Engineer">Site Engineer</option>
                  <option value="Labour">Labour</option>
                </select>
                <input className="ip" value={m.name} onChange={(e) => patchMember(m.key, { name: e.target.value })} placeholder={m.role === 'Labour' ? 'Crew name' : 'Name'} />
                {m.role === 'Labour' ? (
                  <input className="ip" value={m.trade} onChange={(e) => patchMember(m.key, { trade: e.target.value })} placeholder="Trade" title="Trade (e.g. Excavation)" />
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-1">
                  <input className="ip w-16" type="number" min={1} value={m.count} onChange={(e) => patchMember(m.key, { count: Number(e.target.value) })} title="Head count" />
                  <button type="button" onClick={() => up({ members: v.members.filter((x) => x.key !== m.key) })} className="px-1 text-sm font-semibold text-rose-500 hover:text-rose-700">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => up({ members: [...v.members, { key: nextKey(), role: 'Labour', name: '', trade: '', count: 1 }] })} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-500 transition hover:border-brand-400 hover:text-brand-700">
            ＋ Add member
          </button>
        </div>
      </Section>

      {/* 5. Machines */}
      <Section title="Machines assigned" step={5} hint="Register machines on this site — diesel today vs baseline drives the anomaly flag on the Machines tab.">
        <div className="space-y-2">
          {v.machines.map((m) => (
            <div key={m.key} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1fr_1.4fr_1fr_repeat(3,90px)_auto]">
              <input className="ip" value={m.id} onChange={(e) => patchMachine(m.key, { id: e.target.value })} placeholder="ID e.g. EXC-204" />
              <input className="ip" value={m.type} onChange={(e) => patchMachine(m.key, { type: e.target.value })} placeholder="Type e.g. JCB 3DX" />
              <select className="ip" value={m.status} onChange={(e) => patchMachine(m.key, { status: e.target.value as MachineDraft['status'] })}>
                <option value="active">Active</option>
                <option value="idle">Idle</option>
                <option value="maintenance">Maintenance</option>
              </select>
              <input className="ip" type="number" min={0} value={m.dieselTodayL} onChange={(e) => patchMachine(m.key, { dieselTodayL: e.target.value })} placeholder="Diesel L" title="Diesel today (L)" />
              <input className="ip" type="number" min={0} value={m.dieselBaselineL} onChange={(e) => patchMachine(m.key, { dieselBaselineL: e.target.value })} placeholder="Base L" title="Baseline diesel (L)" />
              <input className="ip" type="number" min={0} max={100} value={m.utilizationPct} onChange={(e) => patchMachine(m.key, { utilizationPct: e.target.value })} placeholder="Util %" title="Utilisation %" />
              <button type="button" onClick={() => up({ machines: v.machines.filter((x) => x.key !== m.key) })} className="px-1 text-sm font-semibold text-rose-500 hover:text-rose-700">
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => up({ machines: [...v.machines, { key: nextKey(), id: '', type: '', status: 'active', dieselTodayL: '', dieselBaselineL: '', utilizationPct: '', assignedSince: v.startDate }] })} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-500 transition hover:border-brand-400 hover:text-brand-700">
          ＋ Add machine
        </button>
      </Section>

      {/* 6. Budget & targets */}
      <Section title="Budget & expected progress" step={6} hint="Allotted budget and expected quantity per period. Actuals accumulate from supervisor updates.">
        <Field label="Total contract value (₹)">
          <input className="ip sm:w-72" type="number" min={0} value={v.contract} onChange={(e) => up({ contract: e.target.value })} placeholder="e.g. 21000000" />
        </Field>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-1">Period</th>
                <th className="px-1">Budget allotted (₹)</th>
                <th className="px-1">Expected progress (m)</th>
              </tr>
            </thead>
            <tbody>
              <BudgetRow label="Daily" budget={v.dayBudget} setBudget={(x) => up({ dayBudget: x })} target={v.dayTarget} setTarget={(x) => up({ dayTarget: x })} />
              <BudgetRow label="Weekly" budget={v.weekBudget} setBudget={(x) => up({ weekBudget: x })} target={v.weekTarget} setTarget={(x) => up({ weekTarget: x })} />
              <BudgetRow label="Monthly" budget={v.monthBudget} setBudget={(x) => up({ monthBudget: x })} target={v.monthTarget} setTarget={(x) => up({ monthTarget: x })} />
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          {n(v.contract) > 0 && <span>Contract: <b className="text-slate-700">{formatCurrency(n(v.contract))}</b></span>}
          {n(v.lengthM) > 0 && <span>Route: <b className="text-slate-700">{formatMeters(n(v.lengthM))}</b></span>}
        </div>
      </Section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              Cancel
            </Link>
            {onDelete && (
              <button type="button" onClick={onDelete} className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50">
                Delete
              </button>
            )}
          </div>
          <button type="submit" className="flex-1 rounded-lg bg-brand-700 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99] sm:flex-none sm:px-8">
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, step, hint, children }: { title: string; step: number; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
          {step}
        </span>
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function BudgetRow({ label, budget, setBudget, target, setTarget }: { label: string; budget: string; setBudget: (v: string) => void; target: string; setTarget: (v: string) => void }) {
  return (
    <tr>
      <td className="px-1 text-sm font-semibold text-slate-700">{label}</td>
      <td className="px-1"><input className="ip" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="₹" /></td>
      <td className="px-1"><input className="ip" type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="metres" /></td>
    </tr>
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
