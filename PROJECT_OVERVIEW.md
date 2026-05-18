# AALA.LAND — Project Overview & Developer Onboarding

> Complete reference for developers joining the AALA.LAND codebase. Read top-to-bottom on day one; skim to specific sections thereafter.

---

## 1. What Is This Project?

**AALA.LAND** is a multi-tenant **Property Management SaaS** built for real estate teams in the **Middle East** (and extensible to any market). It is a single platform where a brokerage or landlord team runs its entire operation — from property inventory, to lead pipelines, to signed leases, to cheque collection, to commission payouts, to maintenance work orders — with a boss-level dashboard watching agent performance in real time.

The product pitch:
- **Unified** — properties, leads, leases, cheques, commissions, maintenance, WhatsApp, docs, audit logs all in one app.
- **WhatsApp-first** — primary communication channel for MENA markets (via Meta Cloud API).
- **Multi-region / multi-currency** — ships seeded for ~120 cities across UAE, KSA, Bahrain, Oman, Qatar, Kuwait, Egypt, Jordan, Lebanon, Pakistan, India.
- **Multi-tenant** — each company (tenant) is strictly isolated by `companyId`.
- **Boss dashboard** — real-time KPIs, red flags, agent leaderboards, pipeline funnels.

Licensing is **source-available** (not OSI open-source). Free to self-host for internal business use; commercial redistribution / hosted-as-a-service is not permitted. See [LICENSE](LICENSE).

---

## 2. Repository Layout

```
aala.land/
├── backend/              NestJS 11 API (TypeScript, TypeORM, PostgreSQL)
├── frontend/             Ember.js 6.4 SPA (NuvoUI SCSS, no Tailwind)
├── scripts/              Shell utilities
├── docker-compose.yml    Local infra (Postgres 18 + Dragonfly)
├── docker-compose.prod.yml  Production stack
├── README.md             Public-facing readme
├── LICENSE               Source-available license
└── PROJECT_OVERVIEW.md   ← you are here
```

**Tech stack at a glance**

| Layer     | Tech                                             |
| --------- | ------------------------------------------------ |
| Backend   | NestJS 11 · TypeScript · TypeORM 0.3.28          |
| Database  | PostgreSQL 18                                    |
| Cache/Queue | Dragonfly (Redis-compatible) · BullMQ          |
| Auth      | JWT (Passport) · bcrypt                          |
| Storage   | AWS S3 (presigned uploads)                       |
| Frontend  | Ember.js 6.4 (Octane edition) · NuvoUI SCSS      |
| Icons     | Phosphor Icons (CDN)                             |
| Mobile    | Capacitor wrapper (iOS/Android, same codebase)   |
| Testing   | Jest (backend) · QUnit + ember-qunit (frontend)  |
| Docs      | Swagger/OpenAPI at `/docs`                       |

---

## 3. How It Runs (Local Dev)

### 3.1 Prerequisites
- Node.js ≥ 20
- pnpm
- Docker + Docker Compose

### 3.2 Start everything

```bash
# 1) Infra
docker compose up -d
# → Postgres 18 on :5480, Dragonfly on :6470

# 2) Backend
cd backend
pnpm install
cp .env.example .env              # fill in values (see below)
pnpm run start:dev
# → http://localhost:3010/v1   (Swagger: /docs)

# 3) Frontend
cd ../frontend
pnpm install
pnpm run start
# → http://localhost:4200
```

### 3.3 Minimum `.env` for backend

```env
DB_HOST=localhost
DB_PORT=5480
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=aala_land
DB_SYNC=true                    # dev only – auto-syncs schema from entities
JWT_SECRET=<openssl rand -base64 64>

# Optional, for full functionality
WHATSAPP_TOKEN=...              # Meta Cloud API
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=aala-land-media
CORS_ORIGIN=http://localhost:4200
```

### 3.4 First account
On first boot with `DB_SYNC=true`, tables are created automatically. Register a tenant + admin:

```bash
curl -X POST http://localhost:3010/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "companyName": "Acme Real Estate",
    "companySlug": "acme-re",
    "userName": "John Admin",
    "email": "john@acme.com",
    "password": "SecurePassword123!",
    "defaultRegionCode": "dubai"
  }'
```

Then log in at `http://localhost:4200`.

---

## 4. Backend — NestJS API

