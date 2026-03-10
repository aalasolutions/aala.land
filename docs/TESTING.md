# AALA.LAND Testing Architecture

## Overview

Three-tier testing strategy: Unit, Integration, E2E. Each tier has a specific role and toolchain.

```
Unit Tests         Integration Tests      E2E Tests
(fast, isolated)   (real DB, real DI)     (full stack)
     |                    |                    |
  Jest mocks         Jest + Supertest      Playwright
  per service        per controller        per user flow
     |                    |                    |
  ~2s total           ~15s total            ~60s total
```

---

## Backend Testing

### Unit Tests (Jest)

**Purpose:** Verify service logic in isolation. Every edge case, every error path.

**Location:** `backend/src/modules/<module>/<module>.service.spec.ts`

**Tools:** Jest, `@nestjs/testing`, `jest.fn()` mocks

**Pattern:**
- Mock all TypeORM repositories with `jest.fn()`
- Mock all external dependencies (S3, WhatsApp API, etc.)
- Test every public method: happy path + error paths
- Test company isolation: wrong companyId must throw NotFoundException

**Config:** `backend/jest.config.ts` (unit config)

```typescript
// Unit test config
{
  testPathPattern: 'src/**/*.service.spec.ts',
  coverageThreshold: { global: { lines: 80 } }
}
```

**Run:** `pnpm test`

---

### Integration Tests (Jest + Supertest)

**Purpose:** Verify HTTP layer - routes, guards, validation, response format.

**Location:** `backend/src/modules/<module>/<module>.controller.spec.ts`

**Tools:** Jest, `@nestjs/testing`, Supertest, real PostgreSQL (`aala_land_test` DB)

**Pattern:**
- Use `Test.createTestingModule()` with real providers
- Real TypeORM with test database (not SQLite, not mocks)
- Seed test data in `beforeEach`, clean in `afterEach`
- Test auth guard: unauthenticated requests get 401
- Test validation: invalid DTOs get 400 with field errors
- Test response format: `{ success: true, data: ... }`

**Database:** `aala_land_test` (PostgreSQL, created by `scripts/setup-test-db.sh`)

**Config:** `backend/jest-integration.config.ts`

```typescript
// Integration test config
{
  testPathPattern: 'src/**/*.controller.spec.ts',
  globalSetup: './test/setup.ts',   // runs migrations on test DB
  globalTeardown: './test/teardown.ts'
}
```

**Run:** `pnpm test:integration`

---

### E2E Tests (Backend - Jest + Supertest)

**Purpose:** Full HTTP flow against running NestJS with real database.

**Location:** `backend/test/*.e2e-spec.ts`

**Tools:** Jest, Supertest, real PostgreSQL (`aala_land_test` DB with seed data)

**Pattern:**
- Tests run against the full NestJS application
- Auth: get a real JWT token in `beforeAll`, use it in all requests
- Covers auth flows, multi-tenant isolation, full CRUD cycles

**Run:** `pnpm test:e2e`

---

## Frontend Testing

### Unit Tests (QUnit/ember-qunit)

**Purpose:** Verify pure logic in helpers, utils, and services (not DOM).

**Location:** `frontend/tests/unit/`

**Tools:** QUnit, ember-qunit

**Run:** `pnpm test --filter=unit`

---

### Integration Tests (ember-test-helpers)

**Purpose:** Render a component and interact with it. Verify DOM output.

**Location:** `frontend/tests/integration/components/`

**Tools:** QUnit, ember-qunit, @ember/test-helpers, qunit-dom

**Pattern:**
- Every component has an integration test
- All testable elements have `data-test-*` attributes
- Test: renders correctly, handles user input, shows error states

**Run:** `pnpm test --filter=integration`

---

### E2E Tests (Playwright)

**Purpose:** Full user flows in a real browser against the running full stack.

**Location:** `e2e/` (at project root, not inside frontend/)

**Tools:** Playwright, Chromium (primary), Firefox (secondary)

**Config:** `playwright.config.ts` at project root

```typescript
// playwright.config.ts
{
  baseURL: 'http://localhost:4200',
  use: { screenshot: 'only-on-failure', video: 'retain-on-failure' },
  testDir: './e2e',
  projects: [
    { name: 'chromium' },
    { name: 'firefox' }
  ]
}
```

**Test Suites:**
| Suite | File | Covers |
|-------|------|--------|
| Auth | `e2e/auth/login.spec.ts` | Login, logout, token refresh, invalid creds |
| Properties | `e2e/properties/property-crud.spec.ts` | Full CRUD, hierarchy navigation |
| Leads | `e2e/leads/lead-kanban.spec.ts` | Pipeline moves, assignment, conversion |
| Financial | `e2e/financial/transactions.spec.ts` | Create transaction, view summary |
| Dashboard | `e2e/dashboard/boss-dashboard.spec.ts` | KPIs visible, agent data correct |

**Run:** `pnpm exec playwright test`

---

## Test Database Setup

```bash
# One-time setup
./scripts/setup-test-db.sh

# This creates:
# - PostgreSQL DB: aala_land_test
# - Runs all migrations
# - Creates base test fixtures (company, admin user, agent user)
```

**Test DB credentials** (`.env.test`):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aala_land_test
JWT_SECRET=test-secret-not-for-production
```

---

## Coverage Targets

| Layer | Tool | Target |
|-------|------|--------|
| Backend Services | Jest | 80% line coverage |
| Backend Controllers | Jest | 70% line coverage |
| Frontend Components | QUnit | 70% branch coverage |
| E2E | Playwright | All critical user paths |

---

## CI Pipeline (future)

When CI is added, the order is:
1. `pnpm test` (unit, ~2s)
2. `pnpm test:integration` (integration, ~15s, needs test DB)
3. `pnpm test:e2e` (backend E2E, ~30s)
4. `pnpm exec playwright test` (frontend E2E, ~60s, needs full stack)

Fail fast: if unit tests fail, do not run integration. If integration fails, do not run E2E.

---

## Agent Usage

| What you want | Command |
|--------------|---------|
| Run all backend tests | `/run-tests backend` |
| Run specific module tests | `/run-tests leads` |
| Run full E2E suite | `/run-tests e2e` |
| Run everything | `/run-tests all` |
| Verify before release | `/verify-all` |
