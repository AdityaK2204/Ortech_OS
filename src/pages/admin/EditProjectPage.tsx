import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useProjects } from '../../store/ProjectsContext';
import ProjectForm, {
  toMachines,
  valuesFromProject,
  type ProjectFormValues,
} from './ProjectForm';
import type { Finance, ProjectPatch, RouteGeometry, TeamInfo } from '../../types';

const num = (s: string) => (s === '' ? 0 : Number(s));

export default function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProject, updateProject, deleteProject } = useProjects();
  const project = id ? getProject(id) : undefined;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const initial = useMemo(
    () => (project ? valuesFromProject(project) : null),
    [project]
  );

  if (!project || !initial) {
    return (
      <Layout>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-600">Site not found.</p>
          <Link to="/dashboard" className="mt-2 inline-block text-sm font-semibold text-brand-700">
            ← Back to dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  const onSubmit = async (v: ProjectFormValues) => {
    // Finance: keep existing actuals, overwrite the planned/budget figures.
    const finance: Finance = {
      currency: project.finance.currency,
      contractValue: num(v.contract),
      day: { ...project.finance.day, projectedValue: num(v.dayBudget), projectedQty: num(v.dayTarget) },
      week: { ...project.finance.week, projectedValue: num(v.weekBudget), projectedQty: num(v.weekTarget) },
      month: { ...project.finance.month, projectedValue: num(v.monthBudget), projectedQty: num(v.monthTarget) },
    };

    const team: TeamInfo = {
      supervisor: {
        name: v.supName.trim(),
        phone: v.supPhone.trim(),
        adherencePct: project.team.supervisor.adherencePct,
      },
      siteEngineer: { name: v.engName.trim(), phone: v.engPhone.trim() },
      workers: v.members
        .filter((m) => m.name.trim())
        .map((m) => ({
          name: m.name.trim(),
          trade: m.role === 'Labour' ? m.trade.trim() || 'Labour' : m.role,
          count: Math.max(1, m.count || 1),
        })),
    };

    const route: RouteGeometry = {
      ...project.route,
      geometry: {
        type: 'LineString',
        coordinates: v.routeCoords.length >= 2 ? v.routeCoords : project.route.geometry.coordinates,
      },
    };

    const patch: ProjectPatch = {
      name: v.name.trim(),
      client: v.client.trim(),
      location: v.location.trim(),
      cluster: v.cluster.trim() || 'Unassigned',
      difficulty: v.difficulty,
      status: v.status,
      totalLengthMeters: num(v.lengthM),
      startDate: v.startDate,
      endDate: v.endDate,
      route,
      team,
      machines: toMachines(v.machines, v.startDate),
      finance,
      pointTargets: { t5: num(v.chamber), t6: num(v.splice), t7: num(v.marker) },
    };

    await updateProject(project.id, patch);
    navigate(`/project/${project.id}`);
  };

  const onDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteProject(project.id);
    navigate('/dashboard');
  };

  return (
    <Layout>
      <Link
        to={`/project/${project.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700"
      >
        ← {project.name}
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit Project</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Change any detail. Completed progress (metres trenched, installs) stays supervisor-driven.
          </p>
        </div>
        {confirmDelete && (
          <span className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
            Click Delete again to permanently remove this site.
          </span>
        )}
      </div>

      <ProjectForm
        initial={initial}
        submitLabel="Save changes"
        showStatus
        onSubmit={onSubmit}
        onDelete={onDelete}
      />
    </Layout>
  );
}
