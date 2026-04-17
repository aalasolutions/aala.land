## Current State
`.codex/` is active for repo-local planning, task claims, and structured project memory under single-agent ownership by `@codex`.

## Log
2026-04-17 | AGENT:@codex | UI | Added shared component-flow and styling memory for buttons, inputs, modals, confirm modals, and shared SCSS conventions.
2026-04-17 | AGENT:@codex | BACKEND | Fixed TS2688 `glob` type-loading issue by constraining backend ambient types to `node` in `backend/tsconfig.json`.
2026-04-17 | AGENT:@codex | INDEX | Added core project structure to memory: backend modules, frontend routes/controllers/services/helpers, and lead stages/temperature workflow.
2026-04-17 | AGENT:@codex | FRONTEND | Documented reusable frontend primitives in memory: app button, form input, modal, and confirm modal components under `frontend/app/components/`.
2026-04-17 | AGENT:@codex | CONTROL | Standardized the repo-local control workflow under `.codex/` and renamed the helper to `scripts/codex.sh`.
2026-04-17 | AGENT:@codex | MEMORY | Added structured memory files under `.codex/memory/` plus `scripts/codex.sh` for task and memory operations.
2026-04-17 | AGENT:@codex | CONTROL | Bootstrapped `.codex/` with `TASKS.md`, `memory/project.md`, `plans/2026-04-17-codex-bootstrap.md`, `README.md`, and `skills/README.md`.

## Decisions
2026-04-17 | AGENT:@codex | Use structured memory files alongside `project.md` | Setup facts, incidents, and domain notes are easier to retrieve when separated by purpose | Future sessions should check `memory/INDEX.md` and the relevant memory file before editing.
2026-04-17 | AGENT:@codex | Use a single-agent `.codex` workflow in this repo | User asked to adapt the broader multi-agent protocol for Codex only | Task claims use `AGENT:@codex`, and all project artifacts stay inside `.codex/`.
