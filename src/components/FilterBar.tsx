import { useState } from 'react'
import { assignLabel, config } from '../lib/config'
import { useIsMobile } from '../lib/useIsMobile'

export interface Filters {
  q: string
  scope: 'all' | 'mine' | 'shared' | 'assigned'
  labels: string[]
  due: 'any' | 'overdue' | 'week' | 'none'
  showDone: boolean
}

export const defaultFilters: Filters = { q: '', scope: 'all', labels: [], due: 'any', showDone: false }

export default function FilterBar({ f, set, allLabels }: {
  f: Filters; set: (f: Filters) => void; allLabels: string[]
}) {
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const active = f.labels.length + (f.due !== 'any' ? 1 : 0) + (f.showDone ? 1 : 0)
  const toggle = (l: string) =>
    set({ ...f, labels: f.labels.includes(l) ? f.labels.filter((x) => x !== l) : [...f.labels, l] })
  const scopes: [Filters['scope'], string][] = [
    ['all', 'Everything'], ['mine', 'Mine'], ['shared', 'Shared'], ['assigned', `Assigned to ${config.integratorName}`],
  ]
  const segmented = (
    <div className="segmented">
      {scopes.map(([k, label]) => (
        <button key={k} className={f.scope === k ? 'on' : ''} onClick={() => set({ ...f, scope: k })}>{label}</button>
      ))}
    </div>
  )
  const search = <input className="search" type="search" placeholder="Search cards…" value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} />
  const extras = (
    <>
      <select value={f.due} onChange={(e) => set({ ...f, due: e.target.value as Filters['due'] })}>
        <option value="any">Any due date</option>
        <option value="overdue">Overdue</option>
        <option value="week">Due this week</option>
        <option value="none">No due date</option>
      </select>
      <label className="toggle">
        <input type="checkbox" checked={f.showDone} onChange={(e) => set({ ...f, showDone: e.target.checked })} />
        Show completed
      </label>
      <div className="chips">
        {allLabels.filter((l) => l !== assignLabel).map((l) => (
          <button key={l} className={`chip ${f.labels.includes(l) ? 'on' : ''}`} onClick={() => toggle(l)}>{l}</button>
        ))}
      </div>
    </>
  )

  if (mobile) {
    return (
      <div className="filters m">
        {segmented}
        <div className="m-search">
          {search}
          <button className={`btn ${open || active ? 'on' : ''}`} onClick={() => setOpen(!open)}>
            Filters{active ? ` · ${active}` : ''}
          </button>
        </div>
        {open && <div className="m-panel">{extras}</div>}
      </div>
    )
  }
  return <div className="filters">{segmented}{search}{extras}</div>
}
