# AALA.LAND - Product Roadmap

> Property Management SaaS for the Middle East
> Last Verified: 2026-03-11 (against live codebase)
> Source: docs/archive/MVP_FEATURES.md (original product vision)

---

## Status at a Glance

| MVP Feature | Done | Remaining | Coverage |
|-------------|------|-----------|----------|
| 1. Multi-Tenant Foundation | 9 | 2 | 82% |
| 2. Property Management | 11 | 1 | 92% |
| 3. Lead Management / Kanban | 16 | 0 | 100% |
| 4. Boss Dashboard | 15 | 0 | 100% |
| 5. WhatsApp Integration | 5 | 7 deferred | 42% (API deferred) |
| 6. Financial Management | 11 | 0 | 100% |
| 7. Document Management | 6 | 1 | 86% |
| 8. Maintenance Management | 7 | 1 | 88% |
| 9. Mobile (PWA) | 3 | 3 | 50% |
| 10. Notifications & Reminders | 9 | 2 | 82% |
| **TOTAL** | **92** | **17** | **84%** |

**Backend:** 23 entities, 21 modules, 20+ migrations, 231+ tests passing
**Frontend:** 24 routes, 18 controllers, 23 templates, light theme, Phosphor icons
**E2E:** 29/29 Playwright tests passing
**Production:** Dockerfile + docker-compose.prod.yml ready

---

## MVP Features: Every Line Item

### 1. Multi-Tenant Foundation

| # | Item | Status |
|---|------|--------|
| 1.1 | Company entity (tenant isolation) | Done |
| 1.2 | companyId on every query (no data leaks) | Done |
| 1.3 | User management with role-based access | Done (SUPER_ADMIN, COMPANY_ADMIN, AGENT, VIEWER) |
| 1.4 | JWT auth with refresh tokens | Done |
| 1.5 | Password reset flow | Done (forgot-password + reset-password endpoints) |
| 1.6 | Audit logging | Done (AuditLog entity + interceptor + frontend UI) |
| 1.7 | Rate limiting | Done (100 req/60s ThrottlerModule) |
| 1.8 | Subscription tiers (Free / Starter / Growth / Scale / Enterprise) | Done |
| 1.9 | User invitation system (email invite with temp password) | Done |
| 1.10 | Multi-factor authentication | Not Done |
| 1.11 | Granular permissions (per-entity, not just role enum) | Not Done |

### 2. Property Management

| # | Item | Status |
|---|------|--------|
| 2.1 | Hierarchical structure: Area > Building > Unit | Done |
| 2.2 | Property details with photos | Done (S3 presigned URLs, MinIO local) |
| 2.3 | Unit features / amenities | Done (JSONB column, 20-option chip picker, GIN index) |
| 2.4 | Status tracking (Available, Rented, Sold, Maintenance) | Done |
| 2.5 | Bulk import from CSV/Excel | Done (bulkImportUnits endpoint) |
| 2.6 | Simple search and filtering | Done (pagination + search on all list endpoints) |
| 2.7 | Owners module (owner per unit, agent assignment) | Done |
| 2.8 | Past tenant history for units | Done |
| 2.9 | Property counts (buildings + units per area) | Done |
| 2.10 | Image upload with automatic optimization (resize, WebP) | Not Done (presigned URLs only, no processing) |
| 2.11 | Listing entity for marketing / portal syndication | Done |
| 2.12 | Building-level analytics (occupancy rate) | Done |

### 3. Lead Management / Kanban

| # | Item | Status |
|---|------|--------|
| 3.1 | Lead entity (score, status, temperature, source, budget) | Done |
| 3.2 | **View 3: Pipeline Kanban** (NEW > CONTACTED > VIEWING > NEGOTIATING > WON/LOST) | Done |
| 3.3 | Temperature tracking (HOT / WARM / COLD / DEAD) | Done (field + badge display) |
| 3.4 | Lead scoring (score field) | Done |
| 3.5 | Lead activities (interaction history) | Done |
| 3.6 | Agent assignment (POST /leads/:id/assign) | Done |
| 3.7 | Lead conversion (POST /leads/:id/convert) | Done |
| 3.8 | Lead > Property linking | Done |
| 3.9 | Contact entity (address book: leads, tenants, owners, vendors) | Done |
| 3.10 | **View 1: Temperature Board** (columns by HOT/WARM/COLD/DEAD) | Done |
| 3.11 | **View 2: Agent Board** (columns per agent, visual load balancing) | Done |
| 3.12 | Drag-and-drop lead transfer between columns | Done |
| 3.13 | Bottleneck identification (which stage stalls most) | Done |
| 3.14 | Stage duration tracking (how long leads sit per stage) | Done |
| 3.15 | Transfer reason tracking | Done |
| 3.16 | Automatic handover notifications (new agent gets summary) | Done |

### 4. Boss Dashboard

