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

