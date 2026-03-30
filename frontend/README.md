# AALA.LAND Frontend (Ember.js)

This is the Ember.js app for AALA.LAND.

**Repo location:** `Main/frontend`
**Backend API (dev):** `http://localhost:3010/v1` (see `config/environment.js`)

## Prerequisites

You will need the following things properly installed on your computer.

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Google Chrome](https://google.com/chrome/)

## Installation

- `cd Main/frontend`
- `pnpm install`

## Quickstart (Local Dev)

1. Start infra containers (Postgres, Dragonfly, MinIO) from `Main/`:
   - `cd Main && docker compose up -d`
2. Start the backend API from `Main/backend` (serves `http://localhost:3010/v1`)
3. Start the frontend from `Main/frontend`:
   - `pnpm start`
4. Visit:
   - App: `http://localhost:4200`
   - Tests: `http://localhost:4200/tests`

## Local Credentials (Dev)

- Email: `admin@test.com`
- Password: `Admin123!`

## Configuration

- **Dev API base** is hardcoded to `http://localhost:3010/v1` in `config/environment.js`.
- **Production API base** comes from `API_BASE` (falls back to `/v1`).

## Commands

- Dev server: `pnpm start`
- Tests (lint + Ember tests): `pnpm test`
- Ember tests only: `pnpm test:ember`
- Watch mode: `pnpm test:ember -- --server`
- Lint: `pnpm lint`
- Lint + auto-fix + format: `pnpm lint:fix`
- Format only: `pnpm format`
- Build (production): `pnpm build`

## Conventions (Project Rules)

- Styling is NuvoUI SCSS (no Tailwind, no inline styles).
- Add `data-test-*` attributes for interactive elements in templates.

## Further Reading

- [ember.js](https://emberjs.com/)
- [ember-cli](https://cli.emberjs.com/release/)
- Development Browser Extensions
  - [ember inspector for chrome](https://chrome.google.com/webstore/detail/ember-inspector/bmdblncegkenkacieihfhpjfppoconhi)
  - [ember inspector for firefox](https://addons.mozilla.org/en-US/firefox/addon/ember-inspector/)
