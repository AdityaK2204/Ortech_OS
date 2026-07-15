import type { Project, ProjectPatch } from '../types';

/**
 * Apply an admin edit patch to a (cloned) project in place. Never touches
 * progress fields (segments / installed points) — those come only from pulses.
 * Shared by the local store (edit layer) and the Supabase store (persist edit).
 */
export function applyPatchToProject(project: Project, patch: ProjectPatch): void {
  const scalars: (keyof ProjectPatch)[] = [
    'name',
    'client',
    'location',
    'cluster',
    'difficulty',
    'totalLengthMeters',
    'startDate',
    'endDate',
    'status',
  ];
  for (const key of scalars) {
    if (patch[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (project as any)[key] = patch[key];
    }
  }
  if (patch.route) project.route = patch.route;
  if (patch.team) project.team = patch.team;
  if (patch.machines) project.machines = patch.machines;
  if (patch.finance) project.finance = patch.finance;
  if (patch.pointTargets) {
    for (const [taskId, count] of Object.entries(patch.pointTargets)) {
      const task = project.tasks.find((t) => t.id === taskId);
      if (task) task.targetCount = count;
    }
  }
}
