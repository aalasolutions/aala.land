# .codex

Repo-local control files for `@codex`.

## Purpose

This project keeps planning, task claims, and project memory inside the repository so session context does not depend on chat history.

## Single-Agent Workflow

1. Read `.codex/TASKS.md` before starting work.
2. If the task is not already claimed, add a pending claim for `AGENT:@codex` before editing files.
3. For non-trivial work, write a plan in `.codex/plans/YYYY-MM-DD-title.md` before implementation.
4. Write durable technical facts to `.codex/memory/project.md` as soon as they are established.
5. When work is complete, mark the task as done in `.codex/TASKS.md`.

## Helper Script

Use `scripts/codex.sh` for common operations:

- `scripts/codex.sh claim "Task title"`
- `scripts/codex.sh done "Task title"`
- `scripts/codex.sh log "AREA" "DETAIL"`
- `scripts/codex.sh decision "DECISION" "WHY" "CONSEQUENCES"`
- `scripts/codex.sh incident "ISSUE" "ROOT CAUSE" "STATUS"`

## Layout

- `TASKS.md`: active and completed task ledger, newest entries first
- `memory/project.md`: current state, technical log, and locked decisions
- `memory/INDEX.md`: quick index into the structured memory files
- `memory/setup.md`: verified environment and bootstrap facts
- `memory/decisions.md`: durable architectural and workflow decisions
- `memory/incidents.md`: active and resolved blockers
- `memory/domain/`: backend/frontend specific notes
- `plans/`: per-task plans created before non-trivial changes
- `skills/`: optional project-local skills, each in its own folder with `SKILL.md`

## Conventions

- Keep all project artifacts inside `.codex/`.
- Use `AGENT:@codex` for task ownership in this repo.
- Do not rely on external temp files for plans or memory.
- Prefer appending new memory at the top of the relevant section so recent state is easy to find.