### 4.1 Bootstrap ([backend/src/main.ts](backend/src/main.ts))
1. Initialize TypeORM `AppDataSource` **before** NestJS (ensures all entities loaded).
2. Create Nest app with `rawBody: true` (needed for webhooks).
3. `helmet()` security headers.
4. CORS from `CORS_ORIGIN` env (comma-separated) or `http://localhost:4200`.
5. Global route prefix `/v1`.
6. Global `ResponseInterceptor` → wraps every success response as `{ success: true, data: ... }`.
7. Global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform).
8. Swagger mounted at `/docs`.
9. Listen on `PORT` (default `3010`).

### 4.2 Root module ([backend/src/app.module.ts](backend/src/app.module.ts))
Wires up **21 feature modules** + `ConfigModule.forRoot()` + `BullModule` + global `ThrottlerGuard` (100 req / 60 s).

### 4.3 Module inventory

**Core business modules**

| Module         | Purpose                                           | Key entities             |
| -------------- | ------------------------------------------------- | ------------------------ |
| `leads`        | Lead capture, kanban pipeline, conversion         | Lead, LeadActivity       |
| `leases`       | Lease lifecycle: draft → active → expired/terminated/renewed | Lease       |
| `cheques`      | Receive, deposit, bounce tracking; OCR            | Cheque                   |
| `commissions`  | Agent commission: create → approve → pay          | Commission               |
| `maintenance`  | Work orders, vendor assignment, cost tracking     | WorkOrder                |
| `financial`    | Income/expense transactions                       | Transaction              |
| `whatsapp`     | Meta Cloud API threads per lead                   | WhatsappMessage          |
| `properties`   | Area → Building (Asset) → Unit hierarchy          | PropertyArea, Asset, Unit, Listing |
| `owners`       | Property owners                                    | Owner                    |
| `vendors`      | Maintenance vendor directory                      | Vendor                   |

**Support modules**

| Module             | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| `auth`             | JWT login/register/refresh/forgot-password     |
| `users`            | User mgmt, roles, preferences                  |
| `companies`        | Tenant mgmt, subscription tier, active regions |
| `contacts`         | Unified contact book (leads/tenants/owners/vendors) |
| `notifications`    | In-app notifications                           |
| `audit`            | Immutable mutation log (global interceptor)    |
| `email-templates`  | Handlebars email rendering                     |
| `locations`        | City → Locality seed data                      |
| `reports`          | Analytics endpoints (dashboard, funnel, feed)  |
| `reminder-rules`   | Automated reminders (BullMQ)                   |
| `documents`        | Property document storage                      |

### 4.4 Entity map (23 tables)

All tables (except seed/reference) carry a `companyId` FK for tenant isolation. Most business tables also carry a `regionCode` for multi-region slicing.

**Tenancy & identity**
- **Company** — `id`, `name`, `slug`, `subscriptionTier` (FREE…ENTERPRISE), `maxUsers`, `maxCountries`, `activeRegions` jsonb, `defaultRegionCode`.
- **User** — `id`, `email` (unique), `password` (never selected by default), `role` (SUPER_ADMIN | COMPANY_ADMIN | AGENT | VIEWER), `companyId`, profile fields, reset-password token fields.

**Property hierarchy**
- **City** — name + `regionCode` + `country`. Unique `(name, regionCode)`.
- **Locality** — `cityId` + name. Unique `(name, cityId)`.
- **Asset** (`buildings` table) — building/complex in a Locality. Fields: `name`, `localityId`, `address`, `propertyType`.
- **Unit** — individual apartment/villa/shop. `unitNumber`, `assetId`, `ownerId`, `status` (AVAILABLE/RENTED/SOLD/MAINTENANCE), `price`, `sqFt`, `bedrooms`, `bathrooms`, `amenities` jsonb, `photos` jsonb.
- **Owner** — `name`, contact, `assignedAgentId`. One owner → many units.
- **PropertyArea** — *deprecated* legacy "area" concept, kept for backward compat.

**Lead pipeline**
- **Lead** — `firstName`, `lastName`, `email`, `phone`, `whatsappNumber`, `status` (NEW→CONTACTED→VIEWING→NEGOTIATING→WON/LOST), `temperature` (HOT/WARM/COLD/DEAD), `source`, `score 0–100`, `assignedTo`, `propertyId`, `unitId`, `budgetMin/Max`, `stageEnteredAt`, `transferReason`, `previousAgent`.
- **LeadActivity** — immutable log: `type` (CALL/EMAIL/WHATSAPP/VIEWING/NOTE/STATUS_CHANGE/ASSIGNMENT), `notes`, `performedBy`.

