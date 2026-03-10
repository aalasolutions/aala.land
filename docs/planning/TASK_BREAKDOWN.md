# AALA.LAND - Master Task Breakdown

> Last Updated: 2026-01-17 | Status: Planning Complete

---

## Phase 1: Foundation (Weeks 1-4)

### 1.1 Project Setup
**Status:** [ ] Not Started

**Tasks:**
- [ ] Initialize NestJS project with TypeScript strict mode
- [ ] Configure ESLint + Prettier
- [ ] Setup PostgreSQL connection with TypeORM
- [ ] Configure Dragonfly connection (Redis-compatible)
- [ ] Create `.env.example` with all required vars
- [ ] Setup Swagger documentation

**How to start:** Run `/backend-setup` workflow

**Acceptance:** `pnpm run start:dev` runs without errors

---

### 1.2 Company Module (Multi-tenant)
**Status:** [ ] Not Started

**Entity: `companies`**
```typescript
- id: UUID (PK)
- name: string (required)
- subdomain: string (unique, optional)
- logo: string (S3 URL)
- settings: JSONB { timezone, currency, dateFormat }
- subscriptionPlan: enum [FREE, STARTER, GROWTH, SCALE, ENTERPRISE]
- subscriptionExpiresAt: timestamp
- isActive: boolean (default: true)
- createdAt, updatedAt: timestamps
```

**Endpoints:**
```
POST   /companies           - Create company (admin only)
GET    /companies/:id       - Get company details
PATCH  /companies/:id       - Update company
GET    /companies/:id/stats - Get company statistics
```

**Tasks:**
- [ ] Create Company entity
- [ ] Create DTOs: CreateCompanyDto, UpdateCompanyDto
- [ ] Create CompanyService with CRUD
- [ ] Create CompanyController
- [ ] Add subscription tier validation
- [ ] Write unit tests (>80% coverage)

**Acceptance:** Can create company via API, data isolated per company

---

### 1.3 User & Auth Module
**Status:** [ ] Not Started

**Entity: `users`**
```typescript
- id: UUID (PK)
- companyId: UUID (FK → companies)
- email: string (unique within company)
- passwordHash: string
- firstName, lastName: string
- phone, whatsapp: string
- avatar: string (S3 URL)
- roleId: UUID (FK → roles)
- preferredLanguage: enum [EN, AR]
- isActive: boolean
- lastLoginAt: timestamp
- createdAt, updatedAt: timestamps
```

**Endpoints:**
```
POST   /auth/login          - Login (returns JWT)
POST   /auth/logout         - Logout
POST   /auth/refresh        - Refresh token
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /auth/me             - Current user

GET    /users               - List users (same company)
POST   /users               - Create user
POST   /users/invite        - Send invitation email
GET    /users/:id
PATCH  /users/:id
DELETE /users/:id           - Soft delete
```

**Tasks:**
- [ ] Create User entity with company relation
- [ ] Implement JWT strategy with Passport
- [ ] Create refresh token mechanism
- [ ] Add password hashing (bcrypt)
- [ ] Create invitation email flow
- [ ] Implement CompanyGuard (tenant isolation)
- [ ] Write auth tests

**Acceptance:** Can login, tokens work, users isolated per company

---

### 1.4 Roles & Permissions
**Status:** [ ] Not Started

**Entities:**
```typescript
// roles
- id: UUID (PK)
- companyId: UUID (FK, nullable for system roles)
- name: string
- isSystem: boolean (default: false)
- permissions: string[] (e.g., ['properties:read', 'leads:write'])

// Default system roles: ADMIN, BROKER, AGENT, VIEWER
```

**Tasks:**
- [ ] Create Role entity
- [ ] Create permission constants enum
- [ ] Create PermissionGuard decorator
- [ ] Seed default system roles
- [ ] Allow company-specific custom roles
- [ ] Create role assignment endpoints

**Acceptance:** Can assign roles, permissions enforced on endpoints

---

## Phase 2: Property Core (Weeks 5-8)

### 2.1 Property Hierarchy
**Status:** [ ] Not Started

**Entities:**

