# ORTECH OS — Product Requirements Document (PRD)

**Version:** 1.0 (Detailed)
**Status:** Draft for Review
**Owner:** [Product Owner Name]
**Last Updated:** July 2026

---

## 1. Document Purpose

This PRD defines *what* ORTECH OS V1 must do, for whom, and why — at a level of detail sufficient for design and engineering to scope, estimate, and build without ambiguity. It is paired with a separate Technical Requirements Document (TRD) that defines *how* it will be built.

---

## 2. Executive Summary

ORTECH currently manages infrastructure execution through phone calls and WhatsApp, which leaves management blind to real-time site status. ORTECH OS V1 replaces the *reporting* function of those channels with a lightweight, structured, mobile-first system that captures a small daily data point from every active site, surfaces problems automatically, and feeds that same data into billing — without adding administrative burden to supervisors.

**V1 promise:** Management can answer "what's wrong and where" in under one minute, every day, without making a phone call.

---

## 3. Goals & Success Criteria

### 3.1 Primary Goals
1. Give management same-day visibility into site progress and delays.
2. Make supervisor performance objectively measurable.
3. Surface machine/diesel inefficiency automatically.
4. Reduce billing preparation time by capturing billing data continuously.
5. Reduce reliance on phone calls as the primary status-reporting channel.

### 3.2 Success Metrics

| Metric | Baseline | V1 Target | Measurement Method |
|---|---|---|---|
| % of active sites with same-day check-in | ~0% (untracked) | ≥90% | Daily check-in logs |
| Time to detect a delayed site | Days | Same day | Alert timestamp vs. actual delay start |
| Time to prepare a bill post-completion | Multi-day manual effort | Reduced by ≥50% | Time from site closure to bill package export |
| Diesel anomalies caught | Rare | Within the same week | Alert logs vs. anomaly occurrence |
| Daily status-check phone calls (management-reported) | High | Reduced measurably | Manager self-report survey, pre/post |

### 3.3 Non-Goals (Explicitly Out of Scope for V1)
- Payroll or HR management
- Full accounting/GST/invoicing engine (V1 exports billing *data*, not final invoices)
- Predictive analytics, AI-based scheduling, automated resource allocation
- Public or company-wide leaderboards/gamification
- Multi-tenant/white-label support (single-company deployment only)

---

## 4. Personas

### 4.1 Director / Management ("Rakesh")
Oversees 15–40 active sites across multiple clusters. Currently spends 3–4 hours/day on status calls. Needs a fast way to see which sites need intervention *today*. Not deeply technical; wants a dashboard he can scan in under a minute, on desktop or phone.

### 4.2 Site Supervisor ("Manoj")
Manages 1–3 sites, on-site most of the day, often in low-connectivity areas. Comfortable with WhatsApp-level phone usage, not enterprise software. Will abandon any tool that takes more than a minute or requires typing long text. Motivated by being seen as competent, not punished for problems.

### 4.3 Accounts / Billing Admin ("Priya")
Prepares client bills from measurement sheets, photos, and progress records currently scattered across WhatsApp threads and paper. Needs a single exportable package per project with everything required to generate a bill.

### 4.4 Cluster/Regional Manager ("Suresh") — secondary persona
Sits between supervisors and directors; owns a subset of sites and is the first responder to alerts in that subset.

---

## 5. Scope Overview (V1 Modules)

| # | Module | Primary User |
|---|---|---|
| A | Supervisor Workspace (Daily Pulse, Material Requests, Closure Report) | Supervisor |
| B | Mission Control Dashboard | Director, Cluster Manager |
| C | Alert Engine | Director, Cluster Manager |
| D | Resource Management (Machines, Supervisors, Materials) | Director, Admin |
| E | Billing Support (Continuous Ledger, Export Package) | Accounts |
| F | Project/Site Setup | Director, Admin |

---

## 6. Detailed Functional Requirements & User Stories

### Module A — Supervisor Workspace

**A1. Daily Site Pulse**
> *As a supervisor, I want to submit today's progress in under a minute, so I don't have to answer phone calls tonight.*

Fields: assigned site (auto-detected if only one site; selectable if multiple), target quantity (pre-filled, read-only), actual quantity completed (numeric input), diesel used in liters (numeric, optional if no machine on site today), at least 1 photo, issue flag (single-select: None / Manpower shortage / Machine breakdown / Material shortage / Weather / Client-side delay / Other), optional free-text note (max 200 characters).

