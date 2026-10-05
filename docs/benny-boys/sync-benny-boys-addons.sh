#!/usr/bin/env bash
# Sync Benny Boys extras (paid add-ons) + removable ingredients from the live catalog.
#
# On the droplet:
#   cd ~/piza/piza-api
#   git pull origin main
#   export ADMIN_PASSWORD='your-password'
#   bash docs/benny-boys/sync-benny-boys-addons.sh --brand benny-boys
#
# Preview:
#   bash docs/benny-boys/sync-benny-boys-addons.sh --brand benny-boys --dry-run
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

export API_URL
python3 "$DIR/sync-benny-boys-addons.py" --api "$API_URL" "$@"
