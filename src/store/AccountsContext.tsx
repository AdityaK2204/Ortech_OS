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
import { useAuth } from '../auth/AuthContext';
import {
  clarifyTxn,
  coApproveTxn,
  disburseTxn,
  fetchCoApprovals,
  fetchDisbursements,
  fetchReviews,
  fetchThreshold,
  fetchTxns,
  flagTxn,
  insertTxn,
  logTallyExport,
  reviewTxn,
  subscribeAccounts,
  updateThreshold as apiUpdateThreshold,
} from '../lib/api/transactions';
import { looksDuplicate } from '../lib/accounts';
import type {
  CoApproval,
  Disbursement,
  PaymentMethod,
  Txn,
  TxnInput,
  TxnReview,
} from '../types';

// ---------------------------------------------------------------------------
// Accounts store. Backend mode: RPC-enforced state machine + realtime.
// Local mode: the same state machine enforced in this file against
// localStorage, so the module is fully demo-able without Supabase.
// ---------------------------------------------------------------------------

const TXN_KEY = 'ortech.txns.v1';
const REVIEW_KEY = 'ortech.txnreviews.v1';
const DISB_KEY = 'ortech.disbursements.v1';
const COAPPR_KEY = 'ortech.coapprovals.v1';
const THRESHOLD_KEY = 'ortech.txnthreshold.v1';

type ReviewAction = 'under_review' | 'queried' | 'approved' | 'rejected';

interface AccountsState {
  txns: Txn[];
  reviews: TxnReview[];
  disbursements: Disbursement[];
  coApprovals: CoApproval[];
  threshold: number;
  loading: boolean;
  /** claims visible for one site */
  forSite: (projectId: string) => Txn[];
  reviewsFor: (txnId: string) => TxnReview[];
  disbursementFor: (txnId: string) => Disbursement | undefined;
  coApprovalFor: (txnId: string) => CoApproval | undefined;
  /** does this approved txn still need a director signature before payout? */
  needsCoApproval: (t: Txn) => boolean;
  submitTxn: (input: TxnInput) => Promise<Txn>;
  review: (id: string, action: ReviewAction, reason?: string) => Promise<void>;
  clarify: (id: string, note: string) => Promise<void>;
  coApprove: (id: string) => Promise<void>;
  disburse: (
    id: string,
    method: PaymentMethod,
    reference: string,
    override?: boolean
  ) => Promise<void>;
  adminFlag: (id: string, note: string) => Promise<void>;
  setThreshold: (value: number) => Promise<void>;
  recordExport: (
    format: 'xml' | 'csv',
    filters: Record<string, unknown>,
    ids: string[]
  ) => Promise<void>;
}

const AccountsContext = createContext<AccountsState | undefined>(undefined);

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Local (demo) provider ----------------------------------------------------

function LocalAccountsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [txns, setTxns] = useState<Txn[]>(() => loadJSON(TXN_KEY, []));
  const [reviews, setReviews] = useState<TxnReview[]>(() => loadJSON(REVIEW_KEY, []));
  const [disbursements, setDisbursements] = useState<Disbursement[]>(() =>
    loadJSON(DISB_KEY, [])
  );
  const [coApprovals, setCoApprovals] = useState<CoApproval[]>(() =>
    loadJSON(COAPPR_KEY, [])
  );
  const [threshold, setThresholdState] = useState<number>(() =>
    loadJSON(THRESHOLD_KEY, 10000)
  );

  const persistTxns = (next: Txn[]) => {
    saveJSON(TXN_KEY, next);
    return next;
  };

  const addReview = useCallback(
    (transactionId: string, action: TxnReview['action'], reason?: string) => {
      const entry: TxnReview = {
        id: newId(),
        transactionId,
        reviewerName: user?.name ?? 'Reviewer',
        action,
        reason,
        createdAt: new Date().toISOString(),
      };
      setReviews((prev) => {
        const next = [...prev, entry];
        saveJSON(REVIEW_KEY, next);
        return next;
      });
    },
    [user?.name]
  );

  const setStatus = useCallback((id: string, status: Txn['status']) => {
    setTxns((prev) =>
      persistTxns(prev.map((t) => (t.id === id ? { ...t, status } : t)))
    );
  }, []);

  const submitTxn = useCallback(
    async (input: TxnInput): Promise<Txn> => {
      const txn: Txn = {
        ...input,
        id: newId(),
        status: 'submitted',
        flaggedDuplicate: looksDuplicate(txns, input),
        flaggedDieselAnomaly: false,
        submittedAt: new Date().toISOString(),
      };
      setTxns((prev) => persistTxns([txn, ...prev]));
      return txn;
    },
    [txns]
  );

  const review = useCallback(
    async (id: string, action: ReviewAction, reason?: string) => {
      const t = txns.find((x) => x.id === id);
      if (!t) throw new Error('Transaction not found');
      const allowed: Record<ReviewAction, Txn['status'][]> = {
        under_review: ['submitted', 'queried'],
        queried: ['submitted', 'under_review'],
        approved: ['submitted', 'under_review'],
        rejected: ['submitted', 'under_review', 'queried'],
      };
      if (!allowed[action].includes(t.status))
        throw new Error(`Cannot ${action} a ${t.status} transaction`);
      if ((action === 'rejected' || action === 'queried') && !reason?.trim())
        throw new Error(
          action === 'rejected' ? 'Rejection requires a reason' : 'A query needs a question'
        );
      setStatus(id, action);
      addReview(id, action, reason);
    },
    [txns, setStatus, addReview]
  );

  const clarify = useCallback(
    async (id: string, note: string) => {
      const t = txns.find((x) => x.id === id);
      if (!t || t.status !== 'queried')
        throw new Error('Only queried transactions can be clarified');
      if (!note.trim()) throw new Error('Add the clarification');
      setStatus(id, 'under_review');
      addReview(id, 'clarified', note);
    },
    [txns, setStatus, addReview]
  );

  const coApprove = useCallback(
    async (id: string) => {
      const t = txns.find((x) => x.id === id);
      if (!t || t.status !== 'approved')
        throw new Error('Co-approval applies to approved transactions');
      setCoApprovals((prev) => {
        if (prev.some((c) => c.transactionId === id)) return prev;
        const next = [
          ...prev,
          {
            transactionId: id,
            approvedByName: user?.name ?? 'Director',
            createdAt: new Date().toISOString(),
          },
        ];
        saveJSON(COAPPR_KEY, next);
        return next;
      });
    },
    [txns, user?.name]
  );

  const disburse = useCallback(
    async (id: string, method: PaymentMethod, reference: string, override = false) => {
      const t = txns.find((x) => x.id === id);
      if (!t) throw new Error('Transaction not found');
      if (!reference.trim()) throw new Error('A disbursement needs a reference number');
      if (override) {
        if (user?.role !== 'admin')
          throw new Error('Only a director can emergency-override');
        if (['disbursed', 'reversed', 'rejected'].includes(t.status))
          throw new Error(`Cannot override a ${t.status} transaction`);
      } else {
        if (t.status !== 'approved')
          throw new Error(`Only approved transactions can be disbursed (current: ${t.status})`);
        if (
          t.amount >= threshold &&
          !coApprovals.some((c) => c.transactionId === id)
        )
          throw new Error(
            `Amounts of ₹${threshold.toLocaleString('en-IN')} or more need director co-approval first`
          );
      }
      setStatus(id, 'disbursed');
      setDisbursements((prev) => {
        const next = [
          {
            id: newId(),
            transactionId: id,
            disbursedByName: user?.name ?? 'Accountant',
            amount: t.amount,
            method,
            referenceNumber: reference,
            isEmergencyOverride: override,
            disbursedAt: new Date().toISOString(),
          },
          ...prev,
        ];
        saveJSON(DISB_KEY, next);
        return next;
      });
    },
    [txns, threshold, coApprovals, setStatus, user?.name, user?.role]
  );

  const adminFlag = useCallback(
    async (id: string, note: string) => {
      if (!note.trim()) throw new Error('Flag needs a note');
      addReview(id, 'admin_flag', note);
    },
    [addReview]
  );

  const setThreshold = useCallback(async (value: number) => {
    setThresholdState(value);
    saveJSON(THRESHOLD_KEY, value);
  }, []);

  const recordExport = useCallback(async () => {
    /* local mode: no export log */
  }, []);

  const value = useAccountsValue({
    txns,
    reviews,
    disbursements,
    coApprovals,
    threshold,
    loading: false,
    submitTxn,
    review,
    clarify,
    coApprove,
    disburse,
    adminFlag,
    setThreshold,
    recordExport,
  });

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

// --- Supabase provider ---------------------------------------------------------

