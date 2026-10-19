import { useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { assignLabel } from '../lib/config'
import { dueInfo } from '../lib/dates'
import type { Task, TaskList } from '../lib/types'

function Card({ task, onOpen, onToggle, ghost }: {
  task: Task; onOpen?: () => void; onToggle?: () => void; ghost?: boolean
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
          onClick={(e) => { e.stopPropagation(); onToggle?.() }}
        >
          {done && <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <div className="card-title">{task.title}</div>
        {task.importance === 'high' && <span className="flag" title="High priority">●</span>}
      </div>
      {task.notes && <div className="card-notes">{task.notes}</div>}
      {(due || task.labels.length > 0) && (
        <div className="card-meta">
          {due && <span className={`pill due ${due.tone}`}>{due.text}</span>}
          {task.labels.map((l) => (
            <span key={l} className={`pill label ${l === assignLabel ? 'assigned' : ''}`}>{l}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function DraggableCard(props: { task: Task; onOpen: () => void; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.task.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1 }}>
      <Card {...props} />
    </div>
  )
}

function Column({ list, tasks, onOpen, onToggle, onAdd }: {
  list: TaskList; tasks: Task[]
  onOpen: (t: Task) => void; onToggle: (t: Task) => void; onAdd: (title: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const submit = () => {
    if (title.trim()) onAdd(title.trim())
    setTitle('')
    setAdding(false)
  }
  return (
    <section ref={setNodeRef} className={`column ${isOver ? 'over' : ''}`}>
      <header className="column-head">
        <h2>{list.name}</h2>
        {list.isShared && <span className="shared" title="Shared list">Shared</span>}
        <span className="count">{tasks.length}</span>
      </header>
      <div className="column-body">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={() => onOpen(t)} onToggle={() => onToggle(t)} />
        ))}
        {adding ? (
          <input
            autoFocus className="add-input" placeholder="Card title…" value={title}
            onChange={(e) => setTitle(e.target.value)} onBlur={submit}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setTitle(''); setAdding(false) } }}
          />
        ) : (
          <button className="add-btn" onClick={() => setAdding(true)}>+ Add card</button>
        )}
      </div>
    </section>
  )
}

export default function Board({ lists, tasks, onOpen, onToggle, onMove, onAdd }: {
  lists: TaskList[]; tasks: Task[]
  onOpen: (t: Task) => void; onToggle: (t: Task) => void
  onMove: (t: Task, listId: string) => void; onAdd: (listId: string, title: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [active, setActive] = useState<Task | null>(null)
  const start = (e: DragStartEvent) => setActive(tasks.find((t) => t.id === e.active.id) ?? null)
  const end = (e: DragEndEvent) => {
    setActive(null)
    const t = tasks.find((x) => x.id === e.active.id)
    if (t && e.over && e.over.id !== t.listId) onMove(t, String(e.over.id))
  }
  return (
    <DndContext sensors={sensors} onDragStart={start} onDragEnd={end} onDragCancel={() => setActive(null)}>
      <main className="board">
        {lists.map((l) => (
          <Column
            key={l.id} list={l} tasks={tasks.filter((t) => t.listId === l.id)}
            onOpen={onOpen} onToggle={onToggle} onAdd={(title) => onAdd(l.id, title)}
          />
        ))}
      </main>
      <DragOverlay>{active ? <Card task={active} ghost /> : null}</DragOverlay>
    </DndContext>
  )
}
