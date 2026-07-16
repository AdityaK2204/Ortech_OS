# ORTECH OS — Accounts & Transactions Module

**Type:** Addendum to ORTECH_OS_PRD.md and ORTECH_OS_TRD.md
**Version:** 1.0
**Status:** Draft for Review

---

## 1. Why This Module Exists

Every rupee ORTECH spends in the field today moves through phone calls, cash-in-hand, and paper bills that surface weeks later — the same visibility gap that motivated ORTECH OS in the first place, just applied to money instead of meters. This module closes that gap with one hard rule:

> **No money leaves the company without a submitted, approved, photographed transaction record.**

Everything below is designed around that single sentence.

---

## 2. Roles & Access (New/Extended)

| Role | Scope | Can submit | Can edit a submitted record | Can approve/reject | Can disburse funds | Access outside Accounts |
|---|---|---|---|---|---|---|
| **Supervisor** | Own assigned site(s) | Yes | No — append-only, can only add a clarification note | No | No | Full supervisor workspace (unrelated to Accounts) |
| **Accountant** *(new role)* | All transactions, company-wide | No | No — never, by design | Yes | Yes, within their disbursement limit | **None.** Accountant is scoped exclusively to the Accounts section — no dashboard, no resources, no project setup |
| **Director / Admin** | Everything | No (not their job) | No | Yes, and required above the configured threshold | Only as an emergency override, which is logged and flagged for review | Full access, everywhere |

**Why the Accountant can't edit anything, ever:** the moment an approver can quietly change the amount or description on a submitted claim, the audit trail stops meaning anything. The Accountant's power is entirely in *status transitions* (approve, reject, query, disburse) — never in touching the original record. If a genuine correction is needed, it happens the way real accounting handles it: a reversal entry referencing the original, not an edit.

**Why Accountant access is walled off from the rest of the product:** you asked for this explicitly, and it's good practice independent of that — someone who only touches money shouldn't be able to see or influence site schedules, supervisor performance, or resource allocation, and vice versa. It also means if the Accountant's login is ever compromised, the blast radius is the Accounts module only.

---

## 3. The Control You Didn't Ask For But Need

You said the Accountant "can transact with the company money, which should be reported there." That's correct and necessary — but a single role with unilateral approve-and-pay power over unlimited amounts is the single most common fraud vector in small finance teams, intentional or not (one person under pressure, one mistake, one bad month).

**Recommendation: a configurable disbursement threshold.**
- Below the threshold (e.g., ₹10,000 — you set the number): Accountant can approve and disburse solo. This covers the overwhelming majority of diesel/toll/small-material transactions and keeps the day-to-day fast.
- At or above the threshold: the transaction still goes through the Accountant first, but requires a Director/Admin co-approval before it can be marked disbursed. The Director sees exactly what the Accountant saw — same photo, same description, same amount — and approves or blocks with a reason.
- Every threshold-triggered co-approval, and every solo Accountant action, is visible to Admin in real time regardless of value. Admin isn't in the approval loop for small transactions, but they can see everything and flag anything for review after the fact.

This one rule turns "one person can move company money" into "one person can move company money *up to a limit you set*," without slowing down the 90% of transactions that don't need a second signature.

---

## 4. Transaction Lifecycle (State Machine)

```
Draft → Submitted → Under Review → Approved → (Director co-approval if ≥ threshold) → Disbursed
                          ↓
                       Queried → (supervisor adds info) → back to Under Review
                          ↓
                       Rejected (reason required, terminal unless resubmitted as new)
```

**Rules:**
- A transaction cannot reach **Disbursed** without first being **Approved**. This is enforced by the application, not just by policy — the "mark as disbursed" action is simply unavailable until status = Approved (and, if applicable, Director co-approved).
- **Submitted** and later states are immutable. Corrections after submission happen via a **Reversal** transaction that references the original, never an in-place edit.
- **Queried** lets the Accountant ask for a clearer photo or missing detail without rejecting outright — keeps the supervisor from having to resubmit from scratch for something minor.
- **Rejected** requires a reason, visible to the supervisor, and doesn't block them from submitting a fresh, corrected claim.

