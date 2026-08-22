# Benny Boy's Pizza — store setup

Import **Benny Boy's Pizza (Wantirna South)** menu (61 items) into the Marina API.

## On the Droplet

```bash
cd ~/piza/piza-api
git pull origin main

# Get token from admin dashboard (browser DevTools → leovorno-auth-token)
export ADMIN_TOKEN='eyJ...'

cd docs/benny-boys
chmod +x setup-benny-boys.sh setup-benny-boys-store.py

# Preview
./setup-benny-boys.sh --dry-run

# Full import (new slug benny-boys, clears bunny-boys + leovorno demo menus)
./setup-benny-boys.sh

# Or reuse existing bunny-boys slug
./setup-benny-boys.sh bunny-boys
```

Storefront after import: `https://marinapizzas.com.au/benny-boys` or `/bunny-boys`
