import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/AuthContext';
import { useProjects } from '../../store/ProjectsContext';
import type { Profile } from '../../lib/api/auth';
import {
  listProfiles,
  updateProfile,
  inviteUser,
  type ProfilePatch,
} from '../../lib/api/users';
import type { Role } from '../../auth/AuthContext';

export default function AdminUsersPage() {
  const { backend, user } = useAuth();
  const { projects } = useProjects();

  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  // Distinct supervisor names across all sites → assignment options.
  const supervisorNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) if (p.team.supervisor.name) set.add(p.team.supervisor.name);
    return [...set].sort();
  }, [projects]);

  const siteCountFor = (name?: string) =>
    name ? projects.filter((p) => p.team.supervisor.name === name).length : 0;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listProfiles());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (backend) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  const patch = async (id: string, p: ProfilePatch) => {
    setSavingId(id);
    setError(null);
    // optimistic
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...normalize(p) } : r)));
    try {
      await updateProfile(id, p);
    } catch (e) {
      setError((e as Error).message);
      await load(); // resync on failure
    } finally {
      setSavingId(null);
    }
  };

  if (!backend) {
    return (
      <Layout>
        <BackLink />
        <EmptyState
          title="User management needs the Supabase backend"
          body="Connect Supabase (add your URL + anon key to .env) to manage real user accounts, roles, and site assignments."
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <BackLink />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Users &amp; Access</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage roles, supervisor site assignments, and account access.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99]"
        >
          ＋ Invite user
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Supervisor identity (site assignment)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Loading users…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    No users yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const self = r.id === user?.id;
                  const busy = savingId === r.id;
                  return (
                    <tr key={r.id} className={`hover:bg-slate-50/60 ${!r.active ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                            {(r.fullName || r.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-800">
                              {r.fullName || '—'} {self && <span className="text-[11px] font-normal text-brand-600">(you)</span>}
                            </div>
                            <div className="truncate text-xs text-slate-400">{r.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={r.role}
                          disabled={busy || self}
                          title={self ? "You can't change your own role" : ''}
                          onChange={(e) => patch(r.id, { role: e.target.value as Role })}
                          className="ip w-36 disabled:cursor-not-allowed disabled:bg-slate-50"
                        >
                          <option value="admin">Admin / Director</option>
                          <option value="supervisor">Supervisor</option>
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        {r.role === 'supervisor' ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={r.supervisorName ?? ''}
                              disabled={busy}
                              onChange={(e) => patch(r.id, { supervisorName: e.target.value })}
                              className="ip w-56"
                            >
                              <option value="">— unassigned —</option>
                              {supervisorNames.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                              {/* keep a custom existing value selectable */}
                              {r.supervisorName && !supervisorNames.includes(r.supervisorName) && (
                                <option value={r.supervisorName}>{r.supervisorName}</option>
                              )}
                            </select>
                            <span className="whitespace-nowrap text-xs text-slate-400">
                              {siteCountFor(r.supervisorName)} site{siteCountFor(r.supervisorName) === 1 ? '' : 's'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Full access (all sites)</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                            r.active
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                              : 'bg-slate-100 text-slate-500 ring-slate-200'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${r.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {r.active ? 'Active' : 'Disabled'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          disabled={busy || self}
                          title={self ? "You can't disable yourself" : ''}
                          onClick={() => patch(r.id, { active: !r.active })}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {r.active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Note: “Disabled” hides a user in the app; fully blocking sign-in also requires banning them
        in the Supabase dashboard (Authentication → Users).
      </p>

      {showInvite && (
        <InviteModal
          supervisorNames={supervisorNames}
          onClose={() => setShowInvite(false)}
          onDone={() => {
            setShowInvite(false);
            load();
          }}
        />
      )}
    </Layout>
  );
}

function normalize(p: ProfilePatch): Partial<Profile> {
  const out: Partial<Profile> = {};
  if (p.role !== undefined) out.role = p.role;
  if (p.supervisorName !== undefined) out.supervisorName = p.supervisorName || undefined;
  if (p.active !== undefined) out.active = p.active;
  if (p.fullName !== undefined) out.fullName = p.fullName;
  return out;
}

function InviteModal({
  supervisorNames,
  onClose,
  onDone,
}: {
  supervisorNames: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('supervisor');
  const [supervisorName, setSupervisorName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !fullName.trim()) return setError('Name and email are required.');
    setBusy(true);
    try {
      await inviteUser({
        email: email.trim(),
        fullName: fullName.trim(),
        role,
        supervisorName: role === 'supervisor' ? supervisorName || fullName.trim() : undefined,
        password: password || undefined,
      });
      onDone();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith('EDGE_FUNCTION_UNAVAILABLE')) setUnavailable(true);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Invite a user</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        {unavailable ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-700">
              Creating accounts needs the one-time <code>admin-users</code> Edge Function.
            </p>
            <p>
              It uses the service-role key, which can’t run in the browser. Until it’s deployed, add
              users from the <span className="font-semibold">Supabase dashboard → Authentication → Users → Add user</span>
              , then set their role here. Deploy steps are in{' '}
              <code>supabase/functions/admin-users/README.md</code>.
            </p>
            <button onClick={onClose} className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white">
              Got it
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Field label="Full name">
              <input className="ip" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Kavita Joshi" />
            </Field>
            <Field label="Work email">
              <input className="ip" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@ortech.os" />
            </Field>
            <Field label="Role">
              <select className="ip" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin / Director</option>
              </select>
            </Field>
            {role === 'supervisor' && (
              <Field label="Supervisor identity (site assignment)">
                <select className="ip" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)}>
                  <option value="">Use their name</option>
                  {supervisorNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Temporary password (optional)">
              <input className="ip" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="auto-generate if blank" />
            </Field>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}

            <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:opacity-60">
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
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

function BackLink() {
  return (
    <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700">
      ← All sites
    </Link>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{body}</p>
    </div>
  );
}
