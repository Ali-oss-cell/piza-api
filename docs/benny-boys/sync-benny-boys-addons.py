#!/usr/bin/env python3
"""Sync Benny Boys extras + removable ingredients from the live-site catalog.

Reads: docs/benny-boys/live-site-addons-and-ingredients.json

Does:
  1) Upsert topping categories + extras (live prices)
  2) Deactivate toppings not in the Benny Boys list
  3) Upsert ingredient categories + ingredients
  4) Upsert classic + gluten-free crusts (GF +$3 ≈ live GF Large 11\")
  5) Patch pizza menu items with ingredient slugs (+ short live descriptions)

Auth:
  ADMIN_TOKEN=...
  or ADMIN_EMAIL + ADMIN_PASSWORD

Examples:
  export ADMIN_PASSWORD='...'
  bash docs/benny-boys/sync-benny-boys-addons.sh --brand benny-boys
  python3 docs/benny-boys/sync-benny-boys-addons.py --brand benny-boys --dry-run
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
DEFAULT_CATALOG = SCRIPT_DIR / "live-site-addons-and-ingredients.json"


def normalize_key(value: str) -> str:
    s = value.lower().replace("’", "'").replace("`", "'")
    s = s.replace("&", " and ")
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

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "x-brand-slug": self.brand,
            "Content-Type": "application/json",
        }

    def request(self, method: str, path: str, body: dict | None = None):
        url = f"{self.base}{path}"
        if self.dry_run and method != "GET":
            print(f"  [dry-run] {method} {path}")
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


def choose_store(api_url: str, token: str, brand: str | None) -> str:
    req = urllib.request.Request(
        f"{api_url.rstrip('/')}/brands",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        brands = json.loads(resp.read().decode("utf-8"))
    if not isinstance(brands, list) or not brands:
        raise SystemExit("No brands found from GET /brands")
    if brand:
        match = next((b for b in brands if b.get("slug") == brand), None)
        if not match:
            raise SystemExit(
                f"Brand '{brand}' not found. Available: "
                + ", ".join(b.get("slug", "?") for b in brands)
            )
        return brand
    print("Stores:")
    for i, row in enumerate(brands, start=1):
        print(f"  {i}. {row.get('name')}  [{row.get('slug')}]")
    choice = input("Pick store number: ").strip()
    idx = int(choice) - 1
    return brands[idx]["slug"]


def flatten_grouped(groups) -> list[dict]:
    if not isinstance(groups, list):
        return []
    rows: list[dict] = []
    for group in groups:
        if not isinstance(group, dict):
            continue
        for key in ("toppings", "ingredients"):
            items = group.get(key)
            if isinstance(items, list):
                rows.extend(items)
    # some endpoints return flat lists
    if not rows and groups and "slug" in groups[0]:
        return groups
    return rows


def sync_topping_categories(api: ApiClient, categories: list[dict]) -> None:
    existing = api.get("/customizations/categories/manage/all")
    by_slug = {
        row["slug"]: row
        for row in (existing if isinstance(existing, list) else [])
        if isinstance(row, dict) and row.get("slug")
    }
    for cat in categories:
        slug = cat["slug"]
        payload = {
            "slug": slug,
            "label": cat["label"],
            "sortOrder": int(cat.get("sortOrder", 0)),
        }
        if slug in by_slug:
            api.put(f"/customizations/categories/{slug}", {
                "label": payload["label"],
                "sortOrder": payload["sortOrder"],
            })
            print(f"  ↻ topping category {slug}")
        else:
            api.post("/customizations/categories", payload)
            print(f"  ✓ topping category {slug}")
        time.sleep(0.02)


def sync_ingredient_categories(api: ApiClient, categories: list[dict]) -> None:
    existing = api.get("/customizations/ingredient-categories/manage/all")
    by_slug = {
        row["slug"]: row
        for row in (existing if isinstance(existing, list) else [])
        if isinstance(row, dict) and row.get("slug")
    }
    for cat in categories:
        slug = cat["slug"]
        payload = {
            "slug": slug,
            "label": cat["label"],
            "sortOrder": int(cat.get("sortOrder", 0)),
        }
        if slug in by_slug:
            api.put(f"/customizations/ingredient-categories/{slug}", {
                "label": payload["label"],
                "sortOrder": payload["sortOrder"],
            })
            print(f"  ↻ ingredient category {slug}")
        else:
            api.post("/customizations/ingredient-categories", payload)
            print(f"  ✓ ingredient category {slug}")
        time.sleep(0.02)


def sync_extras(api: ApiClient, extras: list[dict]) -> dict[str, str]:
    """Returns slug -> topping id."""
    grouped = api.get("/customizations/toppings/manage/all")
    existing = flatten_grouped(grouped)
    by_slug = {
        row["slug"]: row
        for row in existing
        if isinstance(row, dict) and row.get("slug")
    }
    wanted = {row["slug"] for row in extras}
    id_by_slug: dict[str, str] = {}

    for index, extra in enumerate(extras):
        slug = extra["slug"]
        payload = {
            "slug": slug,
            "label": extra["label"],
            "categorySlug": extra["categorySlug"],
            "priceDelta": float(extra["priceDelta"]),
            "sortOrder": index,
            "isActive": True,
        }
        current = by_slug.get(slug)
        if current and current.get("id"):
            api.put(f"/customizations/toppings/{current['id']}", {
                "label": payload["label"],
                "categorySlug": payload["categorySlug"],
                "priceDelta": payload["priceDelta"],
                "sortOrder": payload["sortOrder"],
                "isActive": True,
            })
            id_by_slug[slug] = current["id"]
            print(f"  ↻ extra {extra['label']}  +${payload['priceDelta']:.2f}")
        else:
            created = api.post("/customizations/toppings", payload)
            tid = created.get("id") if isinstance(created, dict) else None
            if tid:
                id_by_slug[slug] = tid
            print(f"  ✓ extra {extra['label']}  +${payload['priceDelta']:.2f}")
        time.sleep(0.02)

    for slug, row in by_slug.items():
        if slug in wanted:
            continue
        if not row.get("isActive", True):
            continue
        tid = row.get("id")
        if not tid:
            continue
        api.put(f"/customizations/toppings/{tid}", {"isActive": False})
        print(f"  · deactivated extra {row.get('label') or slug}")
        time.sleep(0.02)

    return id_by_slug


def sync_ingredients(api: ApiClient, ingredients: list[dict]) -> None:
    grouped = api.get("/customizations/ingredients/manage/all")
    existing = flatten_grouped(grouped)
    by_slug = {
        row["slug"]: row
        for row in existing
        if isinstance(row, dict) and row.get("slug")
    }
    for index, ingredient in enumerate(ingredients):
        slug = ingredient["slug"]
        payload = {
            "slug": slug,
            "label": ingredient["label"],
            "categorySlug": ingredient["categorySlug"],
            "sortOrder": index,
            "isActive": True,
        }
        current = by_slug.get(slug)
        if current and current.get("id"):
            api.put(f"/customizations/ingredients/{current['id']}", {
                "label": payload["label"],
                "categorySlug": payload["categorySlug"],
                "sortOrder": payload["sortOrder"],
                "isActive": True,
            })
            print(f"  ↻ ingredient {ingredient['label']}")
        else:
            api.post("/customizations/ingredients", payload)
            print(f"  ✓ ingredient {ingredient['label']}")
        time.sleep(0.02)


def sync_crusts(api: ApiClient, crusts: list[dict]) -> None:
    existing = api.get("/customizations/crusts/manage/all")
    rows = existing if isinstance(existing, list) else []
    by_slug = {
        row["slug"]: row
        for row in rows
        if isinstance(row, dict) and row.get("slug")
    }
    wanted = {c["slug"] for c in crusts}
    for crust in crusts:
        slug = crust["slug"]
        payload = {
            "slug": slug,
            "label": crust["label"],
            "priceDelta": float(crust["priceDelta"]),
            "sortOrder": int(crust.get("sortOrder", 0)),
            "isActive": True,
        }
        current = by_slug.get(slug)
        if current and current.get("id"):
            api.put(f"/customizations/crusts/{current['id']}", {
                "label": payload["label"],
                "priceDelta": payload["priceDelta"],
                "sortOrder": payload["sortOrder"],
                "isActive": True,
            })
            print(f"  ↻ crust {crust['label']}  +${payload['priceDelta']:.2f}")
        else:
            api.post("/customizations/crusts", payload)
            print(f"  ✓ crust {crust['label']}  +${payload['priceDelta']:.2f}")
        time.sleep(0.02)

    for slug, row in by_slug.items():
        if slug in wanted:
            continue
        if not row.get("isActive", True):
            continue
        cid = row.get("id")
        if not cid:
            continue
        api.put(f"/customizations/crusts/{cid}", {"isActive": False})
        print(f"  · deactivated crust {row.get('label') or slug}")
        time.sleep(0.02)


def build_item_lookup(catalog_items: list[dict]) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for item in catalog_items:
        names = list(item.get("matchNames") or [])
        names.append(item["name"])
        for name in names:
            lookup[normalize_key(name)] = item
            # also without trailing "pizza"
            key = normalize_key(re.sub(r"\s+pizza$", "", name, flags=re.I))
            lookup[key] = item
    return lookup


def sync_menu_item_ingredients(api: ApiClient, catalog_items: list[dict]) -> None:
    lookup = build_item_lookup(catalog_items)
    menu = api.get("/menu/manage/all")
    if not isinstance(menu, list):
        print("  ! menu/manage/all did not return a list")
        return

    updated = skipped = 0
    for row in menu:
        if not isinstance(row, dict):
            continue
        name = row.get("name") or ""
        category = row.get("categorySlug") or ""
        if not category.endswith("-pizzas") and category not in {
            "basic-pizzas",
            "supreme-pizzas",
            "chicken-pizzas",
            "vegetarian-pizzas",
        }:
            continue

        key = normalize_key(name)
        key2 = normalize_key(re.sub(r"\s+pizza$", "", name, flags=re.I))
        match = lookup.get(key) or lookup.get(key2)
        if not match:
            print(f"  · no ingredient map for [{category}] {name}")
            skipped += 1
            continue

        item_id = row.get("id")
        if not item_id:
            skipped += 1
            continue

        payload = {
            "ingredients": list(match.get("ingredients") or []),
            "allowedToppingIds": [],
        }
        live_desc = (match.get("description") or "").strip()
        if live_desc:
            payload["description"] = live_desc

        api.put(f"/menu/{item_id}", payload)
        print(
            f"  ↻ [{category}] {name}  ingredients={len(payload['ingredients'])}"
        )
        updated += 1
        time.sleep(0.03)

    print(f"  menu ingredients updated={updated} unmatched={skipped}")


def run_sync(api: ApiClient, catalog: dict) -> None:
    print("→ Topping categories")
    sync_topping_categories(api, catalog.get("toppingCategories") or [])
    print("→ Extras (paid add-ons)")
    sync_extras(api, catalog.get("extras") or [])
    print("→ Ingredient categories")
    sync_ingredient_categories(api, catalog.get("ingredientCategories") or [])
    print("→ Removable ingredients")
    sync_ingredients(api, catalog.get("ingredients") or [])
    print("→ Crusts (incl. gluten-free)")
    sync_crusts(api, catalog.get("crusts") or [])
    print("→ Menu item ingredients")
    sync_menu_item_ingredients(api, catalog.get("items") or [])


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Benny Boys addons + ingredients")
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--brand", default=None)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.catalog.exists():
        raise SystemExit(f"Missing catalog: {args.catalog}")

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))

    token = os.environ.get("ADMIN_TOKEN", "").strip()
    if not token:
        email = os.environ.get("ADMIN_EMAIL", "admin@leovorno.com")
        password = os.environ.get("ADMIN_PASSWORD", "")
        if not password:
            raise SystemExit("Set ADMIN_TOKEN or ADMIN_PASSWORD")
        print("→ Logging in…")
        token = fetch_admin_token(args.api, email, password)

    brand = choose_store(args.api, token, args.brand)
    print(f"→ Brand: {brand}")
    api = ApiClient(args.api, token, brand, dry_run=args.dry_run)
    run_sync(api, catalog)
    print("\nDone. Check Admin → Toppings / Ingredients / Menu.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
