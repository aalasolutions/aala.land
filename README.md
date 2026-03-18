# AALA.LAND

Property Management Platform built for the Middle East market.

Manage properties, leads, leases, maintenance, cheques, commissions, and teams from a single dashboard. WhatsApp-first communication, multi-region currency support, and a boss dashboard for real-time agent tracking.

## Features

- **Property Hierarchy**: Areas, Buildings, Units with bulk CSV import
- **Lead CRM**: Kanban pipeline, temperature board, agent board, list view
- **Lease Management**: Renewals, terminations, tenant history
- **Maintenance**: Work orders, vendor assignment, cost tracking, preventive scheduling
- **Cheque Management**: Post-dated tracking, bounce recording, collection schedule
- **Financial Tracking**: Income/expense, payment methods, deposit reminders
- **Commission Workflow**: Approval and payment pipeline per agent
- **WhatsApp Integration**: Native message threads per lead
- **Boss Dashboard**: KPIs, red flags, agent performance, pipeline funnel, achievements
- **Multi-Region**: 14 MENA cities, automatic currency switching (AED, SAR, BHD, OMR, QAR, KWD, EGP, JOD, LBP)
- **Audit Logs**: Full mutation history with purge controls
- **CRM Tools**: Contacts, email templates with variable rendering, notification system
- **Document Management**: Category filing, access levels, version tracking
- **Team Management**: User invitation, role-based access (Admin, Agent, Viewer)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 11, TypeScript, TypeORM |
| Frontend | Ember.js 6.4 |
| Database | PostgreSQL 18 |
| Cache | Dragonfly (Redis-compatible) |
| Queue | BullMQ |
| Styling | NuvoUI SCSS |
| Mobile | Capacitor (shared codebase) |
| Landing | Next.js |

## Project Structure

```
aala.land/
  backend/          NestJS API (23 entities, 22 modules)
  frontend/         Ember.js SPA (22 routes, 14 helpers, 4 components)
  landing/          Next.js marketing site
  e2e/              Playwright E2E tests
  docs/             Architecture documentation
  scripts/          Database setup scripts
  docker-compose.yml
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Docker and Docker Compose

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (port 5480) and Dragonfly/Redis (port 6470).

### 2. Setup database

```bash
./scripts/setup-test-db.sh
```

### 3. Start backend

```bash
cd backend
pnpm install
cp .env.example .env
pnpm run start:dev
```

Backend runs on http://localhost:3010

### 4. Start frontend

```bash
cd frontend
pnpm install
pnpm run start
```

Frontend runs on http://localhost:4200

### Default login

| Field | Value |
|-------|-------|
| Email | admin@test.com |
| Password | Admin123! |

## API

All endpoints are prefixed with `/v1/`. Responses follow `{ success, data, error }` format.

Core modules: Auth, Properties, Leads, Financial, Leases, Maintenance, Cheques, Commissions, WhatsApp, Reports, Audit, Users, Companies, Owners, Contacts, Email Templates, Vendors, Documents, Notifications, Reminder Rules.

## Testing

```bash
# Backend unit tests
cd backend && pnpm test

# Backend integration tests
cd backend && pnpm test:integration

# E2E tests (requires running stack)
pnpm exec playwright test
```

## Contributing

Contributions are welcome. By submitting a pull request, you agree that your contribution will be licensed under the same terms as the rest of the project (see [LICENSE](LICENSE)).

Before contributing:
1. Fork the repository
2. Create a feature branch
3. Follow existing code conventions (NuvoUI for styling, class-validator for DTOs, companyId scoping on all queries)
4. Include tests for new functionality
5. Submit a pull request with a clear description

## License

AALA.LAND is source-available under a custom license. See [LICENSE](LICENSE) for the full terms.

**You CAN**: Use it for your own business, modify it, self-host it, contribute improvements.

**You CANNOT**: Resell it, offer it as a hosted service to others, remove telemetry, remove branding.

This is NOT an open source license in the OSI sense. It is a source-available license that permits free Internal Business Use while restricting commercial redistribution.

Copyright (c) 2026 AALA IT Solutions. All rights reserved.
