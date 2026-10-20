Import **Benny Boy's Pizza (Wantirna South)** menu into the Marina API.

- **Menu source of truth (names, prices, descriptions, preparation):** the Word doc in [`menu-source/`](./menu-source/) — see *Menu source of truth* below.
- **Older catalog notes (ingredient lists only):** [`WANTIRNA_SOUTH_FULL_MENU.md`](./WANTIRNA_SOUTH_FULL_MENU.md)
- **What’s missing vs current scrape:** [`MENU_GAP_CHECK.md`](./MENU_GAP_CHECK.md)
- **Sync deals from live Zwift Specials** ([trending page](https://wantirnasouth.bbpizza.com.au/?group=trending)):
  `python3 docs/benny-boys/sync-live-specials.py --brand benny-boys`
- **Migrate menu “deals” → real ComboDeal bundles** (then deactivate category deals):
  `python3 docs/benny-boys/migrate-menu-deals-to-combos.py --brand benny-boys`
  Smoke: [`COMBO_DEALS_SMOKE.md`](./COMBO_DEALS_SMOKE.md)

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

## Menu source of truth (Word doc) — apply live fixes

`menu-source/Benny_Boys_Menu_and_Pizza_Guidelines.docx` is the master for the store menu.
Committed JSON: `menu-source/benny-boys-menu.source.json` (already parsed — you usually only need **apply**).

### What `apply-menu-source` changes

| Area | Effect |
|---|---|
| Pizza S/L/F prices | From the Word doc (Basic $10.90 / $14.90 / $20.90, etc.) |
| Gluten-free crust | +$3 Basic, +$4 other pizza categories (`categoryPriceDeltas`) |
| Pasta / mains / sides / desserts | Doc prices (e.g. pasta → $18.90) |
| Drinks | One item per size (`Pepsi 375ML`, `Pepsi 1.25L`, Water, …) |
| Categories | Extras **on** for pizzas only; **off** for pasta/mains/sides/desserts/drinks |
| Unlisted items | Hidden (never deleted); combo-slot items kept |
| Deal descriptions | Single / Double / Family 1 / Party rewritten to Instagram creatives; **prices unchanged** |
| Skipped | Chocolate mouse (needs your confirmation in `needsReview`) |

### Droplet runbook (do this in order)

**1. Pull API + rebuild if schema/API is behind** (needed once for per-category GF):

```bash
cd ~/piza/piza-api
git pull origin main
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
# If prisma schema changed this deploy:
# docker compose -f docker-compose.prod.yml exec -T api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=40 api
```

**2. Preview every change (safe — no writes):**

```bash
cd ~/piza/piza-api
export ADMIN_EMAIL='admin@leovorno.com'
export ADMIN_PASSWORD='your-password'
# Use Traefik HTTPS — do NOT use http://127.0.0.1:3001
export API_URL='https://api.marinapizzas.com.au/api'

bash docs/benny-boys/menu-source/apply-menu-source.sh --brand benny-boys --dry-run
```

Read the dry-run: price diffs, drink renames, hidden extras-category noise, GF crust line, and `Deal copy (Instagram creatives)`.

**3. Apply for real:**

```bash
bash docs/benny-boys/menu-source/apply-menu-source.sh --brand benny-boys
```

**4. Spot-check on the storefront**

- Basic pizza Small/Large/Family + GF Large pricing
- A drink shows as `… 375ML` / `… 1.25L` (old short names should be gone/hidden)
- Pasta/mains: no Extra Toppings UI
- Deals: Single = 1× Small + garlic + can; Double = 2× Large; Family 1 = 3× Large; Party = 5× Large
- Family Deal 2 / Wings (if still live) are untouched

**5. Optional — only if you edit the Word doc later**

```bash
# Replace menu-source/Benny_Boys_Menu_and_Pizza_Guidelines.docx first, then:
python3 docs/benny-boys/menu-source/parse-menu-docx.py
# commit the updated benny-boys-menu.source.json, pull on droplet, then dry-run + apply again
```

### Flags

- `--dry-run` — read-only preview
- `--keep-unlisted` — do not hide store items missing from the doc
- `--rename` — also rename matched items to exact doc wording (off by default)

### Notes

- Always use `API_URL=https://api.marinapizzas.com.au/api` (Traefik). Local `:3001` is not exposed.
- Do **not** run `apply-wantirna-store-catalog.*` anymore — it carries older prices.
- Chocolate mouse stays out until you confirm whether it is a typo or a second dessert.
- Preparation cards stay in the JSON for kitchen reference only (not loaded into the DB).
