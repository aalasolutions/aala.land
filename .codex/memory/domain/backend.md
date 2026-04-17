# Backend Memory

## Facts

2026-04-17 | AGENT:@codex | MODULES | Backend domain modules under `backend/src/modules/` are `audit`, `auth`, `cheques`, `commissions`, `companies`, `contacts`, `documents`, `email-templates`, `financial`, `leads`, `leases`, `locations`, `maintenance`, `notifications`, `owners`, `properties`, `reminder-rules`, `reports`, `users`, `vendors`, and `whatsapp`.
2026-04-17 | AGENT:@codex | LEADS | Canonical lead status stages in `backend/src/modules/leads/entities/lead.entity.ts` are `NEW`, `CONTACTED`, `VIEWING`, `NEGOTIATING`, `WON`, and `LOST`.
2026-04-17 | AGENT:@codex | LEADS | Canonical lead temperature stages in `backend/src/modules/leads/entities/lead.entity.ts` are `HOT`, `WARM`, `COLD`, and `DEAD`.
2026-04-17 | AGENT:@codex | LEADS | Lead sources in `backend/src/modules/leads/entities/lead.entity.ts` are `WEBSITE`, `WHATSAPP`, `REFERRAL`, `SOCIAL_MEDIA`, `WALK_IN`, and `OTHER`.
2026-04-17 | AGENT:@codex | LEADS | Lead records track `stageEnteredAt`, which is used for pipeline analytics and bottleneck reporting.
2026-04-17 | AGENT:@codex | API | Backend package is in `backend/` and uses NestJS with pnpm scripts from `backend/package.json`.
2026-04-17 | AGENT:@codex | ENV | Backend local environment file exists at `backend/.env`.
2026-04-17 | AGENT:@codex | BUILD | Compiled backend output exists at `backend/dist/`.
