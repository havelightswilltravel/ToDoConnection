import type { Person } from '../lib/config'

/** Shown when nobody has a shared list yet. Microsoft only lets people create sharing inside the To Do app. */
export default function ShareGuide({ partner, full, onOpen, onDismiss, onRefresh, refreshing }: {
  partner: Person; full?: boolean
  onOpen?: () => void; onDismiss?: () => void; onRefresh?: () => void; refreshing?: boolean
}) {
  if (!full) {
    return (
      <div className="tip">
        <span>Want to share cards with {partner.name}? Share one list first.</span>
        <button className="btn" onClick={onOpen}>How?</button>
        <button className="btn ghost" onClick={onDismiss} aria-label="Dismiss">✕</button>
      </div>
    )
  }
  return (
    <div className="banner big guide">
      <strong>No shared list yet</strong>
      <p>Cards are shared with {partner.name} by putting them in a list you both have. Microsoft only lets you set that up inside the To Do app, and you only do it once:</p>
      <ol>
        <li>Open <b>Microsoft To Do</b> (the app, or <b>to-do.office.com</b>) and make a list such as “Shared with {partner.name}”.</li>
        <li>Open that list, tap <b>⋯</b> (more), then <b>Share list</b> → <b>Create invitation link</b>.</li>
        <li>Send the link to <b>{partner.email}</b>. {partner.name} opens it while signed in as {partner.email} and taps <b>Join</b>.</li>
        <li>Come back here and press <b>Refresh</b>. The list will be marked <b>Shared</b>, and every card in it is visible to both of you.</li>
      </ol>
      <div className="banner-actions">
        <button className="btn primary" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Checking…' : 'I’ve done it — Refresh'}</button>
      </div>
    </div>
  )
}
