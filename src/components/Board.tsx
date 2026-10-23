import { useState } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { assignLabel } from '../lib/config'
import { dueInfo } from '../lib/dates'
import { useIsMobile } from '../lib/useIsMobile'
import type { Task, TaskList } from '../lib/types'

function Card({ task, onOpen, onToggle, ghost, listName }: {
  task: Task; onOpen?: () => void; onToggle?: () => void; ghost?: boolean; listName?: string
}) {
  const done = task.status === 'completed'
  const due = dueInfo(task.due, done)
  return (
    <div className={`card ${done ? 'is-done' : ''} ${ghost ? 'ghost' : ''}`} onClick={onOpen}>
      <div className="card-top">
        <button
          className={`check ${done ? 'on' : ''}`}
          aria-label={done ? 'Mark not done' : 'Mark done'}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggle?.() }}
        >
          {done && <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <div className="card-title">{task.title}</div>
        {task.importance === 'high' && <span className="flag" title="High priority">●</span>}
      </div>
      {task.notes && <div className="card-notes">{task.notes}</div>}
      {(due || task.labels.length > 0 || listName) && (
        <div className="card-meta">
          {listName && <span className="pill list">{listName}</span>}
          {due && <span className={`pill due ${due.tone}`}>{due.text}</span>}
          {task.labels.map((l) => (
            <span key={l} className={`pill label ${l === assignLabel ? 'assigned' : ''}`}>{l}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function DraggableCard(props: { task: Task; onOpen: () => void; onToggle: () => void; listName?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.task.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1 }}>
      <Card {...props} />
    </div>
  )
}

const COL = 'col:'
const ALL = 'all'

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const submit = () => {
    if (title.trim()) onAdd(title.trim())
    setTitle('')
    setAdding(false)
  }
  return adding ? (
    <input
      autoFocus className="add-input" placeholder="Card title…" value={title}
      onChange={(e) => setTitle(e.target.value)} onBlur={submit}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setTitle(''); setAdding(false) } }}
    />
  ) : (
    <button className="add-btn" onClick={() => setAdding(true)}>+ Add card</button>
  )
}

// Phone layout: one list at a time. Tabs double as drop targets — press-and-hold a card, drag it up onto a tab to move it.
function Tab({ id, label, count, on, onClick }: { id: string; label: string; count: number; on: boolean; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: COL + id, disabled: id === ALL })
  return (
    <button ref={setNodeRef} className={`tab ${on ? 'on' : ''} ${isOver ? 'over' : ''}`} onClick={onClick}>
      {label} <span>{count}</span>
    </button>
  )
}

const ORDER_KEY = 'todoconnection.listOrder'

const loadOrder = (): string[] => {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]') } catch { return [] }
}

function Column({ list, tasks, onOpen, onToggle, onAdd }: {
  list: TaskList; tasks: Task[]
  onOpen: (t: Task) => void; onToggle: (t: Task) => void; onAdd: (title: string) => void
}) {
  const { setNodeRef, isOver, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: COL + list.id })
  return (
    <section
      ref={setNodeRef}
      className={`column ${isOver ? 'over' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : undefined }}
    >
      <header className="column-head" {...attributes} {...listeners} title="Drag to reorder lists">
        <h2>{list.name}</h2>
        {list.isShared && <span className="shared" title="Shared list">Shared</span>}
        <span className="count">{tasks.length}</span>
      </header>
      <div className="column-body">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={() => onOpen(t)} onToggle={() => onToggle(t)} />
        ))}
        <AddCard onAdd={onAdd} />
      </div>
    </section>
  )
}

export default function Board({ lists, tasks, onOpen, onToggle, onMove, onAdd }: {
  lists: TaskList[]; tasks: Task[]
  onOpen: (t: Task) => void; onToggle: (t: Task) => void
  onMove: (t: Task, listId: string) => void; onAdd: (listId: string, title: string) => void
}) {
  // Mouse drags after a few px; touch needs a short press-and-hold so swiping still scrolls the board.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )
  const mobile = useIsMobile()
  const [sel, setSel] = useState(ALL)
  const [active, setActive] = useState<Task | null>(null)
  const [stored, setStored] = useState<string[]>(loadOrder)

  // Saved order first; lists not seen before go to the end.
  const ordered = [...lists].sort((a, b) => {
    const i = stored.indexOf(a.id), j = stored.indexOf(b.id)
    return (i < 0 ? 1e9 : i) - (j < 0 ? 1e9 : j)
  })

  const start = (e: DragStartEvent) => setActive(tasks.find((t) => t.id === e.active.id) ?? null)
  const end = (e: DragEndEvent) => {
    setActive(null)
    const a = String(e.active.id), o = e.over ? String(e.over.id) : null
    if (!o || a === o) return
    if (a.startsWith(COL)) {
      const ids = ordered.map((l) => l.id)
      const next = arrayMove(ids, ids.indexOf(a.slice(COL.length)), ids.indexOf(o.slice(COL.length)))
      // keep positions of lists currently hidden by filters
      const merged = [...next, ...stored.filter((id) => !next.includes(id))]
      setStored(merged)
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(merged)) } catch { /* private mode */ }
      return
    }
    const t = tasks.find((x) => x.id === a)
    const listId = o.slice(COL.length)
    if (t && listId !== ALL && listId !== t.listId) onMove(t, listId)
  }
  const current = sel === ALL || ordered.some((l) => l.id === sel) ? sel : ALL
  const shown = current === ALL ? tasks : tasks.filter((t) => t.listId === current)
  const nameOf = (id: string) => lists.find((l) => l.id === id)?.name
  return (
    <DndContext sensors={sensors} onDragStart={start} onDragEnd={end} onDragCancel={() => setActive(null)}>
      {mobile ? (
        <main className="m-board">
          <nav className="tabs">
            <Tab id={ALL} label="All" count={tasks.length} on={current === ALL} onClick={() => setSel(ALL)} />
            {ordered.map((l) => (
              <Tab key={l.id} id={l.id} label={l.name} count={tasks.filter((t) => t.listId === l.id).length} on={current === l.id} onClick={() => setSel(l.id)} />
            ))}
          </nav>
          <div className="m-cards">
            {shown.map((t) => (
              <DraggableCard
                key={t.id} task={t} listName={current === ALL ? nameOf(t.listId) : undefined}
                onOpen={() => onOpen(t)} onToggle={() => onToggle(t)}
              />
            ))}
            {shown.length === 0 && <p className="empty">Nothing here.</p>}
            {current !== ALL && <AddCard onAdd={(title) => onAdd(current, title)} />}
          </div>
        </main>
      ) : (
        <SortableContext items={ordered.map((l) => COL + l.id)} strategy={rectSortingStrategy}>
          <main className="board">
            {ordered.map((l) => (
              <Column
                key={l.id} list={l} tasks={tasks.filter((t) => t.listId === l.id)}
                onOpen={onOpen} onToggle={onToggle} onAdd={(title) => onAdd(l.id, title)}
              />
            ))}
          </main>
        </SortableContext>
      )}
      <DragOverlay>{active ? <Card task={active} ghost /> : null}</DragOverlay>
    </DndContext>
  )
}
