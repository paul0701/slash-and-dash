// Run: node tests/local.test.mjs  (uses a local Netlify Blobs server)
import { BlobsServer } from "@netlify/blobs/server";
import assert from "node:assert/strict";
import fs from "node:fs";
const dir = "/tmp/sd-blobs-test"; fs.rmSync(dir, { recursive: true, force: true });
const server = new BlobsServer({ directory: dir, token: "tok", port: 9876 });
await server.start();
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: "http://localhost:9876", siteID: "site", token: "tok" })).toString("base64");
process.env.SYNC_SECRET = "s3cret";
const auth = (await import("../netlify/functions/auth.mjs")).default;
const sync = (await import("../netlify/functions/sync.mjs")).default;
const lb = (await import("../netlify/functions/leaderboard.mjs")).default;
const rec = (await import("../netlify/functions/recovery.mjs")).default;
const { weekId, mailer } = await import("../netlify/lib/core.mjs");
const post = (u, b, t) => new Request("http://x" + u, { method: "POST", headers: { "content-type": "application/json", ...(t ? { authorization: "Bearer " + t } : {}) }, body: JSON.stringify(b) });
const call = async (fn, req) => { const r = await fn(req); return { s: r.status, j: await r.json() }; };
const wk = weekId();
let r = await call(auth, post("/api/auth/register", { username: "Ann_1", pin: "123456" })); assert.equal(r.s, 201);
const t1 = r.j.token;
assert.equal((await call(auth, post("/api/auth/register", { username: "ann_1", pin: "123456" }))).s, 409);
r = await call(sync, post("/api/sync", { game: "slashdash", best: 300, week: wk, week_best: 120 }, t1));
assert.deepEqual([r.j.best, r.j.rank, r.j.week_best, r.j.week_rank], [300, 1, 120, 1]);
const t2 = (await call(auth, post("/api/auth/register", { username: "Bob", pin: "654321" }))).j.token;
r = await call(sync, post("/api/sync", { game: "slashdash", best: 100, week: wk, week_best: 150 }, t2));
assert.deepEqual([r.j.rank, r.j.week_rank], [2, 1]);
r = await call(sync, post("/api/sync", { game: "slashdash", best: 10, week: "2000-W01", week_best: 999 }, t1));
assert.deepEqual([r.j.best, r.j.week_best], [300, 120]);
r = await call(lb, new Request("http://x/api/leaderboard?game=slashdash&period=week"));
assert.deepEqual(r.j.entries.map((e) => e.username), ["Bob", "Ann_1"]);
r = await call(lb, new Request("http://x/api/leaderboard?game=slashdash"));
assert.deepEqual(r.j.entries.map((e) => e.best), [300, 150]);
assert.equal((await call(auth, post("/api/auth/change-pin", { pin: "000000", new_pin: "111111" }, t1))).s, 401);
r = await call(auth, post("/api/auth/change-pin", { pin: "123456", new_pin: "111111" }, t1)); assert.equal(r.s, 200);
const t3 = r.j.token;
assert.equal((await call(sync, new Request("http://x/api/me", { headers: { authorization: "Bearer " + t1 } }))).s, 401);
assert.equal((await call(sync, new Request("http://x/api/me", { headers: { authorization: "Bearer " + t3 } }))).s, 200);
assert.equal((await call(auth, post("/api/auth/login", { username: "ANN_1", pin: "111111" }))).s, 200);
for (let i = 0; i < 5; i++) await call(auth, post("/api/auth/login", { username: "bob", pin: "999999" }));
assert.equal((await call(auth, post("/api/auth/login", { username: "bob", pin: "654321" }))).s, 429);
// ---- recovery email and PIN reset ----
const sent = [];
mailer.send = async (m) => { sent.push(m); };
delete process.env.RESEND_API_KEY; delete process.env.RESEND_FROM;
assert.equal((await call(rec, post("/api/auth/forgot", { username: "Ann_1" }))).s, 503);
process.env.RESEND_API_KEY = "k"; process.env.RESEND_FROM = "Slash <x@example.com>";
assert.equal((await call(auth, post("/api/auth/register", { username: "Cara", pin: "222222", email: "not-an-email" }))).s, 400);
r = await call(auth, post("/api/auth/register", { username: "Cara", pin: "222222", email: " Cara.Smith@Example.COM " }));
assert.equal(r.s, 201); assert.match(r.j.email, /^c\*+@example\.com$/);
const cara = r.j.token;
assert.equal((await call(auth, post("/api/auth/login", { username: "cara", pin: "222222" }))).j.email, r.j.email);
r = await call(sync, new Request("http://x/api/me", { headers: { authorization: "Bearer " + cara } }));
assert.match(r.j.email, /^c\*+@example\.com$/);
// add, change, remove (needs the PIN)
const noMail = (await call(auth, post("/api/auth/register", { username: "Dave", pin: "333333" }))).j;
assert.equal(noMail.email, null);
assert.equal((await call(rec, post("/api/auth/set-email", { pin: "000000", email: "d@example.com" }, noMail.token))).s, 401);
assert.equal((await call(rec, post("/api/auth/set-email", { pin: "333333", email: "nope" }, noMail.token))).s, 400);
assert.equal((await call(rec, post("/api/auth/set-email", { pin: "333333", email: "dave@example.com" }))).s, 401);
r = await call(rec, post("/api/auth/set-email", { pin: "333333", email: "dave@example.com" }, noMail.token));
assert.equal(r.s, 200); assert.match(r.j.email, /^d\*+@example\.com$/);
// forgot: same answer for unknown names and names with no email, and nothing is sent
const generic = (await call(rec, post("/api/auth/forgot", { username: "Nobody_x" })));
assert.equal(generic.s, 200);
const none = await call(rec, post("/api/auth/forgot", { username: "Ann_1" }));
assert.deepEqual(none.j, generic.j); assert.equal(sent.length, 0);
// forgot for real
r = await call(rec, post("/api/auth/forgot", { username: "DAVE" })); assert.equal(r.s, 200); assert.deepEqual(r.j, generic.j);
assert.equal(sent.length, 1); assert.equal(sent[0].to, "dave@example.com");
const code = sent[0].text.match(/is (\d{6})\./)[1];
assert.equal((await call(rec, post("/api/auth/forgot", { username: "dave" }))).s, 429);
// wrong code, bad new pin, then the right one
assert.equal((await call(rec, post("/api/auth/reset", { username: "dave", code: code === "123456" ? "654321" : "123456", pin: "444444" }))).s, 403);
assert.equal((await call(rec, post("/api/auth/reset", { username: "dave", code, pin: "12" }))).s, 400);
r = await call(rec, post("/api/auth/reset", { username: "dave", code, pin: "444444" }));
assert.equal(r.s, 200); assert.equal(r.j.username, "Dave");
assert.equal((await call(sync, new Request("http://x/api/me", { headers: { authorization: "Bearer " + noMail.token } }))).s, 401);
assert.equal((await call(sync, new Request("http://x/api/me", { headers: { authorization: "Bearer " + r.j.token } }))).s, 200);
assert.equal((await call(auth, post("/api/auth/login", { username: "dave", pin: "333333" }))).s, 401);
assert.equal((await call(auth, post("/api/auth/login", { username: "dave", pin: "444444" }))).s, 200);
assert.equal((await call(rec, post("/api/auth/reset", { username: "dave", code, pin: "555555" }))).s, 403); // a code works once
// five wrong guesses kill a code, even the right one afterwards
process.env.RESEND_FROM = "Slash <x@example.com>";
await call(auth, post("/api/auth/register", { username: "Eve", pin: "666666", email: "eve@example.com" }));
await call(rec, post("/api/auth/forgot", { username: "eve" }));
const eveCode = sent[1].text.match(/is (\d{6})\./)[1];
for (let i = 0; i < 5; i++) await call(rec, post("/api/auth/reset", { username: "eve", code: eveCode === "000000" ? "111111" : "000000", pin: "777777" }));
assert.equal((await call(rec, post("/api/auth/reset", { username: "eve", code: eveCode, pin: "777777" }))).s, 429);
// removing the email switches recovery off for that account
r = await call(rec, post("/api/auth/set-email", { pin: "666666", email: "" }, (await call(auth, post("/api/auth/login", { username: "eve", pin: "666666" }))).j.token));
assert.equal(r.j.email, null);
delete process.env.SYNC_SECRET;
r = await call(auth, post("/api/auth/register", { username: "NoSecret", pin: "123456" }));
assert.equal(r.s, 500); assert.match(r.j.detail, /SYNC_SECRET/);
assert.equal((await call(sync, post("/api/sync", { game: "slashdash", best: 1 }, t3))).s, 500);
await server.stop();
console.log("All Netlify function tests passed");
