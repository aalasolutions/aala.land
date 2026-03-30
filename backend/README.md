# AALA.LAND Backend

NestJS 11 API powering the AALA.LAND property management platform.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11, TypeScript |
| ORM | TypeORM 0.3 |
| Database | PostgreSQL 18 |
| Cache | Dragonfly (Redis-compatible) via ioredis |
| Queue | BullMQ |
| Auth | JWT (Passport) with role-based access |
| Storage | AWS S3 (presigned URLs) + Sharp for thumbnails |
| Docs | Swagger (auto-generated) |

## Project Structure

```
src/
  modules/              Domain modules (one folder each)
    auth/               Login, JWT, password reset
    properties/         Areas, Buildings, Units, Media, Listings, Occupancy
    leads/              Lead CRM, activities, assignment, conversion
    financial/          Transactions, deposit reminders
    leases/             Lease lifecycle
    maintenance/        Work orders, preventive scheduling
    cheques/            Post-dated cheques, bounce tracking
    commissions/        Commission workflow
    whatsapp/           Meta Cloud API integration
    documents/          Document management with presigned uploads
    contacts/           Address book
    owners/             Property owners
    vendors/            Vendor management
    users/              User CRUD
    companies/          Company management
    email-templates/    Email template rendering
    notifications/      Notification system
    reminder-rules/     Configurable reminder scheduling
    reports/            Reporting endpoints
    audit/              Full mutation audit log
  shared/
    constants/          App-wide constants
    decorators/         Custom decorators
    enums/              Shared enums
    filters/            Exception filters
    guards/             JwtAuthGuard, RolesGuard
    interceptors/       Audit interceptor, response transform
    interfaces/         Shared interfaces
    pipes/              Validation pipes
    utils/              Region filter, helpers
  database/
    migrations/         TypeORM migrations
    seeds/              Database seeders
```

## Modules

20 domain modules, 23 entities. Every database query is scoped by `companyId` for multi-tenant isolation.

**Key patterns:**
- `JwtAuthGuard` on all authenticated routes
- `RolesGuard` with `@Roles()` decorator for admin-only operations
- `ParseUUIDPipe` on all `:id` params
- `class-validator` DTOs on all write endpoints
- Audit interceptor logs all mutations with before/after snapshots
- Region filtering via `regionCode` query param across list endpoints

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL 18 (via Docker or native)
- Dragonfly or Redis (via Docker or native)

### Setup

```bash
pnpm install
cp .env.example .env
```

Edit `.env`:

```env
DB_HOST=localhost
DB_PORT=5480
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=aala_land
DB_SYNC=true                    # Set false in production

JWT_SECRET=your-secret-key      # Generate: openssl rand -base64 64

# Optional
WHATSAPP_TOKEN=your-meta-token
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=aala-land-media
```

### Run

```bash
# Development (watch mode)
pnpm run start:dev

# Production
pnpm run build && pnpm run start:prod
```

Backend runs on **http://localhost:3010**

Swagger docs available at **http://localhost:3010/api**

### Database

```bash
# Generate a migration from entity changes
pnpm run db:migration:generate src/database/migrations/MigrationName

# Run pending migrations
pnpm run db:migration:run

# Revert last migration
pnpm run db:migration:revert

# Seed database
pnpm run db:seed

# Drop and rebuild (destructive)
pnpm run db:reset
```

## API

All endpoints prefixed with `/v1/`. Standard response format:

```json
{
  "success": true,
  "data": { }
}
```

All list endpoints support pagination (`?page=1&limit=20`) and region filtering (`?regionCode=dubai`).

### Security

- Multi-tenant isolation: every query scoped by `companyId`
- Role-based access: Super Admin, Company Admin, Agent, Viewer
- Rate limiting via `@nestjs/throttler`
- Helmet security headers
- CORS configuration
- Full audit trail on all mutations

## Testing

```bash
# Unit tests
pnpm test

# Watch mode
pnpm run test:watch

# Coverage
pnpm run test:cov

# E2E tests
pnpm run test:e2e
```

## License

See [LICENSE](../LICENSE) for full terms. Source-available, free for internal business use.

Copyright (c) 2026 [AALA IT Solutions](https://aalasolutions.com). All rights reserved.