**Acceptance Criteria:**
- Form loads with target pre-filled from the site's plan; supervisor never has to look it up.
- Submission is possible with only 3 required fields: actual quantity, photo, issue flag (default "None"). Everything else optional to avoid friction.
- Form works fully offline; queues for sync when connectivity returns.
- Submission takes under 60 seconds for a supervisor with no issues to report.
- Once submitted, that day's entry is locked from further edits (can be appended with a note, not overwritten) to preserve data integrity.
- If no submission by the configured cutoff time, the site status becomes "No Update" and an alert is generated (see C1).

**A2. Material Request**
> *As a supervisor, I want to request materials from the site, so I don't run out mid-task and lose a day.*

Fields: material (from catalog), quantity, urgency (Normal / Urgent), optional note.
**Acceptance Criteria:** Request appears in Admin's queue immediately (or on next sync); supervisor sees request status (Pending / Approved / Dispatched / Rejected).

**A3. Site Closure Report**
> *As a supervisor, I want to formally close out a completed site, so accounts has everything they need for billing without chasing me.*

Fields: final measured quantity, final photo set, outstanding issues (if any), supervisor sign-off (name + timestamp, digital confirmation).
**Acceptance Criteria:** Closure report can only be submitted once all daily pulses for the site's active duration exist or are explicitly marked "no activity" for gaps; closure locks the site from further daily pulses.

**A4. Multi-site supervisors**
Supervisors assigned to more than one site see a simple site-switcher at the top of the workspace; each site has its own independent daily pulse requirement.

---

### Module B — Mission Control Dashboard

**B1. Site Status Overview**
> *As a director, I want to see every active site's status at a glance, so I know where to focus today.*

Each site shows a status badge:
- 🟢 **On Track** — actual ≥ 90% of cumulative target
- 🟡 **At Risk** — actual 70–89% of cumulative target, or 1 missed check-in
- 🔴 **Behind** — actual < 70% of cumulative target, or 2+ consecutive missed check-ins
- ⚪ **No Update Today** — no pulse submitted yet today (time-of-day dependent)

**Acceptance Criteria:** Status list loads in under 2 seconds for up to 200 concurrent sites; filterable by cluster, project, and status; sortable by "most behind."

**B2. Site Drill-Down**
> *As a director, I want to open a site and understand why it's behind without calling anyone.*

Shows: target-vs-actual trendline (daily), last check-in timestamp and submitter, all reported issues with dates, photo gallery, diesel log, material request history.

**B3. Supervisor Performance View**
> *As a director, I want to know which supervisors are performing well and which need support.*

Shows per supervisor: schedule adherence % (difficulty-adjusted — see 6.B3.1), check-in consistency %, issue-reporting rate (positive framing — supervisors who report issues promptly are flagged as *proactive*, not penalized).

**B3.1 Difficulty Adjustment:** Each site is tagged at setup with a difficulty multiplier (Easy/Medium/Hard, set by management based on terrain/access/client complexity). Adherence % for ranking purposes is normalized against this multiplier so a supervisor on a Hard site isn't unfairly ranked below one on an Easy site.

**B4. Machine View**
Shows per machine: current site assignment, cumulative hours run, diesel consumed vs. rolling 30-day baseline, utilization % (days active / days assigned).

**B5. Billing Readiness View**
Shows per project: % of billable data captured (based on how many required data points — measurements, photos, closure sign-off — exist vs. required), flags projects that are 100% ready for bill export.

**B6. Alerts Feed**
Chronological, filterable feed of all open and resolved alerts (see Module C).

---

### Module C — Alert Engine

**C1. Silence Alert**
Trigger: No daily pulse submitted for an active site by the configured cutoff time (default 6:00 PM local site time).
Routed to: assigned Cluster Manager, escalates to Director if unacknowledged after 2 hours.

**C2. Schedule Slippage Alert**
Trigger: Actual-vs-target falls below threshold (default <70%) for N consecutive days (default 2).
Includes: site, supervisor, cumulative variance, most recent reported issue (if any).

**C3. Diesel Anomaly Alert**
Trigger: A machine's diesel consumption on a given day exceeds its rolling baseline by a configurable % (default 15%).

**C4. Material Shortage Alert**
Trigger: A material request marked "Urgent" remains unactioned for more than a configurable duration (default 4 hours).

