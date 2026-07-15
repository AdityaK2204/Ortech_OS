import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homePathFor, type Role } from '../auth/AuthContext';
import { useProjects } from '../store/ProjectsContext';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const { backend } = useAuth();
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 shadow-md">
            <svg viewBox="0 0 32 32" className="h-7 w-7">
              <path d="M6 20h6v3H6zM14 14h8v3h-8zM10 8h14v3H10z" fill="#5eead4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            ORTECH <span className="text-brand-700">OS</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {backend ? 'Sign in to your account' : 'Mission Control'}
          </p>
        </div>

        {backend ? <CredentialAuth /> : <DemoAuth />}
      </div>
    </div>
  );
}

// --- Real credential auth (Supabase backend) --------------------------------

function CredentialAuth() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) return setError('Enter your email and password.');
    if (mode === 'signup' && !fullName.trim()) return setError('Enter your full name.');
    if (mode === 'signup' && password.length < 6)
      return setError('Password must be at least 6 characters.');

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        navigate('/');
      } else {
        const { needsConfirmation } = await signUp({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          // new self-service accounts are supervisors by default; the name they
          // sign up with becomes their supervisor identity.
          supervisorName: fullName.trim(),
        });
        if (needsConfirmation) {
          setMode('signin');
          setNotice('Account created. Check your email to confirm, then sign in.');
        } else {
          navigate('/');
        }
      }
    } catch (err) {
      setError(friendly((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* mode toggle */}
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(['signin', 'signup'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              mode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      {mode === 'signup' && (
        <Field label="Full name">
          <input className="ip" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Manoj Reddy" autoComplete="name" />
        </Field>
      )}

      <Field label="Work email">
        <input className="ip" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@ortech.os" autoComplete="email" />
      </Field>

      <Field label="Password">
        <input className="ip" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
      </Field>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>
      )}
      {notice && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{notice}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        {mode === 'signin' ? (
          <>
            New here?{' '}
            <button type="button" onClick={() => setMode('signup')} className="font-semibold text-brand-700 hover:underline">
              Create an account
            </button>
          </>
        ) : (
          <>New accounts are created as Site Supervisors. Admin access is granted by your director.</>
        )}
      </p>
    </form>
  );
}

// --- Demo picker (local mode only, no backend) ------------------------------

function DemoAuth() {
  const { demoLogin } = useAuth();
  const navigate = useNavigate();
  const { projects } = useProjects();

  const supervisors = useMemo(() => {
    const names = new Set<string>();
    for (const p of projects) if (p.team.supervisor.name) names.add(p.team.supervisor.name);
    return [...names].sort();
  }, [projects]);

  const [role, setRole] = useState<Role>('admin');
  const [email, setEmail] = useState('admin@ortech.os');
  const [supervisorName, setSupervisorName] = useState(supervisors[0] ?? '');

  const selectRole = (r: Role) => {
    setRole(r);
    setEmail(r === 'admin' ? 'admin@ortech.os' : 'supervisor@ortech.os');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    demoLogin({ email: email.trim(), role, supervisorName });
    navigate(homePathFor(role));
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(['admin', 'supervisor'] as Role[]).map((r) => (
          <button key={r} type="button" onClick={() => selectRole(r)} className={`rounded-lg py-2 text-sm font-semibold capitalize transition ${role === r ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {r === 'admin' ? 'Admin / Boss' : 'Supervisor'}
          </button>
        ))}
      </div>

      {role === 'supervisor' && (
        <Field label="Who are you?">
          <select className="ip" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)}>
            {supervisors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Work email">
        <input className="ip" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@ortech.os" />
      </Field>

      <button type="submit" className="w-full rounded-lg bg-brand-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99]">
        Enter (demo mode)
      </button>
      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-400">
        Local demo · connect Supabase for real accounts
      </p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function friendly(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (/already registered|already been registered/i.test(msg)) return 'That email is already registered — try signing in.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email before signing in.';
  return msg;
}
