# ToDoConnection

A Trello-style board on top of **Microsoft To Do**. Lists are columns, tasks are cards. Drag cards between lists, add keywords, notes and due dates, assign to your integrator, and block calendar time — all synced live through Microsoft Graph.

Each person signs in with their **own** Microsoft account, so you see your lists plus anything shared with you, and your integrator sees theirs plus what you share with them.

## How things map to Microsoft To Do

| App feature | Microsoft To Do / Graph |
|---|---|
| Column | A To Do list (`/me/todo/lists`) |
| Card | A task; notes = task body, due date = `dueDateTime`, priority = `importance` |
| Keywords / filters | Task `categories` |
| Move card between columns | Task is recreated in the target list and the original deleted (Graph has no move endpoint) |
| Shared lists | Lists flagged `isShared`; need the `Tasks.ReadWrite.Shared` scope |
| Assign to Les | Adds an `@Les` keyword. Les sees it if the card is in a list shared with him; optional heads-up email via `Mail.Send` |
| Block time | Creates an Outlook event via `Calendars.ReadWrite` |

**Limitation:** Microsoft's API can't create or change list *sharing*. Share a list once in the To Do app (list ⋯ → Share list → invite Les). It then appears here as "Shared" for both of you. Microsoft To Do also has no true per-task "assignee" outside shared lists, hence the `@Les` keyword.

## Run it

```bash
npm install
npm run dev        # with no .env this runs in demo mode (sample data)
```

## Connect to Microsoft (one-time, ~5 min)

1. [Entra admin center](https://entra.microsoft.com) → **App registrations → New registration**.
2. Name: `ToDoConnection`. Supported account types: your org only (or "any org + personal" if Les is outside your tenant).
3. Redirect URI: platform **Single-page application (SPA)** → `http://localhost:5173` and your production URL.
4. **API permissions → Add → Microsoft Graph → Delegated**: `User.Read`, `Tasks.ReadWrite`, `Tasks.ReadWrite.Shared`, `Calendars.ReadWrite`, `Mail.Send`. Grant admin consent if prompted.
5. Copy the **Application (client) ID** (and Directory (tenant) ID if you limited to your org).
6. `cp .env.example .env` and fill in `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `VITE_INTEGRATOR_NAME`, `VITE_INTEGRATOR_EMAIL`.

No secrets are needed or stored — it's a pure browser app using MSAL sign-in.

## Deploy

Vercel (or Netlify): import this repo, add the four `VITE_*` variables, deploy. `vercel.json` already handles SPA routing. Then add the production URL as a SPA redirect URI in step 3.

## Brand colors

Edit the variables at the top of `src/styles.css` (`--brand`, `--gold`, `--navy`).

## HLWT Hub: the only way in (inert until configured)

With `HUB_ENFORCE=1` To Do's has **no sign-in screen of its own**. It opens only
from the HLWT Hub (https://hub.hlwt.com), and the hub's Access settings decide who sees
which page:

| Hub page id | Path |
|---|---|
| `management.todos` | `every path` |

How it works (`hub/hub-gate.mjs`, the same file in every HLWT app):

1. The hub sends the browser to `/hub/callback?ticket=…`: a 60-second ticket signed with
   `HUB_SHARED_SECRET`, naming the person and the pages of this app they may open
   (hub owners get every page).
2. This app swaps it for its own host-only cookie (`__Host-hlwt_hub`, 8 hours) and checks
   it on every request (Vercel Routing Middleware, `middleware.ts`).
3. Opened directly with no hub session → redirected to `https://hub.hlwt.com/app/<page id>`.
   Inside the hub, a page load older than 10 minutes quietly fetches a fresh ticket, so
   access removed in the hub takes effect within minutes. Data calls answer 401/403.
4. To Do's still needs each person's **own** Microsoft token (Graph is called from the
   browser as them). The hub doesn't replace that; it removes the sign-in *screen*:
   `GET /hub/me` returns the hub's email, and the board signs in to Microsoft silently
   (MSAL `ssoSilent` with that email as the login hint). Browsers that block Microsoft's
   hidden frame (Safari, Firefox strict, Brave) show one **Continue as name@hlwt.com**
   button, which opens Microsoft's pop-up pre-filled; usually it closes by itself.
   A different Microsoft account left in the browser is never used.
5. No Sign out button through the hub (it would sign the person out of Microsoft everywhere).

Still public (no hub needed): the JavaScript/CSS bundle, icons and `popup.html` (no data in any of them; the board's data only ever comes from Microsoft Graph with the person's own token).

| Env var (Vercel, Production) | Value |
|---|---|
| `HUB_ENFORCE` | `1` |
| `HUB_SHARED_SECRET` | the same value as on the hub project |
| `HUB_ORIGIN` | `https://hub.hlwt.com` (only this origin may frame the app) |
| `HUB_FRESH_SECONDS`, `HUB_SESSION_HOURS` | optional, defaults 600 and 8 |

Unset `HUB_ENFORCE` to go back to the old Microsoft sign-in screen (nothing else changes).

Entra (To Do's app registration, **Single-page application** platform): the redirect URIs
`https://todo.hlwt.com` and `https://todo.hlwt.com/popup.html` must both be listed.
