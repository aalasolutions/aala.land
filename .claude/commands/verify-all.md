# Full Stack Verification

Runs a complete verification of the entire AALA.LAND stack.

## Usage
```
/verify-all
```

## What This Does (in order)

1. **Compile check** - TypeScript build for backend
2. **Migration check** - All migrations are up to date via `migration-runner` agent
3. **Unit tests** - Backend unit tests via `test-runner` agent
4. **Integration tests** - Backend integration tests via `test-runner` agent
5. **Frontend tests** - Ember unit + integration tests via `test-runner` agent
6. **Audit** - Full code audit via `code-auditor` agent
7. **E2E** (if stack is running) - Playwright tests via `e2e-runner` agent

## Pass Criteria

ALL of the following must be true:
- TypeScript compiles with 0 errors
- All migrations applied
- 0 failing unit tests
- 0 failing integration tests
- 0 failing frontend tests
- Audit: 0 CRITICAL, 0 HIGH findings
- E2E: 0 failing scenarios (if stack running)

## Report Format

```
FULL VERIFICATION: AALA.LAND
Date: <timestamp>

1. TypeScript Build: PASS | FAIL
2. Migrations: PASS | FAIL (X pending)
3. Backend Unit Tests: PASS | FAIL (X/Y passing)
4. Backend Integration Tests: PASS | FAIL (X/Y passing)
5. Frontend Tests: PASS | FAIL (X/Y passing)
6. Code Audit: PASS | FAIL (X critical, X high)
7. E2E Tests: PASS | FAIL | SKIPPED (stack not running)

OVERALL: PASS | FAIL
BLOCKERS: list any failures
```
