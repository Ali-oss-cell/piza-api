#!/usr/bin/env python3
"""Fetch platform admin JWT from POST /auth/login (no browser DevTools)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


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
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Login failed HTTP {exc.code}: {err}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Login request failed: {exc}") from exc

    token = data.get("accessToken") or data.get("access_token")
    if not token or not isinstance(token, str):
        raise SystemExit(f"Login response missing accessToken: {data}")
    return token


def main() -> int:
    api_url = os.environ.get("API_URL", "https://api.marinapizzas.com.au/api")
    email = os.environ.get("ADMIN_EMAIL", "admin@leovorno.com")
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not password:
        print("Set ADMIN_PASSWORD (and optionally ADMIN_EMAIL, API_URL)", file=sys.stderr)
        return 1
    print(fetch_admin_token(api_url, email, password))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
