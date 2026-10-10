# Benny Boy's Wantirna — menu gap check

Compared: `WANTIRNA_SOUTH_FULL_MENU.md` (store catalog you provided)  
Against: Uber scrape `bunny-boys-menu-with-images.json` + live addons `live-site-addons-and-ingredients.json`

Checked: 2026-10-10

---

## Already covered (names exist)

| Group | Status |
|-------|--------|
| All **24 pizzas** | In live catalog + Uber (names/toppings OK) |
| All **8 pastas** | In Uber (as delivery-priced items) |
| Deals: Single / Double / Family 1 / Party | In Uber (prices higher) |
| Drinks (12) | In Uber — prices match cans/1.25L |
| Garlic bread, loaded chips, wedges, wings, parmi | In Uber (names vary) |
| Desserts: donuts, cheesecake, mousse, chocolate pizza | In Uber |
| Half & Half | In Uber only (`Half n Half Pizza`) |
| Pizza removable ingredients + flat extras | In live addons file |

---

## Missing as menu items — **applied 2026-10-10**

Live API updated via `apply-wantirna-store-catalog.sh` (store prices + new items).

| # | Item | Store price | Status |
|---|------|-------------|--------|
| 1 | **Family Deal 2** | $52.50 | Added |
| 2 | **Chicken Schnitzel + Chips** | $16.00 | Added |
| 3 | **Benny Boy's Fries** | $6.90 | Price set |
| 4 | **Chicken Nuggets** (side) | $8.90 | Added |
| 5 | **Calamari Rings** (side) | $8.90 | Added |
| 6 | **4 Chicken Nuggets and Chips** (kids) | $9.90 | Added |
| 7 | **4 Calamari Rings and Chips** (kids) | $9.90 | Added |
| 8 | **Small Margherita Pizza + Juice** (kids) | $11.50 | Added |
| 9 | **Small Hawaiian Pizza + Juice** (kids) | $11.50 | Added |

Also: pizza S/L/F store tiers, pasta $15.90, deal prices, GF crust +$4, Vegetarian Pizza, Lasagna/Carbonara, duplicate “X Pizza” rows cleaned.

---

## Present but wrong for store POS (must fix)

| Issue | Your store | What’s in repo today |
|-------|------------|----------------------|
| Pizza sizes | S/L/F + GF Large | Uber = **one** delivery price |
| Basic tier | $9.90 / $13.90 / $19.90 / GF $17.90 | Uber ~$12.80; import defaults often $10.90/$14.90/$20.90 |
| Premium tier | $10.90 / $15.90 / $21.90 / GF $19.90 | Uber ~$14.00 |
| Pasta | **$15.90** store | Uber **$19.90** |
| Single Deal | $19.90 | Uber $20.60 |
| Double Deal | $36.90 | Uber $38.80 |
| Family Deal 1 | $49.90 | Uber Family $51.80 |
| Party Deal | $89.90 | Uber $90.80 |
| GF | Store GF Large price | Live crust = Large + **$3** (assumes Large $14.90 → GF $17.90) |
| Extra toppings | ~$1 / $1.50–2 / $2–3 by size | Live extras = **flat** +$1 / +$2 |
| Side/dessert/mains ranges | Need one POS price each | Uber uses delivery numbers / ranges unclear |

---

## Extra in Uber (not in your official list)

Keep or drop when cleaning the store menu:

| Uber item | Price |
|-----------|-------|
| Gelato | $8.00 |
| Boneless chicken 1 pcs with chips | $9.90 |
| Boneless chicken 2 Big pcs with chips | $19.80 |
| Half n Half Pizza | $13.80 |

---

## Extras gap (updated 2026-10-10)

Added to `live-site-addons-and-ingredients.json` and synced via `sync-benny-boys-addons.sh`:

- Pesto (+$1)
- Satay Sauce (+$1)
- Tandoori Sauce (+$1)
- Chilli Sauce (+$1)
- Basil (+$1)

Removable ingredients list was already complete for the 24 pizzas.

---

## Structural gaps (features)

- [ ] Import / admin uses **your** S/L/F tiers (not Uber)
- [ ] GF Large calibrated to **your** Large price
- [ ] Half & Half as POS option (+ surcharge)
- [ ] Extra toppings by size (or confirm flat live prices are OK for POS)
- [ ] Kids meal category
- [ ] Resolve price ranges → single store price (garlic bread, fries, wedges, schnitzel, parmi, desserts)

---

## Recommended next step

1. Confirm with store till/Zwift: Large Basic **$13.90** or **$14.90**?  
2. Add the **9 missing items** above into catalog.  
3. Re-import using `WANTIRNA_SOUTH_FULL_MENU.md` as store price source (ignore Uber $ for POS).  
4. Re-run addons sync after prices are correct.

Related files:

- `WANTIRNA_SOUTH_FULL_MENU.md` — full catalog (saved)
- `live-site-addons-and-ingredients.json` — extras / ingredients
- `bunny-boys-menu-with-images.json` — Uber scrape (images useful; prices not for POS)
- `IMPORT_MENU.md` — how to import on the droplet
