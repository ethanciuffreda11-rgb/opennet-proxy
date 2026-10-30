# OpenNet — working school web proxy (Ultraviolet)

Uses **Ultraviolet + Epoxy + Wisp** (service-worker proxy). That stack can actually run sites like YouTube and Discord — a plain HTML rewriter cannot.

## Live

https://opennet-proxy.onrender.com

## Local

```bash
npm install
npm start
```

Open http://localhost:3000 — service workers need HTTPS in production (Render is fine).

## Deploy

Pushes to `master` auto-deploy on Render. Or Blueprint from `render.yaml`.

## Notes

- First visit installs a service worker; wait a second before searching
- Free Render apps sleep when idle — cold start can take ~1 minute
- Some sites still break; that’s normal for any web proxy
