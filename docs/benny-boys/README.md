# Benny Boy's Pizza — store setup

Import **Benny Boy's Pizza (Wantirna South)** menu into the Marina API.

## One command (recommended)

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

## Menu-only import (store already exists)

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
