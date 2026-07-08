#!/bin/sh
set -e

echo "Starting Leovorno API container..."

if [ "${RUN_MIGRATIONS}" = "true" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy
fi

if [ "${RUN_SEED}" = "true" ]; then
  echo "Running database seed..."
  node prisma/seed.js
fi

echo "Launching NestJS application..."
exec node dist/src/main.js
