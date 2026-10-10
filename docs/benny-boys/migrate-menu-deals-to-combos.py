#!/usr/bin/env python3
"""Migrate fake menu-category deals into ComboDeal records, then deactivate them.

Uses Admin API (combo-deals + menu). Slot patterns follow Zwift specials /
plan choice 2A.

Usage:
  export ADMIN_PASSWORD='...'
  python3 docs/benny-boys/migrate-menu-deals-to-combos.py --brand benny-boys

  # Dry run:
  python3 docs/benny-boys/migrate-menu-deals-to-combos.py --brand benny-boys --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_API = os.environ.get("API_URL", "https://api.marinapizzas.com.au/api")
ZWCDN = "https://3.zwcdn.zwift.com.au/RetailerWebsites/1482/"
SPECIALS_PATH = Path(__file__).resolve().parent / "live-site-specials.json"

# Pizza category slugs that count as "any pizza" for Family Deal 2 style.
ANY_PIZZA_CATS = (
    "basic-pizzas",
    "gourmet-pizzas",
    "vegetarian",
    "seafood-pizzas",
)


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "combo"


def normalize_key(value: str) -> str:
    s = value.lower().replace("'", "'").replace("`", "'")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


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

    def request(self, method: str, path: str, body=None):
        url = f"{self.base}{path}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "X-Brand-Slug": self.brand,
        }
        data = None if body is None else json.dumps(body).encode("utf-8")
        if self.dry_run and method in {"POST", "PUT", "DELETE", "PATCH"}:
            print(f"  [dry-run] {method} {path}")
            if body is not None:
                print(f"           {json.dumps(body)[:200]}...")
            return {"id": "dry-run", "dryRun": True}
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} -> {exc.code}: {detail}") from exc

    def get(self, path: str):
        return self.request("GET", path)

    def post(self, path: str, body):
        return self.request("POST", path, body)

    def put(self, path: str, body):
        return self.request("PUT", path, body)


def find_item(items: list[dict], *names: str) -> dict | None:
    keys = {normalize_key(n) for n in names}
    for item in items:
        if normalize_key(item.get("name", "")) in keys:
            return item
        if normalize_key(item.get("slug", "").replace("-", " ")) in keys:
            return item
    # partial contains
    for item in items:
        nk = normalize_key(item.get("name", ""))
        for key in keys:
            if key and key in nk:
                return item
    return None


def find_drink_can(items: list[dict]) -> dict | None:
    drinks = [i for i in items if i.get("categorySlug") == "drinks" and i.get("isActive")]
    for needle in ("coca cola can", "coke can", "375ml", "can"):
        hit = find_item(drinks, needle)
        if hit:
            return hit
    return drinks[0] if drinks else None


def find_drink_1250(items: list[dict]) -> dict | None:
    drinks = [i for i in items if i.get("categorySlug") == "drinks" and i.get("isActive")]
    for needle in ("1.25l", "1 25l", "1250", "coca cola 1.25"):
        hit = find_item(drinks, needle)
        if hit:
            return hit
    for d in drinks:
        if "1.25" in d.get("name", "").lower() or "1.25" in d.get("slug", "").lower():
            return d
    return None


def cat_slot(
    label: str,
    category: str,
    qty: int,
    sizes: list[str] | None,
    allow_modifiers: bool = True,
    sort: int = 0,
) -> dict:
    return {
        "label": label,
        "sortOrder": sort,
        "quantity": qty,
        "sourceType": "CATEGORY",
        "categorySlug": category,
        "allowedSizes": sizes or None,
        "allowModifiers": allow_modifiers,
    }


def item_slot(
    label: str,
    menu_item_id: str,
    qty: int = 1,
    allow_modifiers: bool = False,
    sort: int = 0,
) -> dict:
    return {
        "label": label,
        "sortOrder": sort,
        "quantity": qty,
        "sourceType": "ITEM",
        "menuItemId": menu_item_id,
        "allowModifiers": allow_modifiers,
    }


def price_from_specials(name: str, fallback: float) -> float:
    if not SPECIALS_PATH.exists():
        return fallback
    data = json.loads(SPECIALS_PATH.read_text())
    for row in data:
        if normalize_key(row.get("name", "")) == normalize_key(name):
            return float(row["price"])
    return fallback


def image_from_specials(name: str) -> str | None:
    if not SPECIALS_PATH.exists():
        return None
    data = json.loads(SPECIALS_PATH.read_text())
    for row in data:
        if normalize_key(row.get("name", "")) == normalize_key(name):
            hero = row.get("heroImageURL")
            if hero:
                return f"{ZWCDN}{hero}" if not str(hero).startswith("http") else hero
    return None


def build_combos(menu_items: list[dict]) -> list[dict]:
    garlic = find_item(menu_items, "garlic bread", "garlic bread loaf")
    can = find_drink_can(menu_items)
    bottle = find_drink_1250(menu_items)
    wings = find_item(
        menu_items,
        "bbq chicken wings",
        "bbq chicken wings chips",
        "chicken wings",
        "wings",
    )
    pasta_cat = "pasta"

    if not garlic:
        raise SystemExit("Could not find Garlic Bread menu item")
    if not can:
        raise SystemExit("Could not find a can drink menu item")
    if not bottle:
        raise SystemExit("Could not find a 1.25L drink menu item")

    combos = [
        {
            "slug": "single-deal",
            "name": "Single Deal",
            "description": "1 x Small Basic Pizza, 1 x Garlic Bread, 1 x Can of Drink",
            "bundlePrice": price_from_specials("Single Deal", 16.9),
            "imageUrl": image_from_specials("Single Deal"),
            "sortOrder": 1,
            "slots": [
                cat_slot("Small Basic Pizza", "basic-pizzas", 1, ["small"], True, 0),
                item_slot("Garlic Bread", garlic["id"], 1, False, 1),
                item_slot("Can of Drink", can["id"], 1, False, 2),
            ],
        },
        {
            "slug": "double-deal",
            "name": "Double Deal",
            "description": "2 x Large Basic Pizzas, 1 x Garlic Bread, 1 x 1.25L Drink",
            "bundlePrice": price_from_specials("Double Deal", 35.9),
            "imageUrl": image_from_specials("Double Deal"),
            "sortOrder": 2,
            "slots": [
                cat_slot("Large Basic Pizza", "basic-pizzas", 2, ["large"], True, 0),
                item_slot("Garlic Bread", garlic["id"], 1, False, 1),
                item_slot("1.25L Drink", bottle["id"], 1, False, 2),
            ],
        },
        {
            "slug": "family-deal-1",
            "name": "Family Deal 1",
            "description": "3 x Large Basic Pizzas, 1 x Garlic Bread, 1 x 1.25L Drink",
            "bundlePrice": price_from_specials("Family Deal 1", 49.9),
            "imageUrl": image_from_specials("Family Deal 1"),
            "sortOrder": 3,
            "slots": [
                cat_slot("Large Basic Pizza", "basic-pizzas", 3, ["large"], True, 0),
                item_slot("Garlic Bread", garlic["id"], 1, False, 1),
                item_slot("1.25L Drink", bottle["id"], 1, False, 2),
            ],
        },
        {
            "slug": "party-deal-1",
            "name": "Party Deal 1",
            "description": "5 x Large Basic Pizzas, 2 x Garlic Bread, 2 x 1.25L Drink",
            "bundlePrice": price_from_specials("Party Deal 1", 79.9),
            "imageUrl": image_from_specials("Party Deal 1"),
            "sortOrder": 4,
            "slots": [
                cat_slot("Large Basic Pizza", "basic-pizzas", 5, ["large"], True, 0),
                item_slot("Garlic Bread", garlic["id"], 2, False, 1),
                item_slot("1.25L Drink", bottle["id"], 2, False, 2),
            ],
        },
        {
            "slug": "family-deal-2",
            "name": "Family Deal 2",
            "description": "2 x Large Pizza (any), 1 x Pasta, 2 x Sides or Drinks",
            "bundlePrice": 54.9,
            "sortOrder": 5,
            "slots": [
                cat_slot("Large Pizza", "basic-pizzas", 2, ["large"], True, 0),
                cat_slot("Pasta", pasta_cat, 1, None, False, 1),
                cat_slot("Side or Drink", "sides", 1, None, False, 2),
                cat_slot("Side or Drink", "drinks", 1, None, False, 3),
            ],
        },
    ]

    if wings:
        combos.extend(
            [
                {
                    "slug": "6-wings-special",
                    "name": "6 Wings Special",
                    "description": "6 Fresh bone-in wings special",
                    "bundlePrice": price_from_specials("6 Wings Special", 9.9),
                    "imageUrl": image_from_specials("6 Wings Special"),
                    "sortOrder": 10,
                    "slots": [
                        item_slot("Wings", wings["id"], 1, True, 0),
                    ],
                },
                {
                    "slug": "12-wings-special",
                    "name": "12 Wings Special",
                    "description": "12 Fresh bone-in wings special",
                    "bundlePrice": price_from_specials("12 Wings Special", 18.9),
                    "imageUrl": image_from_specials("12 Wings Special"),
                    "sortOrder": 11,
                    "slots": [
                        item_slot("Wings", wings["id"], 1, True, 0),
                    ],
                },
            ]
        )
    else:
        print("WARN: wings item not found — skipping wings specials")

    # Family Deal 2: prefer gourmet as second pizza option note — v1 uses basic-pizzas
    # for both pizza picks (admin can widen later). Unused ANY_PIZZA_CATS kept for docs.
    _ = ANY_PIZZA_CATS

    for c in combos:
        c["isActive"] = True
        if c.get("imageUrl") is None:
            c.pop("imageUrl", None)
    return combos


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--brand", default="benny-boys")
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--email", default=os.environ.get("ADMIN_EMAIL", "admin@marinapizzas.com.au"))
    parser.add_argument("--password", default=os.environ.get("ADMIN_PASSWORD", ""))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--keep-menu-deals",
        action="store_true",
        help="Do not deactivate categorySlug=deals menu items",
    )
    args = parser.parse_args()

    if not args.password and not args.dry_run:
        raise SystemExit("Set ADMIN_PASSWORD or pass --password")

    token = (
        "dry-run"
        if args.dry_run and not args.password
        else fetch_admin_token(args.api, args.email, args.password)
    )
    api = ApiClient(args.api, token, args.brand, dry_run=args.dry_run)

    print(f"Loading menu for {args.brand}…")
    try:
        menu_items = api.get("/menu/manage/all")
    except Exception:
        menu_items = api.get("/menu")
    if not isinstance(menu_items, list):
        raise SystemExit(f"Unexpected menu response: {type(menu_items)}")
    print(f"  {len(menu_items)} menu items")

    existing = []
    try:
        existing = api.get("/combo-deals/manage/all") if not args.dry_run else []
    except Exception:
        existing = api.get("/combo-deals") or []
    by_slug = {c.get("slug"): c for c in (existing or [])}

    combos = build_combos(menu_items)
    for combo in combos:
        slug = combo["slug"]
        if slug in by_slug:
            print(f"UPDATE {combo['name']} ({slug})")
            api.put(f"/combo-deals/{by_slug[slug]['id']}", combo)
        else:
            print(f"CREATE {combo['name']} @ ${combo['bundlePrice']}")
            api.post("/combo-deals", combo)

    if not args.keep_menu_deals:
        deal_items = [
            i
            for i in menu_items
            if i.get("categorySlug") == "deals" and i.get("isActive")
        ]
        print(f"Deactivating {len(deal_items)} menu deals…")
        for item in deal_items:
            print(f"  OFF {item.get('name')}")
            api.put(f"/menu/{item['id']}", {"isActive": False})

    print("Done.")


if __name__ == "__main__":
    main()
