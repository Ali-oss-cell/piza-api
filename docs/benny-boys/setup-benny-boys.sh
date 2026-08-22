#!/usr/bin/env bash
# Run from repo: backend/docs/benny-boys/setup-benny-boys.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

API_URL="${API_URL:-https://api.marinapizzas.com.au/api}"
BRAND="${1:-benny-boys}"
EXTRA_ARGS=()

if [[ "${1:-}" == "--dry-run" ]]; then
  EXTRA_ARGS+=(--dry-run)
  BRAND="benny-boys"
elif [[ "${2:-}" == "--dry-run" ]]; then
  EXTRA_ARGS+=(--dry-run)
fi

if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  echo "ERROR: Set ADMIN_TOKEN first."
  echo "  export ADMIN_TOKEN='eyJ...'"
  echo "  (Admin dashboard → DevTools → localStorage → leovorno-auth-token)"
  exit 1
fi

echo "→ Checking local images in $DIR/bunny-boys-images …"
if [[ ! -d bunny-boys-images ]] || [[ $(find bunny-boys-images -type f 2>/dev/null | wc -l) -lt 10 ]]; then
  echo "→ Downloading menu images…"
  python3 download-bunny-boys-images.py || true
fi

echo "→ Running setup (brand=$BRAND, api=$API_URL)…"
python3 setup-benny-boys-store.py \
  --brand "$BRAND" \
  --download-images \
  --also-clear "bunny-boys,leovorno" \
  "${EXTRA_ARGS[@]}"

echo "Done."
