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

Frontend is a **separate repo**: [`piza-front`](https://github.com/Ali-oss-cell/piza-front) on App Platform.

### 1. Create repo & database

1. GitHub repo: **`Ali-oss-cell/piza-api`**.
2. Create **DigitalOcean Managed PostgreSQL** (Sydney region).
3. Copy the connection string into `.env` (see `.env.production.example`).

### 2. Droplet setup

```bash
# On a fresh Ubuntu droplet (same region as DB)
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git

git clone git@github.com:Ali-oss-cell/piza-api.git
cd piza-api
cp .env.production.example .env
# Edit .env: DATABASE_URL, JWT_SECRET, CORS_ORIGIN, admin password
# First deploy only: RUN_SEED=true, then set RUN_SEED=false

docker compose -f docker-compose.prod.yml up -d --build
```

### 3. Nginx + SSL for `api.marinapizzas.com.au`

```bash
sudo cp scripts/nginx-api.conf.example /etc/nginx/sites-available/api.marinapizzas.com.au
sudo ln -s /etc/nginx/sites-available/api.marinapizzas.com.au /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.marinapizzas.com.au
sudo nginx -t && sudo systemctl reload nginx
```

### 4. DNS

Update the existing **A record** for `api.marinapizzas.com.au` to this droplet’s IP.

### 5. Production env checklist

| Variable | Example |
|----------|---------|
| `CORS_ORIGIN` | `https://marinapizzas.com.au,https://www.marinapizzas.com.au` |
| `DATABASE_URL` | Managed Postgres URL with `?sslmode=require` |
| `RUN_SEED` | `true` once, then `false` |
| `JWT_SECRET` | Long random string (32+ chars) |

## Repo layout

This repo contains **backend only**. Do not add the Next.js frontend here.
