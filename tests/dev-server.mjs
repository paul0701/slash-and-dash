// Run: node tests/dev-server.mjs   (serves pwa/ and the functions on http://localhost:8789, reset emails print here and at /dev/last-email)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { BlobsServer } from "@netlify/blobs/server";
const dir = "/tmp/sd-blobs-dev"; fs.rmSync(dir, { recursive: true, force: true });
const blobs = new BlobsServer({ directory: dir, token: "tok", port: 9877 });
await blobs.start();
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: "http://localhost:9877", siteID: "site", token: "tok" })).toString("base64");
process.env.SYNC_SECRET = "dev-secret"; process.env.RESEND_API_KEY = "dev"; process.env.RESEND_FROM = "dev@example.com";
const { mailer } = await import("../netlify/lib/core.mjs");
let last = null;
mailer.send = async (m) => { last = m; console.log("\n--- EMAIL to", m.to, "---\n" + m.text + "\n"); };
const fns = [];
for (const f of fs.readdirSync("netlify/functions")) {
  const mod = await import("../netlify/functions/" + f);
  const p = mod.config.path; fns.push({ paths: Array.isArray(p) ? p : [p], run: mod.default });
}
const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8789");
  if (url.pathname === "/dev/last-email") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(last)); }
  const fn = fns.find((f) => f.paths.includes(url.pathname));
  if (fn) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await fn.run(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let f = path.join("pwa", url.pathname === "/" ? "index.html" : url.pathname);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
}).listen(8789, () => console.log("Slash & Dash dev server on http://localhost:8789"));
