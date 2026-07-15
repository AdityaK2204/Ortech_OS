import type { SiteStatus } from '../types';
import { STATUS_META } from '../lib/progress';

export default function StatusBadge({
  status,
  size = 'md',
}: {
  status: SiteStatus;
  size?: 'sm' | 'md';
}) {
  const m = STATUS_META[status];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ${pad} ${m.bg} ${m.text} ${m.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
