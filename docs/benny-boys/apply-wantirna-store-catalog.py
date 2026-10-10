#!/usr/bin/env python3
"""Apply Wantirna South store catalog prices + missing items to Benny Boys.

Source of truth: WANTIRNA_SOUTH_FULL_MENU.md / MENU_GAP_CHECK.md

  - Pizza S/L/F store tiers (Basic / Premium)
  - GF crust +$4 (Large Basic $13.90 → GF $17.90; Premium $15.90 → $19.90)
  - Pasta $15.90, deal store prices
  - Missing sides / mains / kids / Family Deal 2 / Vegetarian pizza / desserts

Usage:
  export ADMIN_PASSWORD='...'
  python3 docs/benny-boys/apply-wantirna-store-catalog.py --brand benny-boys
  python3 docs/benny-boys/apply-wantirna-store-catalog.py --brand benny-boys --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_API = os.environ.get("API_URL", "https://api.marinapizzas.com.au/api")
PLACEHOLDER = (
    "https://images.unsplash.com/photo-1513104890138-7c749659a591"
    "?auto=format&fit=crop&w=800&q=80"
)

BASIC_SIZES = {
    "small": {"enabled": True, "price": 9.90},
    "large": {"enabled": True, "price": 13.90},
    "family": {"enabled": True, "price": 19.90},
}
PREMIUM_SIZES = {
    "small": {"enabled": True, "price": 10.90},
    "large": {"enabled": True, "price": 15.90},
    "family": {"enabled": True, "price": 21.90},
}

# categorySlug → size tier
PIZZA_CATEGORY_TIERS = {
    "basic-pizzas": BASIC_SIZES,
    "supreme-pizzas": PREMIUM_SIZES,
    "chicken-pizzas": PREMIUM_SIZES,
    "vegetarian-pizzas": PREMIUM_SIZES,
}

DEAL_PRICES = {
    "single deal": 19.90,
    "double deal": 36.90,
    "family deal": 49.90,  # Family Deal 1
    "family deal 1": 49.90,
    "party deal": 89.90,
    "party deal 1": 89.90,
}

SIDE_PRICES = {
    "garlic bread": 3.50,
    "benny boy's fries": 6.90,
    "benny boys fries": 6.90,
    "loaded chips": 9.00,
    "chips loaded with cheese & bacon": 9.00,
    "chips loaded w cheese and bacon": 9.00,
    "seasoned wedges": 9.00,
    "seasoned potato wedges with sour cream": 9.00,
    "seasoned potato wedges w sour cream": 9.00,
}

DESSERT_PRICES = {
    "hot jam donuts": 2.00,
    "cheesecake": 4.50,
    "cheese cake": 4.50,
    "chocolate mousse": 4.50,
    "chocolate pizza": 9.00,
}

RENAME = {
    "americana": "American Style",
}


def normalize_key(value: str) -> str:
    s = value.lower().replace("’", "'").replace("`", "'")
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    s = s.replace("benny-boy-s-", "benny-boys-")
    return s or "item"


def fetch_admin_token(api_url: str, email: str, password: str) -> str:
    url = f"{api_url.rstrip('/')}/auth/login"
    body = json.dumps({"email": email.strip(), "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    token = data.get("accessToken") or data.get("access_token")
    if not token:
        raise SystemExit(f"Login response missing accessToken: {data}")
    return token


class ApiClient:
    def __init__(self, base: str, token: str, brand: str, dry_run: bool = False):
        self.base = base.rstrip("/")
        self.token = token
        self.brand = brand
        self.dry_run = dry_run

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "x-brand-slug": self.brand,
            "Content-Type": "application/json",
        }

    def request(self, method: str, path: str, body: dict | None = None):
        url = f"{self.base}{path}"
        if self.dry_run and method != "GET":
            print(f"  [dry-run] {method} {path} {json.dumps(body)[:120] if body else ''}")
            return {"ok": True, "dryRun": True}
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=self._headers(), method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            err = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} → HTTP {exc.code}: {err}") from exc

    def get(self, path: str):
        return self.request("GET", path)

    def post(self, path: str, body: dict):
        return self.request("POST", path, body=body)

    def put(self, path: str, body: dict):
        return self.request("PUT", path, body=body)


def ensure_category(api: ApiClient, slug: str, label: str, sort_order: int) -> None:
    payload = {
        "slug": slug,
        "label": label,
        "sortOrder": sort_order,
        "supportsSizeOptions": False,
        "supportsExtras": False,
    }
    try:
        api.post("/menu/categories", payload)
        print(f"  ✓ category {slug}")
    except RuntimeError as exc:
        if "409" in str(exc) or "already" in str(exc).lower():
            print(f"  · category {slug} (exists)")
        else:
            raise


def item_payload_from_existing(item: dict, **overrides) -> dict:
    payload = {
        "slug": item["slug"],
        "number": int(item.get("number") or 1),
        "name": item["name"],
        "description": item.get("description") or f"{item['name']}.",
        "price": float(item["price"]),
        "categorySlug": item["categorySlug"],
        "imageUrl": item.get("imageUrl") or PLACEHOLDER,
        "imageAlt": item.get("imageAlt") or item["name"],
        "isActive": bool(item.get("isActive", True)),
        "ingredients": list(item.get("ingredients") or []),
        "badges": list(item.get("badges") or []),
        "allowedToppingIds": list(item.get("allowedToppingIds") or []),
    }
    if item.get("imageBlurHash"):
        payload["imageBlurHash"] = item["imageBlurHash"]
    if item.get("priceNote"):
        payload["priceNote"] = item["priceNote"]
    if item.get("sizeOptions"):
        payload["sizeOptions"] = item["sizeOptions"]
    payload.update(overrides)
    return payload


def new_item(
    *,
    name: str,
    category: str,
    price: float,
    description: str,
    number: int,
    size_options: dict | None = None,
) -> dict:
    payload = {
        "slug": slugify(name),
        "number": number,
        "name": name,
        "description": description,
        "price": float(price),
        "categorySlug": category,
        "imageUrl": PLACEHOLDER,
        "imageAlt": name,
        "isActive": True,
        "ingredients": [],
        "badges": [],
    }
    if size_options:
        payload["sizeOptions"] = size_options
    return payload


def sync_gf_crust(api: ApiClient) -> None:
    print("→ GF crust +$4.00 (store Large→GF delta)")
    crusts = api.get("/customizations/crusts/manage/all")
    rows = crusts if isinstance(crusts, list) else []
    flat: list[dict] = []
    for row in rows:
        if isinstance(row, dict) and row.get("slug"):
            flat.append(row)
        elif isinstance(row, dict) and isinstance(row.get("crusts"), list):
            flat.extend(row["crusts"])
    gf = next((r for r in flat if r.get("slug") == "gluten-free"), None)
    payload = {
        "slug": "gluten-free",
        "label": 'Gluten Free - Large 11"',
        "priceDelta": 4.0,
        "sortOrder": 1,
        "isActive": True,
    }
    if gf and gf.get("id"):
        api.put(f"/customizations/crusts/{gf['id']}", {
            "label": payload["label"],
            "priceDelta": 4.0,
            "sortOrder": 1,
            "isActive": True,
        })
        print(f"  ↻ gluten-free +$4.00 (id={gf['id']})")
    else:
        api.post("/customizations/crusts", payload)
        print("  ✓ gluten-free +$4.00")


def apply_prices_and_gaps(api: ApiClient) -> None:
    print("→ Ensuring kids-meals category")
    ensure_category(api, "kids-meals", "Kid's Meals", 8)

    catalog = api.get("/menu/manage/all")
    if not isinstance(catalog, list):
        raise SystemExit("GET /menu/manage/all did not return a list")

    by_key = {normalize_key(i["name"]): i for i in catalog}
    by_slug = {i["slug"]: i for i in catalog if i.get("slug")}
    max_number = max((int(i.get("number") or 0) for i in catalog), default=0)

    updated = created = 0

    # 1) Pizza size tiers + rename Americana
    print("→ Pizza S/L/F store tiers")
    for item in catalog:
        cat = item.get("categorySlug") or ""
        sizes = PIZZA_CATEGORY_TIERS.get(cat)
        if not sizes:
            continue
        key = normalize_key(item["name"])
        new_name = RENAME.get(key)
        price = float(sizes["small"]["price"])
        overrides = {
            "price": price,
            "sizeOptions": sizes,
            "priceNote": "GF Large 11\" available (+$4 on Large)",
        }
        if new_name:
            overrides["name"] = new_name
            overrides["slug"] = slugify(new_name)
            overrides["imageAlt"] = new_name
        payload = item_payload_from_existing(item, **overrides)
        api.put(f"/menu/{item['id']}", payload)
        label = overrides.get("name", item["name"])
        print(
            f"  ↻ [{cat}] {label}  "
            f"S{sizes['small']['price']}/L{sizes['large']['price']}/F{sizes['family']['price']}"
        )
        updated += 1
        time.sleep(0.02)

    # Refresh catalog after renames
    catalog = api.get("/menu/manage/all")
    by_key = {normalize_key(i["name"]): i for i in catalog}
    by_slug = {i["slug"]: i for i in catalog if i.get("slug")}

    # 2) Pasta → $15.90
    print("→ Pasta $15.90")
    for item in catalog:
        if item.get("categorySlug") != "pasta":
            continue
        payload = item_payload_from_existing(
            item, price=15.90, sizeOptions=None, priceNote="Store price"
        )
        # explicit null sizeOptions — omit if API rejects; clear via not sending sizes
        payload.pop("sizeOptions", None)
        api.put(f"/menu/{item['id']}", payload)
        print(f"  ↻ [pasta] {item['name']}  $15.90")
        updated += 1
        time.sleep(0.02)

    # 3) Deals prices
    print("→ Deal store prices")
    for item in catalog:
        if item.get("categorySlug") != "deals":
            continue
        key = normalize_key(item["name"])
        price = DEAL_PRICES.get(key)
        if price is None:
            continue
        payload = item_payload_from_existing(item, price=price)
        api.put(f"/menu/{item['id']}", payload)
        print(f"  ↻ [deals] {item['name']}  ${price:.2f}")
        updated += 1
        time.sleep(0.02)

    # 4) Side / dessert price fixes for existing rows
    print("→ Side / dessert store prices")
    for item in catalog:
        key = normalize_key(item["name"])
        price = SIDE_PRICES.get(key) or DESSERT_PRICES.get(key)
        if price is None:
            continue
        if abs(float(item["price"]) - price) < 0.001:
            continue
        payload = item_payload_from_existing(item, price=price)
        api.put(f"/menu/{item['id']}", payload)
        print(f"  ↻ [{item['categorySlug']}] {item['name']}  ${price:.2f}")
        updated += 1
        time.sleep(0.02)

    # 5) Create missing items
    print("→ Creating missing items")
    missing = [
        new_item(
            name="Vegetarian Pizza",
            category="basic-pizzas",
            price=9.90,
            description="Mushroom, onion, capsicum and olives. Tomato base and cheese.",
            number=0,
            size_options=BASIC_SIZES,
        ),
        new_item(
            name="Family Deal 2",
            category="deals",
            price=52.50,
            description="2 large pizzas + 1 pasta + 2 sides or drinks.",
            number=0,
        ),
        new_item(
            name="Chicken Schnitzel + Chips",
            category="mains",
            price=16.00,
            description="Succulent crumbed chicken schnitzel fried to perfection, served with chips.",
            number=0,
        ),
        new_item(
            name="BBQ Chicken Wings + Chips",
            category="mains",
            price=15.00,
            description="BBQ-seasoned wings served with chips.",
            number=0,
        ),
        new_item(
            name="Chicken Parmigiana + Chips",
            category="mains",
            price=19.00,
            description="Crumbed chicken baked with mozzarella and home-made sauce, served with chips.",
            number=0,
        ),
        new_item(
            name="Chicken Nuggets",
            category="sides",
            price=8.90,
            description="Crumbed chicken nuggets.",
            number=0,
        ),
        new_item(
            name="Calamari Rings",
            category="sides",
            price=8.90,
            description="Crumbed calamari rings.",
            number=0,
        ),
        new_item(
            name="Cheesecake",
            category="desserts",
            price=4.50,
            description="Cheesecake slice.",
            number=0,
        ),
        new_item(
            name="Chocolate Mousse",
            category="desserts",
            price=4.50,
            description="Chocolate mousse.",
            number=0,
        ),
        new_item(
            name="Chocolate Pizza",
            category="desserts",
            price=9.00,
            description="Nutella base with cheese (cashew nuts optional).",
            number=0,
        ),
        new_item(
            name="Lasagna",
            category="pasta",
            price=15.90,
            description="Cheese and home-made bolognese sauce.",
            number=0,
        ),
        new_item(
            name="Carbonara",
            category="pasta",
            price=15.90,
            description="Sautéed bacon, thickened cream sauce, freshly cracked egg.",
            number=0,
        ),
        new_item(
            name="4 Chicken Nuggets and Chips",
            category="kids-meals",
            price=9.90,
            description="Kid's meal: 4 chicken nuggets and chips.",
            number=0,
        ),
        new_item(
            name="4 Calamari Rings and Chips",
            category="kids-meals",
            price=9.90,
            description="Kid's meal: 4 calamari rings and chips.",
            number=0,
        ),
        new_item(
            name="Small Margherita Pizza + Juice",
            category="kids-meals",
            price=11.50,
            description="Kid's meal: 1 small Margherita pizza + 1 juice.",
            number=0,
        ),
        new_item(
            name="Small Hawaiian Pizza + Juice",
            category="kids-meals",
            price=11.50,
            description="Kid's meal: 1 small Hawaiian pizza + 1 juice.",
            number=0,
        ),
    ]

    # aliases that count as already present
    present_aliases = {
        "vegetarian pizza": "vegetarian",
        "american style pizza": "american style",
        "american style": "american style",
        "bbq chicken wings": "bbq chicken wings chips",
        "chicken parmigiana with chips": "chicken parmigiana chips",
    }

    for payload in missing:
        key = normalize_key(payload["name"])
        exists = by_key.get(key) or by_slug.get(payload["slug"])
        if not exists and key == "vegetarian pizza":
            for item in catalog:
                if (
                    normalize_key(item["name"]) in {"vegetarian", "vegetarian pizza"}
                    and item.get("categorySlug") == "basic-pizzas"
                ):
                    exists = item
                    break
        if not exists:
            for alias, canon in present_aliases.items():
                if canon == key.replace(" + ", " ").replace("+", " "):
                    exists = by_key.get(normalize_key(alias))
                    if exists:
                        break

        if exists:
            merged = item_payload_from_existing(
                exists,
                name=payload["name"],
                slug=payload["slug"],
                price=payload["price"],
                description=payload["description"],
                categorySlug=payload["categorySlug"],
                imageAlt=payload["name"],
            )
            if payload.get("sizeOptions"):
                merged["sizeOptions"] = payload["sizeOptions"]
                merged["priceNote"] = 'GF Large 11" available (+$4 on Large)'
            api.put(f"/menu/{exists['id']}", merged)
            print(f"  ↻ existing {payload['name']}  ${payload['price']:.2f}")
            updated += 1
        else:
            max_number += 1
            payload["number"] = max_number
            if payload.get("sizeOptions"):
                payload["priceNote"] = 'GF Large 11" available (+$4 on Large)'
            try:
                api.post("/menu", payload)
                print(f"  ✓ [{payload['categorySlug']}] {payload['name']}  ${payload['price']:.2f}")
                created += 1
                by_key[key] = payload
                by_slug[payload["slug"]] = payload
            except RuntimeError as exc:
                # slug conflict — try update by slug lookup refresh
                print(f"  ✗ {payload['name']}: {exc}")
        time.sleep(0.03)

    sync_gf_crust(api)
    print(f"\nDone. created={created} updated={updated}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--brand", default="benny-boys")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    token = os.environ.get("ADMIN_TOKEN", "").strip()
    if not token:
        email = os.environ.get("ADMIN_EMAIL", "admin@leovorno.com")
        password = os.environ.get("ADMIN_PASSWORD", "")
        if not password:
            raise SystemExit("Set ADMIN_TOKEN or ADMIN_PASSWORD")
        print("→ Logging in…")
        token = fetch_admin_token(args.api, email, password)

    print(f"→ Brand: {args.brand}")
    api = ApiClient(args.api, token, args.brand, dry_run=args.dry_run)
    apply_prices_and_gaps(api)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