---

## 5. Supervisor Submission Flow

**Where it lives:** a new "Expenses" tab inside the existing Supervisor Workspace (Module A), sitting alongside Daily Pulse and Material Requests — same app, same login, no new tool to learn.

**Fields:**

| Field | Required | Notes |
|---|---|---|
| Category | Yes | Diesel, Materials, GST invoice, Non-GST / cash expense, Wages or labour advance, Toll / parking, Equipment rental, Site consumables, Other. Admin-configurable list — "let it be anything" means the taxonomy is extensible, not that transactions go uncategorized |
| Amount | Yes | Numeric |
| Site / project | Yes | Auto-filled if supervisor has one active site, selectable if more |
| Has GST invoice? | Yes | Toggle. If yes: vendor GSTIN (optional, OCR-assisted in a later phase), base amount, GST amount split out separately — this is what makes the record usable for input tax credit later |
| Vendor / paid to | Yes | Free text; a running vendor list is suggested as they type, to keep spellings consistent for Tally |
| Description | Yes | What the payment was for, in the supervisor's own words |
| Photo of bill / invoice | Yes | Camera capture, not gallery upload, to reduce after-the-fact fabricated receipts. Works offline, syncs when connectivity returns, same pattern as the Daily Pulse photo |
| Payment method already used | No | Cash / UPI / already paid by supervisor, informs how reimbursement should happen |

**Acceptance criteria:** submission takes under 90 seconds including the photo. A supervisor can see the status of every claim they've ever submitted (Submitted / Queried / Approved / Rejected / Disbursed) in a simple list — this alone kills most of the "did my diesel money go through" phone calls.

**Built-in fraud/error checks (automatic, invisible to the supervisor unless triggered):**
- **Duplicate flag:** same amount + vendor + site within a short window auto-flags for the Accountant's attention, doesn't block submission.
- **Diesel cross-check:** a diesel expense is automatically compared against that machine's diesel log and baseline (from the Alert Engine already built for Module C). If the claimed litres are wildly out of line with what the machine's daily pulse diesel log shows, the claim is flagged for the Accountant before it reaches the approval queue — the money module and the operations module talking to each other instead of living in separate silos.

---

## 6. Accountant Workspace

This is the one screen the Accountant lives in all day, so it's built to make triage fast:

- **Queue view**, default sorted oldest-first: every Submitted/Queried transaction, with amount, category, site, supervisor, and a thumbnail of the bill photo visible without opening the record.
- **One-tap approve / reject / query** from the queue itself for straightforward cases; full detail view (photo zoom, GST breakup, site context) one tap away for anything that needs a closer look.
- **Flags surfaced first:** duplicate-flagged and diesel-anomaly-flagged transactions sit at the top of the queue, visually marked, so the Accountant sees the risky ones before the routine ones.
- **Running ledger view:** total disbursed by site, by category, by month — the Accountant's version of the Director's Mission Control dashboard, scoped to money instead of meters.
- **Disbursement recording:** marking something Disbursed requires method (cash/UPI/bank transfer) and a reference number, so every payout has its own paper trail independent of the original claim.
- **Export for Tally:** covered in full below — front and center on this screen, not buried in a settings menu.

---

## 7. Admin Oversight View

Admin gets a read-only mirror of everything — every transaction, every status change, every disbursement, across every site and every Accountant action — filterable by site, supervisor, category, date range, and status. Admin cannot edit or approve routine transactions (that's the Accountant's job, and duplicating it defeats the separation of duties), but can:
- Co-approve threshold-triggered transactions (Section 3).
- Flag any transaction for review after the fact, which creates a visible note on the record without altering it.
- See a live "money out" figure per project, which sits next to the existing Billing Readiness view (Module E) so a Director can see cost-to-date against billing-recovered-to-date on the same screen — project profitability, not just project completion.

---

## 8. Tally Integration

