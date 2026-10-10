Import **Benny Boy's Pizza (Wantirna South)** menu into the Marina API.

- **Store catalog (source of truth draft):** [`WANTIRNA_SOUTH_FULL_MENU.md`](./WANTIRNA_SOUTH_FULL_MENU.md)
- **What’s missing vs current scrape:** [`MENU_GAP_CHECK.md`](./MENU_GAP_CHECK.md)
- **Apply store S/L/F + missing items to live API:**
  `bash docs/benny-boys/apply-wantirna-store-catalog.sh --brand benny-boys`

## Sync extras + removable ingredients (from live site)

Matches [wantirnasouth.bbpizza.com.au](https://wantirnasouth.bbpizza.com.au/) add-on prices and per-pizza removable ingredients.

```bash
cd ~/piza/piza-api
git pull origin main
export ADMIN_PASSWORD='your-password'
bash docs/benny-boys/sync-benny-boys-addons.sh --brand benny-boys
```

Catalog: `docs/benny-boys/live-site-addons-and-ingredients.json`

Also runs automatically at the end of `import-store-menu.sh` (unless you pass `--skip-addons`).

## Import from Word + local `pic/` (recommended for updates)

See **[IMPORT_MENU.md](./IMPORT_MENU.md)**. Short version on the droplet:

```bash
cd ~/piza/piza-api
git pull origin main
# upload docx + pic into docs/benny-boys/menu-import/ first
export ADMIN_PASSWORD='your-password'
bash docs/benny-boys/import-store-menu.sh --brand benny-boys --replace
```

## One command (full store reset)

Deletes **all** old stores, logs in with email/password (no browser JWT), creates **one** Benny Boy's store + full menu.

```bash
cd ~/piza/piza-api
git pull origin main

export ADMIN_EMAIL='admin@leovorno.com'
export ADMIN_PASSWORD='your-password'

bash docs/benny-boys/reset-benny-boys.sh
```

Preview only:

```bash
bash docs/benny-boys/reset-benny-boys.sh --dry-run
```

Storefront after import: `https://marinapizzas.com.au` (Benny Boy's is the main store).

## Menu-only import (Uber JSON / old path)

```bash
export ADMIN_PASSWORD='your-password'
cd docs/benny-boys
./setup-benny-boys.sh
```

## Delete stores only (no JWT)

```bash
docker compose -f docker-compose.prod.yml cp scripts/delete-stores.mjs api:/app/scripts/delete-stores.mjs
docker compose -f docker-compose.prod.yml exec -T api node scripts/delete-stores.mjs --all
```

Or SQL fallback:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres psql -U piza -d marinapizzas -c "
BEGIN;
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders);
DELETE FROM orders;
DELETE FROM brands;
COMMIT;"
```
