#!/usr/bin/env python3
"""Download Bunny Boys menu images from URLs in JSON (no browser needed).

Usage:
  cd ~/Desktop/projects/new_pizza
  python docs/download-bunny-boys-images.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
JSON_FILE = ROOT / "bunny-boys-menu-with-images.json"
OUT_DIR = ROOT / "bunny-boys-images"
REFERER = "https://www.ubereats.com/"


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "item"


def curl_download(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            "curl",
            "-fsSL",
            "-A",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            "-e",
            REFERER,
            "-o",
            str(dest),
            url,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  FAIL {dest.name}: {result.stderr.strip() or result.returncode}")
        return False
    return dest.stat().st_size > 500


def main() -> int:
    if not JSON_FILE.exists():
        print(f"Missing {JSON_FILE}")
        return 1

    data = json.loads(JSON_FILE.read_text(encoding="utf-8"))
    items = data.get("items", [])
    saved = 0

    banner = data.get("store", {}).get("bannerImage")
    if banner:
        dest = OUT_DIR / "banner.jpeg"
        if curl_download(banner, dest):
            print(f"  ✓ banner.jpeg")
            saved += 1

    for item in items:
        url = item.get("imageUrl")
        if not url:
            continue
        ext = ".jpeg" if re.search(r"\.(jpe?g)", url, re.I) else ".webp"
        filename = f"{slugify(item['name'])}{ext}"
        dest = OUT_DIR / filename
        if dest.exists() and dest.stat().st_size > 500:
            item["localImage"] = f"bunny-boys-images/{filename}"
            print(f"  skip {filename} (exists)")
            saved += 1
            continue
        if curl_download(url, dest):
            item["localImage"] = f"bunny-boys-images/{filename}"
            saved += 1
            print(f"  ✓ {filename}")
        else:
            item["localImage"] = None

    data["stats"] = {
        "totalItems": len(items),
        "itemsWithImages": sum(1 for i in items if i.get("localImage")),
        "itemsWithUrls": sum(1 for i in items if i.get("imageUrl")),
    }
    JSON_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"\nDone: {saved} images in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