**Leasing & money**
- **Lease** — `unitId`, tenant fields, `type` (RESIDENTIAL/COMMERCIAL), `status` (DRAFT/ACTIVE/EXPIRED/TERMINATED/RENEWED), dates, `monthlyRent`, `currency`, `securityDeposit`, `numberOfCheques`, `ejariNumber` (UAE), `notes`.
- **Cheque** — `leaseId` (optional), `chequeNumber`, `bankName`, `accountHolder`, `amount`, `dueDate`, `depositDate`, `status` (PENDING/DEPOSITED/CLEARED/BOUNCED/CANCELLED/REPLACED), `type` (RENT/SECURITY_DEPOSIT/MAINTENANCE/OTHER), `ocrImageUrl`, `ocrData` jsonb, `bounceCount`, `bounceReason`, `lastBounceDate`.
- **Commission** — `agentId`, `leadId?`, `transactionId?`, `type` (SALE/RENTAL/REFERRAL), `status` (PENDING→APPROVED→PAID/CANCELLED), `grossAmount`, `commissionRate` (%), computed `commissionAmount`, `currency`, `paidAt`.
- **Transaction** — `type` (INCOME/EXPENSE), `category` (RENT/SALE/DEPOSIT/MAINTENANCE/COMMISSION/OTHER), `status`, `amount`, `paymentMethod` (CASH/CHEQUE/BANK_TRANSFER/CREDIT_CARD/ONLINE), `unitId?`, `transactionDate`, `dueDate`, `paidAt`.

**Operations**
- **WorkOrder** — `unitId?`, `title`, `description`, `status` (OPEN→IN_PROGRESS→PENDING_APPROVAL→COMPLETED / CANCELLED), `priority` (LOW…URGENT), `category` (PLUMBING/ELECTRICAL/HVAC/…), `assignedTo`, `vendorId`, `estimatedCost`, `actualCost`, `scheduledDate`, `completedAt`, `photos` jsonb, `isPreventive`, `scheduleFrequency` (WEEKLY/MONTHLY/QUARTERLY/ANNUALLY), `nextScheduledDate`.
- **Vendor** — `name`, `specialty`, `companyName`, `rating 0–5`, `hourlyRate`, `isActive`, `regionCode`.

**Communication**
- **WhatsappMessage** — `leadId?`, `phoneNumber`, `message`, `direction` (INBOUND/OUTBOUND), `status` (QUEUED/SENT/DELIVERED/READ/FAILED), `externalId` (Meta WAMID), `mediaUrl`.
- **Contact** — unified address book with `type` (LEAD/TENANT/OWNER/VENDOR/OTHER), `tags` jsonb, optional `leadId`.
- **Notification** — `userId`, `type` (LEAD_ASSIGNED/LEAD_STATUS_CHANGED/LEASE_EXPIRING/MAINTENANCE_UPDATE/CHEQUE_DUE/PAYMENT_RECEIVED/SYSTEM), `entityType`, `entityId`, `isRead`, `readAt`.
- **AuditLog** — `userId`, `action`, `entityType`, `entityId`, `oldValue` jsonb, `newValue` jsonb, `ipAddress`, `userAgent`. Indexed by `(companyId)`, `(entityType, entityId)`, `(userId)`.

### 4.5 Multi-tenancy — how isolation is enforced

Three enforcement layers, all required:

1. **Schema** — every business table has `companyId` FK + index.
2. **JWT payload** — `{ userId, email, companyId, role }`. Extracted on every authenticated request into `req.user`.
3. **Service signatures** — every method takes `companyId` as first arg and puts it in every `WHERE` clause.

Typical service shape:
```ts
async findOne(id: string, companyId: string): Promise<Lead> {
  const lead = await this.leadRepository.findOne({
    where: { id, companyId },        // ALWAYS both
    relations: ['property', 'unit'],
  });
  if (!lead) throw new NotFoundException();
  return lead;
}
```

**Never query without `companyId`**. A cross-tenant leak is the worst possible bug in this system.

**Region sub-filtering** — for Unit-derived queries, `shared/utils/region-filter.util.ts` provides a reusable subquery joining Unit → Asset → Locality → City → `regionCode`.

### 4.6 Auth & RBAC

