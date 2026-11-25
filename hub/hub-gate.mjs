// ─────────────────────────────────────────────────────────────────────────────
// HLWT Hub gate. The same file lives in every HLWT app (keep the copies equal).
//
// With HUB_ENFORCE=1 the HLWT Hub (https://hub.hlwt.com) is the ONLY way in:
//   • The hub signs people in with Microsoft and decides which pages they may open.
//   • To open a page, the hub sends the browser to <app>/hub/callback?ticket=…, a
//     60-second ticket signed with HUB_SHARED_SECRET that names the person and the
//     pages of THIS app they may open (owners get every page).
//   • The app swaps the ticket for its own short session cookie and from then on
//     checks that cookie on every request. No app shows a sign-in screen.
//   • No cookie, an expired one, or a page that isn't granted → back to the hub.
//     Opened directly in a browser tab, that is https://hub.hlwt.com/app/<pageId>.
//     Inside the hub's frame, a page older than HUB_FRESH_SECONDS quietly fetches a
//     fresh ticket from the hub (so access removed in the hub takes effect within
//     minutes) and comes straight back.
//
// Only Web APIs are used (crypto.subtle, TextEncoder, Response), so this runs in
// Next.js middleware, Next.js server code and Vercel Routing Middleware alike.
//
// Env:
//   HUB_ENFORCE=1        turn the gate on (unset = the app behaves exactly as before)
//   HUB_SHARED_SECRET    same value as on the hub (32+ random characters)
//   HUB_ORIGIN           default https://hub.hlwt.com; the first entry is where people
//                        are sent, all entries may frame the app (space/comma list,
//                        e.g. "https://hub.hlwt.com https://hlwt-hub.vercel.app")
//   HUB_FRESH_SECONDS    optional, default 600: how old a ticket may be before a page
//                        load asks the hub again
//   HUB_SESSION_HOURS    optional, default 8: how long the app cookie lasts for data
//                        calls made by a page that is already open
//   HUB_APP_ORIGIN       optional: this app's public origin, if the request URL ever
//                        shows a different one (proxies)
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

export const TICKET_TYP = "hub-ticket";
export const SESSION_TYP = "hub-session";
const ISS = "hlwt-hub";

export function hubEnforced() {
  return process.env.HUB_ENFORCE === "1";
}

export function hubOrigins() {
  const raw = process.env.HUB_ORIGIN?.trim() || "https://hub.hlwt.com";
  return raw.split(/[\s,]+/).filter(Boolean).map((o) => o.replace(/\/+$/, ""));
}

export function hubOrigin() {
  return hubOrigins()[0];
}

/** Value for CSP frame-ancestors: only the hub. Null when neither HUB_ORIGIN nor HUB_ENFORCE is set. */
export function hubFrameAncestors() {
  if (!process.env.HUB_ORIGIN?.trim() && !hubEnforced()) return null;
  return hubOrigins().join(" ");
}

