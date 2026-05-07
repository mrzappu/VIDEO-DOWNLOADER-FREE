# Simple Downloader (no folders)

This project is **only files** in the repo root (no folders):
- `index.html` → Frontend (Vercel)
- `server.js`, `package.json`, `Dockerfile` → Backend API (Render)
- `vercel.json` → Vercel rewrites `/mates/*` and `/downloads/*` to Render

## Deploy backend on Render (Docker)
1. Push this repo to GitHub
2. Render → New Web Service → **Docker**
3. Deploy (Render will use `Dockerfile` in root)

After deploy, you get URL like:
`https://xxxx.onrender.com`

## If YouTube shows “Sign in to confirm you’re not a bot”
On some cloud IPs (Render free), YouTube may block downloads.

Optional fix: provide your own cookies to yt-dlp (do **NOT** commit cookies to GitHub).
1. Create a `cookies.txt` file (Netscape format) from your own browser/account
2. Base64 encode it and set it in Render env var:
   - `YTDLP_COOKIES_B64 = <base64-of-cookies.txt>`
3. Redeploy Render

Check:
`/healthz` will show `cookies_enabled: true`.

## Deploy frontend on Vercel
1. Import same GitHub repo to Vercel
2. Edit `vercel.json` and replace:
`https://YOUR-RENDER-BACKEND.onrender.com`
with your real Render URL
3. Deploy

## Local test (optional)
- Backend (needs Docker):
  - `docker build -t vd6s-backend .`
  - `docker run --rm -p 3000:3000 vd6s-backend`
- Frontend:
  - open `index.html` with any static server
  - set `window.API_BASE = "http://localhost:3000"` in `index.html`
