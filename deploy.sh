#!/usr/bin/env bash
# KISS deploy. Bring up the backend stack (Postgres + Dragonfly + backend) and
# wait until it is healthy, apply migrations, then build and serve the frontend.
# Run from the repo root:  ./deploy.sh
#
# Docker-only: both images build inside Docker, so the host needs no node/pnpm.
# Config lives in backend/.env (colocated with backend/docker-compose.yml), so
# there is no root .env to keep in sync.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> [backend] build image"
( cd backend && docker compose build )

echo "==> [backend] start Postgres + Dragonfly, wait for healthy"
( cd backend && docker compose up -d --wait postgres dragonfly )

echo "==> [backend] run migrations (before the app serves traffic)"
( cd backend && docker compose run --rm --no-deps backend npm run db:migration:run )

echo "==> [backend] start the app, wait for healthy"
( cd backend && docker compose up -d --wait backend )

echo "==> [frontend] build image (Ember build runs inside Docker) and serve"
# GOOGLE_CLIENT_ID is single-sourced in backend/.env; export it so the compose
# build arg picks it up. No node/pnpm needed on the host.
export GOOGLE_CLIENT_ID="$(grep -E '^GOOGLE_CLIENT_ID=' backend/.env | cut -d= -f2- 2>/dev/null || true)"
( cd frontend && docker compose up -d --build )

echo "==> Deployed. Backend :${BACKEND_HOST_PORT:-3010}   Frontend :7102"
