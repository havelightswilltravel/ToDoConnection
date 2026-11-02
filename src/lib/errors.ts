/** Turns a raw Microsoft/MSAL error into something a person can act on. */
export function describeError(raw: string): { title: string; hint: string; signIn: boolean } {
  if (/429|rate-limiting|throttl/i.test(raw)) {
    return {
      title: 'Microsoft is asking us to slow down',
      hint: 'Too many requests were sent in a short time. This clears by itself — wait a minute or two, then try again.',
      signIn: false,
    }
  }
  if (/AADSTS|interaction_required|login_required|timed_out|monitor_window|Not signed in|401|InvalidAuthenticationToken|token|consent/i.test(raw)) {
    return {
      title: 'Your Microsoft sign-in needs refreshing',
      hint: 'Microsoft sessions in a browser expire about once a day. Sign in again — it only takes a moment.',
      signIn: true,
    }
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return { title: 'Can’t reach Microsoft', hint: 'Check your internet connection, then try again.', signIn: false }
  }
  return { title: 'Microsoft returned an error', hint: 'Try again. If it keeps happening, send the technical details below to support.', signIn: false }
}
