#!/usr/bin/env bash
# Run from repo: backend/docs/benny-boys/setup-benny-boys.sh
# Or full reset (delete all stores + import): bash docs/benny-boys/reset-benny-boys.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

API_URL="${API_URL:-https://api.marinapizzas.com.au/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@leovorno.com}"
BRAND="${1:-benny-boys}"
EXTRA_ARGS=()

if [[ "${1:-}" == "--dry-run" ]]; then
  EXTRA_ARGS+=(--dry-run)
  BRAND="benny-boys"
elif [[ "${2:-}" == "--dry-run" ]]; then
  EXTRA_ARGS+=(--dry-run)
fi

if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
    echo "→ Logging in as $ADMIN_EMAIL…"
    export ADMIN_TOKEN
    ADMIN_TOKEN="$(API_URL="$API_URL" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      python3 "$DIR/login_admin.py")"
    echo "  ✓ Login OK"
  else
    echo "ERROR: Set ADMIN_PASSWORD (no browser JWT needed):"
    echo "  export ADMIN_PASSWORD='your-password'"
    echo "  export ADMIN_EMAIL='admin@leovorno.com'   # optional"
    echo ""
    echo "Or run the full reset script:"
    echo "  bash docs/benny-boys/reset-benny-boys.sh"
    exit 1
  fi
fi

echo "→ Checking local images in $DIR/bunny-boys-images …"
if [[ ! -d bunny-boys-images ]] || [[ $(find bunny-boys-images -type f 2>/dev/null | wc -l) -lt 10 ]]; then
  echo "→ Downloading menu images…"
  python3 download-bunny-boys-images.py || true
fi

echo "→ Running setup (brand=$BRAND, api=$API_URL)…"
python3 setup-benny-boys-store.py \
  --brand "$BRAND" \
  --email "$ADMIN_EMAIL" \
  --download-images \
  "${EXTRA_ARGS[@]}"

echo "Done."
