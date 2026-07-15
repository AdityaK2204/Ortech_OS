import { Link, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useProjects } from '../../store/ProjectsContext';
import ProjectForm, {
  emptyValues,
  toMachines,
  type ProjectFormValues,
} from './ProjectForm';

const num = (s: string) => (s === '' ? 0 : Number(s));

export default function CreateProjectPage() {
  const navigate = useNavigate();
  const { addProject } = useProjects();

  const onSubmit = async (v: ProjectFormValues) => {
    const project = await addProject({
      name: v.name,
      client: v.client,
      location: v.location,
      cluster: v.cluster,
      difficulty: v.difficulty,
      totalLengthMeters: num(v.lengthM),
      startDate: v.startDate,
      endDate: v.endDate,
      routeCoords: v.routeCoords,
      pointTargets: { chamber: num(v.chamber), splice: num(v.splice), marker: num(v.marker) },
      supervisor: { name: v.supName, phone: v.supPhone },
      siteEngineer: { name: v.engName, phone: v.engPhone },
      members: v.members.map(({ role, name, trade, count }) => ({ role, name, trade, count })),
      machines: toMachines(v.machines, v.startDate),
      finance: {
        contractValue: num(v.contract),
        dayBudget: num(v.dayBudget),
        weekBudget: num(v.weekBudget),
        monthBudget: num(v.monthBudget),
        dayTargetM: num(v.dayTarget),
        weekTargetM: num(v.weekTarget),
        monthTargetM: num(v.monthTarget),
      },
    });
    navigate(`/project/${project.id}`);
  };

  return (
    <Layout>
      <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700">
        ← All sites
      </Link>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create New Project</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Define the site, its route, team, machines, budget and targets. It goes live immediately.
        </p>
      </div>
      <ProjectForm initial={emptyValues()} submitLabel="Create project" onSubmit={onSubmit} />
    </Layout>
  );
}
