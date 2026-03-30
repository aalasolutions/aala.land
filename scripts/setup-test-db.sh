#!/bin/bash
# AALA.LAND - Test Database Setup (Docker-based)
# Requires: docker-compose.yml at project root

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
ENV_TEST="$BACKEND_DIR/.env.test"

echo "Starting Docker services..."
cd "$PROJECT_ROOT"
docker compose up -d postgres redis

echo "Waiting for PostgreSQL to be ready..."
until docker exec aala-land-postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready."

# Create .env.test if missing
if [ ! -f "$ENV_TEST" ]; then
  cat > "$ENV_TEST" << EOF
DB_HOST=localhost
DB_PORT=5480
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=aala_land_test
REDIS_HOST=localhost
REDIS_PORT=6470
JWT_SECRET=test-secret-key-not-for-production
JWT_EXPIRES_IN=1h
NODE_ENV=test
EOF
  echo ".env.test created at $ENV_TEST"
fi

# Run migrations on test DB
echo "Running migrations on aala_land_test..."
cd "$BACKEND_DIR"
NODE_ENV=test pnpm run db:migration:run 2>&1

echo "Test database ready."
