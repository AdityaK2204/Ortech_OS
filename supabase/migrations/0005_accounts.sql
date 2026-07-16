-- =====================================================================
-- ORTECH OS — 0005: Accounts & Transactions module
-- Prereq: 0004_accountant_role.sql (adds 'accountant' to user_role).
--
-- Design (mirrors ORTECH_OS_Accounts_Module.md):
--   transactions          append-only expense claims by supervisors
--   transaction_reviews   append-only audit log of every status action
--   disbursements         append-only payout records
--   director_co_approvals co-signatures for >= threshold amounts
--   accounts_config       single-row config (disbursement threshold)
--   tally_exports         export log (not a source of truth)
--
-- No money leaves without a submitted, approved, photographed record:
-- state transitions happen ONLY through security-definer RPCs that
-- enforce the state machine; nobody has raw UPDATE on transactions.
-- =====================================================================

-- --- helper: is the caller an accountant? ------------------------------
create or replace function public.is_accountant()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'accountant'
  );
$$;

-- Accountant can READ project rows (needed to label transactions with site
-- names and map sites to Tally cost centres) — but has no write policies
-- anywhere outside Accounts, and the app gives them no other screens.
drop policy if exists projects_accountant_read on public.projects;
create policy projects_accountant_read on public.projects
  for select using (public.is_accountant());

-- --- config ------------------------------------------------------------
create table if not exists public.accounts_config (
  id                       int primary key default 1 check (id = 1),
  co_approval_threshold    numeric not null default 10000,
  updated_by               uuid references auth.users(id),
  updated_at               timestamptz not null default now()
);
insert into public.accounts_config (id) values (1) on conflict do nothing;

alter table public.accounts_config enable row level security;
drop policy if exists accounts_config_read on public.accounts_config;
create policy accounts_config_read on public.accounts_config
  for select using (auth.uid() is not null);
drop policy if exists accounts_config_admin on public.accounts_config;
create policy accounts_config_admin on public.accounts_config
  for update using (public.is_admin()) with check (public.is_admin());

-- --- transactions (append-only claims) ---------------------------------
create table if not exists public.transactions (
  id                     uuid primary key,
  project_id             text not null references public.projects(id) on delete cascade,
  submitted_by           uuid references auth.users(id),
  supervisor_name        text,
  category               text not null,
  amount                 numeric not null check (amount > 0),
  gst_applicable         boolean not null default false,
  base_amount            numeric,
  gst_amount             numeric,
  vendor_name            text not null,
  vendor_gstin           text,
  description            text not null,
  bill_photo_names       jsonb not null default '[]'::jsonb,
  payment_method_used    text,          -- cash | upi | paid_by_supervisor | null
  status                 text not null default 'submitted',
    -- submitted | under_review | queried | approved | rejected | disbursed | reversed
  flagged_duplicate      boolean not null default false,
  flagged_diesel_anomaly boolean not null default false,
  reversal_of            uuid references public.transactions(id),
  submitted_at           timestamptz not null default now()
);
create index if not exists transactions_project_idx on public.transactions (project_id, submitted_at);
create index if not exists transactions_status_idx on public.transactions (status);

-- --- reviews (append-only audit log) ------------------------------------
create table if not exists public.transaction_reviews (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  reviewer_id    uuid references auth.users(id),
  reviewer_name  text,
  action         text not null,  -- queried | approved | rejected | escalated | clarified | admin_flag
  reason         text,
  created_at     timestamptz not null default now()
);
create index if not exists reviews_txn_idx on public.transaction_reviews (transaction_id);

-- --- disbursements (append-only payouts) ---------------------------------
create table if not exists public.disbursements (
  id               uuid primary key default gen_random_uuid(),
  transaction_id   uuid not null references public.transactions(id) on delete cascade,
  disbursed_by     uuid references auth.users(id),
  disbursed_by_name text,
  amount           numeric not null,
  method           text not null,  -- cash | upi | bank_transfer
  reference_number text not null,
  is_emergency_override boolean not null default false,
  disbursed_at     timestamptz not null default now()
);
create index if not exists disbursements_txn_idx on public.disbursements (transaction_id);

-- --- director co-approvals ------------------------------------------------
create table if not exists public.director_co_approvals (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  approved_by    uuid references auth.users(id),
  approved_by_name text,
  created_at     timestamptz not null default now(),
  unique (transaction_id)
);

