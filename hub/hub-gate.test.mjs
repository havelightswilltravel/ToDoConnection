// Run: node --test lib/hub-gate.test.mjs   (no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HUB_SHARED_SECRET = "x".repeat(40);
process.env.HUB_ENFORCE = "1";
process.env.HUB_ORIGIN = "https://hub.hlwt.com https://hlwt-hub.vercel.app";
const g = await import("./hub-gate.mjs");

const APP = "https://app.hlwt.com";
const cfg = {
  pages: { "/": "fin.ar", "/pnl": "fin.pnl", "/quote/*": "sales.quotes" },
  defaultPage: "fin.ar",
  isPublic: (p) => p === "/health",
};
const req = (path, headers = {}, method = "GET") => new Request(APP + path, { method, headers });
async function sessionCookie(pages, iatAgo = 0, origin = APP) {
  const ticket = await g.mintTicket({ origin, email: "a@hlwt.com", name: "A", pages });
  // age the ticket by re-signing with an older iat
  let t = ticket;
  if (iatAgo) {
    const now = Math.floor(Date.now() / 1000) - iatAgo;
    t = await g.signJwt({ iss: "hlwt-hub", typ: g.TICKET_TYP, aud: origin, sub: "a@hlwt.com", pages, iat: now, exp: now + 3600 });
  }
  const r = (await g.hubGate(req(`/hub/callback?ticket=${t}&next=/pnl`), cfg)).response;
  assert.equal(r.status, 302);
  return r.headers.get("set-cookie").split(";")[0];
}

test("jwt round trip, wrong secret, wrong aud, expired", async () => {
  const now = Math.floor(Date.now() / 1000);
  const p = { iss: "hlwt-hub", typ: "hub-ticket", aud: APP, sub: "a@x.com", pages: [], iat: now, exp: now + 60 };
  const t = await g.signJwt(p);
  assert.equal((await g.verifyJwt(t, { typ: "hub-ticket", aud: APP })).sub, "a@x.com");
  assert.equal(await g.verifyJwt(t, { typ: "hub-ticket", aud: "https://other.hlwt.com" }), null);
  assert.equal(await g.verifyJwt(t, { typ: "hub-session", aud: APP }), null);
  assert.equal(await g.verifyJwt(t, { typ: "hub-ticket", aud: APP }, "y".repeat(40)), null);
  const old = await g.signJwt({ ...p, exp: now - 1 });
  assert.equal(await g.verifyJwt(old, { typ: "hub-ticket", aud: APP }), null);
  assert.equal(await g.verifyJwt(t.slice(0, -2) + "aa", { typ: "hub-ticket", aud: APP }), null);
});

test("callback sets a host-only Lax cookie and sanitises next", async () => {
  const t = await g.mintTicket({ origin: APP, email: "a@hlwt.com", pages: ["fin.ar"] });
  const r = (await g.hubGate(req(`/hub/callback?ticket=${t}&next=//evil.com/x`), cfg)).response;
  assert.equal(r.headers.get("location"), APP + "/?__hub=1");
  const c = r.headers.get("set-cookie");
  assert.match(c, /^__Host-hlwt_hub=/);
  assert.match(c, /SameSite=Lax/);
  assert.doesNotMatch(c, /Domain=/);
});

test("vercel.app gets a partitioned SameSite=None cookie", async () => {
  const origin = "https://hlwt-portal.vercel.app";
  const t = await g.mintTicket({ origin, email: "a@hlwt.com", pages: ["sales.quotes"] });
  const r = (await g.hubGate(new Request(`${origin}/hub/callback?ticket=${t}`), cfg)).response;
  assert.match(r.headers.get("set-cookie"), /SameSite=None; Partitioned/);
});

test("a ticket for another app is refused", async () => {
  const t = await g.mintTicket({ origin: "https://other.hlwt.com", email: "a@hlwt.com", pages: ["fin.ar"] });
  const r = (await g.hubGate(req(`/hub/callback?ticket=${t}`), cfg)).response;
  assert.equal(r.status, 401);
});

