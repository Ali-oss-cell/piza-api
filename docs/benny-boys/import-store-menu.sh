#!/usr/bin/env bash
# Import Word menu + pic/ images into a chosen store (runs on the droplet).
#
# 1) Upload assets once:
#      mkdir -p ~/piza/piza-api/docs/benny-boys/menu-import
#      # from your PC (PowerShell / scp):
#      scp "Benny_Boys_Pizza_Menu final v1.docx" user@DROPLET:~/piza/piza-api/docs/benny-boys/menu-import/
#      scp -r pic user@DROPLET:~/piza/piza-api/docs/benny-boys/menu-import/
#
# 2) On the droplet:
#      cd ~/piza/piza-api
#      git pull origin main
#      export ADMIN_PASSWORD='your-password'
#      bash docs/benny-boys/import-store-menu.sh --brand benny-boys --replace
#
# Flags are passed through to import-store-menu.py (--dry-run, --parse-only, --brand, --replace, …).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

API_URL="${API_URL:-https://api.marinapizzas.com.au/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@leovorno.com}"

DOCX="${MENU_DOCX:-$DIR/menu-import/Benny_Boys_Pizza_Menu final v1.docx}"
PIC="${MENU_PIC:-$DIR/menu-import/pic}"

if [[ ! -f "$DOCX" ]]; then
  echo "ERROR: Menu Word file not found:"
  echo "  $DOCX"
  echo "Upload it to docs/benny-boys/menu-import/ or set MENU_DOCX=..."
  exit 1
fi

if [[ ! -d "$PIC" ]]; then
  echo "ERROR: pic/ folder not found:"
  echo "  $PIC"
  echo "Upload images to docs/benny-boys/menu-import/pic/ or set MENU_PIC=..."
  exit 1
fi

# parse-only / dry-run with write-json don't need a password
NEED_AUTH=1
for arg in "$@"; do
  if [[ "$arg" == "--parse-only" ]]; then
    NEED_AUTH=0
  fi
done

if [[ "$NEED_AUTH" -eq 1 && -z "${ADMIN_TOKEN:-}" ]]; then
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    echo "ERROR: Set ADMIN_PASSWORD (or ADMIN_TOKEN):"
    echo "  export ADMIN_PASSWORD='your-password'"
    exit 1
  fi
  echo "→ Logging in as $ADMIN_EMAIL…"
  export ADMIN_TOKEN
  ADMIN_TOKEN="$(API_URL="$API_URL" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    python3 "$DIR/login_admin.py")"
  echo "  ✓ Login OK"
fi

export API_URL
export MENU_DOCX="$DOCX"
export MENU_PIC="$PIC"

echo "→ Docx: $DOCX"
echo "→ Pics: $PIC"
echo "→ API:  $API_URL"
echo ""

python3 "$DIR/import-store-menu.py" --docx "$DOCX" --pic "$PIC" --api "$API_URL" "$@"

echo ""
echo "Done. Check Admin → Menu for the selected store."
