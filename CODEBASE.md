# AALA.LAND — Codebase Overview

> One-page reference for LLMs and new contributors.

---

## What Is It?

AALA.LAND is a **multi-tenant SaaS platform** for real estate companies operating in the MENA region. It lets property management firms manage properties, leads, leases, finances, maintenance, and teams from one dashboard. The primary markets ship with 14 MENA cities (Dubai, Abu Dhabi, Riyadh, etc.) and the region list is fully extensible.

---

## High-Level Architecture

```
Browser / Mobile (Capacitor)
        │
        ▼
  Ember.js 6.4 SPA  ──REST──►  NestJS 11 API  ──►  PostgreSQL 18
  (frontend/)                  (backend/)            (TypeORM entities)
                                    │
                               Dragonfly (Redis)
                               BullMQ job queues
                               AWS S3 (media/docs)
                               Meta Cloud API (WhatsApp)
```

**Frontend** (`frontend/`) — Ember.js single-page app. Glimmer components, Handlebars templates, NuvoUI SCSS (no Tailwind). State lives in Ember Data + services.

**Backend** (`backend/src/`) — NestJS modular monolith. One folder per domain under `modules/`. Shared cross-cutting concerns (guards, interceptors, decorators) live in `shared/`.

**Database** — PostgreSQL 18. Every table has a `company_id` column; all queries are scoped to it (multi-tenant isolation).

---

## Multi-Tenancy & Roles

- Every request carries a JWT. The JWT payload includes `companyId` and `role`.
- Guards (`JwtAuthGuard`, `RolesGuard`) enforce authentication and authorization on every endpoint.
- **Roles:** `super_admin` · `company_admin` · `agent` · `viewer`
- Every service method filters data by `companyId` extracted from the JWT — no cross-tenant data leaks.

---

## Region System

- Leads, properties, financials, and listings all carry a `regionCode` (e.g. `dubai`, `riyadh`).
- The frontend `region` service stores the active region in local storage and appends `?regionCode=` to API calls.
- The `locations` module provides the list of cities/regions and their currencies.
- Currency formatting in templates is handled by the `format-currency` helper, which reads the active region's currency.

---

## Domain Modules

| Module | Key Entities / Purpose |
|---|---|
| `companies` | Root tenant. Every other record belongs to a company. |
| `auth` | JWT login, refresh, password change. |
| `users` | Company users with roles. |
| `properties` | `PropertyArea` (area/community) → `Asset` (building) → `Unit`. Units hold status, price, sq ft, amenities, photos. |
| `owners` | Property owners linked to units. |
| `leads` | CRM pipeline. Statuses: NEW → CONTACTED → VIEWING → NEGOTIATING → WON/LOST. Temperature: HOT/WARM/COLD/DEAD. Sources: WEBSITE, WHATSAPP, REFERRAL, etc. Kanban views by pipeline, temperature, agent, list. |
| `leases` | Lease lifecycle (DRAFT → ACTIVE → EXPIRED/TERMINATED/RENEWED). Stores tenant info, monthly rent, currency, security deposit, cheque count, Ejari number. |
| `financial` | Income/expense `Transaction` records with payment method, category, date. |
| `cheques` | Post-dated cheque management: bounce tracking, collection schedule. |
| `commissions` | Agent commission workflow: create → approve → pay. |
| `maintenance` | Work orders assigned to vendors with cost and status tracking. Preventive maintenance schedules. |
| `documents` | File uploads with categories, access levels, versioning. Stored on S3. |
| `whatsapp` | WhatsApp message threads per lead via Meta Cloud API. Inbound webhook + outbound send. |
| `notifications` | In-app notification records + `reminder-rules` for configurable scheduled reminders. |
| `email-templates` | Reusable email templates with variable substitution. |
| `contacts` | Address book: leads, tenants, owners, vendors. |
| `vendors` | Maintenance vendors with contact info. |
| `reports` | Boss dashboard: KPIs, agent performance, pipeline funnel, bottleneck analysis, activity feed. |
| `audit` | Immutable mutation log. Every create/update/delete writes an audit record. |
| `locations` | Cities and regions with currency codes. Seed data ships with 14 MENA cities. |

---

## Frontend Routes & Views

| Route | What it shows |
|---|---|
| `login` / `signup` | Auth screens |
| `dashboard` | Boss dashboard KPIs |
| `leads` | Kanban CRM board |
| `properties` | Area → Building → Unit browser |
| `leases` | Lease list and detail |
| `financials` | Income/expense transactions |
| `cheques` | Cheque schedule |
| `commissions` | Commission tracking |
| `maintenance` | Work orders |
| `documents` | Document library |
| `whatsapp` | WhatsApp thread list |
| `owners` | Owner records |
| `contacts` | Contact address book |
| `vendors` | Vendor list |
| `team` | User management |
| `reports` | Analytics and reporting |
| `email-templates` | Template editor |
| `company` | Company settings (regions, branding) |
| `profile` | User profile |
| `audit` | Audit log viewer |

**Frontend services:** `auth` (JWT storage), `session` (current user), `region` (active region + currency), `notifications` (polling), `preferences` (UI prefs).

---

## API Conventions

- Base prefix: `/v1/`
- All responses: `{ "success": true, "data": <payload> }`
- List endpoints: `?page=1&limit=20` pagination + optional `?regionCode=dubai` filter
- Rate limit: 100 requests / 60 s per IP (Throttler)
- Security headers: Helmet, CORS (configurable `CORS_ORIGIN`)

---

## Key Files to Know

| File | Purpose |
|---|---|
| `backend/src/app.module.ts` | Root module — registers all 22 feature modules |
| `backend/src/data-source.ts` | TypeORM data source config |
| `backend/src/shared/guards/` | `JwtAuthGuard`, `RolesGuard` |
| `backend/src/shared/interceptors/` | Response transform, logging |
| `frontend/app/router.js` | All frontend routes |
| `frontend/app/services/region.js` | Active region / currency logic |
| `frontend/app/services/session.js` | Authenticated user state |
| `docker-compose.yml` | Local dev: PostgreSQL 5480, Dragonfly 6470 |
| `docker-compose.prod.yml` | Production Docker setup |

---

## Data Relationship Map (simplified)

```
Company
 ├─ Users (roles)
 ├─ PropertyArea ──► Asset (Building) ──► Unit ──► Owner
 │                                          │
 │                                        Lease (tenant)
 │                                          │
 │                                        Cheques
 ├─ Leads ──► (assigned User) ──► WhatsApp threads
 ├─ Financial Transactions
 ├─ Commissions
 ├─ MaintenanceWorkOrders ──► Vendor
 ├─ Documents
 ├─ Contacts
 └─ AuditLogs
```

---

## Environment Variables (critical)

| Variable | Purpose |
|---|---|
| `DB_*` | PostgreSQL connection |
| `JWT_SECRET` | Token signing key |
| `REDIS_HOST/PORT` | Dragonfly/Redis for BullMQ |
| `WHATSAPP_TOKEN` | Meta Cloud API token |
| `AWS_*` + `AWS_S3_BUCKET` | Media and document storage |
| `CORS_ORIGIN` | Allowed frontend origin in production |
| `DB_SYNC` | `true` in dev (auto-migrate), `false` in production |