**C5. Alert Lifecycle**
Every alert has a state machine: `Open → Acknowledged → Resolved` (or `Escalated` if unacknowledged past SLA). Every alert stores who acknowledged/resolved it and when, forming an audit trail of management responsiveness — not just supervisor performance.

**Acceptance Criteria:** All alert thresholds must be configurable per client/project by an admin without requiring a code change.

---

### Module D — Resource Management

**D1.** Admin can register/edit machines (ID, type, baseline diesel rate, current assignment).
**D2.** Admin can register/edit supervisors (name, contact, assigned sites, role level).
**D3.** Admin can maintain a materials catalog (name, unit of measure).
**D4.** Admin can reassign a machine or supervisor to a different site; historical logs remain tied to the site/date they occurred, not the current assignment.

---

### Module E — Billing Support

**E1.** System continuously aggregates verified daily pulses, photos, and closure report data into a per-site billing ledger — no manual re-entry.
**E2.** Accounts can view billing-readiness % (see B5) for any project at any time.
**E3.** Accounts can export a "Billing Package" (PDF/ZIP) per completed project containing: cumulative measurements, dated photo evidence, diesel/material logs (if relevant to contract terms), closure sign-off.
**E4.** Exported package is read-only and timestamped, forming a defensible record for client bill submission.

---

### Module F — Project/Site Setup

**F1.** Admin creates Project → Cluster → Site hierarchy.
**F2.** For each site: set planned quantity, start/end date, difficulty rating, assigned supervisor(s), assigned machine(s).
**F3.** Planned quantity can be revised mid-project (e.g., scope change), with a logged reason and timestamp — history is preserved, not overwritten.

---

## 7. Key User Flows

1. **Supervisor daily flow:** Open app → site auto-selected → enter actual quantity → attach photo → select issue (or "None") → submit → done (<60s).
2. **Director morning flow:** Open dashboard → scan status badges → click into red/amber sites → review issue + last update → assign follow-up if needed.
3. **Accounts billing flow:** Open project → check billing-readiness % → if 100%, export billing package → hand to client-facing team.
4. **Alert response flow:** Alert fires → routed to Cluster Manager → acknowledge → resolve or escalate → logged.

---

## 8. Edge Cases & Business Rules

- **No machine on site that day:** Diesel field must be skippable without blocking submission.
- **Site with zero planned quantity (e.g., mobilization-only day):** Status defaults to "On Track" regardless of actual, since there is no numeric target to miss.
- **Multiple supervisors on one site (shift-based):** Each shift submits its own pulse; site-level status aggregates all pulses for the day.
- **Retroactive corrections:** A supervisor cannot delete a submitted pulse; corrections are submitted as a dated addendum, preserving the original entry for audit purposes.
- **Site paused (client-side hold):** Admin can mark a site "On Hold," which suspends silence/slippage alerts until resumed.
- **Weather/force majeure:** Issue flag "Weather" excludes that day from the slippage alert calculation, but is still visible on the trendline.

---

## 9. Release Phasing

| Phase | Scope | Exit Criteria |
|---|---|---|
| Phase 1 | Module F (setup) + Module A (Daily Pulse) + Silence Alert only | ≥90% daily check-in compliance across a pilot cluster |
| Phase 2 | Module B (Dashboard) + full Module C (Alert Engine) | Directors report reduced status-call volume |
| Phase 3 | Module D (Resources) + Module E (Billing Support) | First billing package generated entirely from captured data |
| Phase 4 (Post-V1) | Leaderboards, incentives, predictive analytics | Only after ≥2 months of trusted data history |

---

## 10. Assumptions & Dependencies

- Supervisors have access to an Android smartphone with a working camera.
- Sites have at least intermittent connectivity (daily sync is sufficient; does not need to be real-time).
- Management is willing to set realistic planned quantities per site at project setup — the whole "on track/behind" model depends on this baseline being reasonably accurate.
- Diesel/machine baselines require at least 2–3 weeks of historical data before anomaly detection is meaningful; early alerts may need wider thresholds.

## 11. Open Questions

- Should photo evidence require GPS/timestamp watermarking for audit defensibility?
- Is a manual verification step needed before data flows into the billing ledger, or is supervisor-submitted data trusted as-is in V1?
- Who is the default escalation owner when a Cluster Manager doesn't exist for a given project?
- What is an acceptable cutoff time variance across sites in different time zones or shift patterns?