| # | Item | Status |
|---|------|--------|
| 4.1 | KPI cards (total leads, properties, revenue, occupancy) | Done |
| 4.2 | Agent scoreboard: leads handled | Done (leadsAssigned) |
| 4.3 | Agent scoreboard: revenue generated | Done (commissionsEarned) |
| 4.4 | Agent scoreboard: conversion rates | Done (conversionRate % in agent table) |
| 4.5 | Agent scoreboard: response time metrics | Done |
| 4.6 | Live activity feed: real-time team actions | Done (AuditLog feed, last 25) |
| 4.7 | Live activity feed: achievement notifications | Done |
| 4.8 | Red flag alerts: untouched leads (24hr/48hr warnings) | Done |
| 4.9 | Red flag alerts: long-vacant properties | Done (30+ days vacant) |
| 4.10 | Red flag alerts: overdue follow-ups | Done (7+ days no update) |
| 4.11 | Red flag alerts: stalled pipeline stages | Done (14+ days in NEGOTIATING) |
| 4.12 | Performance analytics: team leaderboard | Done (agent performance table) |
| 4.13 | Performance analytics: conversion funnel analysis | Done (pipeline funnel counts) |
| 4.14 | Performance analytics: agent comparison views | Done |
| 4.15 | Performance analytics: best performer patterns | Done |

**Fixed:** SQL aggregation rewrite complete (QueryBuilder with SUM/COUNT/GROUP BY). No more in-memory processing.

### 5. WhatsApp Integration

| # | Item | Status |
|---|------|--------|
| 5.1 | Send message endpoint (POST /whatsapp/send) | Done |
| 5.2 | Receive webhook (POST /whatsapp/webhook) | Done |
| 5.3 | Conversation thread view (per lead) | Done |
| 5.4 | Frontend: message list + send UI | Done |
| 5.5 | Webhook signature verification | Done (X-Hub-Signature-256 + rawBody) |
| 5.6 | Smart broadcast: segment by property criteria (2BR, under 15K, area) | Not Done |
| 5.7 | Smart broadcast: track delivery and read status | Not Done |
| 5.8 | Smart broadcast: exclude previously contacted leads | Not Done |
| 5.9 | Smart broadcast: response rate analytics | Not Done |
| 5.10 | Property packet: one-click PDF generation (photos, features, floor plans, agent contact) | Not Done |
| 5.11 | Property packet: customizable templates | Not Done |
| 5.12 | Property packet: direct WhatsApp sharing + track views | Not Done |

### 6. Financial Management

| # | Item | Status |
|---|------|--------|
| 6.1 | Income and expense recording | Done |
| 6.2 | Monthly financial summary / simple reporting | Done |
| 6.3 | Post-dated cheque tracker | Done |
| 6.4 | Photo capture with OCR | Done |
| 6.5 | Commission tracking (entity + CRUD) | Done |
| 6.6 | Commission workflow (approve > pay) | Done |
| 6.7 | Payment method tracking | Done |
| 6.8 | Deposit reminders | Done |
| 6.9 | Cheque bounce tracking | Done |
| 6.10 | Cheque collection schedule | Done |
| 6.11 | Rent collection automation | Done (query endpoints, cron deferred) |

### 7. Document Management

| # | Item | Status |
|---|------|--------|
| 7.1 | Simple file upload | Done (S3 presigned URLs) |
| 7.2 | File download and preview | Done |
| 7.3 | Email templates with variable rendering | Done ({{variable}} placeholders, preview endpoint) |
| 7.4 | Category-based filing / organization | Done |
| 7.5 | Access control (per document) | Done |
| 7.6 | Version tracking | Done |
| 7.7 | Direct WhatsApp sharing | Not Done |

### 8. Maintenance Management

| # | Item | Status |
|---|------|--------|
| 8.1 | Work order creation and tracking (status + priority) | Done |
| 8.2 | Vendor module (entity, CRUD, specialty, rating, hourly rate) | Done |
| 8.3 | Vendor assignment on work orders (vendorId FK) | Done |
| 8.4 | Maintenance history per property | Done (filterable by unit) |
| 8.5 | Photo attachments on work orders | Done |
| 8.6 | Cost tracking and budgeting | Done |
| 8.7 | Preventive maintenance scheduling | Done |
| 8.8 | Mobile work order integration | Not Done |

### 9. Mobile (Progressive Web App)

| # | Item | Status |
|---|------|--------|
| 9.1 | PWA manifest + service worker | Done (manifest.json + sw.js with cache-first for assets) |
| 9.2 | Property quick view | Not Done |
| 9.3 | Lead capture form | Not Done |
| 9.4 | Photo upload for properties / maintenance | Not Done |
| 9.5 | WhatsApp launcher | Done (wa-link helper, links on all lead views) |
| 9.6 | Offline capability for basic features | Done (service worker caches static assets, API always network) |

Frontend uses fetch + standard DOM only (no browser-only APIs), so PWA/Capacitor wrapping is feasible.

### 10. Notifications & Reminders

