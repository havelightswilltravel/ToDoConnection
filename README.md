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

Edit the variables at the top of `src/styles.css` (`--brand`, `--accent`).
