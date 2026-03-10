# AALA.LAND - Agent Bootstrap

Property Management SaaS for the Middle East (UAE focus).

**Read these files at session start:**
- @.claude/memory/TaskList.md - current phase and pending tasks
- @.claude/memory/session.md - where we left off
- @.claude/memory/memories.md - key technical decisions and file locations
- @.claude/memory/context.md - project rules and conventions
- @.claude/memory/DEPENDENCY_MAP.md - visual map of all file dependencies (Mermaid)
- @.claude/memory/AUDIT_2026_03_10.md - codebase audit findings and DRY violations

**Frontend work: always load NuvoUI docs first:**
- @~/.claude/home-aamir/nuvoui-llm-guide.md

---

## **MUST FOLLOW**
- Alaways add entry in project memory to keep track what have done, context compresses and you loss the track of things. 
- Always put things in todo or add reference to in session on every small success. 
- The better control you have on context, memroies, project structure the better
- Alays update DEPENDENCY_MAP.md

---

## Testing
- Must use `agent-browser` skill and run browser with head so Aamir can view it
- Try not to take screenshots to reduce token usage
- Must read Console to understand what are the errors
- If not sure, try adding console.logs for Ember Side debugging

---

## Architecture

```
aala.land/
  backend/          NestJS 11 + TypeORM + PostgreSQL
  frontend/         Ember.js 6.4 + NuvoUI SCSS
  landing/          Next.js marketing site
  e2e/              Playwright tests (full stack)
  docs/             Architecture docs
  scripts/          DB setup, init SQL
  docker-compose.yml
```

---

## Non-Negotiable Rules

1. Every entity query filters by `companyId`. No exceptions outside super-admin.
2. Every controller uses `@UseGuards(JwtAuthGuard)`.
3. Every controller endpoint accepts a DTO (never `Partial<Entity>` or raw body).
4. Styling via NuvoUI SCSS only. No Tailwind. No inline styles.
5. Tests must pass before any module is marked complete.
6. No `synchronize: true` outside of clearly marked test-only configs.
7. All interactive elements in Ember templates have `data-test-*` attributes.
8. When adding, modifying, or removing API calls, routes, controllers, services, or entity relationships, update `DEPENDENCY_MAP.md` to reflect the change. The map must stay current with the codebase.

---

## Available Agents

Agents live in [.claude/agents/](.claude/agents/). Claude Code dispatches them automatically based on the task, or you can reference them explicitly.

| Agent | When It Is Used |
|-------|----------------|
| [backend-module](@.claude/agents/backend-module.md) | Building a new NestJS module end-to-end |
| [frontend-feature](@.claude/agents/frontend-feature.md) | Building a new Ember.js feature end-to-end |
| [test-runner](@.claude/agents/test-runner.md) | Running any test suite and parsing results |
| [migration-runner](@.claude/agents/migration-runner.md) | Creating and running TypeORM migrations |
| [e2e-runner](@.claude/agents/e2e-runner.md) | Running Playwright E2E tests |
| [code-auditor](@.claude/agents/code-auditor.md) | Auditing code quality, multi-tenant compliance, security |

---

## Available Commands

Commands live in [.claude/commands/](.claude/commands/). Invoke with `/command-name`.

| Command | What It Does |
|---------|-------------|
| `/build-module <name> [spec]` | Backend module: entity + DTOs + service + controller + tests + migration + audit |
| `/build-feature <name> [spec]` | Frontend feature: route + component + template + tests + audit |
| `/run-tests [scope]` | Run tests for `backend`, `frontend`, `e2e`, `all`, or a module name |
| `/audit [scope]` | Code quality audit for `backend`, `frontend`, `all`, or a module name |
| `/verify-all` | Full stack verification: compile + migrate + unit + integration + E2E + audit |

---

## Local Dev Credentials

| Service | URL | Email | Password |
|---------|-----|-------|----------|
| Frontend | http://localhost:4201 | admin@test.com | Admin123! |
| Backend API | http://localhost:3010/v1 | — | — |
| MinIO console | http://localhost:9001 | minioadmin | minioadmin |

---

## Infrastructure

**Start local services:**
```bash
docker compose up -d
```

Ports (non-default, avoid collisions with other projects):
- PostgreSQL 18: `localhost:5480`
- Dragonfly (Redis-compatible): `localhost:6470`

**First-time test DB setup:**
```bash
./scripts/setup-test-db.sh
```

**Backend dev:**
```bash
cd backend && pnpm run start:dev
```

**Frontend dev:**
```bash
cd frontend && pnpm run start
```

---

## Testing Architecture

Full details in [@./docs/TESTING.md](@./docs/TESTING.md).

| Tier | Tool | Location | Command |
|------|------|----------|---------|
| Backend unit | Jest | `backend/src/**/*.service.spec.ts` | `pnpm test` |
| Backend integration | Jest + Supertest | `backend/src/**/*.controller.spec.ts` | `pnpm test:integration` |
| Backend E2E | Jest + Supertest | `backend/test/*.e2e-spec.ts` | `pnpm test:e2e` |
| Frontend unit | QUnit | `frontend/tests/unit/` | `pnpm test` |
| Frontend integration | ember-test-helpers | `frontend/tests/integration/` | `pnpm test` |
| Full stack E2E | Playwright | `e2e/` | `pnpm exec playwright test` |

---

## Current Phase

Check [TaskList.md](@.claude/memory/TaskList.md) for the live task state.
Check [ROADMAP.md](@./docs/ROADMAP.md) for the live task state.

Execution order:
1. Phase 0: Test infrastructure
2. Phase 1: Foundation hardening (DTOs, guards, real tests, migrations)
3. Phase 2: Property core (financial, S3, bulk import)
4. Phase 3: Lead CRM (leads, WhatsApp, notifications)
5. Phase 4: Advanced (leases, cheques, maintenance, reports)
6. Phase 5: Frontend
7. Phase 6: E2E tests
8. Phase 7: Launch
