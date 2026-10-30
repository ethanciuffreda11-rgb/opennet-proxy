# OpenNet — school-friendly web proxy (Render)

Browser-only proxy: open the Render URL on a Chromebook or school laptop, search or paste any site, and pages load through your server.

## Why this works on school devices

- **No install** — just a normal HTTPS webpage (Chromebooks / managed browsers OK)
- **Traffic goes to your Render host** — many filters only block the destination domain, not your proxy hostname
- **Links & assets rewritten** — navigation, images, CSS, forms, and many XHR/fetch calls stay on the proxy

If school blocks `onrender.com` itself, deploy under a custom domain or another host.

## Deploy on Render

1. Push this folder to GitHub
2. In [Render](https://render.com): **New → Web Service** → connect the repo
3. Settings:
   - **Build:** `npm install`
   - **Start:** `npm start`
   - **Instance:** Free
4. Open `https://YOUR-SERVICE.onrender.com` on the school device and bookmark it

Or use Blueprint: connect the repo and apply `render.yaml`.

## Local run

```bash
npm install
npm start
```

Visit http://localhost:3000

## Notes

- Heavy JavaScript apps (some social/video sites) may only partly work — that’s normal for HTML proxies
- Follow your school’s acceptable-use rules
