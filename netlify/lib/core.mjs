import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const TOKEN_DAYS = 180;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
export const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const PIN_RE = /^\d{6}$/;
export const GAME_RE = /^[a-z0-9-]{1,32}$/;
export { MAX_FAILS, LOCK_MS };

export const players = () => getStore("players");
export const boards = () => getStore("leaderboards");

export function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
export const fail = (status, detail) => json(status, { detail });

function secret() {
  const s = process.env.SYNC_SECRET;
  if (!s) throw new Error("SYNC_SECRET env var is not set");
  return s;
}
export const setupError = () => (process.env.SYNC_SECRET ? null
  : fail(500, "Server not set up: add SYNC_SECRET in Netlify environment variables, then redeploy"));
const b64u = (buf) => Buffer.from(buf).toString("base64url");

export function makeToken(key, tv = 0) {
  const payload = b64u(JSON.stringify({ sub: key, tv, exp: Date.now() + TOKEN_DAYS * 864e5 }));
  const sig = b64u(crypto.createHmac("sha256", secret()).update(payload).digest());
  return payload + "." + sig;
}

function readToken(tok) {
  const [payload, sig] = (tok || "").split(".");
  if (!payload || !sig) return null;
  const want = b64u(crypto.createHmac("sha256", secret()).update(payload).digest());
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  return data.exp > Date.now() ? data : null;
}

export function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(pin, salt, 32).toString("hex") };
}
export function pinMatches(pin, user) {
  const h = Buffer.from(hashPin(pin, user.salt).hash, "hex");
  return crypto.timingSafeEqual(h, Buffer.from(user.hash, "hex"));
}

export async function currentUser(req) {
  const h = req.headers.get("authorization") || "";
  const tok = h.startsWith("Bearer ") ? readToken(h.slice(7)) : null;
  if (!tok) return { error: "Session expired, please sign in again" };
  const user = await players().get(tok.sub, { type: "json" });
  if (!user) return { error: "Account not found" };
  if ((tok.tv || 0) !== (user.tv || 0)) return { error: "Your PIN was changed. Please sign in again" };
  return { key: tok.sub, user };
}

export const userOut = (key, u) => ({ token: makeToken(key, u.tv || 0), username: u.username, games: u.games || {} });

// returns an error Response, or null when the PIN is right (always saves fail counters)
export async function checkPin(key, user, pin, wrongMsg) {
  if (user.lockUntil > Date.now()) return fail(429, "Too many tries. Wait 15 minutes and try again");
  const ok = pinMatches(pin, user);
  if (ok) { user.fails = 0; user.lockUntil = 0; }
  else {
    user.fails = (user.fails || 0) + 1;
    if (user.fails >= MAX_FAILS) { user.fails = 0; user.lockUntil = Date.now() + LOCK_MS; }
  }
  await players().setJSON(key, user);
  return ok ? null : fail(401, wrongMsg);
}

export function weekId(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - y0) / 864e5 + 1) / 7);
  return t.getUTCFullYear() + "-W" + String(wk).padStart(2, "0");
}

export const clamp = (n) => Math.max(0, Math.min(Math.floor(Number(n) || 0), 1e7));

export async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}
