import { useState } from 'react'
import { assignLabel, config } from '../lib/config'
import { todayStr } from '../lib/dates'
import type { Importance, Status, Task, TaskList } from '../lib/types'

export interface SaveOpts { notifyIntegrator: boolean }

export default function TaskModal({ task, lists, allLabels, onClose, onSave, onDelete, onBlock }: {
  task: Task; lists: TaskList[]; allLabels: string[]
  onClose: () => void
  onSave: (t: Task, o: SaveOpts) => void
  onDelete: (t: Task) => void
  onBlock: (t: Task, start: Date, minutes: number) => Promise<void>
}) {
  const [t, setT] = useState(task)
  const [newLabel, setNewLabel] = useState('')
  const [notify, setNotify] = useState(true)
  const [blockDate, setBlockDate] = useState(task.due ?? todayStr())
  const [blockTime, setBlockTime] = useState('09:00')
  const [minutes, setMinutes] = useState(60)
  const [blocking, setBlocking] = useState(false)

  const assigned = t.labels.includes(assignLabel)
  const list = lists.find((l) => l.id === t.listId)
  const canNotify = !!config.integratorEmail
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((p) => ({ ...p, [k]: v }))
  const addLabel = (raw: string) => {
    const l = raw.trim().replace(/^#/, '')
    if (l && !t.labels.includes(l)) set('labels', [...t.labels, l])
    setNewLabel('')
  }
  const toggleAssign = () =>
    set('labels', assigned ? t.labels.filter((l) => l !== assignLabel) : [...t.labels, assignLabel])

  const block = async () => {
    setBlocking(true)
    try {
      const start = new Date(`${blockDate}T${blockTime}:00`)
      await onBlock(t, start, minutes)
      const line = `📅 Time blocked: ${start.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} (${minutes} min)`
      set('notes', t.notes ? `${t.notes}\n${line}` : line)
    } finally {
      setBlocking(false)
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Edit card">
        <input className="modal-title" value={t.title} onChange={(e) => set('title', e.target.value)} placeholder="Title" />

        <div className="grid">
          <label>List
            <select value={t.listId} onChange={(e) => set('listId', e.target.value)}>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.isShared ? ' (shared)' : ''}</option>)}
            </select>
          </label>
          <label>Due date
            <input type="date" value={t.due ?? ''} onChange={(e) => set('due', e.target.value || null)} />
          </label>
          <label>Priority
            <select value={t.importance} onChange={(e) => set('importance', e.target.value as Importance)}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
            </select>
          </label>
          <label>Status
            <select value={t.status} onChange={(e) => set('status', e.target.value as Status)}>
              <option value="notStarted">Not started</option><option value="inProgress">In progress</option><option value="completed">Completed</option>
            </select>
          </label>
        </div>

        <div className="field">
          <span className="field-label">Keywords</span>
          <div className="chips">
            {t.labels.filter((l) => l !== assignLabel).map((l) => (
              <button key={l} className="chip on" onClick={() => set('labels', t.labels.filter((x) => x !== l))}>{l} ✕</button>
            ))}
            <input
              className="chip-input" list="labels" placeholder="Add keyword…" value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel(newLabel) } }}
              onBlur={() => addLabel(newLabel)}
            />
            <datalist id="labels">{allLabels.map((l) => <option key={l} value={l} />)}</datalist>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Notes</span>
          <textarea rows={5} value={t.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Add notes…" />
        </label>

        <div className="panel">
          <div className="panel-row">
            <div>
              <strong>Assign to {config.integratorName}</strong>
              <p className="hint">
                {list?.isShared
                  ? `${config.integratorName} can see this card because “${list.name}” is shared with them.`
                  : `Move this card to a shared list so ${config.integratorName} can see it in their To Do.`}
              </p>
            </div>
            <button className={`switch ${assigned ? 'on' : ''}`} onClick={toggleAssign} aria-pressed={assigned} aria-label="Assign"><i /></button>
          </div>
          {assigned && canNotify && !task.labels.includes(assignLabel) && (
            <label className="inline"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email {config.integratorName} a heads-up</label>
          )}
        </div>

        <div className="panel">
          <strong>Block time on my calendar</strong>
          <div className="block-row">
            <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />
            <input type="time" value={blockTime} onChange={(e) => setBlockTime(e.target.value)} />
            <select value={minutes} onChange={(e) => setMinutes(+e.target.value)}>
              {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} hr` : `${m} min`}</option>)}
            </select>
            <button className="btn" disabled={blocking} onClick={block}>{blocking ? 'Adding…' : 'Add to calendar'}</button>
          </div>
        </div>

        <footer className="modal-foot">
          <button className="btn danger" onClick={() => confirm('Delete this card?') && onDelete(task)}>Delete</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(t, { notifyIntegrator: assigned && notify && canNotify && !task.labels.includes(assignLabel) })}>Save</button>
        </footer>
      </div>
    </div>
  )
}