Real-time, fully automatic sync into Tally isn't a clean fit for a cloud product talking to software that typically runs on a local machine — Tally's live API (its XML/HTTP gateway) only works when Tally is actively running with that gateway enabled on a reachable network, which is a client-side setup ORTECH doesn't control. So this is built in two honest phases rather than overpromising a one-click sync.

### Phase 1 (V1) — Tally-ready export, zero extra infrastructure
- Accountant or Admin selects a date range, site, category, or supervisor, and exports.
- Two formats generated:
  - **Tally XML** (voucher import format) — imports directly via Tally's own *Gateway of Tally → Import Data → Vouchers* menu. No typing, no reformatting.
  - **CSV/Excel** as a fallback for accountants who prefer to review before import, or whose Tally setup needs manual entry.
- **Field mapping**, so the export lands correctly on the Tally side:

| ORTECH OS field | Tally field |
|---|---|
| Category | Voucher type (Purchase for GST invoices, Payment for cash/non-GST) |
| Site / project | Cost Centre — every ORTECH site becomes a Tally Cost Centre, so Tally-side reports can slice spend by site automatically |
| Vendor | Party ledger |
| Amount / GST split | Amount, CGST/SGST/IGST ledgers |
| Description | Narration |
| Disbursement date | Voucher date |

This mapping is the single most valuable technical decision in this section: because every ORTECH site already exists as an entity in your data model, mapping it 1:1 to a Tally Cost Centre means your field-level spend visibility carries straight through into the accountant's actual books, instead of being ORTECH-only data that gets manually re-keyed.

### Phase 2 (post-V1, only if Phase 1 proves insufficient) — semi-live push
A small local "sync agent" installed on the accountant's own machine (where Tally already runs) polls ORTECH OS's API for newly approved transactions and pushes them into Tally's local XML gateway automatically. This removes the manual import step entirely, but it's real infrastructure — a locally installed agent, a service account, error handling for when Tally isn't running — and isn't worth building until Phase 1's export is in daily use and the manual import step is a proven bottleneck rather than a guess.

---

## 9. Data Model Additions (extends the TRD)

```
transactions (append-only)
 ├─ id, site_id, project_id, submitted_by, category
 ├─ amount, gst_applicable, gst_amount, vendor_name, vendor_gstin
 ├─ description, bill_photo_urls[], payment_method_requested
 ├─ status, flagged_duplicate, flagged_diesel_anomaly
 └─ submitted_at

transaction_reviews (append-only audit log)
 ├─ id, transaction_id, reviewer_id, action (queried/approved/rejected/escalated)
 ├─ reason, created_at

disbursements (append-only)
 ├─ id, transaction_id, disbursed_by, amount, method, reference_number, disbursed_at

director_co_approvals
 ├─ id, transaction_id, approved_by, created_at

tally_exports (log, not a source of truth)
 ├─ id, export_format, filters_used, requested_by, transaction_ids[], generated_at
```

Same rules as the rest of ORTECH OS: `transactions`, `transaction_reviews`, and `disbursements` are append-only. A correction is a new row referencing the old one, never an update.

---

## 10. Success Metrics

| Metric | Target |
|---|---|
| Time from field expense to reimbursement | Same-week, down from ad hoc/delayed |
| % of transactions with photographic evidence | 100% (enforced at submission) |
| Transactions disbursed without a matching approval | 0 (enforced by the state machine) |
| Accountant time spent re-keying data into Tally | Reduced via direct XML import instead of manual entry |
| Duplicate/anomalous claims caught before disbursement | Same-day, via automatic flagging |

---

## 11. Open Questions for You to Confirm

- What disbursement threshold should trigger Director co-approval? (₹10,000 used as a placeholder above.)
- Should wage/labour advances follow this same flow, or do they need a separate recurring-advance pattern (since they're often periodic rather than one-off bills)?
- Does the Accountant disburse funds directly (cash from an office float, UPI transfer), or does disbursement just mean "cleared for the existing payroll/payment process to act on"? This changes whether "Disbursed" is the final state or whether a separate finance system closes the loop.
- Should suppliers/vendors become a proper master list (so GSTINs and ledger names stay consistent for Tally) rather than free text from day one?
