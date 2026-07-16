import { requireSupabase } from '../supabase';
import type {
  CoApproval,
  Disbursement,
  PaymentMethod,
  Txn,
  TxnReview,
} from '../../types';

// ---------------------------------------------------------------------------
// Accounts API. Reads are plain selects (RLS scopes them); every state
// transition goes through a security-definer RPC — the app has no raw
// UPDATE path to transactions, by design.
// ---------------------------------------------------------------------------

interface TxnRow {
  id: string;
  project_id: string;
  supervisor_name: string | null;
  category: string;
  amount: number;
  gst_applicable: boolean;
  base_amount: number | null;
  gst_amount: number | null;
  vendor_name: string;
  vendor_gstin: string | null;
  description: string;
  bill_photo_names: string[];
  payment_method_used: string | null;
  status: string;
  flagged_duplicate: boolean;
  flagged_diesel_anomaly: boolean;
  reversal_of: string | null;
  submitted_at: string;
}

function rowToTxn(r: TxnRow): Txn {
  return {
    id: r.id,
    projectId: r.project_id,
    supervisorName: r.supervisor_name ?? '',
    category: (r.category as Txn['category']) ?? 'other',
    amount: Number(r.amount),
    gstApplicable: r.gst_applicable,
    baseAmount: r.base_amount ?? undefined,
    gstAmount: r.gst_amount ?? undefined,
    vendorName: r.vendor_name,
    vendorGstin: r.vendor_gstin ?? undefined,
    description: r.description,
    billPhotoNames: r.bill_photo_names ?? [],
    paymentMethodUsed: (r.payment_method_used as Txn['paymentMethodUsed']) ?? undefined,
    status: (r.status as Txn['status']) ?? 'submitted',
    flaggedDuplicate: r.flagged_duplicate,
    flaggedDieselAnomaly: r.flagged_diesel_anomaly,
    reversalOf: r.reversal_of ?? undefined,
    submittedAt: r.submitted_at,
  };
}

function txnToRow(t: Txn): Record<string, unknown> {
  return {
    id: t.id,
    project_id: t.projectId,
    supervisor_name: t.supervisorName,
    category: t.category,
    amount: t.amount,
    gst_applicable: t.gstApplicable,
    base_amount: t.baseAmount ?? null,
    gst_amount: t.gstAmount ?? null,
    vendor_name: t.vendorName,
    vendor_gstin: t.vendorGstin ?? null,
    description: t.description,
    bill_photo_names: t.billPhotoNames,
    payment_method_used: t.paymentMethodUsed ?? null,
    status: t.status,
    reversal_of: t.reversalOf ?? null,
    submitted_at: t.submittedAt,
  };
}

export async function fetchTxns(): Promise<Txn[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('transactions')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data as TxnRow[]).map(rowToTxn);
}

export async function insertTxn(t: Txn): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('transactions').insert(txnToRow(t));
  if (error) throw error;
}

export async function fetchReviews(): Promise<TxnReview[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('transaction_reviews')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    transactionId: r.transaction_id as string,
    reviewerName: (r.reviewer_name as string) ?? '',
    action: r.action as TxnReview['action'],
    reason: (r.reason as string) ?? undefined,
    createdAt: r.created_at as string,
  }));
}

export async function fetchDisbursements(): Promise<Disbursement[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('disbursements')
    .select('*')
    .order('disbursed_at', { ascending: false });
  if (error) throw error;
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    transactionId: r.transaction_id as string,
    disbursedByName: (r.disbursed_by_name as string) ?? '',
    amount: Number(r.amount),
    method: r.method as PaymentMethod,
    referenceNumber: r.reference_number as string,
    isEmergencyOverride: Boolean(r.is_emergency_override),
    disbursedAt: r.disbursed_at as string,
  }));
}

export async function fetchCoApprovals(): Promise<CoApproval[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('director_co_approvals').select('*');
  if (error) throw error;
  return (data as Record<string, unknown>[]).map((r) => ({
    transactionId: r.transaction_id as string,
    approvedByName: (r.approved_by_name as string) ?? '',
    createdAt: r.created_at as string,
  }));
}

export async function fetchThreshold(): Promise<number> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('accounts_config')
    .select('co_approval_threshold')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return Number(data.co_approval_threshold);
}

export async function updateThreshold(value: number): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from('accounts_config')
    .update({ co_approval_threshold: value, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
}

// --- state transitions (RPCs) -----------------------------------------------

export async function reviewTxn(
  id: string,
  action: 'under_review' | 'queried' | 'approved' | 'rejected',
  reason?: string
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('review_transaction', {
    txn: id,
    act: action,
    why: reason ?? null,
  });
  if (error) throw error;
}

export async function clarifyTxn(id: string, note: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('clarify_transaction', { txn: id, note });
  if (error) throw error;
}

export async function coApproveTxn(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('co_approve_transaction', { txn: id });
  if (error) throw error;
}

export async function disburseTxn(
  id: string,
  method: PaymentMethod,
  reference: string,
  override = false
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('disburse_transaction', {
    txn: id,
    pay_method: method,
    reference,
    override,
  });
  if (error) throw error;
}

export async function flagTxn(id: string, note: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('flag_transaction', { txn: id, note });
  if (error) throw error;
}

export async function logTallyExport(
  format: 'xml' | 'csv',
  filters: Record<string, unknown>,
  transactionIds: string[]
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('tally_exports').insert({
    export_format: format,
    filters_used: filters,
    transaction_ids: transactionIds,
  });
  if (error) throw error;
}

export function subscribeAccounts(onChange: () => void): () => void {
  const sb = requireSupabase();
  const channel = sb
    .channel('accounts-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction_reviews' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'disbursements' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'director_co_approvals' }, onChange)
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
