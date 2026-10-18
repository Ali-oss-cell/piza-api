#!/usr/bin/env python3
"""Apply the Benny Boys menu source of truth to a store through the API.

Source: benny-boys-menu.source.json  (generated from the Word doc by
parse-menu-docx.py — re-run that after editing the doc).

What it does (idempotent — safe to run again):
  1. Ensures the menu categories exist.
  2. Matches each doc item to the store's existing item and updates its
     prices, description, number and sizes. Image, slug, ingredients, badges and
     extras stay as they are. Missing items are created (placeholder image).
  3. Pizzas get Small / Large / Family prices from the doc. Gluten-free Large is
     the gluten-free crust surcharge, set per category (needs the API build that
     supports crust `categoryPriceDeltas`).
  4. Drinks become one item per size (e.g. "Pepsi 375ML", "Pepsi 1.25L").
  5. Items in the store that are NOT in the doc are hidden (deactivated, never
     deleted). Deals / combos are never touched, and neither is any item used
     by a combo deal slot.

Always preview first:
  export ADMIN_PASSWORD='...'
  python3 docs/benny-boys/menu-source/apply-menu-source.py --brand benny-boys --dry-run
  python3 docs/benny-boys/menu-source/apply-menu-source.py --brand benny-boys

Flags:
  --dry-run          read-only; prints every change it would make
  --keep-unlisted    do not hide store items that are missing from the doc
  --rename           also rename matched items to the doc wording
                     (off by default: other scripts match items by name)
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

HERE = Path(__file__).resolve().parent
SOURCE_JSON = HERE / "benny-boys-menu.source.json"
DEFAULT_API = os.environ.get("API_URL", "https://api.marinapizzas.com.au/api")
PLACEHOLDER = (
    "https://images.unsplash.com/photo-1513104890138-7c749659a591"
    "?auto=format&fit=crop&w=800&q=80"
)

CATEGORY_DEFS = [
    ("basic-pizzas", "Basic Pizzas", 1, True, True),
    ("supreme-pizzas", "Supreme Pizzas", 2, True, True),
    ("chicken-pizzas", "Chicken Pizzas", 3, True, True),
    ("vegetarian-pizzas", "Vegetarian Pizzas", 4, True, True),
    ("pasta", "Pasta", 5, False, False),
    ("mains", "Mains", 6, False, False),
    ("sides", "Sides", 7, False, False),
    ("desserts", "Desserts", 8, False, False),
    ("drinks", "Drinks", 9, False, False),
]
PIZZA_CATEGORIES = {s for s, _, _, size, _ in CATEGORY_DEFS if size}

# Doc name (normalized) -> other names the same dish has had in the store.
ALIASES = {
    "bbq chicken wings 6 pcs chips": ["bbq chicken wings", "bbq chicken wings chips"],
    "chicken parmigiana chips": ["chicken parmigiana with chips", "chicken parma chips"],
    "chicken schnitzel chips": ["chicken schnitzel and chips"],
    "chips loaded with cheese and bacon": [
        "chips loaded w cheese and bacon",
        "loaded chips",
    ],
    "seasoned potato with cream": [
        "seasoned potato wedges w sour cream",
        "seasoned potato wedges with sour cream",
        "seasoned wedges",
    ],
    "garlic bread": ["garlic bread loaf"],
    "lasagne": ["lasagna"],
    "pesto chicken": ["chicken pesto"],
    "american style": ["americana", "american style pizza"],
    "bbq chicken": ["classic bbq chicken", "tropical bbq chicken"],
}


def normalize_key(value: str) -> str:
    s = value.lower().replace("’", "'").replace("`", "'")
    s = s.replace("&", " and ").replace("+", " ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    s = s.replace("benny-boy-s-", "benny-boys-")
    return s or "item"


def fetch_admin_token(api_url: str, email: str, password: str) -> str:
    req = urllib.request.Request(
        f"{api_url.rstrip('/')}/auth/login",
        data=json.dumps({"email": email.strip(), "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    token = data.get("accessToken") or data.get("access_token")
    if not token:
        raise SystemExit(f"Login response missing accessToken: {data}")
    return token


class Api:
    def __init__(self, base: str, token: str, brand: str, dry_run: bool):
        self.base, self.token, self.brand, self.dry_run = base.rstrip("/"), token, brand, dry_run

    def request(self, method: str, path: str, body: dict | None = None):
        if self.dry_run and method != "GET":
            return {"ok": True, "dryRun": True}
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=json.dumps(body).encode() if body is not None else None,
            headers={
                "Authorization": f"Bearer {self.token}",
                "x-brand-slug": self.brand,
                "Content-Type": "application/json",
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            err = exc.read().decode(errors="replace")
            raise RuntimeError(f"{method} {path} -> HTTP {exc.code}: {err}") from exc

    def get(self, path):
        return self.request("GET", path)

    def post(self, path, body):
        return self.request("POST", path, body)

    def put(self, path, body):
        return self.request("PUT", path, body)


def flatten_crusts(rows) -> list[dict]:
    flat: list[dict] = []
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict) and row.get("slug"):
            flat.append(row)
        elif isinstance(row, dict) and isinstance(row.get("crusts"), list):
            flat.extend(row["crusts"])
    return flat


def build_wanted(source: dict) -> list[dict]:
    """Flatten the source into the items the store should have."""
    wanted: list[dict] = []
    gf = source["glutenFree"]
    for cat in source["categories"]:
        slug = cat["slug"]
        for item in cat["items"]:
            if item.get("skip"):
                continue
            if cat["kind"] == "pizza":
                p = item["prices"]
                gf_price = p["glutenFreeLarge"]
                wanted.append(
                    {
                        "name": item["name"],
                        "description": item["description"],
                        "categorySlug": slug,
                        "price": p["small"],
                        "docNumber": item["number"],
                        "sizeOptions": {
                            "small": {"enabled": True, "price": p["small"]},
                            "large": {"enabled": True, "price": p["large"]},
                            "family": {"enabled": True, "price": p["family"]},
                        },
                        "priceNote": f"Gluten-free Large available (${gf_price:.2f})",
                    }
                )
            elif cat["kind"] == "drinks":
                for key, suffix, label in (
                    ("can", "375ML", "Can"),
                    ("bottle1250", "1.25L", "1.25L bottle"),
                    ("bottle", "", "Bottle"),
                ):
                    if key in item["sizes"]:
                        name = f"{item['name']} {suffix}".strip()
                        wanted.append(
                            {
                                "name": name,
                                "description": f"{item['name']} — {label}",
                                "categorySlug": slug,
                                "price": item["sizes"][key],
                            }
                        )
            else:
                wanted.append(
                    {
                        "name": item["name"],
                        "description": item["description"],
                        "categorySlug": slug,
                        "price": item["price"],
                    }
                )
    # Numbering: pizzas keep the doc number (1-24); everything else continues after.
    next_number = max((w.get("docNumber", 0) for w in wanted), default=0) + 1
    for w in wanted:
        if "docNumber" in w:
            w["number"] = w.pop("docNumber")
        else:
            w["number"] = next_number
            next_number += 1
    return wanted


def find_match(want: dict, catalog: list[dict], used: set[str]) -> dict | None:
    base = normalize_key(want["name"])
    keys = [base, base + " pizza", base + " pasta"] + ALIASES.get(base, [])
    keys = [normalize_key(k) for k in keys]
    cat = want["categorySlug"]

    def pick(rows: list[dict]) -> dict | None:
        for key in keys:
            for row in rows:
                if row["id"] not in used and normalize_key(row["name"]) == key:
                    return row
        return None

    if cat in PIZZA_CATEGORIES:
        # The store may file a pizza under a different pizza category than the doc
        # (e.g. Red Devil) — search all pizza categories, never pasta.
        pool = [r for r in catalog if r.get("categorySlug") in PIZZA_CATEGORIES]
        return pick([r for r in pool if r.get("categorySlug") == cat]) or pick(pool)
    if cat == "pasta":
        # Marinara / Vegetarian exist as both pizza and pasta: pasta matches pasta only.
        return pick([r for r in catalog if r.get("categorySlug") == "pasta"])
    same = pick([r for r in catalog if r.get("categorySlug") == cat])
    return same or pick(
        [
            r
            for r in catalog
            if r.get("categorySlug") not in {"deals", "pasta"} | PIZZA_CATEGORIES
        ]
    )


def payload_for(want: dict, existing: dict | None, rename: bool) -> dict:
    if existing is None:
        payload = {
            "slug": slugify(want["name"]),
            "number": want["number"],
            "name": want["name"],
            "description": want["description"] or f"{want['name']}.",
            "price": round(float(want["price"]), 2),
            "categorySlug": want["categorySlug"],
            "imageUrl": PLACEHOLDER,
            "imageAlt": want["name"],
            "isActive": True,
            "ingredients": [],
            "badges": [],
        }
    else:
        name = want["name"] if rename else existing["name"]
        payload = {
            "slug": existing["slug"],
            "number": want["number"],
            "name": name,
            "description": want["description"]
            or existing.get("description")
            or f"{name}.",
            "price": round(float(want["price"]), 2),
            "categorySlug": want["categorySlug"],
            "imageUrl": existing.get("imageUrl") or PLACEHOLDER,
            "imageAlt": existing.get("imageAlt") or name,
            "isActive": True,
            "ingredients": list(existing.get("ingredients") or []),
            "badges": list(existing.get("badges") or []),
            "allowedToppingIds": list(existing.get("allowedToppingIds") or []),
        }
        if existing.get("imageBlurHash"):
            payload["imageBlurHash"] = existing["imageBlurHash"]
        if existing.get("sku"):
            payload["sku"] = existing["sku"]
    if want.get("sizeOptions"):
        payload["sizeOptions"] = want["sizeOptions"]
    if want.get("priceNote"):
        payload["priceNote"] = want["priceNote"]
    return payload


def changed_fields(existing: dict, payload: dict) -> list[str]:
    out = []
    if abs(float(existing.get("price") or 0) - payload["price"]) > 0.001:
        out.append(f"price {float(existing.get('price') or 0):.2f}->{payload['price']:.2f}")
    if (existing.get("description") or "") != payload["description"]:
        out.append("description")
    if existing.get("name") != payload["name"]:
        out.append(f"name {existing.get('name')!r}->{payload['name']!r}")
    if int(existing.get("number") or 0) != payload["number"]:
        out.append(f"number {existing.get('number')}->{payload['number']}")
    if existing.get("categorySlug") != payload["categorySlug"]:
        out.append(f"category {existing.get('categorySlug')}->{payload['categorySlug']}")
    if not existing.get("isActive", True):
        out.append("re-activate")
    if payload.get("sizeOptions"):
        old = existing.get("sizeOptions") or {}
        new = payload["sizeOptions"]
        for k in ("small", "large", "family"):
            o = (old.get(k) or old.get(k.upper()) or {})
            if (
                not o.get("enabled", False)
                or abs(float(o.get("price") or 0) - new[k]["price"]) > 0.001
            ):
                out.append(
                    f"{k} {float(o.get('price') or 0):.2f}->{new[k]['price']:.2f}"
                )
    if payload.get("priceNote") and existing.get("priceNote") != payload["priceNote"]:
        out.append("priceNote")
    return out


def ensure_categories(api: Api) -> None:
    print("-> Categories")
    existing = api.get("/menu/categories/manage/all")
    have = {c["slug"] for c in existing} if isinstance(existing, list) else set()
    for slug, label, order, sizes, extras in CATEGORY_DEFS:
        if slug in have:
            print(f"   . {slug}")
            continue
        api.post(
            "/menu/categories",
            {
                "slug": slug,
                "label": label,
                "sortOrder": order,
                "supportsSizeOptions": sizes,
                "supportsExtras": extras,
            },
        )
        print(f"   + {slug} (created)")


def apply_gluten_free(api: Api, source: dict) -> None:
    gf = source["glutenFree"]
    print(
        f"-> Gluten-free crust: default +${gf['defaultDelta']:.2f}, "
        f"per category {gf['categoryDeltas'] or 'none'}"
    )
    crusts = flatten_crusts(api.get("/customizations/crusts/manage/all"))
    crust = next((c for c in crusts if c.get("slug") == gf["crustSlug"]), None)
    body = {
        "label": (crust or {}).get("label") or gf["label"],
        "priceDelta": gf["defaultDelta"],
        "categoryPriceDeltas": gf["categoryDeltas"] or None,
        "isActive": True,
    }
    if crust:
        api.put(f"/customizations/crusts/{crust['id']}", body)
        print(f"   ~ updated '{gf['crustSlug']}'")
    else:
        api.post(
            "/customizations/crusts",
            {"slug": gf["crustSlug"], "sortOrder": 1, **body},
        )
        print(f"   + created '{gf['crustSlug']}'")
    if api.dry_run:
        return
    check = next(
        (c for c in flatten_crusts(api.get("/customizations/crusts/manage/all")) if c.get("slug") == gf["crustSlug"]),
        None,
    )
    saved = (check or {}).get("categoryPriceDeltas") or {}
    if (gf["categoryDeltas"] or {}) != saved:
        raise SystemExit(
            "The API did not store the per-category gluten-free surcharge. "
            "Deploy the latest piza-api first (it adds crust categoryPriceDeltas), then re-run."
        )


def combo_item_ids(api: Api) -> set[str]:
    deals = api.get("/combo-deals/manage/all")
    ids: set[str] = set()
    for deal in deals if isinstance(deals, list) else []:
        for slot in deal.get("slots") or []:
            if slot.get("menuItemId"):
                ids.add(slot["menuItemId"])
    return ids


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--brand", default=os.environ.get("BRAND_SLUG", "benny-boys"))
    ap.add_argument("--api", default=DEFAULT_API)
    ap.add_argument("--source", type=Path, default=SOURCE_JSON)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--keep-unlisted", action="store_true")
    ap.add_argument("--rename", action="store_true")
    args = ap.parse_args()

    source = json.loads(args.source.read_text(encoding="utf-8"))
    wanted = build_wanted(source)

    token = os.environ.get("ADMIN_TOKEN", "").strip()
    if not token:
        email = os.environ.get("ADMIN_EMAIL", "admin@leovorno.com")
        password = os.environ.get("ADMIN_PASSWORD", "")
        if not password:
            print("Set ADMIN_TOKEN, or ADMIN_PASSWORD (+ optional ADMIN_EMAIL).", file=sys.stderr)
            return 1
        token = fetch_admin_token(args.api, email, password)

    api = Api(args.api, token, args.brand, args.dry_run)
    mode = "DRY RUN" if args.dry_run else "APPLY"
    print(f"== Menu source of truth -> '{args.brand}' [{mode}] ==")

    ensure_categories(api)
    apply_gluten_free(api, source)

    catalog = api.get("/menu/manage/all")
    if not isinstance(catalog, list):
        raise SystemExit("GET /menu/manage/all did not return a list")

    print(f"-> Items ({len(wanted)} in the doc, {len(catalog)} in the store)")
    used: set[str] = set()
    created = updated = unchanged = failed = 0
    for want in wanted:
        existing = find_match(want, catalog, used)
        if existing:
            used.add(existing["id"])
        payload = payload_for(want, existing, args.rename)
        label = f"[{want['categorySlug']}] {payload['name']}"
        try:
            if existing is None:
                api.post("/menu", payload)
                print(f"   + {label}  ${payload['price']:.2f}  (new)")
                created += 1
            else:
                diff = changed_fields(existing, payload)
                # number/description are always rewritten from the doc; skip no-op PUTs.
                if not diff:
                    unchanged += 1
                    continue
                api.put(f"/menu/{existing['id']}", payload)
                print(f"   ~ {label}: {', '.join(diff)}")
                updated += 1
        except RuntimeError as exc:
            print(f"   x {label}: {exc}")
            failed += 1
        time.sleep(0.02)

    hidden = kept = 0
    unlisted = [
        r
        for r in catalog
        if r["id"] not in used
        and r.get("categorySlug") != "deals"
        and r.get("isActive", True)
    ]
    if unlisted:
        print(f"-> Store items not in the doc ({len(unlisted)})")
        protected: set[str] = set()
        keep_all = args.keep_unlisted
        if not keep_all:
            try:
                protected = combo_item_ids(api)
            except RuntimeError as exc:
                print(f"   ! could not read combo deals ({exc}); NOT hiding anything")
                keep_all = True
        for row in unlisted:
            label = f"[{row.get('categorySlug')}] {row['name']}  ${float(row.get('price') or 0):.2f}"
            if keep_all:
                print(f"   . kept {label}")
                kept += 1
            elif row["id"] in protected:
                print(f"   ! kept {label} (used by a combo deal)")
                kept += 1
            else:
                payload = payload_for(
                    {
                        "name": row["name"],
                        "description": row.get("description") or "",
                        "categorySlug": row.get("categorySlug"),
                        "price": float(row.get("price") or 0),
                        "number": int(row.get("number") or 1),
                    },
                    row,
                    False,
                )
                payload["isActive"] = False
                if row.get("sizeOptions"):
                    payload["sizeOptions"] = row["sizeOptions"]
                if row.get("priceNote"):
                    payload["priceNote"] = row["priceNote"]
                try:
                    api.put(f"/menu/{row['id']}", payload)
                    print(f"   - hidden {label}")
                    hidden += 1
                except RuntimeError as exc:
                    print(f"   x {label}: {exc}")
                    failed += 1

    for r in source.get("needsReview", []):
        print(f"-> NOT imported (needs your confirmation): {r['item']} ${r['price']:.2f} — {r['reason']}")

    print(
        f"\nDone [{mode}]: created={created} updated={updated} unchanged={unchanged} "
        f"hidden={hidden} kept={kept} failed={failed}"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
