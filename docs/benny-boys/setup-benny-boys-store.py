#!/usr/bin/env python3
"""Reset a store and import Benny Boy's Pizza (Wantirna South) menu + images.

Clears old menu items, deals, and categories for the target store(s), then creates
or updates the store and imports all items from docs/bunny-boys-menu-with-images.json
with local images uploaded to the API.

Prerequisites:
  - Platform admin JWT (Admin dashboard → DevTools → localStorage → leovorno-auth-token)
  - Optional: run docs/download-bunny-boys-images.py first if images are missing

Usage:
  export ADMIN_TOKEN='eyJ...'
  export API_URL='https://api.marinapizzas.com.au/api'   # optional

  # Preview only
  python docs/setup-benny-boys-store.py --dry-run

  # Full reset + import (default brand slug: benny-boys)
  python docs/setup-benny-boys-store.py

  # Use existing bunny-boys slug from seed
  python docs/setup-benny-boys-store.py --brand bunny-boys

  # Also wipe demo Leovorno catalog (menu + deals only)
  python docs/setup-benny-boys-store.py --also-clear leovorno

  # Download missing images, then import
  python docs/setup-benny-boys-store.py --download-images
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMAGES_DIR = ROOT / "bunny-boys-images"
MENU_JSON = ROOT / "bunny-boys-menu-with-images.json"
DOWNLOAD_SCRIPT = ROOT / "download-bunny-boys-images.py"

DEFAULT_API = "https://api.marinapizzas.com.au/api"
DEFAULT_BRAND = "benny-boys"
PLACEHOLDER_IMAGE = (
    "https://images.unsplash.com/photo-1513104890138-7c749659a591"
    "?auto=format&fit=crop&w=800&q=80"
)

STORE_PROFILE = {
    "name": "Benny Boy's Pizza (Wantirna South)",
    "tagline": "Bold flavours · Fresh bites",
    "primaryColor": "#E85D04",
    "secondaryColor": "#1F2937",
    "pathPrefix": None,  # filled from brand slug
    "location": {
        "name": "Wantirna South",
        "suburb": "Wantirna South",
        "address": "100 Coleman Rd, Wantirna South VIC 3152, Australia",
        "phone": "",
        "email": "",
        "deliveryFee": 4.0,
        "minOrderAmount": 20.0,
    },
}

CATEGORIES = [
    {"slug": "deals", "label": "Deals", "sortOrder": 0, "supportsSizeOptions": False, "supportsExtras": False},
    {"slug": "basic-pizzas", "label": "Basic Pizzas", "sortOrder": 1, "supportsSizeOptions": True, "supportsExtras": True},
    {"slug": "supreme-pizzas", "label": "Supreme Pizzas", "sortOrder": 2, "supportsSizeOptions": True, "supportsExtras": True},
    {"slug": "chicken-pizzas", "label": "Chicken Pizzas", "sortOrder": 3, "supportsSizeOptions": True, "supportsExtras": True},
    {"slug": "vegetarian-pizzas", "label": "Vegetarian Pizzas", "sortOrder": 4, "supportsSizeOptions": True, "supportsExtras": True},
    {"slug": "pasta", "label": "Pasta", "sortOrder": 5, "supportsSizeOptions": False, "supportsExtras": False},
    {"slug": "mains", "label": "Mains", "sortOrder": 6, "supportsSizeOptions": False, "supportsExtras": False},
    {"slug": "sides", "label": "Sides", "sortOrder": 7, "supportsSizeOptions": False, "supportsExtras": False},
    {"slug": "desserts", "label": "Desserts", "sortOrder": 8, "supportsSizeOptions": False, "supportsExtras": False},
    {"slug": "drinks", "label": "Drinks", "sortOrder": 9, "supportsSizeOptions": False, "supportsExtras": False},
]

CATEGORY_BY_NAME = {
    "double deal": "deals",
    "family deal": "deals",
    "party deal": "deals",
    "single deal": "deals",
    "margherita pizza": "basic-pizzas",
    "pepperoni pizza": "basic-pizzas",
    "hawaiian pizza": "basic-pizzas",
    "aussie pizza": "basic-pizzas",
    "garlic pizza": "basic-pizzas",
    "american style pizza": "basic-pizzas",
    "mexicana pizza": "basic-pizzas",
    "capricciosa pizza": "basic-pizzas",
    "vegetarian pizza": "basic-pizzas",
    "napolitana": "basic-pizzas",
    "marinara pizza": "basic-pizzas",
    "half n half pizza": "basic-pizzas",
    "super supreme pizza": "supreme-pizzas",
    "meat supreme": "supreme-pizzas",
    "benny boy's supreme pizza": "supreme-pizzas",
    "tomato supreme": "supreme-pizzas",
    "red devil pizza": "supreme-pizzas",
    "bbq chicken pizza": "chicken-pizzas",
    "tandoori chicken": "chicken-pizzas",
    "pesto chicken": "chicken-pizzas",
    "chicken supreme pizza": "chicken-pizzas",
    "satay chicken pizza": "chicken-pizzas",
    "hot and spicy chicken pizza": "chicken-pizzas",
    "gourmet vegetarian pizza": "vegetarian-pizzas",
    "mediterranean pizza": "vegetarian-pizzas",
    "bolognese pasta": "pasta",
    "marinara pasta": "pasta",
    "vegetarian pasta": "pasta",
    "carbonara pasta": "pasta",
    "chicken pollo pasta": "pasta",
    "lasagne": "pasta",
    "matriciana pasta": "pasta",
    "rose pasta": "pasta",
    "bbq chicken wings": "mains",
    "chicken parmigiana with chips": "mains",
    "boneless chicken 2 big pcs with chips": "mains",
    "boneless chicken 1 pcs with chips": "mains",
    "seasoned potato wedges w sour cream": "sides",
    "garlic bread loaf": "sides",
    "chips loaded w cheese and bacon": "sides",
    "hot jam donuts": "desserts",
    "gelato": "desserts",
    "chocolate pizza": "desserts",
    "chocolate mousse": "desserts",
    "cheese cake": "desserts",
}


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "item"


def category_for(name: str) -> str:
    key = name.lower().strip()
    if key in CATEGORY_BY_NAME:
        return CATEGORY_BY_NAME[key]
    if "deal" in key:
        return "deals"
    if "pasta" in key or key == "lasagne":
        return "pasta"
    if any(w in key for w in ("pepsi", "solo", "sunkist", "lemonade", "mountain dew")):
        return "drinks"
    if any(w in key for w in ("donut", "gelato", "mousse", "cake", "chocolate")):
        return "desserts"
    if any(w in key for w in ("chip", "wedge", "garlic bread")):
        return "sides"
    if "chicken" in key and "pizza" not in key:
        return "mains"
    if "vegetarian" in key or "mediterranean" in key:
        return "vegetarian-pizzas"
    if "chicken" in key:
        return "chicken-pizzas"
    if "supreme" in key or "devil" in key:
        return "supreme-pizzas"
    if "pizza" in key:
        return "basic-pizzas"
    return "mains"


class ApiClient:
    def __init__(self, base: str, token: str, brand: str, dry_run: bool = False):
        self.base = base.rstrip("/")
        self.token = token
        self.brand = brand
        self.dry_run = dry_run
        if self.base.endswith("/api"):
            self.public_origin = self.base[:-4]
        else:
            self.public_origin = self.base

    def _headers(self, json_body: bool = True) -> dict[str, str]:
        h = {"Authorization": f"Bearer {self.token}", "x-brand-slug": self.brand}
        if json_body:
            h["Content-Type"] = "application/json"
        return h

    def request(
        self,
        method: str,
        path: str,
        body: dict | None = None,
        multipart: tuple[str, Path] | None = None,
    ):
        url = f"{self.base}{path}"
        if self.dry_run and method != "GET":
            print(f"  [dry-run] {method} {path}")
            return {"ok": True, "dryRun": True}

        data: bytes | None = None
        headers = self._headers(json_body=multipart is None)

        if multipart:
            field, file_path = multipart
            boundary = f"----BennyBoys{int(time.time() * 1000)}"
            filename = file_path.name
            mime = "image/jpeg"
            if file_path.suffix.lower() == ".png":
                mime = "image/png"
            elif file_path.suffix.lower() == ".webp":
                mime = "image/webp"
            file_bytes = file_path.read_bytes()
            parts = [
                f"--{boundary}\r\n".encode(),
                (
                    f'Content-Disposition: form-data; name="{field}"; '
                    f'filename="{filename}"\r\n'
                    f"Content-Type: {mime}\r\n\r\n"
                ).encode(),
                file_bytes,
                f"\r\n--{boundary}--\r\n".encode(),
            ]
            data = b"".join(parts)
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        elif body is not None:
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} → HTTP {exc.code}: {err_body}") from exc

    def get(self, path: str):
        return self.request("GET", path)

    def post(self, path: str, body: dict):
        return self.request("POST", path, body=body)

    def put(self, path: str, body: dict):
        return self.request("PUT", path, body=body)

    def delete(self, path: str):
        return self.request("DELETE", path)

    def upload_hero(self, file_path: Path) -> str:
        if self.dry_run:
            print(f"  [dry-run] upload {file_path.name}")
            return f"{self.public_origin}/api/uploads/heroes/dry-run-{file_path.name}"
        result = self.request("POST", "/uploads/hero", multipart=("file", file_path))
        rel = result.get("url") or ""
        if not rel:
            raise RuntimeError(f"Upload failed for {file_path.name}: {result}")
        if rel.startswith("http"):
            return rel
        return f"{self.public_origin}{rel}"


def load_menu() -> dict:
    if not MENU_JSON.exists():
        raise FileNotFoundError(f"Missing menu JSON: {MENU_JSON}")
    return json.loads(MENU_JSON.read_text(encoding="utf-8"))


def download_missing_images() -> None:
    if not DOWNLOAD_SCRIPT.exists():
        print("! download script missing, skipping image download")
        return
    print("→ Downloading missing menu images…")
    subprocess.run([sys.executable, str(DOWNLOAD_SCRIPT)], check=False)


def clear_store_catalog(api: ApiClient) -> None:
    print(f"→ Clearing catalog for '{api.brand}'…")

    if api.dry_run:
        print("  [dry-run] would delete all menu items, deals, and categories")
        return

    for pass_num in range(1, 6):
        items: list = []
        try:
            items = api.get("/menu/manage/all")
        except RuntimeError:
            try:
                items = api.get("/menu")
            except RuntimeError:
                items = []
        if not isinstance(items, list) or not items:
            break
        active = [i for i in items if i.get("isActive", True)]
        if not active:
            break
        print(f"  pass {pass_num}: deactivating {len(active)} menu items…")
        for item in active:
            item_id = item.get("id")
            name = item.get("name", item_id)
            if not item_id:
                continue
            try:
                api.delete(f"/menu/{item_id}")
                print(f"    ✗ {name}")
            except RuntimeError as exc:
                print(f"    ! skip item {name}: {exc}")

    deals: list = []
    try:
        deals = api.get("/deals/manage/all")
    except RuntimeError:
        pass
    if isinstance(deals, list):
        for deal in deals:
            deal_id = deal.get("id")
            if not deal_id:
                continue
            try:
                api.delete(f"/deals/{deal_id}")
                print(f"  ✗ deal {deal.get('title', deal_id)}")
            except RuntimeError as exc:
                print(f"  ! skip deal: {exc}")

    for pass_num in range(1, 4):
        cats: list = []
        try:
            cats = api.get("/menu/categories/manage/all")
        except RuntimeError:
            try:
                cats = api.get("/menu/categories")
            except RuntimeError:
                cats = []
        if not isinstance(cats, list) or not cats:
            break
        print(f"  pass {pass_num}: deleting {len(cats)} categories…")
        for cat in cats:
            slug = cat.get("slug")
            if not slug:
                continue
            try:
                api.delete(f"/menu/categories/{slug}")
                print(f"    ✗ category {slug}")
            except RuntimeError as exc:
                print(f"    ! skip category {slug}: {exc}")

    print("  ✓ catalog cleared")


def create_store_if_missing(api: ApiClient, menu: dict) -> None:
    store_meta = menu.get("store") or {}
    name = store_meta.get("name") or STORE_PROFILE["name"]
    path_prefix = f"/{api.brand}"

    print(f"→ Ensuring store '{api.brand}' exists…")
    payload = {
        "name": name,
        "slug": api.brand,
        "tagline": STORE_PROFILE["tagline"],
        "primaryColor": STORE_PROFILE["primaryColor"],
        "secondaryColor": STORE_PROFILE["secondaryColor"],
        "pathPrefix": path_prefix,
        "createStarterCategories": False,
        "location": STORE_PROFILE["location"],
    }
    try:
        created = api.post("/brands", payload)
        print(f"  ✓ Store created id={created.get('id', '?')}")
    except RuntimeError as exc:
        msg = str(exc).lower()
        if "already" in msg or "409" in msg or "unique" in msg or "conflict" in msg:
            print("  · Store already exists — updating settings")
        else:
            raise


def update_store_branding(api: ApiClient, menu: dict, hero_url: str | None) -> None:
    store_meta = menu.get("store") or {}
    name = store_meta.get("name") or STORE_PROFILE["name"]
    body: dict = {
        "storeName": name,
        "tagline": STORE_PROFILE["tagline"],
        "primaryColor": STORE_PROFILE["primaryColor"],
        "secondaryColor": STORE_PROFILE["secondaryColor"],
        "deliveryFee": STORE_PROFILE["location"]["deliveryFee"],
        "minOrderAmount": STORE_PROFILE["location"]["minOrderAmount"],
        "address": STORE_PROFILE["location"]["address"],
        "contactPhone": STORE_PROFILE["location"].get("phone") or "",
        "contactEmail": STORE_PROFILE["location"].get("email") or "",
    }
    if hero_url:
        body["heroImageUrl"] = hero_url
    api.put("/settings", body)
    print(f"  ✓ Store settings updated ({name})")


def upload_banner_hero(api: ApiClient, menu: dict) -> str | None:
    store_meta = menu.get("store") or {}
    local = store_meta.get("localBannerImage")
    candidates: list[Path] = []
    if local:
        candidates.append(ROOT / local)
        candidates.append(IMAGES_DIR / Path(local).name)
    candidates.append(IMAGES_DIR / "banner.jpeg")

    for path in candidates:
        if path.exists() and path.stat().st_size > 500:
            print(f"→ Uploading store hero from {path.name}…")
            return api.upload_hero(path)
    print("  ! No banner image found — skipping hero upload")
    return None


def ensure_categories(api: ApiClient) -> None:
    print("→ Creating menu categories…")
    for cat in CATEGORIES:
        try:
            api.post("/menu/categories", cat)
            print(f"  ✓ {cat['slug']}")
        except RuntimeError as exc:
            if "409" in str(exc) or "already exists" in str(exc).lower():
                print(f"  · {cat['slug']} (exists)")
            else:
                raise


def resolve_local_image(item: dict) -> Path | None:
    local = item.get("localImage")
    if local:
        for path in (ROOT / local, IMAGES_DIR / Path(local).name):
            if path.exists() and path.stat().st_size > 500:
                return path

    name = item.get("name", "")
    for candidate in (
        IMAGES_DIR / f"{slugify(name)}.jpeg",
        IMAGES_DIR / f"{slugify(name.replace(chr(39), ''))}.jpeg",
        IMAGES_DIR / "benny-boys-supreme-pizza.jpeg"
        if "benny boy" in name.lower()
        else None,
    ):
        if candidate and candidate.exists() and candidate.stat().st_size > 500:
            return candidate
    return None


def import_menu_items(api: ApiClient, menu: dict) -> None:
    items = menu.get("items", [])
    print(f"→ Importing {len(items)} menu items…")
    created = updated = failed = skipped = 0
    number = 1

    existing_by_slug: dict[str, str] = {}
    try:
        catalog = api.get("/menu/manage/all")
        if isinstance(catalog, list):
            for row in catalog:
                slug = row.get("slug")
                item_id = row.get("id")
                if slug and item_id:
                    existing_by_slug[slug] = item_id
    except RuntimeError:
        pass

    for item in items:
        name = (item.get("name") or "").strip()
        if not name:
            continue

        slug = slugify(name)
        if slug.startswith("benny-boy-s-"):
            slug = slug.replace("benny-boy-s-", "benny-boys-", 1)

        cat = category_for(name)
        price = float(item.get("price") or 0)
        desc = (item.get("description") or "").strip() or f"{name}."

        image_url = PLACEHOLDER_IMAGE
        local = resolve_local_image(item)
        try:
            if local:
                image_url = api.upload_hero(local)
            elif item.get("imageUrl") and str(item["imageUrl"]).startswith("http"):
                image_url = item["imageUrl"]
        except RuntimeError as exc:
            print(f"  ! image failed for {name}: {exc}")

        payload: dict = {
            "slug": slug,
            "number": number,
            "name": name,
            "description": desc,
            "price": round(price, 2),
            "categorySlug": cat,
            "imageUrl": image_url,
            "imageAlt": name,
            "isActive": True,
            "ingredients": [],
            "badges": [],
        }

        if cat.endswith("-pizzas"):
            payload["sizeOptions"] = {
                "SMALL": {"enabled": True, "price": round(price, 2)},
                "MEDIUM": {"enabled": False, "price": 0},
                "LARGE": {"enabled": False, "price": 0},
                "FAMILY": {"enabled": False, "price": 0},
            }

        try:
            existing_id = existing_by_slug.get(slug)
            if existing_id:
                api.put(f"/menu/{existing_id}", payload)
                img_note = "📷" if local else ("🔗" if image_url != PLACEHOLDER_IMAGE else "⬜")
                print(f"  ↻ {img_note} [{cat}] {name}  ${price:.2f}")
                updated += 1
            else:
                api.post("/menu", payload)
                img_note = "📷" if local else ("🔗" if image_url != PLACEHOLDER_IMAGE else "⬜")
                print(f"  ✓ {img_note} [{cat}] {name}  ${price:.2f}")
                created += 1
        except RuntimeError as exc:
            if "409" in str(exc) or "already exists" in str(exc).lower():
                print(f"  · {name} (exists)")
                skipped += 1
            else:
                print(f"  ✗ {name}: {exc}")
                failed += 1

        number += 1
        time.sleep(0.04)

    print(f"\nImport done: created={created} updated={updated} skipped={skipped} failed={failed}")


def print_summary(api: ApiClient) -> None:
    web = os.environ.get("WEB_ORIGIN", "https://marinapizzas.com.au").rstrip("/")
    print("\n" + "=" * 60)
    print("Benny Boy's store setup complete")
    print("=" * 60)
    print(f"  Store slug:     {api.brand}")
    print(f"  Storefront:     {web}/{api.brand}")
    print(f"  Admin menu:     {web}/admin/dashboard")
    print(f"  SEO portal:     {web}/seo-login")
    print("\nNext steps:")
    print("  1. Admin → Settings → logo, opening hours, phone")
    print("  2. Admin → Advanced Settings → custom domain (optional)")
    print("  3. Admin → Payments → cash / Stripe / Linkly")
    print("  4. SEO portal → edit home hero + meta for this store")


def fetch_admin_token(api_url: str, email: str, password: str) -> str:
    base = api_url.rstrip("/")
    url = f"{base}/auth/login"
    body = json.dumps({"email": email.strip(), "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Login failed HTTP {exc.code}: {err}") from exc
    token = data.get("accessToken") or data.get("access_token")
    if not token:
        raise SystemExit(f"Login response missing accessToken: {data}")
    return str(token)


def resolve_admin_token(api_url: str, token: str, email: str, password: str, dry_run: bool) -> str:
    if token.strip():
        return token.strip()
    if dry_run:
        return "dry-run"
    if not password:
        raise SystemExit(
            "No ADMIN_TOKEN. Set ADMIN_PASSWORD (and optionally ADMIN_EMAIL), e.g.:\n"
            "  export ADMIN_EMAIL='admin@leovorno.com'\n"
            "  export ADMIN_PASSWORD='your-password'\n"
            "Or run: bash docs/benny-boys/reset-benny-boys.sh"
        )
    print(f"→ Logging in as {email}…")
    fetched = fetch_admin_token(api_url, email, password)
    print("  ✓ Login OK")
    return fetched


def validate_admin_token(token: str) -> None:
    cleaned = token.strip()
    placeholders = {"…", "...", "eyJ...", "your-token", "admin login token"}
    if not cleaned or cleaned.lower() in placeholders or cleaned.startswith("#"):
        raise SystemExit(
            "ADMIN_TOKEN is missing or still a placeholder.\n"
            "On the Droplet, run:\n"
            "  export ADMIN_TOKEN=$(curl -s -X POST https://api.marinapizzas.com.au/api/auth/login \\\n"
            "    -H 'Content-Type: application/json' \\\n"
            "    -d '{\"email\":\"admin@leovorno.com\",\"password\":\"YOUR_PASSWORD\"}' \\\n"
            "    | python3 -c 'import sys,json; print(json.load(sys.stdin)[\"accessToken\"])')"
        )
    try:
        cleaned.encode("latin-1")
    except UnicodeEncodeError as exc:
        raise SystemExit(
            "ADMIN_TOKEN must be plain ASCII (the JWT from login). "
            "Do not paste '…' or other placeholder characters."
        ) from exc
    if len(cleaned) < 80:
        raise SystemExit("ADMIN_TOKEN looks too short — paste the full JWT from login.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Clear old store data and import Benny Boy's Pizza menu + images",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print actions without API writes")
    parser.add_argument("--skip-clear", action="store_true", help="Do not delete existing catalog")
    parser.add_argument(
        "--clear-only",
        action="store_true",
        help="Only clear catalog for target store(s); skip store setup and menu import",
    )
    parser.add_argument("--download-images", action="store_true", help="Run image download script first")
    parser.add_argument("--api-url", default=os.environ.get("API_URL", DEFAULT_API))
    parser.add_argument("--brand", default=os.environ.get("BRAND_SLUG", DEFAULT_BRAND))
    parser.add_argument("--token", default=os.environ.get("ADMIN_TOKEN", ""))
    parser.add_argument("--email", default=os.environ.get("ADMIN_EMAIL", "admin@leovorno.com"))
    parser.add_argument("--password", default=os.environ.get("ADMIN_PASSWORD", ""))
    parser.add_argument(
        "--also-clear",
        default="",
        help="Comma-separated extra brand slugs to wipe (e.g. leovorno,bunny-boys)",
    )
    args = parser.parse_args()

    token = resolve_admin_token(
        args.api_url,
        args.token,
        args.email,
        args.password,
        args.dry_run,
    )

    if token and token != "dry-run" and not args.dry_run:
        validate_admin_token(token)

    try:
        menu = load_menu()
    except FileNotFoundError as exc:
        print(exc)
        return 1

    if args.download_images:
        download_missing_images()

    brands_to_clear = [args.brand]
    if args.also_clear.strip():
        brands_to_clear.extend(s.strip() for s in args.also_clear.split(",") if s.strip())

    # De-dupe while preserving order
    seen: set[str] = set()
    brands_to_clear = [b for b in brands_to_clear if not (b in seen or seen.add(b))]

    print(f"API        = {args.api_url}")
    print(f"Target     = {args.brand}")
    print(f"Clear      = {', '.join(brands_to_clear)}")
    print(f"Dry run    = {args.dry_run}")
    print(f"Menu items = {len(menu.get('items', []))}")
    print()

    token = token if token else "dry-run"

    if not args.skip_clear:
        for slug in brands_to_clear:
            clear_api = ApiClient(args.api_url, token, slug, dry_run=args.dry_run)
            clear_store_catalog(clear_api)
            print()

    if args.clear_only:
        print("Clear-only run complete.")
        return 0

    api = ApiClient(args.api_url, token, args.brand, dry_run=args.dry_run)
    create_store_if_missing(api, menu)
    hero_url = upload_banner_hero(api, menu)
    update_store_branding(api, menu, hero_url)
    ensure_categories(api)
    import_menu_items(api, menu)
    print_summary(api)
    return 0


if __name__ == "__main__":
    sys.exit(main())