- **Roles**: `SUPER_ADMIN` (platform), `COMPANY_ADMIN` (tenant owner), `AGENT`, `VIEWER`.
- **Tokens**: access 24 h, refresh 7 d, both signed with `JWT_SECRET`.
- **JwtStrategy** validates token + re-checks user is active + company is active on every request.
- **RolesGuard** + `@Roles(Role.COMPANY_ADMIN)` for method-level gating. `SUPER_ADMIN` always passes.
- **Register** uses a DB transaction to atomically create Company + first User (bcrypt, 12 rounds).
- **Forgot-password** — 32-byte random token, 1 h TTL. Reset clears the token.

### 4.7 Core business workflows (what to read first)

**Lead → Kanban → Conversion** ([backend/src/modules/leads/leads.service.ts](backend/src/modules/leads/leads.service.ts))
- `create` defaults status=NEW, temperature=WARM; resolves `regionCode` from company if omitted.
- `update` on status change: stamps `stageEnteredAt` and writes a `LeadActivity` of type `STATUS_CHANGE`.
- `assign` records `previousAgent` and `transferReason`, writes `ASSIGNMENT` activity.
- `convert` sets status=WON + activity. Typically followed by a Commission creation.
- `addActivity` — immutable log entries; enforces lead belongs to the calling company.

**Lease lifecycle** ([backend/src/modules/leases/leases.service.ts](backend/src/modules/leases/leases.service.ts))
- `create` → DRAFT.
- `renew` — only from ACTIVE/EXPIRED. Marks old lease RENEWED + inserts a new Lease row.
- `terminate` — only from ACTIVE → TERMINATED.

**Cheque lifecycle** ([backend/src/modules/cheques/cheques.service.ts](backend/src/modules/cheques/cheques.service.ts))
- `create` while PENDING.
- Deposit = client sets `status=DEPOSITED` + `depositDate`.
- `bounce` increments `bounceCount`, stores reason + `lastBounceDate`, status=BOUNCED.
- `getCollectionSchedule` → `{ overdue, thisWeek, nextWeek, thisMonth }` buckets of pending cheques.
- `processOcr` — stores image URL, calls OCR service (stubbed – ready for AWS Textract), writes extracted data to `ocrData` jsonb.

**Commission workflow** ([backend/src/modules/commissions/commissions.service.ts](backend/src/modules/commissions/commissions.service.ts))
- `create` → `commissionAmount = grossAmount * (commissionRate / 100)`; status=PENDING.
- `approve` PENDING → APPROVED (COMPANY_ADMIN only).
- `pay` APPROVED → PAID + `paidAt`.
- `getSummary(agentId)` → totals (earned/paid/pending) per agent.

**Maintenance work orders** ([backend/src/modules/maintenance/maintenance.service.ts](backend/src/modules/maintenance/maintenance.service.ts))
- Status flow: OPEN → IN_PROGRESS → PENDING_APPROVAL → COMPLETED (or CANCELLED).
- `update` auto-stamps `completedAt` when status flips to COMPLETED.
- `getCostSummary` → estimated vs. actual vs. variance + avg per order.
- Preventive: `isPreventive=true` + `scheduleFrequency` drives `nextScheduledDate` reminders.

**WhatsApp threads** ([backend/src/modules/whatsapp/whatsapp.service.ts](backend/src/modules/whatsapp/whatsapp.service.ts))
- Outbound: create record (QUEUED) → `dispatchToWhatsAppApi` → update to SENT.
- Inbound: `POST /v1/whatsapp/webhook` → parse Meta payload `entry[].changes[].value.messages[]` → insert INBOUND row.
- `findMessagesByLead(leadId)` renders the chat thread.

**Property creation order (important)**
```
Company → City → Locality → Asset (Building) → Unit
                                                ↓
                                              Lease → Cheques → (Commission)
                                              Owner → Units
```

### 4.8 Shared infrastructure ([backend/src/shared/](backend/src/shared/))

