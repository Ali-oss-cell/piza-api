#!/usr/bin/env bash
# Apply Wantirna store S/L/F prices + missing menu items to Benny Boys.
#
#   export ADMIN_PASSWORD='...'
#   bash docs/benny-boys/apply-wantirna-store-catalog.sh --brand benny-boys
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

API_URL="${API_URL:-https://api.marinapizzas.com.au/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@leovorno.com}"

if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    echo "ERROR: Set ADMIN_PASSWORD (or ADMIN_TOKEN)"
    exit 1
  fi
  echo "→ Logging in as $ADMIN_EMAIL…"
  export ADMIN_TOKEN
  ADMIN_TOKEN="$(API_URL="$API_URL" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    python3 "$DIR/login_admin.py")"
  echo "  ✓ Login OK"
fi

export API_URL PYTHONUNBUFFERED=1
python3 "$DIR/apply-wantirna-store-catalog.py" --api "$API_URL" "$@"
