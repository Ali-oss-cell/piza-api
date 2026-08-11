# Sentry setup (Marina Pizzas)

Error monitoring for **piza-api** and **piza-front**. POS is not wired yet.

## 1. Create projects (one-time)

1. Sign up at https://sentry.io (free Developer plan is enough).
2. Create org if needed.
3. Create two projects:
   - Platform **NestJS** → name `piza-api`
   - Platform **Next.js** → name `piza-front`
4. Copy each project’s **DSN**.

## 2. Droplet `.env` (`~/piza/piza-api/.env`)

```bash
# API
SENTRY_DSN=https://<api-key>@o<org>.ingest.sentry.io/<api-project>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Website (baked into Next build + runtime)
NEXT_PUBLIC_SENTRY_DSN=https://<front-key>@o<org>.ingest.sentry.io/<front-project>
```

Leave blank to disable (local/dev default).

## 3. Deploy

```bash
cd ~/piza/piza-api && git pull origin main
cd ~/piza/piza-front && git pull origin main

cd ~/piza/piza-api
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api

docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml up -d web
```

## 4. Verify

- In Sentry → project → **Issues** → use “Send a test event” (or wait for a real 500).
- Enable **Email alerts** under Alerts if not already on.