-- --- tally export log -------------------------------------------------------
create table if not exists public.tally_exports (
  id             uuid primary key default gen_random_uuid(),
  export_format  text not null,   -- xml | csv
  filters_used   jsonb not null default '{}'::jsonb,
  requested_by   uuid references auth.users(id),
  transaction_ids jsonb not null default '[]'::jsonb,
  generated_at   timestamptz not null default now()
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.transactions          enable row level security;
alter table public.transaction_reviews   enable row level security;
alter table public.disbursements         enable row level security;
alter table public.director_co_approvals enable row level security;
alter table public.tally_exports         enable row level security;

-- transactions: supervisors see/insert own-site claims; accountant + admin see all.
-- NOBODY gets UPDATE — every status change goes through the RPCs below.
drop policy if exists txn_supervisor_read on public.transactions;
create policy txn_supervisor_read on public.transactions
  for select using (
    public.is_admin() or public.is_accountant() or exists (
      select 1 from public.projects p
      where p.id = project_id and p.supervisor_name = public.my_supervisor_name()
    )
  );

drop policy if exists txn_supervisor_insert on public.transactions;
create policy txn_supervisor_insert on public.transactions
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.supervisor_name = public.my_supervisor_name()
    )
  );

-- reviews / disbursements / co-approvals: readable by the same audience as
-- their transaction; written ONLY via the security-definer RPCs.
drop policy if exists reviews_read on public.transaction_reviews;
create policy reviews_read on public.transaction_reviews
  for select using (
    public.is_admin() or public.is_accountant() or exists (
      select 1 from public.transactions t
      join public.projects p on p.id = t.project_id
      where t.id = transaction_id and p.supervisor_name = public.my_supervisor_name()
    )
  );

drop policy if exists disb_read on public.disbursements;
create policy disb_read on public.disbursements
  for select using (
    public.is_admin() or public.is_accountant() or exists (
      select 1 from public.transactions t
      join public.projects p on p.id = t.project_id
      where t.id = transaction_id and p.supervisor_name = public.my_supervisor_name()
    )
  );

drop policy if exists coappr_read on public.director_co_approvals;
create policy coappr_read on public.director_co_approvals
  for select using (public.is_admin() or public.is_accountant());

drop policy if exists tally_read on public.tally_exports;
create policy tally_read on public.tally_exports
  for select using (public.is_admin() or public.is_accountant());
drop policy if exists tally_insert on public.tally_exports;
create policy tally_insert on public.tally_exports
  for insert with check (public.is_admin() or public.is_accountant());

-- =====================================================================
-- State machine — security-definer RPCs (the ONLY write path)
-- =====================================================================

