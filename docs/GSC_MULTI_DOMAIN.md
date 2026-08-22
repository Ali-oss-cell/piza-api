# Google Search Console — multi-domain / multi-store

## Do you need a sitemap file per domain in the database?

**No.** Marina serves a **dynamic** `https://{host}/sitemap.xml` for each request Host. That sitemap only lists URLs for the store resolved from that host (or path prefix). Google expects this pattern.

## What you must do per custom domain

1. Add the domain in **HQ → Domains** (or store Infrastructure) and **Sync Traefik**.
2. Point DNS (A/AAAA or CNAME) at the Droplet.
3. In [Google Search Console](https://search.google.com/search-console):
   - Add a **Domain** or **URL-prefix** property for that host (e.g. `https://bennyboys.com.au`).
   - Verify ownership (DNS TXT preferred, or HTML tag).
4. For HTML-tag verification: paste the token into **Admin → System Settings → Search Console** (`googleSiteVerification`) for that store, save, then complete verification in GSC.
5. Submit sitemap: `https://{that-host}/sitemap.xml`.
6. Confirm `https://{that-host}/robots.txt` includes `Sitemap: https://{that-host}/sitemap.xml`.

## Path stores (e.g. marinapizzas.com.au/bunny-boys)

- Usually **one** GSC property for `marinapizzas.com.au`.
- The primary sitemap already includes path-prefixed URLs.
- Optional: create a URL-prefix property for `/bunny-boys` if you want reporting split.

## Avoid these mistakes

| Mistake | Result |
|---------|--------|
| Submitting store A’s URLs under store B’s GSC property | Coverage / “URL not under property” errors |
| One shared static sitemap listing every domain | Same conflict |
| Forgetting Traefik sync after adding a host | Site/sitemap unreachable on that host |

## In-app helpers

- **SEO Dashboard → Dashboard**: launch checklist with sitemap/robots links and GSC steps.
- **Fill empty SEO from store**: copies name, tagline, address, phone into page meta/heroes.
- **Create starter blog draft**: one welcome post per store (edit/publish when ready).
- New stores auto-bootstrap SEO defaults + starter draft on create.
