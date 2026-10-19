# Slash & Dash – Netlify deploy

1. Netlify > Site configuration > Environment variables > Add a variable: key `SYNC_SECRET`, value = any long random string, scopes must include Functions. Keep it secret and never change it (changing it signs everyone out).
2. Deploy AFTER adding the variable: drag-and-drop this whole unzipped folder onto Deploys, or connect a GitHub repo. Env var changes only apply to the next deploy.
3. Check: sign in on the game. If you see "Server not set up: add SYNC_SECRET...", step 1 or 2 was missed. The game is in `pwa/`, the API lives at `/api/*` (Netlify Functions + Netlify Blobs, no extra setup).

API (same for every game, change `game`):
- POST /api/auth/register  {username, pin}
- POST /api/auth/login     {username, pin}
- POST /api/auth/change-pin {pin, new_pin} (Bearer token) – signs out other devices
- GET  /api/me             (Bearer token)
- POST /api/sync           {game, best, theme, week, week_best} (Bearer token) – best score wins, returns rank + week_rank
- GET  /api/leaderboard?game=slashdash&period=all|week  (weekly board resets Monday 00:00 UTC)

PIN recovery (optional): create a free account at resend.com, then add `RESEND_API_KEY` and `RESEND_FROM` (for example `Slash and Dash <noreply@yourdomain>`) as environment variables and redeploy. Without them the Forgot your PIN button tells players recovery is not switched on yet; everything else still works. Players add an email when they create an account, or later with the Recovery email button.

Local check of the functions: `npm install` then `node tests/local.test.mjs`.

GitHub Pages only serves static files, so sign-in/leaderboard only work on the Netlify copy. The game still plays fully offline everywhere.
