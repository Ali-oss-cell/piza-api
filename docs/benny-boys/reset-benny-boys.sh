#!/usr/bin/env bash
# Delete ALL stores from the database, then import one fresh Benny Boy's store + menu.
# No browser JWT — uses ADMIN_EMAIL + ADMIN_PASSWORD only.
#
# On the Droplet:
#   cd ~/piza/piza-api
#   git pull origin main
#   export ADMIN_PASSWORD='your-password'
#   bash docs/benny-boys/reset-benny-boys.sh
#
# Optional:
#   export ADMIN_EMAIL='admin@leovorno.com'
#   export API_URL='https://api.marinapizzas.com.au/api'
#   bash docs/benny-boys/reset-benny-boys.sh --dry-run
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BENNY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
API_URL="${API_URL:-https://api.marinapizzas.com.au/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@leovorno.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
DRY_RUN=0

for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=1
  fi
done

if [[ -z "$ADMIN_PASSWORD" && "$DRY_RUN" -eq 0 ]]; then
  echo "ERROR: Set admin password (not stored in git):"
  echo "  export ADMIN_PASSWORD='your-password'"
  echo "  export ADMIN_EMAIL='admin@leovorno.com'   # optional"
  exit 1
fi

echo "=============================================="
echo " Benny Boy's — full store reset"
echo "=============================================="
echo " Repo:   $REPO_ROOT"
echo " API:    $API_URL"
echo " Admin:  $ADMIN_EMAIL"
echo ""

echo "→ Step 1/3: Delete ALL stores from database (no JWT needed)…"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [dry-run] would delete all brands via delete-stores.mjs or SQL"
else
  deleted=0
  if docker compose -f "$COMPOSE_FILE" ps api --status running -q 2>/dev/null | grep -q .; then
    docker compose -f "$COMPOSE_FILE" cp scripts/delete-stores.mjs api:/app/scripts/delete-stores.mjs 2>/dev/null || true
    mkdir -p scripts
    if [[ -f scripts/delete-stores.mjs ]]; then
      if docker compose -f "$COMPOSE_FILE" exec -T api node scripts/delete-stores.mjs --all; then
        deleted=1
      fi
    fi
  fi

  if [[ "$deleted" -eq 0 ]]; then
    echo "  Using SQL fallback (postgres)…"
    docker compose -f "$COMPOSE_FILE" exec -T postgres psql \
      -U "${POSTGRES_USER:-piza}" \
      -d "${POSTGRES_DB:-marinapizzas}" \
      -v ON_ERROR_STOP=1 \
      -c "BEGIN;
          DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders);
          DELETE FROM orders;
          DELETE FROM brands;
          COMMIT;"
  fi
  echo "  ✓ All stores removed"
fi

echo ""
echo "→ Step 2/3: Login as platform admin…"
if [[ "$DRY_RUN" -eq 1 ]]; then
  export ADMIN_TOKEN="dry-run"
  echo "  [dry-run] skip login"
else
  export ADMIN_TOKEN
  ADMIN_TOKEN="$(API_URL="$API_URL" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    python3 "$BENNY_DIR/login_admin.py")"
  echo "  ✓ Got API token (${#ADMIN_TOKEN} chars)"
fi

echo ""
echo "→ Step 3/3: Create Benny Boy's + import menu…"
EXTRA=()
if [[ "$DRY_RUN" -eq 1 ]]; then
  EXTRA+=(--dry-run)
fi

cd "$BENNY_DIR"
if [[ ! -d bunny-boys-images ]] || [[ $(find bunny-boys-images -type f 2>/dev/null | wc -l) -lt 10 ]]; then
  echo "→ Downloading menu images…"
  python3 download-bunny-boys-images.py || true
fi

python3 setup-benny-boys-store.py \
  --brand benny-boys \
  --skip-clear \
  --download-images \
  "${EXTRA[@]}"

echo ""
echo "=============================================="
echo " Done. Open https://marinapizzas.com.au/admin/dashboard"
echo " You should see ONE store: Benny Boy's"
echo "=============================================="
