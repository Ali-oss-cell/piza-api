#!/bin/sh
set -e

echo "Starting Leovorno API container..."

if [ "${RUN_MIGRATIONS}" = "true" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy
fi

if [ "${RUN_SEED}" = "true" ]; then
  echo "Running database seed..."
  if ! node prisma/seed.js; then
    echo "WARNING: Database seed failed. API will start anyway — fix seed and re-run: node prisma/seed.js"
  fi
fi

echo "Launching NestJS application..."
exec node dist/src/main.js