- `interceptors/response.interceptor.ts` — wraps every response `{ success, data }`.
- `interceptors/audit.interceptor.ts` — global audit logger. Captures POST/PATCH/DELETE, maps path→entityType, method→action (with overrides: `/assign` → ASSIGN, `/approve` → APPROVE, `/pay` → PAY, etc.), sanitizes password/token fields, fire-and-forget insert to `audit_logs`.
- `guards/jwt-auth.guard.ts` — wraps Passport JWT.
- `guards/roles.guard.ts` — consults `@Roles` metadata; SUPER_ADMIN bypass.
- `decorators/roles.decorator.ts` — `@Roles(Role.COMPANY_ADMIN)`.
- `interfaces/authenticated-request.interface.ts` — `{ user: { userId, email, companyId, role } }`.
- `constants/regions.ts` — ~120 region definitions across MENA + SA (code, name, country, currency, currencySymbol, timezone).
- `utils/region-filter.util.ts` — subquery helper for Unit-based region filtering.

### 4.9 Database lifecycle

- **Migrations**: `backend/src/database/migrations/` — 42 migrations (initial + feature adds + enum/column fixes).
  - `pnpm run db:migration:run` — apply pending.
  - `pnpm run db:migration:generate` — from entity diffs.
  - `pnpm run db:migration:revert` — roll back last.
- **Seeds**: `backend/src/database/seeds/run-all-seeds.ts`.
  - `pnpm run db:seed` (prod), `pnpm run seed:test` (test).
- **`DB_SYNC`**: **only** `true` in dev. In prod it must be `false` — use migrations.

### 4.10 External integrations

- **Meta WhatsApp Cloud API** — send + webhook; messages persisted per lead.
- **AWS S3** — presigned upload URLs (`POST /v1/properties/media/presigned-url`), then metadata persisted. Sharp generates thumbnails.
- **Email** — `EmailTemplate` entity + Handlebars renderer; SMTP provider plug (SendGrid/SES) not wired yet.
- **BullMQ + Dragonfly** — queue at Redis host (`REDIS_HOST`, `REDIS_PORT`). Intended jobs: cheque reminders, lease expiries, commission batches, maintenance follow-ups, WhatsApp retries.

### 4.11 API conventions

- Prefix: **`/v1`**.
- Response envelope: `{ success: true, data: ... }`.
- Paginated list: `?page=1&limit=20` → `{ data: [...], total, page, limit }`.
- Region filter: `?regionCode=dubai` (optional; when omitted, unfiltered across company).
- Bearer: `Authorization: Bearer <accessToken>`.
- Custom verbs are POST sub-paths:
  - `POST /leads/:id/assign | /convert | /activities`
  - `POST /leases/:id/renew | /terminate`
  - `POST /cheques/:id/bounce`
  - `POST /commissions/:id/approve | /pay`
  - `POST /whatsapp/send`
- Swagger auto-doc at **`/docs`** — best place to explore live.

### 4.12 Testing

```bash
cd backend
pnpm test                 # unit
pnpm test:watch
pnpm test:cov
pnpm test:integration
pnpm test:e2e
```

Unit tests live next to code as `*.spec.ts`; E2E config is `test/jest-e2e.json`. Patterns:
- Mock repositories.
- Assert `companyId` in every WHERE.
- Assert `NotFoundException` on missing records.
- Assert `BadRequestException` on illegal status transitions.

---

## 5. Frontend — Ember.js SPA

### 5.1 Bootstrap
- [frontend/app/index.html](frontend/app/index.html) — HTML shell, Google Fonts (Inter / Outfit), Phosphor Icons CDN, PWA manifest, service worker.
- [frontend/app/app.js](frontend/app/app.js) — Ember 6.4 Octane; ember-resolver; loads initializers; dev-only deprecation workflow.
- [frontend/app/router.js](frontend/app/router.js) — history-based routing.
- [frontend/config/environment.js](frontend/config/environment.js) — `APP.API_BASE` (dev: `http://localhost:3010/v1`; prod: env `API_BASE` or `/v1`).

### 5.2 Route map

