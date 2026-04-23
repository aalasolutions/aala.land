# Backend Code Optimization — Design

**Date:** 2026-04-20
**Branch:** `fixes`
**Scope:** `backend/src/` — NestJS 11, 21 modules, 23 entities

---

## 1. Goal

Quick-win pass across the backend to fix security holes, performance issues, and code duplication. Pattern-first approach: scan for issue classes across all modules at once, then fix systematically by category.

## 2. Non-goals

- DB schema changes (no migrations, no index additions)
- Test file edits
- Frontend changes
- Architectural refactors (new modules, renamed entities, changed response envelopes)
- API contract changes — response shapes stay identical
- Git operations (no commits, no PRs)

## 3. Issue classes to scan

### Security
- Service methods whose WHERE clause omits `companyId`
- Mutation endpoints (POST/PATCH/DELETE) without `@Roles()` gating where admin-only is expected
- DTOs lacking `@IsUUID`, `@IsEnum`, `@IsEmail`, `@IsNotEmpty` on sensitive fields
- Places that log or return `password`, tokens, or other sensitive fields

### Performance
- `await` inside `.forEach` / `.map` / `for…of` loops (sequential when parallelizable, or N+1 queries)
- `findOne` / `find` with `relations:` loading more than needed
- Repeated `.count()` + `.find()` pairs where `findAndCount()` fits
- Missing pagination on list endpoints that can grow large
- Repeated computation inside loops that could hoist out

### Code quality / duplication
- Identical CRUD method bodies across modules (lift into small shared helper only when seen in 3+ places)
- Hand-rolled region-filter SQL that should use existing `shared/utils/region-filter.util.ts`
- Dead code (unused imports, unused params, unreachable branches)
- Redundant try/catch that swallows errors or re-throws unchanged
- Manual pagination math repeated across controllers

## 4. Execution order

1. **Scan pass** — grep across `backend/src/` for each issue class. Build in-session punch list (file:line + issue tag).
2. **Write todo md file** — `backend-optimization-tasks.md` in `.claude/memories/` with `[ ] -` pattern per user request.
3. **Security fixes first** — correctness bugs take precedence.
4. **Performance fixes.**
5. **Duplication cleanup** — extract helpers only when pattern appears in 3+ places.
6. **Final sweep** — `pnpm run build` (or `tsc --noEmit`); report results.

## 5. Guardrails

- Response shapes unchanged
- No schema touches
- No test file edits
- Flag (don't silently rewrite) any service-signature change used by 5+ callers
- Skip `node_modules`, `dist`, `database/migrations/`, `database/seeds/`

## 6. Stopping criteria

Stop and ask the user when:
- A fix requires changing a service signature used by 5+ callers
- A genuine bug (e.g. cross-tenant leak) is found that deserves eyes before patching
- Any category surfaces >50 issues — ask which subset to prioritize

## 7. Deliverables

- In-repo markdown todo list with live checkbox state
- End-of-run summary grouped by category: Issue → file:line → fix applied, plus flagged-but-not-fixed items with reasoning
- Build verification result
