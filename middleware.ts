// Vercel Routing Middleware (runs on Vercel only; Vite never sees this file).
//
// HLWT Hub:
//  • HUB_ORIGIN or HUB_ENFORCE set → only the hub may show To Do's inside a frame.
//  • HUB_ENFORCE=1 → the hub (https://hub.hlwt.com) is the only way in. The hub sends
//    the browser here with a short signed ticket (hub/hub-gate.mjs); without one, or
//    without the "To Do's" grant, the page sends the person back to the hub.
//    GET /hub/me tells the board who the hub signed in, so Microsoft sign-in can be
//    silent (MSAL ssoSilent with that email as the login hint, src/lib/graph.ts).
//    To Do's still needs each person's OWN Microsoft token for Graph; the hub only
//    decides who may open it.
// With neither set, the site behaves exactly as before.
import { next } from '@vercel/functions'
import { hubEnforced, hubFrameAncestors, hubGate, hubUser } from './hub/hub-gate.mjs'

const HUB = {
  pages: { '/*': 'management.todos' },
  defaultPage: 'management.todos',
}

export default async function middleware(request: Request) {
  const ancestors = hubFrameAncestors()
  const headers: Record<string, string> = ancestors ? { 'Content-Security-Policy': `frame-ancestors ${ancestors}` } : {}
  if (!hubEnforced()) return next({ headers })

  const { response, session } = await hubGate(request, HUB)
  if (response) {
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v)
    return response
  }
  if (new URL(request.url).pathname === '/hub/me') {
    const u = hubUser(session ?? null)
    return Response.json(u ? { email: u.email, name: u.name } : { error: 'not signed in' }, {
      status: u ? 200 : 401,
      headers: { 'cache-control': 'no-store' },
    })
  }
  return next({ headers })
}

export const config = {
  // Static files (the JS/CSS bundle, icons) and the Microsoft pop-up return page hold no
  // data; everything else, including the board's HTML, goes through the gate.
  matcher: ['/((?!assets/|popup\\.html|favicon\\.svg|logo\\.png|icon-|apple-touch-icon\\.png|manifest\\.webmanifest).*)'],
}
