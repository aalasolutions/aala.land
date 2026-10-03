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

Run your whole agency from one place: the properties, the leads, the leases, the money and the team. Built for brokerages that live on WhatsApp and work in more than one market. Free to self-host for your own business.

## Why teams use it

- **Keep your clients closer.** Every lead's WhatsApp conversation and history stay on the lead, not on one agent's phone, so a handover never starts from zero.
- **Know what your team is doing today.** A live dashboard shows the pipeline, response times, red flags and who needs help.
- **Stay on top of the money.** Income, expenses and commissions in one place, with every post-dated cheque on a collection schedule.
- **Stop running the business on spreadsheets.** Properties, leases, maintenance and documents live in one system.
- **Sell in more than one market.** Each region has its own currency and its own view of the data.

## Features

| Area | What you get |
| --- | --- |
| Properties | Buildings and units with photos and specs, bulk import, occupancy, listings for rent and sale |
| Leads | Kanban pipeline, scoring, assignment, transfer history |
| WhatsApp | Conversations per lead on your own number, with media and optional AI replies |
| Money | Income and expenses, post-dated cheques, commissions from creation to payout |
| Leases and maintenance | Lease create, renew and terminate; work orders with vendors and costs; scheduled maintenance |
| Contacts and documents | One contact book for leads, tenants, owners and vendors; documents with access levels and versions |
| Boss dashboard | Live KPIs, red flags, agent comparison, activity feed |
| Regions | Any market, its own currency, data filtered by region |
| Access and audit | Roles from agent to company admin, each company's data isolated, every change logged |

**Need an Enterprise setup or a customization?** Reach out at [info@aala.land](mailto:info@aala.land).

---

## For developers

Everything below is for running, deploying and contributing to the code.

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | NestJS 11, TypeScript, TypeORM |
| Frontend | Ember.js 6, NuvoUI SCSS |
| Database | PostgreSQL 18 |
| Cache and queues | Valkey (Redis-compatible), BullMQ |
| Storage | Any S3-compatible bucket |

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
    docker-compose.yml     Production frontend (nginx serving the build)
  docker-compose.yml       Local infrastructure (Postgres, Valkey, MinIO)
  deploy.sh                One-shot production deploy
  CODEBASE.md              Module and endpoint map
  LICENSE
```

## API

All endpoints live under `/v1/`. Interactive API docs are served at `/docs` outside production, and `CODEBASE.md` maps the modules.

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
