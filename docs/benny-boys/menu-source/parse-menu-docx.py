#!/usr/bin/env python3
"""Parse the Benny Boys menu Word doc (source of truth) into structured JSON.

  python3 docs/benny-boys/menu-source/parse-menu-docx.py            # writes benny-boys-menu.source.json
  python3 docs/benny-boys/menu-source/parse-menu-docx.py --check    # parse + validate only

Standard library only (reads the .docx zip directly).

What it extracts
  - Every menu table: item number, name, description and every price column
    (Small / Large / Gluten-free large / Family, or a single "Serve" price,
    or Can / Bottle / 1.25L for drinks).
  - The PREPARATION cards that follow each pizza table, matched to pizzas in
    order (base, build steps, bake, after-the-oven).
  - The "Standard steps for every pizza" text.

Validation fails loudly (non-zero exit) when counts or prices look wrong, so a
badly edited document cannot be silently imported.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_DOCX = HERE / "Benny_Boys_Menu_and_Pizza_Guidelines.docx"
DEFAULT_OUT = HERE / "benny-boys-menu.source.json"

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

SECTION_TO_CATEGORY = {
    "basic pizza": ("basic-pizzas", "Basic Pizzas"),
    "supreme pizzas": ("supreme-pizzas", "Supreme Pizzas"),
    "chicken pizzas": ("chicken-pizzas", "Chicken Pizzas"),
    "vegetarian pizzas": ("vegetarian-pizzas", "Vegetarian Pizzas"),
    "pasta": ("pasta", "Pasta"),
    "mains": ("mains", "Mains"),
    "sides": ("sides", "Sides"),
    "dessert": ("desserts", "Desserts"),
    "drinks": ("drinks", "Drinks"),
}
PIZZA_CATEGORIES = {"basic-pizzas", "supreme-pizzas", "chicken-pizzas", "vegetarian-pizzas"}

# Unambiguous typos in the source wording. Each fix is reported in the output.
TEXT_FIXES = [
    ("sacue", "sauce"),
    ("thicken cream", "thickened cream"),
    ("Gelto", "Gelato"),
]

# Name tidy-ups (docx casing/spelling -> display name).
NAME_FIXES = {
    "Garlic pizza": "Garlic Pizza",
}

# Items we deliberately do NOT import until the owner confirms them.
NEEDS_REVIEW = {
    "chocolate mouse": (
        "Listed as 'Chocolate mouse $7.90' directly above 'Chocolate Mousse $4.50'. "
        "Looks like a typo or a second size — confirm before importing."
    ),
}

EXPECTED_COUNTS = {
    "basic-pizzas": 11,
    "supreme-pizzas": 4,
    "chicken-pizzas": 6,
    "vegetarian-pizzas": 3,
    "pasta": 8,
    "mains": 3,
    "sides": 4,
    "desserts": 5,
    "drinks": 7,
}


def money(text: str) -> float | None:
    text = text.strip()
    m = re.fullmatch(r"\$\s*([0-9]+(?:\.[0-9]{1,2})?)", text)
    return round(float(m.group(1)), 2) if m else None


def para_text(p: ET.Element) -> str:
    """Paragraph text; manual line breaks (<w:br/>) become newlines."""
    out: list[str] = []
    for node in p.iter():
        if node.tag == W + "t":
            out.append(node.text or "")
        elif node.tag == W + "tab":
            out.append(" ")
        elif node.tag == W + "br":
            out.append("\n")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in "".join(out).split("\n")]
    return "\n".join(ln for ln in lines if ln)


def para_style(p: ET.Element) -> str:
    s = p.find(f"{W}pPr/{W}pStyle")
    return s.get(W + "val") if s is not None else ""


def cell_paragraphs(tc: ET.Element) -> list[str]:
    """Non-empty text lines of a cell (paragraphs and manual line breaks)."""
    lines: list[str] = []
    for p in tc.findall(W + "p"):
        lines.extend(ln for ln in para_text(p).split("\n") if ln)
    return lines


def fix_text(text: str, fixes: list[dict]) -> str:
    for old, new in TEXT_FIXES:
        if old in text:
            text = text.replace(old, new)
            fixes.append({"from": old, "to": new})
    return text


def parse(docx_path: Path) -> dict:
    root = ET.fromstring(zipfile.ZipFile(docx_path).read("word/document.xml"))
    body = root.find(W + "body")
    assert body is not None

    fixes: list[dict] = []
    review: list[dict] = []

    standard_steps: list[str] = []
    categories: dict[str, dict] = {}
    section: str | None = None
    in_standard = False
    pending_cards: list[dict] = []
    last_pizza_category: str | None = None
    card: dict | None = None
    card_mode: str | None = None
    header: list[str] = []

    def flush_card() -> None:
        nonlocal card, card_mode
        if card is not None:
            pending_cards.append(card)
        card, card_mode = None, None

    def attach_cards() -> None:
        flush_card()
        if not pending_cards or last_pizza_category is None:
            return
        items = categories[last_pizza_category]["items"]
        if len(pending_cards) != len(items):
            raise SystemExit(
                f"Preparation cards ({len(pending_cards)}) != pizzas ({len(items)}) "
                f"in section {last_pizza_category}"
            )
        for item, prep in zip(items, pending_cards):
            item["preparation"] = prep
        pending_cards.clear()

    for el in body:
        if el.tag == W + "p":
            text = para_text(el).replace("\n", " ")
            style = para_style(el)
            if not text:
                continue

            if style == "Heading1":
                attach_cards()
                in_standard = text.lower().startswith("standard steps")
                if text.lower() == "menu":
                    in_standard = False
                section = None
                continue
            if style == "Heading2":
                attach_cards()
                key = text.lower()
                if key not in SECTION_TO_CATEGORY:
                    raise SystemExit(f"Unknown menu section heading: {text!r}")
                section = key
                continue

            if in_standard:
                standard_steps.append(text)
                continue

            if section is None:
                if len(header) < 4:
                    header.append(text)
                continue

            low = text.lower()
            if low == "preparation":
                flush_card()
                card = {"base": None, "build": [], "bake": None, "afterOven": None}
                card_mode = None
                continue
            if card is not None:
                if low.startswith("base:"):
                    card["base"] = text.split(":", 1)[1].strip()
                elif low.startswith("build"):
                    card_mode = "build"
                elif low.startswith("bake:"):
                    card["bake"] = text.split(":", 1)[1].strip()
                    card_mode = None
                elif low.startswith("after the oven:"):
                    card["afterOven"] = text.split(":", 1)[1].strip()
                    card_mode = None
                elif card_mode == "build":
                    card["build"].append(text)
            continue

        if el.tag == W + "tbl" and section is not None:
            slug, label = SECTION_TO_CATEGORY[section]
            rows = el.findall(W + "tr")
            head = [" ".join(cell_paragraphs(tc)) for tc in rows[0].findall(W + "tc")]
            head_l = [h.lower() for h in head]
            cat = categories.setdefault(
                slug, {"slug": slug, "label": label, "kind": None, "items": []}
            )

            if slug in PIZZA_CATEGORIES:
                cat["kind"] = "pizza"
                col = {
                    "small": head_l.index("small"),
                    "large": head_l.index("large"),
                    "glutenFreeLarge": head_l.index("gluten-free large"),
                    "family": head_l.index("family"),
                }
                for tr in rows[1:]:
                    cells = tr.findall(W + "tc")
                    first = cell_paragraphs(cells[0])
                    m = re.match(r"^(\d+)\.\s*(.+)$", first[0])
                    if not m:
                        raise SystemExit(f"Pizza row without number: {first!r}")
                    name = NAME_FIXES.get(m.group(2).strip(), m.group(2).strip())
                    desc = fix_text(" ".join(first[1:]).strip(), fixes)
                    prices = {}
                    for key, idx in col.items():
                        val = money(" ".join(cell_paragraphs(cells[idx])))
                        if val is None:
                            raise SystemExit(f"Bad {key} price for {name}")
                        prices[key] = val
                    cat["items"].append(
                        {
                            "number": int(m.group(1)),
                            "name": name,
                            "description": desc,
                            "categorySlug": slug,
                            "prices": prices,
                        }
                    )
                last_pizza_category = slug
                pending_cards.clear()
                card = None

            elif slug == "drinks":
                cat["kind"] = "drinks"
                idx_can = head_l.index("can")
                idx_bottle = head_l.index("bottle")
                idx_big = head_l.index("1.25l bottle")
                for tr in rows[1:]:
                    cells = tr.findall(W + "tc")
                    name = " ".join(cell_paragraphs(cells[0]))
                    sizes = {}
                    for key, idx in (("can", idx_can), ("bottle", idx_bottle), ("bottle1250", idx_big)):
                        val = money(" ".join(cell_paragraphs(cells[idx])))
                        if val is not None:
                            sizes[key] = val
                    cat["items"].append(
                        {"name": name, "categorySlug": slug, "sizes": sizes}
                    )

            else:
                cat["kind"] = "single"
                idx_name = 0
                idx_desc = head_l.index("description") if "description" in head_l else None
                idx_price = len(head_l) - 1
                for tr in rows[1:]:
                    cells = tr.findall(W + "tc")
                    raw_name = " ".join(cell_paragraphs(cells[idx_name]))
                    name = NAME_FIXES.get(raw_name, raw_name)
                    desc = (
                        fix_text(" ".join(cell_paragraphs(cells[idx_desc])), fixes)
                        if idx_desc is not None
                        else ""
                    )
                    price = money(" ".join(cell_paragraphs(cells[idx_price])))
                    if price is None:
                        raise SystemExit(f"Bad price for {name}")
                    fixed_name = fix_text(name, fixes)
                    item = {
                        "name": fixed_name,
                        "description": desc,
                        "categorySlug": slug,
                        "price": price,
                    }
                    reason = NEEDS_REVIEW.get(raw_name.lower())
                    if reason:
                        item["skip"] = True
                        item["skipReason"] = reason
                        review.append({"item": raw_name, "price": price, "reason": reason})
                    cat["items"].append(item)

    attach_cards()
    return {
        "header": header,
        "standardSteps": standard_steps,
        "categories": list(categories.values()),
        "textFixes": fixes,
        "needsReview": review,
    }


def derive_gluten_free(data: dict) -> dict:
    """Gluten-free surcharge per category = GF large - large (must be uniform in a category)."""
    per_cat: dict[str, float] = {}
    for cat in data["categories"]:
        if cat["slug"] not in PIZZA_CATEGORIES:
            continue
        deltas = {round(i["prices"]["glutenFreeLarge"] - i["prices"]["large"], 2) for i in cat["items"]}
        if len(deltas) != 1:
            raise SystemExit(
                f"Gluten-free surcharge is not uniform in {cat['slug']}: {sorted(deltas)}"
            )
        per_cat[cat["slug"]] = deltas.pop()
    # Default = the most common surcharge (ties -> higher); the rest become overrides.
    counts: dict[float, int] = {}
    for v in per_cat.values():
        counts[v] = counts.get(v, 0) + 1
    default = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)[0][0]
    overrides = {slug: v for slug, v in per_cat.items() if v != default}
    return {
        "crustSlug": "gluten-free",
        "label": 'Gluten Free - Large 11"',
        "defaultDelta": default,
        "categoryDeltas": overrides,
        "perCategory": per_cat,
    }


def validate(data: dict) -> list[str]:
    problems: list[str] = []
    by_slug = {c["slug"]: c for c in data["categories"]}
    for slug, expected in EXPECTED_COUNTS.items():
        got = len(by_slug.get(slug, {}).get("items", []))
        if got != expected:
            problems.append(f"{slug}: expected {expected} items, found {got}")
    numbers = [
        i["number"]
        for c in data["categories"]
        if c["slug"] in PIZZA_CATEGORIES
        for i in c["items"]
    ]
    if numbers != list(range(1, len(numbers) + 1)):
        problems.append(f"Pizza numbers are not 1..{len(numbers)} in order: {numbers}")
    for c in data["categories"]:
        if c["slug"] in PIZZA_CATEGORIES:
            for i in c["items"]:
                p = i["prices"]
                if not (p["small"] < p["large"] < p["family"]):
                    problems.append(f"{i['name']}: sizes not increasing {p}")
                if p["glutenFreeLarge"] <= p["large"]:
                    problems.append(f"{i['name']}: GF large not above large {p}")
                if "preparation" not in i:
                    problems.append(f"{i['name']}: no preparation card")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--docx", type=Path, default=DEFAULT_DOCX)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--check", action="store_true", help="Parse and validate only; do not write JSON")
    args = ap.parse_args()

    data = parse(args.docx)
    data["glutenFree"] = derive_gluten_free(data)
    data["source"] = {"file": args.docx.name}
    problems = validate(data)

    total = sum(len(c["items"]) for c in data["categories"])
    print(f"Parsed {total} items from {args.docx.name}")
    for c in data["categories"]:
        print(f"  {c['slug']:<18} {len(c['items'])}")
    gf = data["glutenFree"]
    print(
        f"Gluten-free surcharge: default +${gf['defaultDelta']:.2f}, "
        f"overrides {gf['categoryDeltas'] or 'none'}"
    )
    for fix in data["textFixes"]:
        print(f"  typo fixed: {fix['from']!r} -> {fix['to']!r}")
    for r in data["needsReview"]:
        print(f"  NEEDS REVIEW (skipped): {r['item']} ${r['price']:.2f} — {r['reason']}")

    if problems:
        print("\nVALIDATION FAILED:")
        for p in problems:
            print(f"  - {p}")
        return 1
    if not args.check:
        args.out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
