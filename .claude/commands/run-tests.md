# Run Tests

Runs the specified test suite and reports results.

## Usage
```
/run-tests [scope]
```

## Scope Options

- `backend` - Backend unit tests only
- `backend-e2e` - Backend E2E tests (requires running DB)
- `frontend` - Frontend unit + integration tests
- `e2e` - Playwright E2E (requires full stack running)
- `all` - Everything (unit + integration + E2E)
- `<module-name>` - Tests for a specific backend module only

## What This Does

Delegates to the `test-runner` agent with the specified scope. Agent runs tests, parses output, and returns a structured report with pass/fail per test and analysis of any failures.

## Examples

```
/run-tests backend
/run-tests leads
/run-tests all
/run-tests e2e
```
