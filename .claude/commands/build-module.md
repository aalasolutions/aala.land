# Build Backend Module

Builds a complete, tested NestJS backend module for AALA.LAND.

## Usage
```
/build-module <module-name> [spec]
```

## What This Does

1. Delegates to the `backend-module` agent with the module name and any spec provided
2. Agent creates all files: entity, DTOs, service, controller, module, unit tests, integration tests
3. Agent registers module in app.module.ts
4. Agent runs tests and confirms they pass
5. Agent runs build to confirm TypeScript is clean
6. Delegates to `migration-runner` agent to generate and run the migration
7. Delegates to `code-auditor` agent to verify the module passes all audit checks
8. Reports final status

## Examples

```
/build-module leads
/build-module financial "transactions and cheque management with post-dated cheque tracking"
/build-module leases "lease agreements with start/end dates, monthly rent, and Ejari tracking"
```

## Failure Policy

If any step fails (tests fail, audit finds CRITICAL/HIGH issues, migration fails), the module is NOT marked complete. Report what failed and what needs to be fixed.
