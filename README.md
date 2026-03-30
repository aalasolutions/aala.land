<p align="center">
  <img src="https://aala.land/logo.png" alt="AALA.LAND" width="200" />
</p>

<h1 align="center">AALA.LAND</h1>

<p align="center">
  Property Management Platform for modern real estate teams.
  <br />
  <a href="https://aala.land">Website</a> &middot; <a href="#features">Features</a> &middot; <a href="#installation">Install</a> &middot; <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-ea2845?style=flat-square" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/Ember.js-6.4-e04e39?style=flat-square" alt="Ember.js 6.4" />
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169e1?style=flat-square" alt="PostgreSQL 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-source--available-1AB5A5?style=flat-square" alt="License" />
</p>

---

Manage properties, leads, leases, maintenance, cheques, commissions, and teams from a single dashboard. WhatsApp-first communication, multi-region currency support, and a boss dashboard for real-time agent tracking.

## Features

**Property Management**
- Area, Building, Unit hierarchy with bulk CSV import
- Unit detail pages with photo gallery, specs, amenities
- Building occupancy analytics
- Listing management for portals (rent/sale)

**Lead CRM**
- Kanban board with 4 views: Pipeline, Temperature, Agent, List
- Lead scoring, assignment, conversion tracking
- Stage duration and bottleneck identification
- Transfer history with handover notifications

**Financial**
- Income/expense tracking with payment method support
- Post-dated cheque management with bounce tracking and collection schedule
- Commission workflow (create, approve, pay)
- Deposit reminders and rent collection queries

**Operations**
- Lease lifecycle: create, renew, terminate
- Maintenance work orders with vendor assignment and cost tracking
- Preventive maintenance scheduling (weekly/monthly/quarterly/annually)
- Document management with categories, access levels, and versioning

**Communication**
- WhatsApp message threads per lead (Meta Cloud API)
- Email templates with variable rendering
- Contact address book (leads, tenants, owners, vendors)
- Notification system with customizable reminder rules

**Boss Dashboard**
- Real-time KPIs, red flags, pipeline funnel
- Agent performance comparison and achievements
- Response time metrics and bottleneck analysis
- Activity feed from audit logs

**Multi-Region**
- Configurable city and region support (ships with 14 cities across MENA, extensible to any market)
- Automatic currency switching per region
- Region-filtered data across all modules
- Company settings for active regions

**Security and Compliance**
- Multi-tenant isolation (every query scoped by company)
- Role-based access: Super Admin, Company Admin, Agent, Viewer
- Full audit log with mutation history
- Rate limiting, helmet, CORS, input validation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 11, TypeScript, TypeORM |
| Frontend | Ember.js 6.4, NuvoUI SCSS |
| Database | PostgreSQL 18 |
| Cache | Dragonfly (Redis-compatible) |
| Queue | BullMQ |
| Mobile | Capacitor (shared codebase) |

## Project Structure

```
aala.land/
  backend/                NestJS API (23 entities, 22 modules)
    src/
      modules/            One folder per domain module
      shared/             Guards, interceptors, constants
      database/           Migrations and seeds
  frontend/               Ember.js SPA (22 routes, 14 helpers)
    app/
      routes/             Data loading
      controllers/        User actions
      templates/          Handlebars templates
      services/           Auth, session, region, notifications
      helpers/            Template helpers (currency, dates, etc.)
      components/         Reusable UI components
  docker-compose.yml      Local dev infrastructure
  docker-compose.prod.yml Production configuration
  LICENSE
```

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [pnpm](https://pnpm.io/) package manager
- [Docker](https://www.docker.com/) and Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/aalasolutions/aala.land.git
cd aala.land
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 18** on port `5480`
- **Dragonfly** (Redis-compatible) on port `6470`

### 3. Setup backend

```bash
cd backend
pnpm install
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
DB_HOST=localhost
DB_PORT=5480
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=aala_land
DB_SYNC=true                    # Set false in production

JWT_SECRET=your-secret-key      # Generate: openssl rand -base64 64

# Optional (for full functionality)
WHATSAPP_TOKEN=your-meta-token
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=aala-land-media
```

Start the backend:

```bash
pnpm run start:dev
```

Backend runs on **http://localhost:3010**

### 4. Setup frontend

```bash
cd frontend
pnpm install
pnpm run start
```

Frontend runs on **http://localhost:4200**

### 5. Create your first account

On first run with `DB_SYNC=true`, the database tables are created automatically. Use the API to create your first company and admin user:

```bash
# Create company
curl -X POST http://localhost:3010/v1/companies \
  -H "Content-Type: application/json" \
  -d '{"name": "My Company"}'

# Note the company ID from the response, then create admin user
curl -X POST http://localhost:3010/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin",
    "email": "admin@mycompany.com",
    "password": "YourSecurePassword123!",
    "role": "company_admin",
    "companyId": "COMPANY_ID_FROM_ABOVE"
  }'
```

Log in at **http://localhost:4200** with your credentials.

## Production Deployment

A production-ready Docker setup is included:

```bash
# Build and start
docker compose -f docker-compose.prod.yml up -d

# Environment variables to set:
# DB_SYNC=false (always)
# JWT_SECRET=<strong random string>
# CORS_ORIGIN=https://your-domain.com
# NODE_ENV=production
```

See `backend/Dockerfile` for the multi-stage build configuration.

## API

All endpoints are prefixed with `/v1/`. Every response follows:

```json
{
  "success": true,
  "data": { }
}
```

**22 modules:** Auth, Properties, Leads, Financial, Leases, Maintenance, Cheques, Commissions, WhatsApp, Reports, Audit, Users, Companies, Owners, Contacts, Email Templates, Vendors, Documents, Notifications, Reminder Rules, Listings, Occupancy.

All list endpoints support pagination (`?page=1&limit=20`) and region filtering (`?regionCode=dubai`).

## Testing

```bash
# Backend unit tests
cd backend && pnpm test

# Backend integration tests
cd backend && pnpm test:integration

# Backend E2E tests
cd backend && pnpm test:e2e
```

## Contributing

Contributions are welcome. By submitting a pull request, you agree that your contribution will be licensed under the same terms as the project.

1. Fork the repository
2. Create a feature branch from `main`
3. Follow existing conventions:
   - NuvoUI SCSS for styling (no Tailwind, no inline styles)
   - class-validator DTOs on all endpoints
   - `companyId` scoping on every database query
   - `data-test-*` attributes on interactive elements
4. Include tests for new functionality
5. Submit a pull request with a clear description

## License

AALA.LAND is **source-available** under a custom license. See [LICENSE](LICENSE) for the full terms.

**You CAN**: Use it for your own business, modify it, self-host it, contribute improvements back.

**You CANNOT**: Resell it, offer it as a hosted service to others, remove telemetry, remove attribution.

This is not an OSI-approved open source license. It is a source-available license that permits free internal business use while restricting commercial redistribution.

Copyright (c) 2026 [AALA IT Solutions](https://aalasolutions.com). All rights reserved.
