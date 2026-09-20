#!/usr/bin/env bash
# Docker-only deploy; config lives only in backend/.env, no root .env to sync.
set -euo pipefail
cd "$(dirname "$0")"

env_get() { grep -E "^$1=" "$2" 2>/dev/null | cut -d= -f2- || true; }

echo "==> [backend] build image"
( cd backend && docker compose build )

echo "==> [backend] start Postgres + Valkey, wait for healthy"
( cd backend && docker compose up -d --wait postgres valkey )

echo "==> [backend] run migrations (before the app serves traffic)"
( cd backend && docker compose run --rm --no-deps backend npm run db:migration:run )

echo "==> [backend] start the app, wait for healthy"
( cd backend && docker compose up -d --wait backend )

echo "==> [frontend] build image (Ember build runs inside Docker) and serve"
export GOOGLE_CLIENT_ID="$(env_get GOOGLE_CLIENT_ID backend/.env)"
export STACK_NAME="$(env_get STACK_NAME backend/.env)"
( cd frontend && docker compose up -d --build )

BACKEND_PORT="$(env_get BACKEND_HOST_PORT backend/.env)"
FRONTEND_PORT="$(env_get FRONTEND_HOST_PORT frontend/.env)"
echo "==> Deployed. Backend :${BACKEND_PORT:-3010}   Frontend :${FRONTEND_PORT:-7102}"
