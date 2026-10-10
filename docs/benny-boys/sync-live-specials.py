#!/usr/bin/env python3
"""Sync Benny Boys deals from the live Zwift Specials API.

Source: https://wantirnasouth.bbpizza.com.au/api/get-specials
Page:   https://wantirnasouth.bbpizza.com.au/?group=trending

Usage:
  export ADMIN_PASSWORD='...'
  python3 docs/benny-boys/sync-live-specials.py --brand benny-boys
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_API = os.environ.get("API_URL", "https://api.marinapizzas.com.au/api")
DEFAULT_SPECIALS_URL = os.environ.get(
    "BB_SPECIALS_URL",
    "https://wantirnasouth.bbpizza.com.au/api/get-specials",
)
PLACEHOLDER = (
    "https://images.unsplash.com/photo-1513104890138-7c749659a591"
    "?auto=format&fit=crop&w=800&q=80"
)
# Prefer Zwift CDN hero when present
ZWCDN = "https://3.zwcdn.zwift.com.au/RetailerWebsites/1482/"


def normalize_key(value: str) -> str:
    s = value.lower().replace("’", "'").replace("`", "'")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "deal"


def fetch_json(url: str):
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "MarinaPizzasCatalogSync/1.0",
            "Origin": "https://wantirnasouth.bbpizza.com.au",
            "Referer": "https://wantirnasouth.bbpizza.com.au/",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


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


def match_existing(catalog: list[dict], special_name: str):
    key = normalize_key(special_name)
    aliases = {
        "family deal 1": ["family deal", "family deal 1"],
        "party deal 1": ["party deal", "party deal 1"],
        "single deal": ["single deal"],
        "double deal": ["double deal"],
        "6 wings special": ["6 wings special", "six wings special"],
        "12 wings special": ["12 wings special", "twelve wings special"],
    }
    keys = aliases.get(key, [key])
    for item in catalog:
        if item.get("categorySlug") != "deals":
            continue
        nk = normalize_key(item["name"])
        if nk in keys or nk == key:
            return item
    return None


def image_for(special: dict) -> str:
    hero = (special.get("heroImageURL") or "").strip()
    if hero:
        if hero.startswith("http"):
            return hero
        return f"{ZWCDN}{hero}"
    return PLACEHOLDER


def sync_specials(api: ApiClient, specials: list[dict]) -> None:
    catalog = api.get("/menu/manage/all")
    if not isinstance(catalog, list):
        raise SystemExit("GET /menu/manage/all failed")

    max_number = max((int(i.get("number") or 0) for i in catalog), default=0)
    created = updated = 0

    # Save snapshot
    out = SCRIPT_DIR / "live-site-specials.json"
    out.write_text(json.dumps(specials, indent=2), encoding="utf-8")
    print(f"→ Saved {len(specials)} specials → {out.name}")

    for special in sorted(specials, key=lambda s: int(s.get("priority") or 99)):
        if not special.get("available", True):
            print(f"  · skip unavailable {special.get('name')}")
            continue
        name = (special.get("name") or "").strip()
        price = float(special.get("price") or 0)
        desc = (special.get("description") or "").replace("\r\n", "\n").strip()
        if not name or price <= 0:
            continue

        existing = match_existing(catalog, name)
        payload = {
            "slug": slugify(name) if not existing else existing["slug"],
            "number": int(existing["number"]) if existing else max_number + 1,
            "name": name,
            "description": desc or f"{name}.",
            "price": price,
            "categorySlug": "deals",
            "imageUrl": existing.get("imageUrl") if existing and "uploads/heroes" in (existing.get("imageUrl") or "") else image_for(special),
            "imageAlt": name,
            "isActive": True,
            "ingredients": list((existing or {}).get("ingredients") or []),
            "badges": list((existing or {}).get("badges") or []),
            "priceNote": "From live Wantirna Specials (Zwift)",
        }
        if not existing:
            max_number += 1

        if existing:
            api.put(f"/menu/{existing['id']}", payload)
            print(f"  ↻ {name}  ${price:.2f}")
            updated += 1
        else:
            api.post("/menu", payload)
            print(f"  ✓ {name}  ${price:.2f}")
            created += 1
            catalog.append({**payload, "id": "new"})
        time.sleep(0.05)

    print(f"\nDone. created={created} updated={updated}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--brand", default="benny-boys")
    parser.add_argument("--specials-url", default=DEFAULT_SPECIALS_URL)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"→ Fetching specials from {args.specials_url}")
    specials = fetch_json(args.specials_url)
    if not isinstance(specials, list):
        raise SystemExit(f"Unexpected specials payload: {type(specials)}")
    for s in specials:
        print(f"  · {s.get('name')}: ${s.get('price')} — {(s.get('description') or '').splitlines()[0][:60]}")

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
    sync_specials(api, specials)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