function num(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
export const freshSeconds = () => num("HUB_FRESH_SECONDS", 600);
export const sessionSeconds = () => Math.round(num("HUB_SESSION_HOURS", 8) * 3600);

// ── Minimal HS256 JWT (WebCrypto) ───────────────────────────────────────────
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const keys = new Map();
function hmacKey(secret) {
  if (!secret || secret.length < 32) throw new Error("HUB_SHARED_SECRET must be at least 32 characters");
  if (!keys.has(secret)) {
    keys.set(secret, crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
  }
  return keys.get(secret);
}
function secret() {
  return process.env.HUB_SHARED_SECRET?.trim() || "";
}

export async function signJwt(payload, key = secret()) {
  const head = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(key), enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

/** Verified payload, or null (bad signature, wrong typ/aud, expired, malformed, or no secret). */
export async function verifyJwt(token, { typ, aud }, key = secret()) {
  try {
    if (!token || typeof token !== "string" || !key) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;
    const head = JSON.parse(dec.decode(unb64url(h)));
    if (head.alg !== "HS256") return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(key), unb64url(s), enc.encode(`${h}.${b}`));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(unb64url(b)));
    const now = Math.floor(Date.now() / 1000);
    if (p.iss !== ISS || p.typ !== typ) return null;
    if (typeof p.exp !== "number" || p.exp < now) return null;
    if (typeof p.iat !== "number" || p.iat > now + 60) return null;
    const auds = (Array.isArray(aud) ? aud : [aud]).filter(Boolean);
    if (!auds.includes(p.aud)) return null;
    if (typeof p.sub !== "string" || !p.sub || !Array.isArray(p.pages)) return null;
    return p;
  } catch {
    return null;
  }
}

// ── Cookie ──────────────────────────────────────────────────────────────────
export function sessionCookieName(secure) {
  return secure ? "__Host-hlwt_hub" : "hlwt_hub";
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

/** Sites outside hlwt.com (e.g. *.vercel.app) are cross-site inside the hub's frame. */
function crossSite(host) {
  const hubHost = new URL(hubOrigin()).hostname.split(".").slice(-2).join(".");
  return !(host === hubHost || host.endsWith(`.${hubHost}`));
}

function setCookieHeader(url, value, maxAge) {
  const secure = url.protocol === "https:";
  const parts = [`${sessionCookieName(secure)}=${value}`, "Path=/", "HttpOnly", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  // Inside the hub's frame a *.vercel.app app is a third party: it needs SameSite=None
  // and a partitioned (CHIPS) cookie. A *.hlwt.com app is same-site with the hub: Lax.
  if (secure && crossSite(url.hostname)) parts.push("SameSite=None", "Partitioned");
  else parts.push("SameSite=Lax");
  return parts.join("; ");
}

export function appOrigins(url) {
  const out = [url.origin];
  const extra = process.env.HUB_APP_ORIGIN?.trim();
  if (extra) out.push(...extra.split(/[\s,]+/).map((o) => o.replace(/\/+$/, "")));
  return out;
}

/** The verified hub session from a Cookie header (or null). */
export async function sessionFromCookieHeader(cookieHeader, url) {
  const u = typeof url === "string" ? new URL(url) : url;
  const token = readCookie(cookieHeader, sessionCookieName(u.protocol === "https:"));
  return verifyJwt(token, { typ: SESSION_TYP, aud: appOrigins(u) });
}

/** Same, for server code that only has the host (Next.js headers()). */
export async function sessionFromHeaders(get) {
  const host = get("x-forwarded-host") || get("host");
  if (!host) return null;
  const proto = (get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")).split(",")[0];
  return sessionFromCookieHeader(get("cookie"), `${proto}://${host}/`);
}

/** Who is signed in, in the shape the apps use. */
export function hubUser(session) {
  return session ? { email: session.sub, name: session.name || session.sub, pages: session.pages, role: session.role } : null;
}

// ── Pages ───────────────────────────────────────────────────────────────────
/** Hub page id for a path: exact match first, then the longest prefix entry ending in "/*". */
export function pageFor(pathname, pageMap) {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (pageMap[p]) return pageMap[p];
  let best = null;
  let bestLen = -1;
  for (const [k, v] of Object.entries(pageMap)) {
    if (!k.endsWith("/*")) continue;
    const base = k.slice(0, -2) || "/";
    if ((p === base || p.startsWith(base === "/" ? "/" : `${base}/`)) && base.length > bestLen) {
      best = v;
      bestLen = base.length;
    }
  }
  return best;
}

function safeNext(next, url) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  try {
    const u = new URL(next, url.origin);
    return u.origin === url.origin ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}

function html(status, title, body, extraHeaders = {}) {
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#eaf0f8;color:#0a1a2f">
<div style="max-width:440px;padding:32px;text-align:center;background:#fff;border-radius:24px;box-shadow:0 20px 50px -20px rgba(0,29,59,.35)">${body}</div></body></html>`;
  return new Response(page, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", ...extraHeaders },
  });
}
const btn = (href, label, target = "_top") =>
  `<a href="${href}" target="${target}" rel="noopener" style="display:inline-block;margin-top:12px;padding:12px 18px;border-radius:14px;background:#064789;color:#fff;text-decoration:none;font-weight:600">${label}</a>`;

function redirect(to, extra = {}) {
  return new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store", "referrer-policy": "no-referrer", ...extra } });
}

/**
 * The gate. Call it for every request the app serves (middleware).
 *
 * cfg = {
 *   pages:        { "/": "financials.ar", "/pnl": "financials.pnl", "/quote/*": "sales.quotes" },
 *   defaultPage:  page id to send people to for paths that aren't a hub page,
 *   isPublic(path, request): true for paths that must stay open (cron, health, customer links),
 *   apiPages?(path): page ids that may call this data path (default: any page of this app),
 * }
 * Returns { response } to send as-is, or { session } to let the request through.
 */
export async function hubGate(request, cfg) {
  const url = new URL(request.url);
  const path = url.pathname;
  const hub = hubOrigin();
  const appPages = Array.from(new Set(Object.values(cfg.pages)));
  const defaultPage = cfg.defaultPage || appPages[0];

  if (path === "/hub/callback") return { response: await callback(request, url) };
  if (path === "/hub/signout") {
    const secure = url.protocol === "https:";
    return { response: redirect(`${hub}/`, { "set-cookie": `${sessionCookieName(secure)}=; Path=/; Max-Age=0${secure ? "; Secure" : ""}` }) };
  }
  if (cfg.isPublic?.(path, request)) return { session: null };

  const session = await sessionFromCookieHeader(request.headers.get("cookie"), url);
  const pageId = pageFor(path, cfg.pages);
  const needs = pageId ? [pageId] : cfg.apiPages?.(path) ?? appPages;
  const granted = !!session && needs.some((p) => session.pages.includes(p));

  const method = request.method.toUpperCase();
  const dest = request.headers.get("sec-fetch-dest");
  const accept = request.headers.get("accept") || "";
  const isDocument =
    (method === "GET" || method === "HEAD") &&
    !path.startsWith("/api/") &&
    !request.headers.get("rsc") &&
    !request.headers.get("next-action") &&
    (dest === "document" || dest === "iframe" || (!dest && accept.includes("text/html")));

  // Data calls, server actions, client-side navigations: answer, never redirect.
  if (!isDocument) {
    if (granted) return { session };
    return { response: Response.json({ error: session ? "Not granted in the HLWT Hub" : "Open this app from the HLWT Hub" }, { status: session ? 403 : 401, headers: { "cache-control": "no-store" } }) };
  }

  const fresh = !!session && Math.floor(Date.now() / 1000) - session.iat <= freshSeconds();
  const justBack = url.searchParams.has("__hub");

  if (granted && fresh) {
    if (justBack) {
      url.searchParams.delete("__hub");
      return { response: redirect(url.toString()) };
    }
    return { session };
  }

  const target = pageId || defaultPage;
  const here = (() => {
    const u = new URL(url);
    u.searchParams.delete("__hub");
    return u.pathname + u.search;
  })();
  const goUrl = `${hub}/go/${encodeURIComponent(target)}?next=${encodeURIComponent(here)}`;
  const appUrl = `${hub}/app/${encodeURIComponent(target)}`;

  // We just came back from the hub with a ticket and still have no cookie: the browser
  // refused it (third-party cookies blocked in the frame). Don't loop.
  if (justBack && !session) {
    return {
      response: html(
        200,
        "Open in a new tab",
        `<h1 style="font-size:22px;margin:0 0 8px">Your browser blocked this page inside the Hub</h1><p style="color:#4a5a70;line-height:1.5">Open it in its own tab instead. You'll still be signed in.</p>${btn(`${hub}/go/${encodeURIComponent(target)}?next=${encodeURIComponent(here)}`, "Open in a new tab", "_blank")}`
      ),
    };
  }

  // Signed in through the hub and current, but this page isn't theirs.
  if (session && fresh && !granted) {
    return {
      response: html(
        403,
        "Not available",
        `<h1 style="font-size:22px;margin:0 0 8px">This page isn't open to you</h1><p style="color:#4a5a70;line-height:1.5">Access is managed in the HLWT Hub. If you think you should see it, ask Kyle.</p>${btn(`${hub}/`, "Open the Hub")}`
      ),
    };
  }

  // Inside the hub's frame: fetch a fresh ticket and come straight back.
  if (dest === "iframe") return { response: redirect(goUrl) };
  // Opened in its own tab with a hub session that's just old: same, at the top level.
  if (dest === "document" && session) return { response: redirect(goUrl) };
  // Opened directly with no hub session: the app is only reachable through the hub.
  if (dest === "document") return { response: redirect(appUrl) };

  // Older browsers without Sec-Fetch-Dest: decide in the page.
  return {
    response: html(
      200,
      "Opening the HLWT Hub",
      `<p style="color:#4a5a70">Opening the HLWT Hub…</p>${btn(appUrl, "Open the Hub")}
<script>(function(){var inFrame;try{inFrame=window.self!==window.top}catch(e){inFrame=true}location.replace(inFrame||${session ? "true" : "false"}?${JSON.stringify(goUrl)}:${JSON.stringify(appUrl)})})()</script>`
    ),
  };
}

async function callback(request, url) {
  const ticket = url.searchParams.get("ticket");
  const next = safeNext(url.searchParams.get("next") || "/", url);
  const t = await verifyJwt(ticket, { typ: TICKET_TYP, aud: appOrigins(url) });
  if (!t) {
    return html(
      401,
      "Link expired",
      `<h1 style="font-size:22px;margin:0 0 8px">That link has expired</h1><p style="color:#4a5a70;line-height:1.5">Open this page from the HLWT Hub.</p>${btn(`${hubOrigin()}/`, "Open the Hub")}`
    );
  }
  const maxAge = sessionSeconds();
  const session = await signJwt({
    iss: ISS,
    typ: SESSION_TYP,
    aud: t.aud,
    sub: t.sub,
    name: t.name,
    role: t.role,
    pages: t.pages,
    iat: t.iat,
    exp: t.iat + maxAge,
  });
  const to = new URL(next, url.origin);
  to.searchParams.set("__hub", "1");
  // Absolute: Next.js middleware refuses a relative Location.
  return redirect(to.toString(), { "set-cookie": setCookieHeader(url, session, maxAge) });
}

/** Hub side: mint a ticket for one app origin. */
export async function mintTicket({ origin, email, name, role, pages }, ttl = 60) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ iss: ISS, typ: TICKET_TYP, aud: origin, sub: email, name, role, pages, iat: now, exp: now + ttl });
}
