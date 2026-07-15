import type { Project, MachineAssignment } from '../../types';

const STATUS_TONE: Record<MachineAssignment['status'], string> = {
  active: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
  idle: 'text-slate-600 bg-slate-100 ring-slate-200',
  maintenance: 'text-amber-700 bg-amber-50 ring-amber-200',
};

export default function MachinesTab({ project }: { project: Project }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-3 py-3">Machine</th>
              <th className="px-3 py-3">Assigned since</th>
              <th className="px-3 py-3">Diesel today</th>
              <th className="px-3 py-3">vs baseline</th>
              <th className="px-3 py-3">Utilisation</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {project.machines.map((m) => {
              const delta = m.dieselTodayL - m.dieselBaselineL;
              const overBaseline = m.dieselBaselineL > 0 && delta / m.dieselBaselineL > 0.15;
              return (
                <tr key={m.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-3">
                    <div className="font-bold text-slate-900">{m.id}</div>
                    <div className="text-xs text-slate-500">{m.type}</div>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-slate-600">
                    {new Date(m.assignedSince).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </td>
                  <td className="px-3 py-3 tabular-nums font-semibold text-slate-800">
                    {m.dieselTodayL} L
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`tabular-nums font-semibold ${
                        overBaseline ? 'text-rose-600' : delta < 0 ? 'text-emerald-600' : 'text-slate-500'
                      }`}
                    >
                      {delta > 0 ? '+' : ''}
                      {delta} L
                      {overBaseline && (
                        <span className="ml-1 text-[10px] font-bold uppercase">anomaly</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-600"
                          style={{ width: `${m.utilizationPct}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs font-semibold text-slate-600">
                        {m.utilizationPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ${STATUS_TONE[m.status]}`}
                    >
                      {m.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