| # | Item | Status |
|---|------|--------|
| 10.1 | Email notifications (SendGrid) | Done |
| 10.2 | SMS notifications (Twilio) | Done |
| 10.3 | Notification persistence (entity, DB table) | Done |
| 10.4 | Bell icon with unread count (frontend topbar) | Done |
| 10.5 | Mark read / mark all read | Done |
| 10.6 | WhatsApp notifications | Not Done |
| 10.7 | Customizable reminder rules | Done (ReminderRules module + CRUD) |
| 10.8 | Rent due date reminders | Done (checkRentDueReminders, 3 days before due) |
| 10.9 | Lease expiry alerts | Done (checkLeaseExpiryAlerts, 60 days before end) |
| 10.10 | Maintenance schedule reminders | Done (checkMaintenanceReminders) |
| 10.11 | Push notifications (mobile) | Not Done |

---

## Additional Features Built (Beyond MVP Scope)

These were not in the original MVP_FEATURES.md but are implemented:

| Feature | Details |
|---------|---------|
| Lease Management | Full CRUD + renew + terminate lifecycle |
| Audit Logging | Entity + interceptor + frontend list with filters |
| Contact CRM | Address book entity (LEAD/TENANT/OWNER/VENDOR/OTHER types) |
| Email Templates | CRUD + {{variable}} rendering + preview |
| Owners Module | CRUD + agent assignment per owner |
| Security Hardening | helmet, CORS, ParseUUIDPipe, ValidationPipe whitelist |
| Production Docker | Multi-stage Dockerfile + docker-compose.prod.yml |
| E2E Test Suite | 29 Playwright tests (auth, properties, leads, financial, reports) |
| DRY Frontend | Centralized API_BASE, fetchJson(), generic setField() |
| Light Theme | Design tokens, responsive breakpoints, z-index layers |
| Phosphor Icons | 23+ icons across all pages, Ph component |

Note: Commission tracking and vendor module are listed under MVP (sections 6 and 8) since they map to MVP_FEATURES.md items. Lease management does NOT appear in MVP_FEATURES.md (it was added during Phase 4 build).

---

## V2 Features (Post-MVP, build based on customer demand)

| Feature | Sub-items | Overlap with Built |
|---------|-----------|-------------------|
| Advanced Viewing Scheduler | Move-out tracking, auto-open slots, booking, route planning, calendar | None |
| Commission Calculator (Advanced) | Deal split templates, multi-agent handling, split agreement PDF | Basic commission done (approve/pay), advanced features not done |
| Utility Management | DEWA/SEWA tracking, move-in/out checklists, deposit tracking | None |
| Advanced Integrations | QuickBooks, Xero, RERA, Ejari, MLS, banking APIs, Stripe | None |
| Enhanced Analytics | Custom report builder, predictive analytics, market trends, ROI | None |

## V3 Features (Future Vision)

- Team meeting mode (TV/projector dashboards)
- AI-powered features (lead scoring automation, price recommendations, predictive maintenance)
- Marketplace connections (listing syndication, portal lead generation)
- Advanced mobile app (native iOS/Android, AR tours, voice, biometrics)

---

## Codebase Stats

| Layer | Count |
|-------|-------|
| Backend entities | 21 |
| Backend modules | 19 |
| Database migrations | 20 |
| Backend test files | 29 (231+ tests) |
| E2E test files | 5 (29 tests) |
| Frontend routes | 24 |
| Frontend controllers | 18 |
| Frontend templates | 23 |
| Frontend services | 3 (auth, session, notifications) |

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL 18 + Ember.js 6.4 + NuvoUI SCSS + Playwright

---

## Success Metrics (from MVP_FEATURES.md)

- 100+ active companies within 3 months
- 70% daily active usage rate
- <2 minute onboarding time
- 50%+ lead conversion improvement
- 90% boss satisfaction score

## Key Differentiators

1. WhatsApp-first approach (where ME market lives)
2. Boss-friendly dashboards (make decision makers happy)
3. Cheque management (solve real ME pain points)
4. Simple pricing (no per-property fees)
5. Quick value (productive in minutes, not weeks)

---

## Multi-Region Support

**Status:** Phase 12 (in progress)
**Availability:** All tiers (paid guard deferred to payments phase)

**How it works:**
- MENA regions are a hardcoded list (14 cities across 8 countries)
- Company admin selects which regions they operate in (Company Settings)
- Default region sets the currency for single-region companies
- When 2+ regions selected: top nav shows a region switcher dropdown
- All data filters by active region (properties, leads, financials, reports)
- Currency formatting uses Intl.NumberFormat with browser locale detection

**Region list:** Dubai, Abu Dhabi, Sharjah, Ajman (AED), Riyadh, Jeddah, Dammam (SAR), Manama (BHD), Muscat (OMR), Doha (QAR), Kuwait City (KWD), Cairo (EGP), Amman (JOD), Beirut (LBP)

**Entity scoping:**
- Direct regionCode: PropertyArea, Lead, Vendor, Commission
- Inherited via FK chain: Lease, Cheque, WorkOrder, Transaction (through Unit > Building > PropertyArea)
- Cross-region (no filter): Users, Contacts, EmailTemplates, Notifications, AuditLog

**Future (payments phase):** Paid guard on multi-region addon, included in GROWTH tier and above.

---

*"Every feature should answer: Does this make the boss's life easier? If yes, build it. If maybe, defer it. If no, skip it."*

*Last verified against codebase: 2026-03-11*