| Route                | Path                                    | Purpose                                                                                       |
| -------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `index`              | `/`                                     | auth? → dashboard : login                                                                     |
| `login`              | `/login`                                | Credential entry; skip if already authenticated                                               |
| `signup`             | `/signup`                               | Company + admin registration                                                                  |
| `dashboard`          | `/dashboard`                            | Command Center: KPIs, activity feed, pipeline funnel                                          |
| `properties.index`   | `/properties`                           | Localities list + browse/filter units                                                         |
| `properties.detail`  | `/properties/:area_id`                  | Buildings + units under a locality                                                            |
| `properties.unit`    | `/properties/:area_id/unit/:unit_id`    | Unit detail: leases, owners, media                                                            |
| `owners.index`       | `/owners`                               | Paginated owner list                                                                          |
| `owners.detail`      | `/owners/:owner_id`                     | Owner profile (units, financial summary)                                                      |
| `leads`              | `/leads`                                | Kanban (4 views: Pipeline / Temperature / Agent / List)                                       |
| `contacts`           | `/contacts`                             | Address book                                                                                  |
| `leases`             | `/leases`                               | Lease management                                                                              |
| `financials`         | `/financials`                           | Transactions + summary + deposit reminders                                                    |
| `commissions`        | `/commissions`                          | Agent commission tracker                                                                      |
| `cheques`            | `/cheques`                              | Cheque tracker + collection schedule                                                          |
| `maintenance`        | `/maintenance`                          | Work orders + vendors + cost summary                                                          |
| `vendors`            | `/vendors`                              | Vendor directory                                                                              |
| `whatsapp`           | `/whatsapp`                             | WhatsApp history (filter by lead)                                                             |
| `email-templates`    | `/email-templates`                      | Template library                                                                              |
| `documents`          | `/documents`                            | Document library                                                                              |
| `reports`            | `/reports`                              | Analytics: KPIs, agent perf, red flags, pipeline funnel                                       |
| `team`               | `/team`                                 | User mgmt (create / invite / edit / delete)                                                   |
| `audit`              | `/audit`                                | Audit log viewer + purge                                                                      |
| `profile`            | `/profile`                              | Logged-in user's profile                                                                      |
| `company`            | `/company`                              | Company settings; manage active regions                                                       |

All routes except `index`, `login`, `signup` extend `AuthenticatedRoute` ([frontend/app/routes/authenticated.js](frontend/app/routes/authenticated.js)) which redirects to `/login` if `session.isAuthenticated` is false.

### 5.3 Services (singletons)

- **[auth.js](frontend/app/services/auth.js)** — the spine of the frontend. `fetchJson(path, opts)` is the single API wrapper: adds `Authorization: Bearer <token>`, appends `?regionCode=...`, unwraps `{ data }`, throws on 401 and auto-logs out.
- **[session.js](frontend/app/services/session.js)** — login/logout lifecycle. Persists to `localStorage` key `aala-session` (restored on boot). Stores `user`, `accessToken`, `refreshToken`, `regions[]`, `defaultRegionCode`.
- **[region.js](frontend/app/services/region.js)** — active region state. On login calls `initialize(regions, defaultRegionCode)`; persists user's choice under `aala-region`. Exposes `currencyCode`, `currencySymbol`, `regionCode`.
- **[notifications.js](frontend/app/services/notifications.js)** — toast service: `success / error / warning / info` with auto-dismiss.
- **[preferences.js](frontend/app/services/preferences.js)** — localStorage prefs under `aala-pref-*`.

### 5.4 Components worth knowing

| Component              | Purpose                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `form-input`           | Thin input wrapper; emits `onChange`.                                                   |
| `form-dropdown`        | Searchable dropdown with click-outside + Escape + smart upward-open in modals.          |
| `form-textarea`        | Textarea wrapper.                                                                       |
| `app-button`           | Variants (primary/secondary/success/danger/warning), loading + disabled states.         |
| `modal`                | Backdrop + panel + `onClose`.                                                           |
| `confirm-modal`        | Yes/No wrapper.                                                                         |
| `toast-container`      | Renders `notifications.toasts`.                                                         |
| `ph`                   | Phosphor icon wrapper (`<Ph @icon="..." @size="..." />`).                               |
| `login-form`           | Email/password + forgot-password toggle.                                                |
| `signup-form`          | Company slug auto-gen + region selector.                                                |
| `location-typeahead`   | Debounced (300ms) search + create-new pattern (used for city/locality/asset).           |
| `glass-glow`           | Frosted-glass panel used on KPI cards.                                                  |

### 5.5 Template helpers

`format-currency`, `format-date`, `format-date-time`, `format-number`, `format-role`, `capitalize`, `lowercase`, `truncate-id`, `get-initial`, `get-activity-icon`, `wa-link`, `includes`, `or`, `object-at`.

`format-currency` reads `region.currencyCode` — currency follows the active region automatically.

### 5.6 Styling ([frontend/app/styles/](frontend/app/styles/))