-- Accountant/admin review action: approve / reject / query / take under review.
create or replace function public.review_transaction(
  txn uuid, act text, why text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  cur text;
  amt numeric;
  threshold numeric;
begin
  if not (public.is_accountant() or public.is_admin()) then
    raise exception 'Only the accountant or a director can review transactions';
  end if;

  select status, amount into cur, amt from public.transactions where id = txn;
  if cur is null then raise exception 'Transaction not found'; end if;

  if act = 'under_review' then
    if cur not in ('submitted', 'queried') then
      raise exception 'Cannot move % to under review', cur;
    end if;
    update public.transactions set status = 'under_review' where id = txn;
  elsif act = 'queried' then
    if cur not in ('submitted', 'under_review') then
      raise exception 'Cannot query a % transaction', cur;
    end if;
    if why is null or length(trim(why)) = 0 then
      raise exception 'A query needs a question for the supervisor';
    end if;
    update public.transactions set status = 'queried' where id = txn;
  elsif act = 'approved' then
    if cur not in ('submitted', 'under_review') then
      raise exception 'Cannot approve a % transaction', cur;
    end if;
    update public.transactions set status = 'approved' where id = txn;
  elsif act = 'rejected' then
    if cur not in ('submitted', 'under_review', 'queried') then
      raise exception 'Cannot reject a % transaction', cur;
    end if;
    if why is null or length(trim(why)) = 0 then
      raise exception 'Rejection requires a reason';
    end if;
    update public.transactions set status = 'rejected' where id = txn;
  else
    raise exception 'Unknown review action %', act;
  end if;

  insert into public.transaction_reviews (transaction_id, reviewer_id, reviewer_name, action, reason)
  values (
    txn, auth.uid(),
    (select coalesce(full_name, email) from public.profiles where id = auth.uid()),
    act, why
  );
end $$;

-- Supervisor answers a query: adds a clarification note, back to under review.
create or replace function public.clarify_transaction(
  txn uuid, note text
) returns void language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  select t.status into cur from public.transactions t
  join public.projects p on p.id = t.project_id
  where t.id = txn and p.supervisor_name = public.my_supervisor_name();
  if cur is null then raise exception 'Transaction not found or not yours'; end if;
  if cur <> 'queried' then raise exception 'Only queried transactions can be clarified'; end if;
  if note is null or length(trim(note)) = 0 then raise exception 'Add the clarification'; end if;

  update public.transactions set status = 'under_review' where id = txn;
  insert into public.transaction_reviews (transaction_id, reviewer_id, reviewer_name, action, reason)
  values (
    txn, auth.uid(),
    (select coalesce(full_name, email) from public.profiles where id = auth.uid()),
    'clarified', note
  );
end $$;

-- Director co-approval for >= threshold amounts.
create or replace function public.co_approve_transaction(txn uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if not public.is_admin() then
    raise exception 'Only a director can co-approve';
  end if;
  select status into cur from public.transactions where id = txn;
  if cur is null then raise exception 'Transaction not found'; end if;
  if cur <> 'approved' then raise exception 'Co-approval applies to approved transactions'; end if;

  insert into public.director_co_approvals (transaction_id, approved_by, approved_by_name)
  values (
    txn, auth.uid(),
    (select coalesce(full_name, email) from public.profiles where id = auth.uid())
  )
  on conflict (transaction_id) do nothing;
end $$;

-- Disburse: THE gate. Approved first; >= threshold also needs co-approval.
-- Admin may use emergency override (logged + flagged), accountant may not.
create or replace function public.disburse_transaction(
  txn uuid, pay_method text, reference text, override boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare
  cur text;
  amt numeric;
  threshold numeric;
  has_co boolean;
  is_dir boolean;
begin
  is_dir := public.is_admin();
  if not (public.is_accountant() or is_dir) then
    raise exception 'Only the accountant or a director can disburse';
  end if;
  if reference is null or length(trim(reference)) = 0 then
    raise exception 'A disbursement needs a reference number';
  end if;
  if pay_method not in ('cash', 'upi', 'bank_transfer') then
    raise exception 'Method must be cash, upi or bank_transfer';
  end if;

  select status, amount into cur, amt from public.transactions where id = txn;
  if cur is null then raise exception 'Transaction not found'; end if;

  if override then
    if not is_dir then raise exception 'Only a director can emergency-override'; end if;
    if cur in ('disbursed', 'reversed', 'rejected') then
      raise exception 'Cannot override a % transaction', cur;
    end if;
  else
    if cur <> 'approved' then
      raise exception 'Only approved transactions can be disbursed (current: %)', cur;
    end if;
    select co_approval_threshold into threshold from public.accounts_config where id = 1;
    if amt >= threshold then
      select exists (
        select 1 from public.director_co_approvals where transaction_id = txn
      ) into has_co;
      if not has_co then
        raise exception 'Amounts of ₹% or more need director co-approval first', threshold;
      end if;
    end if;
  end if;

  update public.transactions set status = 'disbursed' where id = txn;
  insert into public.disbursements
    (transaction_id, disbursed_by, disbursed_by_name, amount, method, reference_number, is_emergency_override)
  values (
    txn, auth.uid(),
    (select coalesce(full_name, email) from public.profiles where id = auth.uid()),
    amt, pay_method, reference, override
  );
end $$;

-- Admin after-the-fact flag: a visible note, never an edit.
create or replace function public.flag_transaction(txn uuid, note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only a director can flag'; end if;
  if note is null or length(trim(note)) = 0 then raise exception 'Flag needs a note'; end if;
  insert into public.transaction_reviews (transaction_id, reviewer_id, reviewer_name, action, reason)
  values (
    txn, auth.uid(),
    (select coalesce(full_name, email) from public.profiles where id = auth.uid()),
    'admin_flag', note
  );
end $$;

-- =====================================================================
-- Automatic duplicate flag — same site + vendor + amount within 72 h.
-- Flags for the accountant's attention; never blocks submission.
-- =====================================================================
create or replace function public.flag_duplicate_txn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.transactions t
    where t.project_id = new.project_id
      and lower(t.vendor_name) = lower(new.vendor_name)
      and t.amount = new.amount
      and t.status <> 'reversed'
      and t.submitted_at > now() - interval '72 hours'
      and t.id <> new.id
  ) then
    new.flagged_duplicate := true;
  end if;
  return new;
end $$;

drop trigger if exists transactions_dup_flag on public.transactions;
create trigger transactions_dup_flag before insert on public.transactions
  for each row execute function public.flag_duplicate_txn();

-- =====================================================================
-- Realtime
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.transaction_reviews;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.disbursements;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.director_co_approvals;
exception when duplicate_object then null; end $$;
