#!/usr/bin/env python3
"""Import menu + images from a Word menu + pic/ folder into a chosen store.

Designed to run on the DigitalOcean droplet (or locally).

Default asset location (upload these to the server):
  docs/benny-boys/menu-import/Benny_Boys_Pizza_Menu final v1.docx
  docs/benny-boys/menu-import/pic/**

Or set:
  MENU_DOCX=/path/to/menu.docx
  MENU_PIC=/path/to/pic

Then:
  1) Lists stores from the API
  2) You pick one by number (or pass --brand)
  3) Optionally clears that store's catalog (--replace)
  4) Creates categories, uploads matched images, upserts menu items

Auth (one of):
  ADMIN_TOKEN=eyJ...
  or ADMIN_EMAIL + ADMIN_PASSWORD

Server examples:
  cd ~/piza/piza-api
  git pull
  # upload docx + pic into docs/benny-boys/menu-import/
  export ADMIN_PASSWORD='...'
  bash docs/benny-boys/import-store-menu.sh --brand benny-boys --replace
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
import zipfile
import xml.etree.ElementTree as ET
from difflib import SequenceMatcher
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MENU_IMPORT_DIR = SCRIPT_DIR / "menu-import"
DEFAULT_API = os.environ.get("API_URL", "https://api.marinapizzas.com.au/api")
PLACEHOLDER = (
    "https://images.unsplash.com/photo-1513104890138-7c749659a591"
    "?auto=format&fit=crop&w=800&q=80"
)


def resolve_docx() -> Path:
    env = os.environ.get("MENU_DOCX", "").strip()
    if env:
        return Path(env)
    candidates = [
        MENU_IMPORT_DIR / "Benny_Boys_Pizza_Menu final v1.docx",
        MENU_IMPORT_DIR / "menu.docx",
        SCRIPT_DIR.parents[1].parent / "Benny_Boys_Pizza_Menu final v1.docx",
    ]
    for path in candidates:
        if path.exists():
            return path
    return candidates[0]


def resolve_pic() -> Path:
    env = os.environ.get("MENU_PIC", "").strip()
    if env:
        return Path(env)
    candidates = [
        MENU_IMPORT_DIR / "pic",
        SCRIPT_DIR.parents[1].parent / "pic",
    ]
    for path in candidates:
        if path.is_dir():
            return path
    return candidates[0]


DEFAULT_DOCX = resolve_docx()
DEFAULT_PIC = resolve_pic()

W_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

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

SECTION_TO_CATEGORY = {
    "basic pizzas": "basic-pizzas",
    "supreme pizzas": "supreme-pizzas",
    "chicken pizzas": "chicken-pizzas",
    "vegetarian pizzas": "vegetarian-pizzas",
    "pastas": "pasta",
    "pasta": "pasta",
    "chicken parmas": "mains",
    "sides": "sides",
    "desserts": "desserts",
    "benny boys combo deals": "deals",
    "combo deals": "deals",
    "cold beverages": "drinks",
}

# Known docx typos / aliases → canonical menu name
NAME_FIXES = {
    "meat suprem": "Meat Supreme",
    "meat lovers": "Meat Lovers",
    "benny boy's supreme": "Benny Boy's Supreme",
    "benny boys supreme": "Benny Boy's Supreme",
    "dounts": "Hot Jam Donuts",
    "cake slice": "Cake Slice",
}

# Extra image search keys when filename differs from menu name
IMAGE_ALIASES = {
    "margherita": ["margherita", "margherita thin crust"],
    "hawaiian": ["hawaiian", "hawaiian 2", "hawaiian zwift"],
    "pepperoni": ["pepperoni"],
    "capricciosa": ["capricciosa", "01capricciosa"],
    "aussie": ["aussie"],
    "vegetarian": ["vegetarian"],
    "americana": ["americana", "american"],
    "marinara": ["marinara"],
    "mexicana": ["mexicana"],
    "napolitana": ["napoletana", "napolitana"],
    "garlic pizza": ["garlic pizza"],
    "super supreme": ["super supreme"],
    "benny boy's supreme": ["benny boy_s supreme", "benny boys supreme", "benny boy s supreme"],
    "meat supreme": ["meat supreme", "meat lovers"],
    "meat lovers": ["meat lovers", "meat supreme"],
    "tomato supreme": ["tomato supreme"],
    "tandoori chicken": ["tandoori chicken"],
    "pesto chicken": ["pesto chicken"],
    "satay chicken": ["satay chicken"],
    "tropical bbq chicken": ["tropical bbq chicken"],
    "classic bbq chicken": ["classic bbq chicken", "bbq chicken"],
    "hot & spicy chicken": ["hot & spicy chicken", "hot and spicy chicken"],
    "chicken supreme": ["chicken supreme"],
    "mediterranean": ["mediterranean"],
    "red devil": ["red devil"],
    "gourmet vegetarian": ["gourmet vegetarian"],
    "lasagne": ["lasagne", "lasagna"],
    "bolognese": ["bolognese"],
    "chicken pollo": ["chicken pollo"],
    "carbonara": ["carbonara"],
    "chicken rosa": ["chicken rosa", "chicken rosa", "rose pasta"],
    "seafood marinara": ["seafood marinara"],
    "spicy matriciana": ["spicy matriciana", "matriciana"],
    "vegetarian pasta": ["vegetarian pasta"],
    "classic parma": ["classic parma", "classic parma with chips"],
    "hawaiian parma": ["hawaiian parma"],
    "mexican parma": ["mexican parma"],
    "benny boy's fries": ["benny boy_s fries", "benny boys fries", "fries", "chips"],
    "loaded chips": ["loaded chips"],
    "seasoned wedges": ["wedges", "seasoned wedges"],
    "garlic bread": ["garlic bread"],
    "chocolate pizza": ["chocolate pizza"],
    "hot jam donuts": ["hot jam donuts", "dounts"],
    "single deal": ["single deal", "single"],
    "double deal": ["double deal", "double"],
    "family deal": ["family deal", "family"],
    "party deal": ["party deal", "party", "part deal"],
}

# Items often mangled in the Word export — force-include if parser missed them.
ENSURE_ITEMS = [
    {
        "name": "Garlic Pizza",
        "description": "Extra virgin olive oil, smashed garlic, fresh rosemary, and sea salt.",
        "categorySlug": "basic-pizzas",
        "price": 9.90,
        "sizeOptions": {
            "small": {"enabled": True, "price": 9.90},
            "large": {"enabled": True, "price": 13.90},
            "family": {"enabled": True, "price": 19.90},
        },
    },
    {
        "name": "Napolitana",
        "description": "Napoli, mozzarella, olives, anchovies and oregano.",
        "categorySlug": "basic-pizzas",
        "price": 9.90,
        "sizeOptions": {
            "small": {"enabled": True, "price": 9.90},
            "large": {"enabled": True, "price": 13.90},
            "family": {"enabled": True, "price": 19.90},
        },
    },
    {
        "name": "Gelato",
        "description": "Chocolate, Banana, Lemon, Mango, Pistachio, or Strawberry.",
        "categorySlug": "desserts",
        "price": 7.00,
        "sizeOptions": None,
    },
    {
        "name": "Cake Slice",
        "description": "A generous slice of our daily cake.",
        "categorySlug": "desserts",
        "price": 7.90,
        "sizeOptions": None,
    },
]


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    s = s.replace("benny-boy-s-", "benny-boys-")
    return s or "item"


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


def docx_paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    paras: list[str] = []
    for p in root.iter(f"{{{W_NS['w']}}}p"):
        texts = [t.text or "" for t in p.iter(f"{{{W_NS['w']}}}t")]
        line = "".join(texts).strip()
        if line:
            paras.append(line)
    return paras


def parse_money(text: str) -> float | None:
    """Parse $10.90, ($20.90), or bare price in parentheses."""
    m = re.search(r"\$\s*([0-9]+(?:\.[0-9]{1,2})?)", text)
    if m:
        return float(m.group(1))
    m = re.search(r"\(\s*([0-9]+(?:\.[0-9]{1,2})?)\s*\)", text)
    if m:
        return float(m.group(1))
    return None


def parse_size_row(line: str) -> dict[str, float] | None:
    """Parse 'Small: $10.90 | Large: $14.90 | Family: $20.90' (also glued 'PizzasSmall:')."""
    low = line.lower()
    if "small" not in low or "$" not in line:
        return None
    sizes: dict[str, float] = {}
    for label, key in (("small", "small"), ("large", "large"), ("family", "family")):
        m = re.search(
            rf"{label}\s*:?\s*\$\s*([0-9]+(?:\.[0-9]{{1,2}})?)",
            line,
            re.I,
        )
        if m:
            sizes[key] = float(m.group(1))
    return sizes or None


def is_section_header(line: str) -> str | None:
    key = normalize_key(line)
    # Strip trailing size pricing, including glued "Chicken PizzasSmall: $11.90..."
    key = re.split(r"\s*small\s*:", key)[0].strip()
    for name, slug in SECTION_TO_CATEGORY.items():
        if key == name or key.startswith(name + " ") or re.match(
            rf"^{re.escape(name)}(?![a-z])", key
        ):
            return slug
    return None


def pizza_size_options(size_prices: dict[str, float]) -> dict:
    """API expects lowercase size keys (small/large/family)."""
    return {
        "small": {"enabled": True, "price": float(size_prices.get("small", 10.9))},
        "large": {"enabled": True, "price": float(size_prices.get("large", 14.9))},
        "family": {"enabled": True, "price": float(size_prices.get("family", 20.9))},
    }


def normalize_menu_line(line: str) -> str:
    text = (
        line.replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2015", "-")
        .replace("\u2212", "-")
    )
    text = re.sub(r"(?i)(pizzas)(small\s*:)", r"\1 \2", text)
    text = re.sub(r"(?i)(deals)\(", r"\1 (", text)
    text = re.sub(r"(?i)(parmas)\s*-?\s*\$", r"\1 - $", text)
    text = re.sub(r"(\$\s*[0-9]+\.[0-9]{2})(\d)", r"\1 \2", text)
    return text


def clean_item_name(raw: str) -> str:
    name = raw.strip(" -:\t")
    name = re.sub(r"^\d+[a-z]?\.\s*", "", name, flags=re.I)
    name = re.sub(r"\s+", " ", name).strip()
    fixed = NAME_FIXES.get(normalize_key(name))
    return fixed or name


def parse_menu(docx_path: Path) -> list[dict]:
    lines = [normalize_menu_line(line) for line in docx_paragraphs(docx_path)]
    items: list[dict] = []
    category = "basic-pizzas"
    size_prices: dict[str, float] = {
        "small": 10.90,
        "large": 14.90,
        "family": 20.90,
    }
    flat_price: float | None = None
    drinks_can = 3.50
    drinks_bottle = 5.90

    skip_prefixes = (
        "trading hours",
        "contact",
        "phone:",
        "please note",
        "allergen",
        "menu items and prices",
        "using same style",
        "gluten-free",
        "served with crisp",
        "all deals apply",
        "(to add sweet",
        "upgrade any",
    )

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        low = line.lower()

        if any(low.startswith(p) for p in skip_prefixes):
            i += 1
            continue

        section = is_section_header(line)
        if section:
            category = section
            sizes = parse_size_row(line)
            if sizes:
                size_prices = sizes
            # Pastas / parmas often have "$18.90" on same or next line
            money = parse_money(line)
            if money and section in {"pasta", "mains", "sides", "desserts", "deals"}:
                flat_price = money
            i += 1
            # Look ahead for size/price-only next line
            if i < len(lines):
                nxt = lines[i]
                sizes2 = parse_size_row(nxt)
                if sizes2:
                    size_prices = sizes2
                    i += 1
                elif section in {"pasta", "mains"} and parse_money(nxt) and ":" not in nxt:
                    flat_price = parse_money(nxt)
                    i += 1
                elif section == "drinks" and "375ml" in nxt.lower():
                    can = re.search(r"375ml.*?\$\s*([0-9.]+)", nxt, re.I)
                    bot = re.search(r"1\.25l.*?\$\s*([0-9.]+)", nxt, re.I)
                    if can:
                        drinks_can = float(can.group(1))
                    if bot:
                        drinks_bottle = float(bot.group(1))
                    i += 1
            continue

        sizes_only = parse_size_row(line)
        if sizes_only:
            size_prices = sizes_only
            i += 1
            continue

        if re.fullmatch(r"\$\s*[0-9]+(?:\.[0-9]+)?", line):
            flat_price = parse_money(line)
            i += 1
            continue

        if category == "drinks" and re.fullmatch(
            r"(pepsi( max)?|lemonade|solo|sunkist|mountain dew)", low
        ):
            items.append(
                {
                    "name": line.title() if line.lower() != "pepsi max" else "Pepsi Max",
                    "description": "375ml can or 1.25L bottle.",
                    "categorySlug": "drinks",
                    "price": drinks_can,
                    "sizeOptions": None,
                    "priceNote": f"Can ${drinks_can:.2f} · 1.25L ${drinks_bottle:.2f}",
                }
            )
            i += 1
            continue

        # "Name - description" or "Name: description" or numbered "12. Name"
        m = re.match(
            r"^(?:\d+[a-z]?\.\s*)?(.+?)\s*[-–—:]\s+(.+)$",
            line,
        )
        name: str | None = None
        desc: str = ""
        inline_price: float | None = None

        if m:
            name = clean_item_name(m.group(1))
            rest = m.group(2).strip()
            inline_price = parse_money(rest)
            # Strip leading price from description
            desc = re.sub(r"^\$\s*[0-9]+(?:\.[0-9]+)?\s*", "", rest).strip(" :.-")
            # "Single Deal - $16.90 1 Small..."
            if inline_price and not desc:
                desc = rest
            if inline_price:
                desc = re.sub(
                    r"^\$\s*[0-9]+(?:\.[0-9]+)?\s*",
                    "",
                    rest,
                ).strip()
        elif re.match(r"^\d+[a-z]?\.\s+", line):
            name = clean_item_name(line)
            # Description often on following lines until next item/section
            desc_parts: list[str] = []
            j = i + 1
            while j < len(lines):
                nxt = lines[j].strip()
                if is_section_header(nxt) or parse_size_row(nxt):
                    break
                if re.match(r"^\d+[a-z]?\.\s+", nxt):
                    break
                if re.match(r"^.+\s*[-–—:]\s+.+$", nxt) and parse_money(nxt):
                    break
                if any(nxt.lower().startswith(p) for p in skip_prefixes):
                    break
                # Next titled item without number (e.g. Meat Lovers -)
                if re.match(r"^[A-Z][\w'& ]+\s*[-–—:]\s*$", nxt):
                    break
                if re.match(r"^[A-Z][\w'& ]+\s*[-–—:]\s+.+$", nxt):
                    break
                desc_parts.append(nxt)
                j += 1
            desc = " ".join(desc_parts).strip()
            i = j - 1
        elif re.match(r"^[A-Z][\w'& ]{2,40}$", line) and category in {
            "pasta",
            "mains",
            "sides",
            "desserts",
            "deals",
        }:
            # Bare title; description may follow
            name = clean_item_name(line)
            if i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                if (
                    not is_section_header(nxt)
                    and not parse_size_row(nxt)
                    and not re.match(r"^\d+[a-z]?\.\s+", nxt)
                    and not re.match(r"^[A-Z][\w'& ]+\s*[-–—:]", nxt)
                ):
                    desc = nxt
                    i += 1

        if not name or len(name) < 3:
            i += 1
            continue

        # Skip junk leftovers from docx
        if normalize_key(name) in {"napoli mozzarella olives anchovies and oregano"}:
            i += 1
            continue
        if name.lower().startswith("extra virgin"):
            # Treat as Garlic Pizza if we somehow get here
            name = "Garlic Pizza"
            desc = line

        # Build Garlic Pizza if we only see the oil description without a title nearby
        if "extra virgin olive oil" in low and "garlic" in low:
            name = "Garlic Pizza"
            desc = line

        price = inline_price
        size_options = None
        if category.endswith("-pizzas"):
            size_options = pizza_size_options(size_prices)
            price = size_prices.get("small", price or 10.9)
        elif category == "pasta":
            price = price or flat_price or 18.90
            if "seafood" in normalize_key(name):
                price = 20.90
        elif category == "mains":
            price = price or flat_price or 24.90
        else:
            price = price or flat_price or 0

        if not price:
            # try extract from description
            price = parse_money(desc) or parse_money(line) or 0

        items.append(
            {
                "name": name,
                "description": desc or f"{name}.",
                "categorySlug": category,
                "price": round(float(price), 2),
                "sizeOptions": size_options,
            }
        )
        i += 1

    # Deduplicate by normalized name (keep first with richer description)
    dedup: dict[str, dict] = {}
    for item in items:
        key = normalize_key(item["name"])
        if key not in dedup or len(item["description"]) > len(dedup[key]["description"]):
            dedup[key] = item

    for extra in ENSURE_ITEMS:
        key = normalize_key(extra["name"])
        if key not in dedup:
            dedup[key] = dict(extra)

    return list(dedup.values())


def index_images(pic_dir: Path) -> list[Path]:
    exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    files: list[Path] = []
    for path in pic_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in exts:
            continue
        if path.name.startswith("~$") or path.name.startswith("~"):
            continue
        files.append(path)
    return files


def image_score(item_name: str, category: str, path: Path, pic_root: Path) -> float:
    rel = str(path.relative_to(pic_root)).replace("\\", "/").lower()
    stem = normalize_key(path.stem)
    name_key = normalize_key(item_name)

    # Prefer web assets over POS crops
    score = 0.0
    if "/pos/" in f"/{rel}/" or rel.startswith("pos/") or "/pos/" in rel:
        score -= 1.5
    if "600 w" in rel:
        score -= 0.5

    # Category folder bonus
    cat_hints = {
        "basic-pizzas": ("basic", "pizza"),
        "supreme-pizzas": ("new folder", "pizza", "supreme"),
        "chicken-pizzas": ("chicken",),
        "vegetarian-pizzas": ("vegetarian",),
        "pasta": ("pasta",),
        "mains": ("parma",),
        "sides": ("sides",),
        "desserts": ("desert", "dessert"),
        "deals": ("deals",),
    }
    for hint in cat_hints.get(category, ()):
        if hint in rel:
            score += 0.4

    ratio = SequenceMatcher(None, name_key, stem).ratio()
    score += ratio * 3.0

    # Alias hits
    aliases = IMAGE_ALIASES.get(name_key, [])
    for alias in [name_key, *aliases]:
        a = normalize_key(alias)
        if a and a in stem:
            score += 1.2
        if a and all(tok in stem for tok in a.split() if len(tok) > 2):
            score += 0.6

    # Exact-ish
    if stem == name_key or stem.replace(" v1", "") == name_key:
        score += 2.0

    return score


def match_image(item: dict, images: list[Path], pic_root: Path) -> Path | None:
    best: Path | None = None
    best_score = 1.2  # minimum threshold
    for path in images:
        s = image_score(item["name"], item["categorySlug"], path, pic_root)
        if s > best_score:
            best_score = s
            best = path
    return best


class ApiClient:
    def __init__(self, base: str, token: str, brand: str, dry_run: bool = False):
        self.base = base.rstrip("/")
        self.token = token
        self.brand = brand
        self.dry_run = dry_run
        self.public_origin = self.base[:-4] if self.base.endswith("/api") else self.base

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
            boundary = f"----MenuImport{int(time.time() * 1000)}"
            mime = {
                ".png": "image/png",
                ".webp": "image/webp",
                ".gif": "image/gif",
            }.get(file_path.suffix.lower(), "image/jpeg")
            file_bytes = file_path.read_bytes()
            data = b"".join(
                [
                    f"--{boundary}\r\n".encode(),
                    (
                        f'Content-Disposition: form-data; name="{field}"; '
                        f'filename="{file_path.name}"\r\n'
                        f"Content-Type: {mime}\r\n\r\n"
                    ).encode(),
                    file_bytes,
                    f"\r\n--{boundary}--\r\n".encode(),
                ]
            )
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        elif body is not None:
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
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

    def delete(self, path: str):
        return self.request("DELETE", path)

    def upload_hero(self, file_path: Path) -> tuple[str, str | None]:
        if self.dry_run:
            return (
                f"{self.public_origin}/api/uploads/heroes/dry-run-{file_path.name}",
                None,
            )
        result = self.request("POST", "/uploads/hero", multipart=("file", file_path))
        rel = result.get("url") or ""
        if not rel:
            raise RuntimeError(f"Upload failed for {file_path.name}: {result}")
        url = rel if rel.startswith("http") else f"{self.public_origin}{rel}"
        blur = result.get("blurHash") or result.get("blur_hash")
        return url, blur if isinstance(blur, str) and blur.strip() else None


def choose_store(api_base: str, token: str, brand_arg: str | None) -> str:
    client = ApiClient(api_base, token, brand_arg or "benny-boys", dry_run=False)
    brands = client.get("/brands")
    if not isinstance(brands, list) or not brands:
        raise SystemExit("No stores returned from GET /brands")

    if brand_arg:
        match = next((b for b in brands if b.get("slug") == brand_arg), None)
        if not match:
            raise SystemExit(
                f"Brand '{brand_arg}' not found. Available: "
                + ", ".join(b.get("slug", "?") for b in brands)
            )
        return brand_arg

    print("\nStores:")
    for idx, brand in enumerate(brands, start=1):
        print(f"  {idx}. {brand.get('name')}  [{brand.get('slug')}]")
    while True:
        raw = input("\nChoose store number: ").strip()
        if not raw.isdigit():
            print("Enter a number.")
            continue
        n = int(raw)
        if 1 <= n <= len(brands):
            slug = brands[n - 1]["slug"]
            print(f"→ Selected {brands[n - 1].get('name')} ({slug})")
            return slug
        print("Out of range.")


def clear_catalog(api: ApiClient) -> None:
    print(f"→ Clearing catalog for '{api.brand}'…")
    if api.dry_run:
        print("  [dry-run] would deactivate menu items / deals / categories")
        return
    for _ in range(5):
        try:
            items = api.get("/menu/manage/all")
        except RuntimeError:
            items = []
        if not isinstance(items, list) or not items:
            break
        active = [i for i in items if i.get("isActive", True)]
        if not active:
            break
        for item in active:
            item_id = item.get("id")
            if item_id:
                try:
                    api.delete(f"/menu/{item_id}")
                except RuntimeError:
                    pass
    try:
        deals = api.get("/deals")
        if isinstance(deals, list):
            for deal in deals:
                deal_id = deal.get("id")
                if deal_id:
                    try:
                        api.delete(f"/deals/{deal_id}")
                    except RuntimeError:
                        pass
    except RuntimeError:
        pass


def ensure_categories(api: ApiClient) -> None:
    print("→ Ensuring categories…")
    for cat in CATEGORIES:
        try:
            api.post("/menu/categories", cat)
            print(f"  ✓ {cat['slug']}")
        except RuntimeError as exc:
            if "409" in str(exc) or "already" in str(exc).lower():
                print(f"  · {cat['slug']} (exists)")
            else:
                raise


def import_items(api: ApiClient, items: list[dict], pic_root: Path) -> None:
    images = index_images(pic_root)
    print(f"→ Indexed {len(images)} images under {pic_root}")
    print(f"→ Importing {len(items)} menu items…")

    existing_by_slug: dict[str, str] = {}
    try:
        catalog = api.get("/menu/manage/all")
        if isinstance(catalog, list):
            for row in catalog:
                if row.get("slug") and row.get("id"):
                    existing_by_slug[row["slug"]] = row["id"]
    except RuntimeError:
        pass

    created = updated = failed = missing_img = 0
    for number, item in enumerate(items, start=1):
        name = item["name"]
        slug = slugify(name)
        local = match_image(item, images, pic_root)
        image_url = PLACEHOLDER
        image_blur_hash: str | None = None
        try:
            if local:
                image_url, image_blur_hash = api.upload_hero(local)
            else:
                missing_img += 1
        except RuntimeError as exc:
            print(f"  ! image upload failed for {name}: {exc}")
            missing_img += 1

        payload = {
            "slug": slug,
            "number": number,
            "name": name,
            "description": item.get("description") or f"{name}.",
            "price": float(item["price"]),
            "categorySlug": item["categorySlug"],
            "imageUrl": image_url,
            "imageAlt": name,
            "isActive": True,
            "ingredients": [],
            "badges": [],
        }
        if image_blur_hash:
            payload["imageBlurHash"] = image_blur_hash
        if item.get("sizeOptions"):
            payload["sizeOptions"] = item["sizeOptions"]
        if item.get("priceNote"):
            payload["priceNote"] = item["priceNote"]

        img_note = "📷" if local else "⬜"
        rel = str(local.relative_to(pic_root)) if local else "-"
        try:
            existing_id = existing_by_slug.get(slug)
            if existing_id:
                api.put(f"/menu/{existing_id}", payload)
                print(f"  ↻ {img_note} [{item['categorySlug']}] {name}  ${item['price']:.2f}  ← {rel}")
                updated += 1
            else:
                api.post("/menu", payload)
                print(f"  ✓ {img_note} [{item['categorySlug']}] {name}  ${item['price']:.2f}  ← {rel}")
                created += 1
        except RuntimeError as exc:
            print(f"  ✗ {name}: {exc}")
            failed += 1
        time.sleep(0.03)

    print(
        f"\nDone. created={created} updated={updated} failed={failed} "
        f"missing_image={missing_img}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Import docx menu + pic images into a store")
    parser.add_argument("--docx", type=Path, default=DEFAULT_DOCX)
    parser.add_argument("--pic", type=Path, default=DEFAULT_PIC)
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--brand", default=None, help="Brand slug (skip interactive picker)")
    parser.add_argument("--replace", action="store_true", help="Clear store catalog first")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-addons", action="store_true", help="Skip extras/ingredients sync")
    parser.add_argument("--write-json", type=Path, help="Write parsed menu JSON and exit/import")
    parser.add_argument("--parse-only", action="store_true", help="Only parse + match images")
    args = parser.parse_args()

    if not args.docx.exists():
        raise SystemExit(f"Missing docx: {args.docx}")
    if not args.pic.exists():
        raise SystemExit(f"Missing pic folder: {args.pic}")

    print(f"→ Parsing {args.docx.name}…")
    items = parse_menu(args.docx)
    images = index_images(args.pic)
    matched = 0
    enriched = []
    for item in items:
        local = match_image(item, images, args.pic)
        row = {**item, "localImage": str(local.relative_to(args.pic)) if local else None}
        enriched.append(row)
        if local:
            matched += 1

    print(f"  parsed {len(items)} items · image match {matched}/{len(items)}")
    by_cat: dict[str, int] = {}
    for item in items:
        by_cat[item["categorySlug"]] = by_cat.get(item["categorySlug"], 0) + 1
    for cat, count in sorted(by_cat.items(), key=lambda x: x[0]):
        print(f"    {cat}: {count}")

    if args.write_json:
        args.write_json.write_text(
            json.dumps({"items": enriched}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"→ Wrote {args.write_json}")

    if args.parse_only:
        for row in enriched:
            mark = "📷" if row["localImage"] else "⬜"
            print(f"  {mark} [{row['categorySlug']}] {row['name']} ${row['price']:.2f} {row['localImage'] or ''}")
        return 0

    token = os.environ.get("ADMIN_TOKEN", "").strip()
    if not token:
        email = os.environ.get("ADMIN_EMAIL", "admin@leovorno.com")
        password = os.environ.get("ADMIN_PASSWORD", "")
        if not password:
            raise SystemExit("Set ADMIN_TOKEN or ADMIN_PASSWORD (and optional ADMIN_EMAIL)")
        print("→ Logging in…")
        token = fetch_admin_token(args.api, email, password)

    brand = choose_store(args.api, token, args.brand)
    api = ApiClient(args.api, token, brand, dry_run=args.dry_run)

    if args.replace:
        clear_catalog(api)
    ensure_categories(api)
    import_items(api, enriched, args.pic)

    if not args.skip_addons:
        print("\n→ Syncing Benny Boys extras + ingredients…")
        catalog_path = SCRIPT_DIR / "live-site-addons-and-ingredients.json"
        sync_path = SCRIPT_DIR / "sync-benny-boys-addons.py"
        if catalog_path.exists() and sync_path.exists():
            import importlib.util

            spec = importlib.util.spec_from_file_location(
                "sync_benny_boys_addons", sync_path
            )
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
                mod.run_sync(api, catalog)
            else:
                print("  ! could not load sync-benny-boys-addons.py")
        else:
            print("  ! missing addons catalog/script — skipped")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
