Last Updated: 2026-07-09
Working on: (1) Frontend dedup Batch 1 F1-F4 executed; (2) cross-repo enum/taxonomy reconciliation discovered + planned.
Status:
  - F2/F3/F4 DONE + F1 partial (Groups A+B, 17 fields) — ALL UNCOMMITTED.
  - Then discovered Aamir's frontend constants.js overhaul diverges from 12 backend Postgres enums. Full reconciliation plan written to ../backend/docs/ENUM_RECONCILIATION_PLAN.md.
Next: NEW SESSION starts here. READ ../backend/docs/ENUM_RECONCILIATION_PLAN.md FIRST.
  - Owner decision pending: Option A/B/C (RECOMMENDED B = drop enums to varchar + shared FE/BE constant). 8 data-rewrite mapping decisions needed before migrating.
  - Commit the F1-F4 frontend changes first (independent of the enum work).
Context:
  - Enum trigger = lead-status save rejection. 12/19 FE option arrays diverge; 8 have renamed keys (CREDIT_CARD->CREDIT_DEBIT_CARD, OPEN->OPEN_NEW, CLEANING->CLEANING_DEEP, ID_COPY->ID_PASSPORT, VIEWING removed, DEAD removed, COMMERCIAL split).
  - BLOCKER: leads.service.ts:318 (WON convert) + reports.service.ts:378,496 (funnel) are keyed to enum VALUES — must refactor to category-based BEFORE changing LeadStatus.
  - Precedent for enum rename in repo: users_role_enum renamed via _new/_old type recreation.
  - F1 Group C (profile 4 fields + admin-expiry) deferred — needs visual layout fix (form-group/form-label -> FormInput). Gaps FormInput can't cover: file inputs, textareas.
