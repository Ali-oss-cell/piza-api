# Menu import assets (not committed — upload on the droplet)

Put these on the server under this folder:

```text
docs/benny-boys/menu-import/
  Benny_Boys_Pizza_Menu final v1.docx
  pic/          ← all product photos
```

Then run:

```bash
cd ~/piza/piza-api
export ADMIN_PASSWORD='your-password'
bash docs/benny-boys/import-store-menu.sh --brand benny-boys --replace
```

See [IMPORT_MENU.md](./IMPORT_MENU.md) for full steps.