```typescript
// property_areas
- id, companyId
- name: string (e.g., "Business Bay")
- city, country: string
- polygon: JSONB (GeoJSON, optional)

// property_buildings
- id, companyId, areaId (FK)
- name: string (e.g., "IrisBay Tower")
- address: text
- totalUnits: integer
- amenities: string[]
- yearBuilt: integer

// properties
- id, companyId, buildingId (FK)
- unitNumber: string
- floor: integer
- bedrooms, bathrooms: decimal
- areaSqft, areaSqm: decimal
- propertyType: enum [APARTMENT, VILLA, OFFICE, SHOP, WAREHOUSE]
- status: enum [AVAILABLE, RENTED, MAINTENANCE, UNLISTED]
- monthlyRent: decimal
- currency: string (default: AED)
- features: string[]
- description: text
- createdAt, updatedAt
```

**Endpoints:**
```
# Areas
GET    /property-areas
POST   /property-areas
PATCH  /property-areas/:id

# Buildings
GET    /property-buildings
POST   /property-buildings
GET    /property-buildings/:id/units

# Properties
GET    /properties           - With filters: area, building, status, type, rent range
POST   /properties
GET    /properties/:id
PATCH  /properties/:id
POST   /properties/bulk-import   - CSV/Excel
GET    /properties/export        - CSV
```

**Tasks:**
- [ ] Create PropertyArea entity + CRUD
- [ ] Create PropertyBuilding entity + CRUD
- [ ] Create Property entity with full relations
- [ ] Implement advanced search/filter service
- [ ] Create bulk CSV import parser
- [ ] Add property status workflow
- [ ] Write tests

**Acceptance:** Full hierarchy works, search fast (<200ms)

---

### 2.2 Property Media
**Status:** [ ] Not Started

**Entity: `property_media`**
```typescript
- id, companyId, propertyId (FK)
- type: enum [IMAGE, FLOOR_PLAN, VIDEO, DOCUMENT]
- url: string (S3)
- thumbnailUrl: string
- caption: string
- order: integer
- createdAt
```

**Tasks:**
- [ ] Create S3 upload service
- [ ] Implement image optimization (sharp)
- [ ] Create thumbnail generation
- [ ] Add media reordering
- [ ] Implement media deletion with S3 cleanup

**Acceptance:** Can upload images, thumbnails auto-generated

---

## Phase 3: Lead Management (Weeks 9-12)

### 3.1 Lead CRM
**Status:** [ ] Not Started

**Entity: `leads`**
```typescript
- id, companyId
- assignedTo: UUID (FK → users)
- firstName, lastName, email, phone, whatsapp: string
- source: enum [WEBSITE, BAYUT, PROPERTY_FINDER, WHATSAPP, WALK_IN, REFERRAL]
- status: enum [NEW, CONTACTED, VIEWING, NEGOTIATING, WON, LOST]
- temperature: enum [HOT, WARM, COLD, DEAD]
- score: integer (0-100)
- budgetMin, budgetMax: decimal
- preferredAreas: string[]
- propertyRequirements: JSONB
- notes: text
- lastContactedAt: timestamp
- createdAt, updatedAt
```

**Endpoints:**
```
GET    /leads               - With Kanban grouping option
POST   /leads
GET    /leads/:id
PATCH  /leads/:id
POST   /leads/:id/assign    - Transfer to agent
POST   /leads/:id/convert   - Convert to tenant/deal
GET    /leads/:id/activities
POST   /leads/:id/activities
```

**Tasks:**
- [ ] Create Lead entity
- [ ] Implement lead scoring algorithm
- [ ] Create Kanban grouping service (by status, temp, agent)
- [ ] Build lead transfer with notification
- [ ] Create activity timeline
- [ ] Add lead source tracking
- [ ] Implement duplicate detection

**Acceptance:** Kanban views work, transfers notify agents

---

### 3.2 Lead Activities
**Status:** [ ] Not Started

**Entity: `lead_activities`**
```typescript
- id, leadId (FK), userId (FK)
- type: enum [NOTE, CALL, EMAIL, WHATSAPP, VIEWING, STATUS_CHANGE]
- content: text
- metadata: JSONB
- createdAt
```

**Tasks:**
- [ ] Create LeadActivity entity
- [ ] Auto-log status changes
- [ ] Create activity timeline endpoint
- [ ] Add activity filters

---

### 3.3 WhatsApp Integration
**Status:** [ ] Not Started

