# GitHub Actions auto-deploy (Phase 1)

Push to `main` deploys that app to the Droplet over SSH.

## Secrets (each repo)

| Name | Example |
|------|---------|
| `DROPLET_HOST` | `170.64.219.198` |
| `DROPLET_USER` | `root` |
| `DROPLET_SSH_KEY` | private key PEM / OpenSSH |
| `DROPLET_SSH_PORT` | optional, default `22` |

## Repos → service

| Repo | Workflow | Service |
|------|----------|---------|
| `piza-api` | `.github/workflows/deploy.yml` | `api` |
| `piza-front` | `.github/workflows/deploy.yml` | `web` (stops `pos` during build) |
| `pizza_pos` | `.github/workflows/deploy.yml` | `pos` |

## Manual run

GitHub → Actions → **Deploy …** → **Run workflow**.

## Notes

- Same concurrency group `deploy-droplet` so deploys don’t overlap.
- `COMPOSE_BAKE=false` avoids the buildx warning on small Droplets.
- Web builds are heavy; later we can build images in CI and only `pull` on the server.
