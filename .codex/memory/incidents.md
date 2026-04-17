# Incident Memory

Record blockers, failed attempts, and root causes here.

## Active

- 2026-04-17 | AGENT:@codex | Backend TS2688 for implicit `glob` types | TypeScript was auto-loading ambient `@types/*` libraries from `node_modules`; backend only needs explicit Node types | fixed in `backend/tsconfig.json` with `"types": ["node"]`
- 2026-04-17 | AGENT:@codex | Bootstrap blocked by missing executable `node`, `pnpm`, and `docker` in the shell environment.

## Resolved

None yet.