- `_variables.scss` — design tokens (colors, spacing, radii, shadows, typography, z-index).
- `_nuvoui.scss` — NuvoUI config: primary teal `#1AB5A5`, light theme only, Inter font.
- `app.scss` — global layouts, sidebar, cards/panels (glass), kanban, modals.
- **Rules**: NuvoUI SCSS **only**. No Tailwind. No inline styles. All tokens exposed as CSS custom properties.

### 5.7 Auth flow end-to-end

1. App boots → `SessionService` restores from `localStorage` (if any).
2. `IndexRoute` → auth? `/dashboard` : `/login`.
3. `LoginForm.submit()` → `auth.login(email, pw)` → `session.authenticate(...)` → `POST /v1/auth/login` → store tokens + user + regions + `region.initialize(...)`.
4. All API calls go through `auth.fetchJson()` which injects `Bearer` + `?regionCode=...`.
5. On 401 → `auth.logout()` → `session.invalidate()` → `POST /v1/auth/logout` (best-effort) → wipe `localStorage` → redirect to `/login`.

### 5.8 Key user flows

- **Leads kanban** ([controllers/leads.js](frontend/app/controllers/leads.js), ~490 lines) — 4 views: Pipeline / Temperature / Agent / List. Drag-drop handlers fire `PATCH /leads/:id` (status/temp) or `POST /leads/:id/assign`. Create/edit modal has all form fields tracked; filter tabs (All / Mine / Others / Unassigned); detail modal shows `GET /leads/:id/activities`.
- **Property detail** ([controllers/properties/detail.js](frontend/app/controllers/properties/detail.js), ~343 lines) — cascading city→locality→asset typeahead when creating buildings; unit creation has amenity checkboxes, owner dropdown, status/type enums; tenant history is pulled lazily per unit.
- **Dashboard** ([controllers/dashboard.js](frontend/app/controllers/dashboard.js)) — 3 parallel calls: `/reports/dashboard`, `/reports/activity-feed`, `/reports/pipeline-funnel`. `occupancyRate = activeLeases / totalUnits`. `timeAgo()` formatter for feed ("5m ago").
- **Financials** ([controllers/financials.js](frontend/app/controllers/financials.js)) — tabs (All/Income/Expense), summary cards, pagination; modal for create/edit → `POST|PATCH /financial/transactions`.
- **Team/Audit** — admin-only surfaces. Audit supports filter by action + entity type, expand to see `oldValue/newValue` jsonb diffs, and a purge modal (`DELETE /audit-logs/purge?olderThanDays=N`).

### 5.9 API integration rules

- **Never** call `fetch()` directly — always `this.auth.fetchJson(path, opts)`.
- List endpoints return `{ data: [...], total, page, limit }` (nested inside the outer `{ data: ... }`).
- Use `safeJson()` ([frontend/app/utils/safe-json.js](frontend/app/utils/safe-json.js)) in routes that should tolerate partial failures (dashboard, maintenance).
- All form submissions: `event.preventDefault()`, set `isSaving`, try/catch, show `errorMsg` or toast.
- Tests use `data-test-*` selectors on interactive elements.

### 5.10 Capacitor / mobile
Frontend is the same codebase used by the Capacitor mobile wrapper. There's no Capacitor-specific code in `frontend/` (build-time wrapping); the app is PWA-ready (service worker + manifest) and all UI is touch-friendly via NuvoUI.

---

## 6. End-to-End Example: A Deal Happens

Putting it all together, here's what the system tracks when a tenant signs a 1-year lease on a Dubai apartment:

1. **Lead** created (source=WHATSAPP, temperature=HOT) → LeadActivity(CREATED).
2. Agent chats on WhatsApp → WhatsappMessage rows (inbound + outbound) + LeadActivity(WHATSAPP).
3. Lead moved NEW → CONTACTED → VIEWING (each drag triggers `PATCH /leads/:id`, stamps `stageEnteredAt`, writes STATUS_CHANGE activity).
4. Unit viewed → LeadActivity(VIEWING).
5. Negotiation → status NEGOTIATING.
6. Lead converted → status WON (`POST /leads/:id/convert`) → STATUS_CHANGE activity.
7. Lease created (`POST /leases`) → status DRAFT → ACTIVE.
8. 12 post-dated Cheques created against `leaseId`, due monthly (`status=PENDING`).
9. Commission created for the agent (`POST /commissions`) → status PENDING.
10. COMPANY_ADMIN approves (`POST /commissions/:id/approve`) → APPROVED, then pays (`POST /commissions/:id/pay`) → PAID + `paidAt`.
11. Each month a Cheque is deposited (`PATCH /cheques/:id` status=DEPOSITED). If it bounces → `POST /cheques/:id/bounce`, `bounceCount++`.
12. Unit status flips AVAILABLE → RENTED (via unit PATCH).
13. Every mutation above inserts an `AuditLog` row automatically via the global `AuditInterceptor`.
14. Notifications fire (`LEAD_ASSIGNED`, `PAYMENT_RECEIVED`, `CHEQUE_DUE`, etc.) to the right users.
15. Boss sees it all on `/dashboard` and `/reports`.

