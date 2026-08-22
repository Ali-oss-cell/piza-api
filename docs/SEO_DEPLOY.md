# SEO CMS — deployment and smoke test

Per-store / per-domain SEO portal at `/seo-login` and `/seo-dashboard`.

## Database migration

From the API container host (`~/piza/piza-api`):

```bash
cd ~/piza/piza-api
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec api node prisma/seed.js
```

The migration adds `seo_content`, `seo_images`, `blog_posts`, and the `SEO` store membership role.

## Rebuild services

Build **api** first (new `SeoModule` + migration), then **web** (SEO routes + TinyMCE):

```bash
cd ~/piza/piza-api
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api

docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml up -d web
```

Verify uploads volume persists (`api_uploads`) — SEO images live under `uploads/seo/` inside the API container.

## SEO user access

- Invite a team member with role **SEO** from the admin Team screen, or use the seed account (dev only):
  - Email: `seo@marinapizzas.com.au` (override with `SEO_SEED_EMAIL`)
  - Password: set via `SEO_SEED_PASSWORD` — rotate in production
- SEO users sign in at **`/seo-login`** (not linked in public navigation).
- Global admins and store admins can also access the SEO dashboard.

## Dashboard workflow

1. **Store picker** — choose brand (e.g. `leovorno`, `bunny-boys`).
2. **Domain picker** — “Store default” applies to all domains; pick a specific domain to override content for that host/path only.
3. **Pages** — edit hero text and meta tags; character counts shown for title/description.
4. **Images** — upload JPG/PNG/GIF/WebP (5MB); assign to hero slots.
5. **Blog** — create/edit posts with TinyMCE; publish when ready.

## Public site integration

- CMS content is served via `GET /api/seo/content?brand=&page=`
- Blog: `/blog` and `/blog/[slug]`
- `robots.txt` disallows `/seo-login`, `/seo-dashboard`, `/admin`, `/login`
- Dynamic `sitemap.xml` per resolved store/domain
- JSON-LD on home (Restaurant), menu items (Product), blog posts (BlogPosting)

## Smoke test checklist

- [ ] `GET /api/seo/content?brand=leovorno&page=home` returns sections + meta
- [ ] Login at `/seo-login` with SEO or admin account
- [ ] Edit home hero H1 → save → verify on live homepage
- [ ] Upload image → assign to home hero slot
- [ ] Create blog post → toolbar loads → publish → visible at `/blog`
- [ ] `/robots.txt` lists disallow rules for SEO/admin paths
- [ ] `/sitemap.xml` includes store URLs
- [ ] Custom domain resolves store-specific SEO when domain override exists

## Environment

No new required env vars. Existing:

- `NEXT_PUBLIC_API_URL` — frontend → API
- `JWT_SECRET` — auth for write endpoints
- `DATABASE_URL` — PostgreSQL

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login denied at `/seo-login` | User needs `SEO`, `STORE_ADMIN`, or platform admin membership |
| Blog editor blank | Confirm `public/tinymce/icons/` exists after web build |
| Images 404 | Check `api_uploads` volume; do not wipe `uploads/seo/` on deploy |
| Wrong store content | Match `x-brand-slug` / store picker to live site brand |
| Domain override not showing | Select the domain in dashboard; public site resolves host via `StoreDomain` |
