// Vercel Routing Middleware (runs on Vercel only; Vite never sees this file).
//
// HLWT Hub: when HUB_ORIGIN is set in Vercel (e.g. https://hub.hlwt.com), only the
// hub may show To Do's inside a frame. With HUB_ORIGIN unset no header is added,
// so the site behaves exactly as before.
import { next } from '@vercel/functions'

export default function middleware() {
  const raw = process.env.HUB_ORIGIN?.trim()
  if (!raw) return next()
  const ancestors = ["'self'", ...raw.split(/[\s,]+/).filter(Boolean)].join(' ')
  return next({ headers: { 'Content-Security-Policy': `frame-ancestors ${ancestors}` } })
}