---

## 7. Conventions Cheat Sheet

**Backend**
- Every service method → `companyId` first argument.
- Every query → `where: { ..., companyId }`.
- `DB_SYNC=false` in prod, always. Use migrations.
- Immutable activity entities (LeadActivity, AuditLog) — never update, only insert.
- Use `@Roles(Role.COMPANY_ADMIN)` on any admin-only mutation.
- Sanitize `password`, `accessToken`, `refreshToken` when logging request bodies.

**Frontend**
- All styling via NuvoUI SCSS classes — no Tailwind, no inline styles.
- `data-test-*` on every interactive element.
- All API calls via `auth.fetchJson(...)`.
- Region code auto-appends — don't hardcode.
- `@tracked` for reactive state, `@action` for methods.

---

## 8. Troubleshooting

| Symptom                              | Likely cause / fix                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 401 on every request                 | Access token expired (24h). Re-login or call `auth.refresh()`. Check `JWT_SECRET` matches between sessions.   |
| "Company not found" mid-request      | User's JWT `companyId` doesn't exist or company `isActive=false`.                                             |
| Cross-tenant data leak               | Missing `companyId` in `WHERE`. Audit the service method.                                                     |
| Region filter returns nothing        | City → Locality → Asset → Unit chain not seeded. `regionCode` on City must match `shared/constants/regions.ts`. |
| Missing audit logs                   | `AuditInterceptor` only fires on POST/PATCH/DELETE. GETs aren't audited by design.                            |
| Migration rollback                   | `pnpm run db:migration:revert` — never hand-edit a committed migration.                                       |
| Dashboard endpoints 404              | Reports module not registered, or backend running on wrong port.                                              |
| Cheque bounce not persisted          | Use `POST /cheques/:id/bounce` (not `PATCH`). It's a dedicated endpoint that increments counters.             |
| CORS blocked                         | Add your origin to `CORS_ORIGIN` env (comma-separated).                                                        |

---

## 9. Suggested Reading Order (Day 1)

1. This file top-to-bottom.
2. [backend/src/main.ts](backend/src/main.ts) + [backend/src/app.module.ts](backend/src/app.module.ts) + [backend/src/data-source.ts](backend/src/data-source.ts).
3. [backend/src/modules/leads/](backend/src/modules/leads/) end-to-end — it's the cleanest example of the full pattern (entity + DTO + service + controller + activity log).
4. [backend/src/shared/](backend/src/shared/) — guards, interceptors, decorators.
5. [frontend/app/router.js](frontend/app/router.js) + [frontend/app/services/auth.js](frontend/app/services/auth.js) + [frontend/app/services/session.js](frontend/app/services/session.js).
6. [frontend/app/controllers/leads.js](frontend/app/controllers/leads.js) — the most feature-rich controller.
7. Open Swagger at `http://localhost:3010/docs` and hit some endpoints with a Bearer token.

---

## 10. Glossary

- **Tenant** — a `Company` row. Every other row (except seed tables like `cities`, `localities`, `regions`) belongs to exactly one tenant.
- **Region** — a geographic code (`dubai`, `riyadh`, …) with its own currency. A company can enable multiple regions via `activeRegions`.
- **Asset** — building/complex. Table is literally named `buildings`.
- **Unit** — one apartment/villa/shop inside an Asset. Leases and cheques attach here.
- **Lead temperature** — orthogonal to pipeline status. HOT/WARM/COLD/DEAD tracks intent; NEW/CONTACTED/… tracks funnel stage.
- **Ejari** — UAE lease registration number (stored on `Lease.ejariNumber`).
- **Cheque** — post-dated bank cheque, standard rent-payment instrument in UAE.
- **Boss Dashboard** — the owner-facing analytics page at `/dashboard` with real-time KPIs.
