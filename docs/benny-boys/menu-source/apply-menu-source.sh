#!/usr/bin/env bash
# Apply the menu source of truth (Word doc) to a store.
#
#   export ADMIN_PASSWORD='...'
#   bash docs/benny-boys/menu-source/apply-menu-source.sh --brand benny-boys --dry-run
#   bash docs/benny-boys/menu-source/apply-menu-source.sh --brand benny-boys
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT="$(dirname "$DIR")"

API_URL="${API_URL:-https://api.marinapizzas.com.au/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@leovorno.com}"

if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    echo "ERROR: Set ADMIN_PASSWORD (or ADMIN_TOKEN)"
    exit 1
  fi
  echo "-> Logging in as $ADMIN_EMAIL..."
  export ADMIN_TOKEN
  ADMIN_TOKEN="$(API_URL="$API_URL" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    python3 "$PARENT/login_admin.py")"
  echo "   Login OK"
fi

export API_URL PYTHONUNBUFFERED=1
python3 "$DIR/apply-menu-source.py" --api "$API_URL" "$@"