test("direct visit with no session → hub page (top level)", async () => {
  const r = (await g.hubGate(req("/pnl", { "sec-fetch-dest": "document" }), cfg)).response;
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://hub.hlwt.com/app/fin.pnl");
});

test("in the hub frame with no session → hub /go and back", async () => {
  const r = (await g.hubGate(req("/pnl?m=1", { "sec-fetch-dest": "iframe" }), cfg)).response;
  assert.equal(r.headers.get("location"), "https://hub.hlwt.com/go/fin.pnl?next=%2Fpnl%3Fm%3D1");
});

test("granted + fresh passes; __hub marker is cleaned once", async () => {
  const cookie = await sessionCookie(["fin.ar", "fin.pnl"]);
  const back = await g.hubGate(req("/pnl?__hub=1", { cookie, "sec-fetch-dest": "iframe" }), cfg);
  assert.equal(back.response.headers.get("location"), APP + "/pnl");
  const ok = await g.hubGate(req("/pnl", { cookie, "sec-fetch-dest": "iframe" }), cfg);
  assert.equal(ok.response, undefined);
  assert.equal(ok.session.sub, "a@hlwt.com");
});

test("not granted → 403 page, API → 403 json", async () => {
  const cookie = await sessionCookie(["fin.ar"]);
  const r = (await g.hubGate(req("/pnl", { cookie, "sec-fetch-dest": "document" }), cfg)).response;
  assert.equal(r.status, 403);
  const api = (await g.hubGate(req("/api/x", { cookie }, "POST"), { ...cfg, apiPages: () => ["fin.pnl"] })).response;
  assert.equal(api.status, 403);
  const apiOk = await g.hubGate(req("/api/x", { cookie }, "POST"), cfg);
  assert.equal(apiOk.response, undefined);
});

test("stale page load refreshes through the hub; API still works", async () => {
  const cookie = await sessionCookie(["fin.ar", "fin.pnl"], 3600);
  const r = (await g.hubGate(req("/pnl", { cookie, "sec-fetch-dest": "iframe" }), cfg)).response;
  assert.match(r.headers.get("location"), /^https:\/\/hub\.hlwt\.com\/go\/fin\.pnl/);
  const top = (await g.hubGate(req("/pnl", { cookie, "sec-fetch-dest": "document" }), cfg)).response;
  assert.match(top.headers.get("location"), /\/go\/fin\.pnl/);
  const api = await g.hubGate(req("/api/x", { cookie }), cfg);
  assert.equal(api.response, undefined);
});

test("no session API → 401; public paths pass; prefix pages", async () => {
  assert.equal((await g.hubGate(req("/api/x"), cfg)).response.status, 401);
  assert.equal((await g.hubGate(req("/health", { "sec-fetch-dest": "document" }), cfg)).response, undefined);
  assert.equal(g.pageFor("/quote/123/edit", cfg.pages), "sales.quotes");
  assert.equal(g.pageFor("/quotes", cfg.pages), null);
  assert.equal(g.pageFor("/", cfg.pages), "fin.ar");
});

test("cookie refused by the browser → no loop", async () => {
  const r = (await g.hubGate(req("/pnl?__hub=1", { "sec-fetch-dest": "iframe" }), cfg)).response;
  assert.equal(r.status, 200);
  assert.match(await r.text(), /new tab/);
});

test("frame-ancestors lists only the hub origins", () => {
  assert.equal(g.hubFrameAncestors(), "https://hub.hlwt.com https://hlwt-hub.vercel.app");
});

test("server-side read from headers", async () => {
  const cookie = await sessionCookie(["fin.ar"]);
  const h = new Headers({ cookie, host: "app.hlwt.com", "x-forwarded-proto": "https" });
  assert.equal((await g.sessionFromHeaders((n) => h.get(n))).sub, "a@hlwt.com");
  const h2 = new Headers({ cookie, host: "other.hlwt.com", "x-forwarded-proto": "https" });
  assert.equal(await g.sessionFromHeaders((n) => h2.get(n)), null);
});
