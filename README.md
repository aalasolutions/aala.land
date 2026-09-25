<p align="center">
  <img src="https://aala.land/logo.png" alt="AALA.LAND" width="200" />
</p>

<h1 align="center">AALA.LAND</h1>

<p align="center">
  Property Management Platform for modern real estate teams.
  <br />
  <a href="https://aala.land">Website</a> &middot; <a href="#features">Features</a> &middot; <a href="#quick-start">Quick start</a> &middot; <a href="#production">Production</a> &middot; <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-ea2845?style=flat-square" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/Ember.js-6-e04e39?style=flat-square" alt="Ember.js 6" />
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169e1?style=flat-square" alt="PostgreSQL 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-source--available-1AB5A5?style=flat-square" alt="License" />
</p>

---

Manage properties, leads, leases, maintenance, cheques, commissions and teams from one dashboard. WhatsApp-first communication, multi-region currency support, and a boss dashboard for real-time agent tracking.

## Features

| Area | What you get |
| --- | --- |
| Properties | Area, building and unit hierarchy with bulk CSV import; unit pages with photos, specs and amenities; occupancy analytics; rent and sale listings for portals |
| Lead CRM | Kanban with pipeline, temperature, agent and list views; scoring, assignment and conversion tracking; stage duration and bottlenecks; transfer history with handover notifications |
| Financial | Income and expense tracking by payment method; post-dated cheques with bounce tracking and a collection schedule; commission workflow (create, approve, pay); deposit reminders and rent collection queries |
| Operations | Lease lifecycle (create, renew, terminate); maintenance work orders with vendor assignment and cost tracking; preventive maintenance schedules; documents with categories, access levels and versioning |
| Communication | WhatsApp threads per lead through the Meta Cloud API, with inbound and outbound media; email templates with variables; a contact book for leads, tenants, owners and vendors; notifications with configurable reminder rules |
| Boss dashboard | Real-time KPIs, red flags and pipeline funnel; agent comparison and achievements; response-time metrics and bottleneck analysis; activity feed from the audit log |
| Multi-region | Configurable regions and cities for any market; automatic currency per region; region-filtered data in every module; active regions per company |
| Security | Multi-tenant isolation, every query scoped by company; roles: super admin, company admin, admin, manager, agent, accountant; full audit log with mutation history; rate limiting, helmet, CORS and input validation |

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | NestJS 11, TypeScript, TypeORM |
| Frontend | Ember.js 6, NuvoUI SCSS |
| Database | PostgreSQL 18 |
| Cache and queues | Valkey (Redis-compatible), BullMQ |
| Storage | Any S3-compatible bucket |
| Mobile | Capacitor, shared codebase |

## Quick start

Prerequisites: [Node.js](https://nodejs.org/) 26 or later, [pnpm](https://pnpm.io/), [Docker](https://www.docker.com/) with Compose.

**1. Clone and start the infrastructure**

```bash
git clone https://github.com/aalasolutions/aala.land.git
cd aala.land
docker compose up -d
```

This starts PostgreSQL on port `5480` and Valkey on port `6470`.

**2. Configure and run the backend**

```bash
cd backend
pnpm install
cp .env.example .env
```

`.env.example` is grouped by section; required keys are uncommented, optional ones are commented with their default. For local development set:

```env
DB_HOST=localhost
DB_PORT=5480
DB_PASSWORD=postgres
REDIS_HOST=localhost
REDIS_PORT=6470
JWT_SECRET=<openssl rand -base64 64>
```

WhatsApp, storage buckets, AI auto-reply, email and billing are optional and documented in the same file. Then:

```bash
pnpm run db:migration:run
pnpm run start:dev
```

The API listens on **http://localhost:3010**, with Swagger docs at `/docs` outside production.

**3. Run the frontend**

```bash
cd frontend
pnpm install
pnpm run start
```

The app runs on **http://localhost:4200**.

**4. Create the first accounts**

- A company and its admin: sign up in the app, or `POST /v1/auth/register` with `companyName`, `companySlug`, `defaultRegionCode`, `userName`, `email` and `password`.
- The operator console super admin: `pnpm run db:seed` on an empty database creates `admin@aala.land` with the password set in `backend/src/database/seeds/test.seed.ts`. Change it after the first login.

## Production

Configure `backend/.env` from `backend/.env.example`, then run the one-shot deploy:

```bash
./deploy.sh
```

It brings up the backend stack (`backend/docker-compose.yml`: Postgres, Valkey, backend), waits for health, runs migrations, then builds and serves the frontend (`frontend/docker-compose.yml`). Both images build inside Docker, so the host needs only Docker.

`backend/.env` is the single source of configuration for the backend stack: Compose loads it for `${...}` interpolation and for the container environment. Values that must change for production:

```env
NODE_ENV=production
DB_HOST=postgres          # the compose service name, not localhost
DB_SYNC=false             # always; the schema comes from migrations
JWT_SECRET=<strong random string>
CORS_ORIGIN=https://your-domain.com
```

A second stack on the same host (staging) sets `STACK_NAME` and its own host ports; see the comments in `.env.example`. The build itself is in `backend/Dockerfile`.

## Project structure

```
aala.land/
  backend/                 NestJS API
    src/modules/           One folder per domain module
    src/shared/            Guards, interceptors, utils, constants
    src/database/          Migrations and seeds
    docker-compose.yml     Production backend stack
  frontend/                Ember.js app
    app/routes/            Data loading
    app/controllers/       User actions
    app/components/        Reusable UI
    app/services/          Auth, session, region, notifications, WhatsApp
    app/templates/         Handlebars templates
    nuvoui/                The NuvoUI Ember kit
    docker-compose.yml     Production frontend (nginx serving the build)
  docker-compose.yml       Local infrastructure (Postgres, Valkey, MinIO)
  deploy.sh                One-shot production deploy
  CODEBASE.md              Module and endpoint map
  LICENSE
```

## API

All endpoints are prefixed with `/v1/`. Every response has the same envelope:

```json
{
  "success": true,
  "data": { }
}
```

List endpoints support pagination (`?page=1&limit=20`) and region filtering (`?regionCode=dubai`). Modules cover auth, companies, users, properties, listings, occupancy, leads, contacts, financial, cheques, commissions, leases, maintenance, vendors, documents, WhatsApp, email templates, notifications, reminder rules, reports and audit. See `CODEBASE.md` for the map.

## Testing

```bash
# Backend: unit and integration (jest), end-to-end, database-backed
cd backend && pnpm test
cd backend && pnpm test:e2e
cd backend && pnpm test:db

# Frontend: lint plus the QUnit suite
cd frontend && pnpm test
```

## Contributing

Contributions are welcome. By submitting a pull request, you agree that your contribution will be licensed under the same terms as the project.

1. Fork the repository and branch from `main`.
2. Follow the conventions: NuvoUI SCSS for styling (no Tailwind, no inline styles), class-validator DTOs on every endpoint, `companyId` scoping on every query, `data-test-*` attributes on interactive elements.
3. Include tests for new functionality.
4. Open a pull request with a clear description.

## License

AALA.LAND is **source-available** under a custom license. See [LICENSE](LICENSE) for the full terms.

**You CAN**: Use it for your own business, modify it, self-host it, contribute improvements back.

**You CANNOT**: Resell it, offer it as a hosted service to others, remove telemetry, remove attribution.

This is not an OSI-approved open source license. It is a source-available license that permits free internal business use while restricting commercial redistribution.

Copyright (c) 2026 [AALA IT Solutions](https://aalasolutions.com). All rights reserved.
