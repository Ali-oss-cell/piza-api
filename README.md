# Leovorno API (NestJS + PostgreSQL)

Secure e-commerce backend with JWT authentication, RBAC, menu management, and order fulfillment APIs.

## Stack

- NestJS 11
- PostgreSQL 16
- Prisma ORM
- JWT (`@nestjs/jwt` + `passport-jwt`)
- bcrypt password hashing

## Quick Start (Docker)

```bash
cp .env.example .env
# Update JWT_SECRET and admin seed credentials

docker compose up --build
```

On startup the API container will:

1. Wait for PostgreSQL health checks
2. Run `prisma migrate deploy`
3. Run idempotent admin seed
4. Start NestJS on `http://localhost:3001`

## Local Development

```bash
cp .env.example .env
docker compose up postgres -d

npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

API base URL: `http://localhost:3001/api`

## Authentication

### Login (Admin or User)

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@leovorno.com",
  "password": "ChangeMe!2026"
}
```

Response includes `accessToken`. Send it as:

```http
Authorization: Bearer <accessToken>
```

### Register (Retail USER role)

```http
POST /api/auth/register
```

## RBAC

| Role  | Permissions |
|-------|-------------|
| USER  | Register, login, place orders, view own orders |
| ADMIN | All USER permissions + menu mutations + all orders + status updates |

Protected with `@Roles()` + global `RolesGuard`.

## Key Endpoints

| Method | Route | Access |
|--------|-------|--------|
| GET | `/api/health` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/register` | Public |
| GET | `/api/menu` | Public |
| POST | `/api/menu` | ADMIN |
| PUT | `/api/menu/:id` | ADMIN |
| DELETE | `/api/menu/:id` | ADMIN |
| POST | `/api/orders` | Public (guest) or authenticated USER |
| GET | `/api/orders` | ADMIN |
| GET | `/api/orders/:id` | ADMIN or order owner |
| PATCH | `/api/orders/:id` | ADMIN |

## Environment Variables

See `.env.example` for:

- `DATABASE_URL`
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `ADMIN_SEED_*` credentials
- `RUN_MIGRATIONS`, `RUN_SEED` bootstrap flags

## Admin Seed (Idempotent)

The seed script creates one `ADMIN` user only if the configured email does not already exist.

**Rotate `ADMIN_SEED_PASSWORD` immediately after first boot in production.**

## Production deploy (DigitalOcean Droplet)

Frontend, API, **PostgreSQL**, and Traefik all run on the **same Droplet** via Docker Compose.

### 1. Clone both repos on the droplet

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git

mkdir -p ~/piza && cd ~/piza
git clone git@github.com:Ali-oss-cell/piza-api.git
git clone git@github.com:Ali-oss-cell/piza-front.git

cd piza-api
cp .env.production.example .env
# Edit .env — POSTGRES_PASSWORD, JWT_SECRET, ACME_EMAIL, admin password
# First deploy only: RUN_SEED=true, then set RUN_SEED=false

docker compose -f docker-compose.prod.yml up -d --build
```

This starts four containers:

| Service | Role |
|---------|------|
| `postgres` | PostgreSQL 16 (data persisted in Docker volume) |
| `traefik` | HTTPS (Let's Encrypt), routes by hostname |
| `api` | NestJS → `api.marinapizzas.com.au` |
| `web` | Next.js → `marinapizzas.com.au` / `www` |

Postgres is **not exposed** to the internet — only the API container connects on the internal Docker network (`postgres:5432`).

### 2. DNS

Point these to the **Droplet IP** (same IP for all):

| Record | Host |
|--------|------|
| A | `@` (apex) |
| A or CNAME | `www` |
| A | `api` |

Open **firewall ports 80 and 443** on the droplet. Traefik handles HTTP→HTTPS redirect and certificate renewal.

### 3. Production env checklist

| Variable | Example |
|----------|---------|
| `POSTGRES_PASSWORD` | Strong random password |
| `ACME_EMAIL` | `you@marinapizzas.com.au` |
| `FRONTEND_DIR` | `../piza-front` |
| `NEXT_PUBLIC_API_URL` | `https://api.marinapizzas.com.au/api` |
| `CORS_ORIGIN` | `https://marinapizzas.com.au,https://www.marinapizzas.com.au,https://pos.marinapizzas.com.au` |
| `RUN_SEED` | `true` once, then `false` |
| `JWT_SECRET` | Long random string (32+ chars) |

### 4. Updates

```bash
cd ~/piza/piza-api && git pull
cd ../piza-front && git pull
cd ../piza-api
docker compose -f docker-compose.prod.yml up -d --build
```

Rebuild a single service:

```bash
docker compose -f docker-compose.prod.yml up -d --build api   # API only
docker compose -f docker-compose.prod.yml up -d --build web   # frontend only
```

### Alternative: host nginx

See `scripts/nginx-api.conf.example` if you prefer nginx on the host instead of Traefik (API only — you would still need a reverse proxy for the frontend).

## Repo layout

This repo contains **backend + production stack** (`docker-compose.prod.yml`). The Next.js app lives in [`piza-front`](https://github.com/Ali-oss-cell/piza-front).