**Entity: `whatsapp_messages`**
```typescript
- id, companyId, leadId (FK)
- direction: enum [INBOUND, OUTBOUND]
- fromNumber, toNumber: string
- messageType: enum [TEXT, IMAGE, DOCUMENT, TEMPLATE]
- content: text
- mediaUrl: string
- status: enum [SENT, DELIVERED, READ, FAILED]
- waMessageId: string
- createdAt
```

**Tasks:**
- [ ] Integrate WhatsApp Business API
- [ ] Create message sending service
- [ ] Implement webhook receiver
- [ ] Build message status tracking
- [ ] Create broadcast list feature
- [ ] Generate property packet PDFs

**Property Packet PDF Template:**
```
- Property photos (grid)
- Key details (beds, baths, sqft, rent)
- Building amenities
- Location map
- Agent contact QR code
```

**Acceptance:** Can send WhatsApp from CRM, status updates in real-time

---

### 3.4 Boss Dashboard
**Status:** [ ] Not Started

**Endpoints:**
```
GET /dashboard/overview       - KPIs summary
GET /dashboard/agents         - Agent performance
GET /dashboard/activity-feed  - Real-time actions (WebSocket)
GET /dashboard/alerts         - Red flags
GET /dashboard/leaderboard    - Top performers
```

**Widgets to Build:**
1. **KPI Cards:** Total leads, conversions, revenue, active properties
2. **Agent Scoreboard:** Leads handled, conversion rate, response time
3. **Activity Feed:** Real-time log of team actions
4. **Red Flag Alerts:** 
   - Leads untouched >24h
   - Leads in same status >7 days
   - Properties vacant >30 days
5. **Leaderboard:** Top 5 agents this month

**Tasks:**
- [ ] Create dashboard aggregation queries
- [ ] Implement WebSocket for activity feed
- [ ] Build alert detection cron job
- [ ] Create performance metrics calculator
- [ ] Cache dashboard data (Dragonfly, 5min TTL)

**Acceptance:** Dashboard loads <1s, activity updates real-time

---

## Phase 4: Financial (Weeks 13-16)

### 4.1 Transactions
**Status:** [ ] Not Started

**Entity: `transactions`**
```typescript
- id, companyId, propertyId, leaseId
- type: enum [RENT, DEPOSIT, COMMISSION, EXPENSE, REFUND]
- category: string
- amount: decimal
- currency: string
- paymentMethod: enum [CASH, BANK, CHEQUE, CARD]
- status: enum [PENDING, COMPLETED, CANCELLED, BOUNCED]
- dueDate, paidDate: date
- reference: string
- attachments: JSONB
- createdBy: UUID
- createdAt
```

**Tasks:**
- [ ] Create Transaction entity
- [ ] Implement transaction categories
- [ ] Build financial summary queries
- [ ] Create transaction filters
- [ ] Add receipt generation

---

### 4.2 Cheque Management
**Status:** [ ] Not Started

**Entity: `cheques`**
```typescript
- id, companyId, transactionId (FK)
- chequeNumber: string
- bank: string
- amount: decimal
- issueDate, dueDate: date
- status: enum [PENDING, DEPOSITED, CLEARED, BOUNCED, CANCELLED]
- imageUrl: string (S3)
- ocrData: JSONB (extracted text)
- depositedAt: timestamp
- createdAt
```

**Tasks:**
- [ ] Create Cheque entity
- [ ] Implement image upload with OCR (Tesseract or cloud)
- [ ] Extract: cheque number, amount, date, bank
- [ ] Create deposit reminder notifications
- [ ] Build cheque calendar view
- [ ] Track bounce history

**Acceptance:** Upload cheque photo → auto-extract details

---

## Development Order Summary

```
Week 1-2:  Setup → Company → User/Auth
Week 3-4:  Roles → Base guards → API docs
Week 5-6:  Property hierarchy → Media
Week 7-8:  Testing → Performance tuning
Week 9-10: Leads → Activities → Kanban
Week 11-12: WhatsApp → Boss Dashboard
Week 13-14: Transactions → Cheques
Week 15-16: Leases → Reports
Week 17-20: Frontend (Ember.js)
Week 21-24: Mobile → Launch
```

---

*Each task should be completable in 1-2 days. Mark as `[/]` when in progress, `[x]` when done.*