function SupabaseAccountsProvider({ children }: { children: ReactNode }) {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [reviews, setReviews] = useState<TxnReview[]>([]);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [coApprovals, setCoApprovals] = useState<CoApproval[]>([]);
  const [threshold, setThresholdState] = useState(10000);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [t, r, d, c, th] = await Promise.all([
        fetchTxns(),
        fetchReviews(),
        fetchDisbursements(),
        fetchCoApprovals(),
        fetchThreshold(),
      ]);
      setTxns(t);
      setReviews(r);
      setDisbursements(d);
      setCoApprovals(c);
      setThresholdState(th);
    } catch (e) {
      console.error('Failed to load accounts data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const unsub = subscribeAccounts(reload);
    return unsub;
  }, [reload]);

  const submitTxn = useCallback(async (input: TxnInput): Promise<Txn> => {
    const txn: Txn = {
      ...input,
      id: crypto.randomUUID(),
      status: 'submitted',
      flaggedDuplicate: false, // server trigger decides
      flaggedDieselAnomaly: false,
      submittedAt: new Date().toISOString(),
    };
    setTxns((prev) => [txn, ...prev]); // optimistic
    try {
      await insertTxn(txn);
    } catch (e) {
      setTxns((prev) => prev.filter((t) => t.id !== txn.id));
      throw e;
    }
    return txn;
  }, []);

  const review = useCallback(
    async (id: string, action: ReviewAction, reason?: string) => {
      await reviewTxn(id, action, reason);
      await reload();
    },
    [reload]
  );

  const clarify = useCallback(
    async (id: string, note: string) => {
      await clarifyTxn(id, note);
      await reload();
    },
    [reload]
  );

  const coApprove = useCallback(
    async (id: string) => {
      await coApproveTxn(id);
      await reload();
    },
    [reload]
  );

  const disburse = useCallback(
    async (id: string, method: PaymentMethod, reference: string, override = false) => {
      await disburseTxn(id, method, reference, override);
      await reload();
    },
    [reload]
  );

  const adminFlag = useCallback(
    async (id: string, note: string) => {
      await flagTxn(id, note);
      await reload();
    },
    [reload]
  );

  const setThreshold = useCallback(
    async (value: number) => {
      await apiUpdateThreshold(value);
      setThresholdState(value);
    },
    []
  );

  const recordExport = useCallback(
    async (format: 'xml' | 'csv', filters: Record<string, unknown>, ids: string[]) => {
      try {
        await logTallyExport(format, filters, ids);
      } catch (e) {
        console.error('Failed to log export:', e); // never block the download
      }
    },
    []
  );

  const value = useAccountsValue({
    txns,
    reviews,
    disbursements,
    coApprovals,
    threshold,
    loading,
    submitTxn,
    review,
    clarify,
    coApprove,
    disburse,
    adminFlag,
    setThreshold,
    recordExport,
  });

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

// --- shared derived state -------------------------------------------------------

function useAccountsValue(
  base: Omit<
    AccountsState,
    'forSite' | 'reviewsFor' | 'disbursementFor' | 'coApprovalFor' | 'needsCoApproval'
  >
): AccountsState {
  const { txns, reviews, disbursements, coApprovals, threshold } = base;

  const forSite = useCallback(
    (projectId: string) => txns.filter((t) => t.projectId === projectId),
    [txns]
  );
  const reviewsFor = useCallback(
    (txnId: string) => reviews.filter((r) => r.transactionId === txnId),
    [reviews]
  );
  const disbursementFor = useCallback(
    (txnId: string) => disbursements.find((d) => d.transactionId === txnId),
    [disbursements]
  );
  const coApprovalFor = useCallback(
    (txnId: string) => coApprovals.find((c) => c.transactionId === txnId),
    [coApprovals]
  );
  const needsCoApproval = useCallback(
    (t: Txn) =>
      t.status === 'approved' &&
      t.amount >= threshold &&
      !coApprovals.some((c) => c.transactionId === t.id),
    [threshold, coApprovals]
  );

  return useMemo(
    () => ({
      ...base,
      forSite,
      reviewsFor,
      disbursementFor,
      coApprovalFor,
      needsCoApproval,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, forSite, reviewsFor, disbursementFor, coApprovalFor, needsCoApproval]
  );
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseAccountsProvider>{children}</SupabaseAccountsProvider>
  ) : (
    <LocalAccountsProvider>{children}</LocalAccountsProvider>
  );
}

export function useAccounts(): AccountsState {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error('useAccounts must be used within AccountsProvider');
  return ctx;
}
