# Import Word menu + images on the server

Imports from `Benny_Boys_Pizza_Menu final v1.docx` + `pic/` into a store you choose (or `--brand`).

## One-time: upload assets to the droplet

From your PC (`D:\pizza`):

```powershell
# replace USER and DROPLET_IP
scp "D:\pizza\Benny_Boys_Pizza_Menu final v1.docx" USER@DROPLET_IP`:~/piza/piza-api/docs/benny-boys/menu-import/
scp -r "D:\pizza\pic" USER@DROPLET_IP`:~/piza/piza-api/docs/benny-boys/menu-import/
```

Or with `rsync` if you have it. Create the folder first on the server:

```bash
mkdir -p ~/piza/piza-api/docs/benny-boys/menu-import
```

## Run on the droplet

```bash
cd ~/piza/piza-api
git pull origin main

export ADMIN_EMAIL='admin@leovorno.com'
export ADMIN_PASSWORD='your-password'
export API_URL='https://api.marinapizzas.com.au/api'

# Preview parse + image matches (no write)
bash docs/benny-boys/import-store-menu.sh --parse-only

# Dry-run against API (no writes if script dry-run paths)
bash docs/benny-boys/import-store-menu.sh --brand benny-boys --dry-run

# Real import (clears that store’s menu first)
bash docs/benny-boys/import-store-menu.sh --brand benny-boys --replace
```

Without `--brand`, the script lists stores and asks you to pick a number (needs an interactive SSH session).

## Notes

- Images under `pic/**/pos/` are lower priority; web-quality folders are preferred.
- Needs `python3` on the droplet host (same as existing Benny Boys scripts).
- Large `pic/` files are **not** in git — only the importer scripts are.
