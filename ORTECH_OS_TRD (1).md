# ORTECH OS — Technical Requirements Document (TRD)

**Version:** 1.0 (Detailed)
**Status:** Draft for Review
**Companion Document:** ORTECH_OS_PRD.md
**Last Updated:** July 2026

---

## 1. Purpose & Scope

This TRD defines the technical architecture, data model, APIs, and non-functional requirements needed to build ORTECH OS V1 as specified in the PRD. It is written to be stack-agnostic where possible, with a recommended default stack, so engineering can adapt to existing team expertise.

---

## 2. Architectural Principles

1. **Offline-first, sync-later.** The supervisor mobile client must be fully functional with zero connectivity; the backend must tolerate delayed, out-of-order, and batched writes.
2. **Event-sourced site history.** Daily pulses, alerts, and closures are immutable events, not mutable rows — corrections are additive, never destructive (supports the PRD's audit-trail requirements).
3. **Thin client, smart backend.** Business rules (status calculation, alert thresholds, difficulty-adjusted ranking) live server-side so they can change without a mobile app release.
4. **Modular monolith over microservices for V1.** Team size and operational complexity don't justify microservices yet; a well-modularized monolith with clear internal boundaries (mirroring PRD Modules A–F) is faster to build and easier to operate, with extraction points identified for future scale.
5. **Config over code for thresholds.** Alert thresholds, cutoff times, and difficulty multipliers must be admin-configurable at runtime, not hardcoded.

---

## 3. High-Level System Architecture

**Components:**
- **Supervisor Mobile App** (Android-first, offline-capable) — Module A
- **Management Web Dashboard** (responsive, desktop-primary) — Modules B, D, E, F
- **Backend API** (REST, modular monolith) — all modules
- **Alert/Rules Engine** (scheduled + event-driven jobs) — Module C
- **Primary Database** (relational, transactional integrity for billing data)
- **Object Storage** (photos, exported billing packages)
- **Notification Service** (push notifications, SMS/WhatsApp fallback for alerts)
- **Sync Queue** (handles offline mobile writes, conflict resolution)

**Data flow (daily pulse example):**
`Mobile app (offline write to local store) → Sync Queue → Backend API → Primary DB (event log) → Rules Engine (recompute site status) → Dashboard (reads updated status) + Alert Engine (checks thresholds)`

---

## 4. Recommended Technology Stack

| Layer | Recommendation | Rationale |
|---|---|---|
| Supervisor mobile app | React Native (or Flutter) | Single codebase, strong offline-storage libraries (WatermelonDB / SQLite), good camera/GPS access |
| Local offline store (mobile) | SQLite via WatermelonDB or Realm | Mature offline-first sync patterns, conflict handling |
| Management web dashboard | React + TypeScript | Component reuse potential with mobile team, wide hiring pool |
| Backend API | Node.js (NestJS) or Python (FastAPI/Django) | Both support rapid REST development; choose based on team's existing expertise |
| Primary database | PostgreSQL | Strong relational integrity for billing-critical data, JSONB support for flexible fields (e.g., issue metadata) |
| Object storage | S3-compatible (AWS S3 / DigitalOcean Spaces / MinIO for self-hosted) | Photo and export storage, signed URLs for secure access |
| Background jobs / alert engine | BullMQ (Node) or Celery (Python) with Redis | Scheduled checks (cutoff-time silence detection) + event-driven triggers |
| Push notifications | Firebase Cloud Messaging | Free tier sufficient for V1 scale, cross-platform |
| SMS/WhatsApp fallback | Twilio or WhatsApp Business API | For alert escalation to management when app isn't checked |
| Hosting | AWS / GCP / Azure (single-region to start) | Standard managed Postgres + compute; avoid over-engineering for V1 scale |
| Authentication | JWT-based, role-based access control (RBAC) | Simple, stateless, supports mobile + web clients |

*Note: this is a recommendation, not a mandate — the architecture in Section 3 is stack-agnostic and should hold regardless of final language/framework choice.*

---

## 5. Data Model

### 5.1 Core Entities

```
Company
 └─ Project
     └─ Cluster
         └─ Site
             ├─ SiteAssignment (Supervisor, Machine, Crew)
             ├─ PlannedTarget (quantity, start_date, end_date, difficulty_rating)
             ├─ DailyPulse (immutable event log)
             ├─ MaterialRequest
             ├─ DieselLog
             ├─ SiteClosureReport
             └─ BillingLedgerEntry

User (Supervisor / Director / ClusterManager / Accounts / Admin)
Machine (type, baseline_diesel_rate, current_site_id)
MaterialCatalogItem
Alert (site_id, type, status, assigned_to, created_at, acknowledged_at, resolved_at)
```

### 5.2 Key Table Definitions (Illustrative Schema)

**`sites`**
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| cluster_id | UUID | FK |
| name | text | |
| difficulty_rating | enum(easy, medium, hard) | drives ranking normalization |
| status | enum | derived/cached: on_track, at_risk, behind, no_update — recomputed by rules engine |
| planned_quantity | numeric | |
| unit_of_measure | text | e.g., meters, RM |
| start_date / end_date | date | |
| on_hold | boolean | pauses alerts |

**`daily_pulses`** (immutable event log — never updated, only appended)
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| site_id | UUID | FK |
| supervisor_id | UUID | FK |
| pulse_date | date | |
| actual_quantity | numeric | |
| diesel_used_liters | numeric, nullable | |
| issue_flag | enum | none, manpower, machine, material, weather, client, other |
| note | text, nullable | |
| photo_urls | array<text> | object storage references |
| submitted_at | timestamp | client-side timestamp, for offline-submitted entries |
| synced_at | timestamp | server receipt time |
| is_addendum | boolean | true if correcting a prior entry (never overwrites) |
| addendum_to | UUID, nullable | FK to original pulse if applicable |

**`alerts`**
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| site_id | UUID | FK |
| type | enum | silence, slippage, diesel_anomaly, material_shortage |
| status | enum | open, acknowledged, resolved, escalated |
| assigned_to | UUID | FK to user |
| payload | JSONB | context data (e.g., variance %, baseline vs. actual) |
| created_at / acknowledged_at / resolved_at | timestamp | |

**`billing_ledger_entries`**
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| site_id | UUID | FK |
| source_type | enum | daily_pulse, closure_report |
| source_id | UUID | FK to originating record |
| verified_quantity | numeric | |
| evidence_urls | array<text> | |
| created_at | timestamp | |

### 5.3 Data Integrity Rules
- `daily_pulses` and `billing_ledger_entries` are append-only tables — no UPDATE or DELETE at the application layer; corrections are new rows referencing the original.
- Site `status` is a derived/cached field recomputed by the rules engine on every new pulse or on a scheduled interval — never written directly by clients.
- All monetary/billing-relevant tables require audit columns (`created_by`, `created_at`) for defensibility in client billing disputes.

---

## 6. API Design (REST, Illustrative)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/sites/{siteId}/pulses` | Submit a daily pulse (supports offline batch submission with client timestamps) |
| GET | `/api/v1/sites/{siteId}/pulses?from=&to=` | Retrieve pulse history for drill-down |
| GET | `/api/v1/dashboard/sites?status=&cluster=` | Fetch site status list for Mission Control |
| GET | `/api/v1/sites/{siteId}` | Site detail (target, actuals, trendline, logs) |
| POST | `/api/v1/sites/{siteId}/material-requests` | Submit material request |
| PATCH | `/api/v1/material-requests/{id}` | Approve/dispatch/reject (admin) |
| POST | `/api/v1/sites/{siteId}/closure` | Submit site closure report |
| GET | `/api/v1/supervisors/{id}/performance` | Difficulty-adjusted performance metrics |
| GET | `/api/v1/machines/{id}/diesel-log` | Diesel history + baseline comparison |
| GET | `/api/v1/alerts?status=open&type=` | Alert feed |
| PATCH | `/api/v1/alerts/{id}` | Acknowledge/resolve/escalate |
| GET | `/api/v1/projects/{id}/billing-readiness` | Billing readiness % |
| POST | `/api/v1/projects/{id}/billing-package/export` | Generate billing export (async job, returns download URL when ready) |
| POST | `/api/v1/sync/batch` | Bulk offline-sync endpoint accepting queued mobile writes with idempotency keys |

**Idempotency:** All write endpoints accepting offline-queued data must accept a client-generated idempotency key to prevent duplicate submissions on retry after a dropped connection.

---

## 7. Offline Sync Strategy (Module A)

1. Mobile app writes all submissions to local SQLite immediately; UI reflects the local write as "Saved (pending sync)."
2. Background sync process attempts upload whenever connectivity is detected; uses exponential backoff on failure.
3. Each local record carries a client-generated UUID and idempotency key so retries don't create duplicates server-side.
4. Conflict policy: since `daily_pulses` are append-only and scoped to (site, supervisor, date), true conflicts are rare; if two entries exist for the same site/date (e.g., shift handoff), both are retained and the dashboard aggregates them rather than picking one as canonical.
5. Photos are queued for upload separately from the metadata record, with the pulse referencing photo upload status; a pulse can sync with "photo pending" state and backfill the photo URL once uploaded, so poor connectivity doesn't block the numeric data from reaching management.

---

## 8. Alert / Rules Engine Design (Module C)

**Execution model:** Hybrid — event-driven (triggered immediately on new pulse ingestion) + scheduled (cron-style jobs for time-based checks like cutoff silence).

| Alert Type | Trigger Mechanism | Frequency |
|---|---|---|
| Silence | Scheduled job at configured cutoff time per site/timezone | Daily |
| Slippage | Event-driven, recalculated on each new pulse | Real-time |
| Diesel anomaly | Event-driven, on each diesel log entry, compared to rolling 30-day baseline (excluding flagged anomaly days from the baseline calc to avoid self-reinforcing drift) | Real-time |
| Material shortage (urgent, unactioned) | Scheduled job checking request age | Every 30–60 min |

**Configurability:** All thresholds (cutoff time, slippage %, consecutive-day count, diesel anomaly %) stored in a `project_config` or `company_config` table, editable via admin UI — never hardcoded in the rules engine logic.

**Escalation SLA:** Each alert type has a configurable acknowledgment SLA (default 2 hours); a scheduled job checks for unacknowledged alerts past SLA and escalates to the next role up (Cluster Manager → Director).

---

## 9. Security & Access Control

### 9.1 Roles (RBAC)

| Role | Access |
|---|---|
| Supervisor | Own assigned site(s) only: submit pulses, requests, closures |
| Cluster Manager | All sites within assigned cluster(s): view, acknowledge/resolve alerts |
| Director | All projects/clusters/sites: full read, configuration access |
| Accounts | Billing views and exports across all projects; no ability to edit operational data |
| Admin | User management, resource registration, threshold configuration |

### 9.2 Requirements
- JWT-based auth with short-lived access tokens + refresh tokens; mobile app supports offline auth via securely cached credentials with a defined re-auth interval.
- All API endpoints enforce role checks server-side (never trust client-side role assumptions).
- Photo and document storage uses signed, time-limited URLs — no publicly readable buckets.
- All billing-relevant data changes are logged in an immutable audit table (who, what, when) to support client billing disputes.
- PII (supervisor contact info) access restricted to Admin and Director roles.

---

## 10. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Dashboard site-list view loads in <2s for up to 200 concurrent active sites |
| Offline resilience | Supervisor app fully functional for at least 72 hours with zero connectivity before local storage concerns arise |
| Availability | Backend API target 99.5% uptime (single-region acceptable for V1; not mission-critical-realtime like a trading system) |
| Data retention | Daily pulses, alerts, and billing ledger entries retained indefinitely (billing/audit requirement); photos retained minimum 3 years or per contract requirement |
| Scalability | Architecture should comfortably support 500 sites / 300 supervisors without redesign; horizontal scaling path documented for beyond that |
| Backup | Daily automated Postgres backups, point-in-time recovery enabled |
| Localization | Support for regional language labels in supervisor app UI (config-driven, not hardcoded strings) given field-user comfort level |
| Device support | Supervisor app must run acceptably on low-to-mid-range Android devices (assume 2–3GB RAM baseline) |

---

## 11. Monitoring & Observability

- Application-level logging for all API requests, with correlation IDs tracing a mobile submission through sync → ingestion → rules engine → alert generation.
- Dashboard for internal ops team: sync failure rates, alert-engine job health, average time-to-acknowledge per alert type.
- Error tracking (e.g., Sentry) on both mobile and backend to catch offline-sync edge cases early — this is the highest-risk technical area given field connectivity variability.

---

## 12. Integration Points (Present & Future)

| Integration | V1 Status | Notes |
|---|---|---|
| Push notifications (FCM) | In scope | Alert delivery to management |
| SMS/WhatsApp fallback | In scope (basic) | Escalation alerts when app notifications aren't acted on |
| Accounting/ERP export | Out of scope (V1 exports data package only, not a direct integration) | Revisit post-V1 based on accounts team's actual tooling |
| GPS/geofencing on photo capture | Recommended, not mandatory for V1 | Strengthens billing evidence defensibility; can be Phase 2 |
| Weather API (auto-tagging weather delays) | Post-V1 | Nice-to-have to reduce reliance on manual "Weather" flag |

---

## 13. Technical Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Offline sync conflicts / data loss in poor-connectivity zones | Append-only design + client-side idempotency keys + local retry queue with generous retention window |
| Rules engine miscalibration causing alert fatigue (too many false positives) | All thresholds configurable; start conservative, tune based on Phase 1 pilot data before wider rollout |
| Photo storage costs at scale | Compress on-device before upload; set a sensible max photo count per pulse (e.g., 3) |
| Diesel baseline unreliable in first weeks (cold start) | Suppress diesel anomaly alerts until a machine has ≥10 days of logged history; use company-wide baseline by machine type as interim fallback |
| Team unfamiliarity with offline-first mobile patterns | Budget extra time in Phase 1 for this specifically; consider a proven library (WatermelonDB) over building sync from scratch |

---

## 14. Out of Scope for This TRD

- Detailed UI/UX wireframes (covered in design phase, not architecture)
- CI/CD pipeline specifics (to be defined by engineering team based on chosen stack)
- Detailed cost/infrastructure sizing estimates (to be produced once initial site-count/user-count projections are confirmed by stakeholders)
