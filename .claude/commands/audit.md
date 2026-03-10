# Audit Code Quality

Runs a full code quality audit on the specified scope.

## Usage
```
/audit [scope]
```

## Scope Options

- `backend` - Full backend audit
- `frontend` - Full frontend audit
- `all` - Everything
- `<module-name>` - Audit a specific module

## What This Does

Delegates to the `code-auditor` agent. Agent checks:
1. Multi-tenant isolation (CRITICAL)
2. Auth guards on all routes (CRITICAL)
3. DTOs on all controllers (HIGH)
4. Real tests (not skeletons) (HIGH)
5. TypeScript compilation (HIGH)
6. Naming conventions (MEDIUM)
7. Response format consistency (MEDIUM)
8. Frontend data-test attributes (LOW)
9. No inline styles (LOW)

Returns a structured report with severity levels and exact file locations.

## Examples

```
/audit backend
/audit leads
/audit all
```
