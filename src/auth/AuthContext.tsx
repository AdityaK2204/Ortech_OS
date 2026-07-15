import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  signInWithPassword,
  signOut as apiSignOut,
  signUpWithPassword,
  fetchMyProfile,
  onAuthChange,
} from '../lib/api/auth';

export type Role = 'admin' | 'supervisor';

export interface AuthUser {
  id?: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  supervisorName?: string;
}

export interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  supervisorName?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthed: boolean;
  loading: boolean;
  /** true when the real Supabase backend is in use */
  backend: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (p: SignUpParams) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;
  /** cosmetic login — only meaningful in local (no-backend) mode */
  demoLogin: (p: { email: string; role: Role; supervisorName?: string }) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function titleCase(s: string) {
  return s.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function roleLabel(role: Role) {
  return role === 'admin' ? 'Director / Admin' : 'Site Supervisor';
}

// --- Supabase-backed auth ---------------------------------------------------

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const syncFromSession = useCallback(async () => {
    const profile = await fetchMyProfile();
    if (!profile) {
      setUser(null);
    } else {
      setUser({
        id: profile.id,
        email: profile.email,
        name: profile.fullName || profile.email,
        role: profile.role,
        roleLabel: roleLabel(profile.role),
        supervisorName: profile.supervisorName,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    syncFromSession();
    const unsub = onAuthChange(() => syncFromSession());
    return unsub;
  }, [syncFromSession]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthed: user !== null,
      loading,
      backend: true,
      signIn: async (email, password) => {
        await signInWithPassword(email, password);
        await syncFromSession();
      },
      signUp: async ({ email, password, fullName, supervisorName }) => {
        const { session } = await signUpWithPassword(email, password, {
          full_name: fullName,
          role: 'supervisor',
          supervisor_name: supervisorName,
        });
        if (session) await syncFromSession();
        return { needsConfirmation: !session };
      },
      logout: async () => {
        await apiSignOut();
        setUser(null);
      },
      demoLogin: () => {
        /* not used when the backend is active */
      },
    }),
    [user, loading, syncFromSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// --- Local cosmetic auth (no backend configured) ----------------------------

const LOCAL_KEY = 'ortech.auth';

function readStored(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStored);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthed: user !== null,
      loading: false,
      backend: false,
      signIn: async () => {
        throw new Error('Sign in requires the Supabase backend to be configured.');
      },
      signUp: async () => {
        throw new Error('Sign up requires the Supabase backend to be configured.');
      },
      logout: async () => {
        sessionStorage.removeItem(LOCAL_KEY);
        setUser(null);
      },
      demoLogin: ({ email, role, supervisorName }) => {
        const next: AuthUser =
          role === 'supervisor'
            ? {
                email,
                role,
                supervisorName,
                name: supervisorName ?? titleCase(email.split('@')[0] || 'supervisor'),
                roleLabel: roleLabel('supervisor'),
              }
            : {
                email,
                role,
                name: titleCase(email.split('@')[0] || 'admin'),
                roleLabel: roleLabel('admin'),
              };
        sessionStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        setUser(next);
      },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
  ) : (
    <LocalAuthProvider>{children}</LocalAuthProvider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Landing route for a role. */
export function homePathFor(role: Role | undefined): string {
  return role === 'supervisor' ? '/my-sites' : '/dashboard';
}
