# Combo deals smoke checklist

After deploy + migrate:

```bash
cd ~/piza/piza-api && git pull origin main
docker compose -f docker-compose.prod.yml build api && docker compose -f docker-compose.prod.yml up -d api
# apply migration (compose usually runs prisma migrate on start)

cd ~/piza/piza-front && git pull origin main
cd ~/piza/piza-api && docker compose -f docker-compose.prod.yml build web && docker compose -f docker-compose.prod.yml up -d web

cd ~/piza/piza-pos && git pull origin main
cd ~/piza/piza-api && docker compose -f docker-compose.prod.yml build pos && docker compose -f docker-compose.prod.yml up -d pos
```

Seed combos (Benny Boys):

```bash
cd ~/piza/piza-api
export ADMIN_PASSWORD='...'
python3 docs/benny-boys/migrate-menu-deals-to-combos.py --brand benny-boys
```

## POS — Single Deal

1. Open register → **Combos** tab.
2. Tap **Single Deal** → pick small basic pizza → garlic bread → can drink → Add.
3. Cart shows bundle price (~$16.90).
4. Pay cash (or card). Kitchen ticket shows combo header + chosen pizza/side/drink lines.

## Website — Single Deal

1. Open `/deals` → **Build combo** on Single Deal.
2. Complete slots → cart → checkout.
3. Paid/pending order on POS kitchen shows expanded lines.

## Admin

1. Store admin → **Combo deals** (builder) and **Promo codes** (renamed former Promo deals).
