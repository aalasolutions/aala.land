# Frontend Memory

## Facts

2026-04-17 | AGENT:@codex | ROUTES | Top-level frontend routes in `frontend/app/routes/` are `application`, `audit`, `authenticated`, `cheques`, `commissions`, `company`, `contacts`, `dashboard`, `documents`, `email-templates`, `financials`, `index`, `leads`, `leases`, `login`, `maintenance`, `profile`, `reports`, `signup`, `team`, `vendors`, and `whatsapp`.
2026-04-17 | AGENT:@codex | CONTROLLERS | Frontend controllers exist for `application`, `audit`, `cheques`, `commissions`, `company`, `contacts`, `dashboard`, `documents`, `email-templates`, `financials`, `leads`, `leases`, `maintenance`, `profile`, `team`, and `vendors`.
2026-04-17 | AGENT:@codex | SERVICES | Frontend services are `auth`, `notifications`, `preferences`, `region`, and `session`.
2026-04-17 | AGENT:@codex | HELPERS | Frontend helpers include formatting and utility helpers such as `format-currency`, `format-date`, `format-date-time`, `format-number`, `format-role`, `get-activity-icon`, `get-initial`, `includes`, `lowercase`, `object-at`, `or`, `truncate-id`, and `wa-link`.
2026-04-17 | AGENT:@codex | LEADS | The leads UI supports view modes `pipeline`, `temperature`, and `agent`, with persisted preference key `leads-view-mode`.
2026-04-17 | AGENT:@codex | LEADS | Frontend lead pipeline stages in `frontend/app/controllers/leads.js` are `NEW`, `CONTACTED`, `VIEWING`, `NEGOTIATING`, `WON`, and `LOST`.
2026-04-17 | AGENT:@codex | LEADS | Frontend lead temperature stages in `frontend/app/controllers/leads.js` are `HOT`, `WARM`, `COLD`, and `DEAD`.
2026-04-17 | AGENT:@codex | COMPONENTS | Reusable UI primitives exist at `frontend/app/components/app-button.{js,hbs}`, `frontend/app/components/form-input.{js,hbs}`, `frontend/app/components/modal.{js,hbs}`, and `frontend/app/components/confirm-modal.{js,hbs}`.
2026-04-17 | AGENT:@codex | APP | Frontend package is in `frontend/` and uses Ember with pnpm scripts from `frontend/package.json`.
2026-04-17 | AGENT:@codex | API | Frontend README states dev API base is `http://localhost:3010/v1`.
2026-04-17 | AGENT:@codex | BUILD | Frontend build output exists at `frontend/dist/`.
