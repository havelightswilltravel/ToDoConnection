import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Board from './components/Board'
import FilterBar, { defaultFilters, type Filters } from './components/FilterBar'
import TaskModal, { type SaveOpts } from './components/TaskModal'
import { assignLabel, config, demoMode } from './lib/config'
import { currentAccount, graphApi, signIn, signOut } from './lib/graph'
import { mockApi } from './lib/mock'
import { todayStr } from './lib/dates'
import type { Task, TaskList } from './lib/types'

const api = demoMode ? mockApi : graphApi

export default function App() {
  const [ready, setReady] = useState(demoMode)
  const [authed, setAuthed] = useState(demoMode)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [lists, setLists] = useState<TaskList[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [editing, setEditing] = useState<Task | null>(null)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)

  const say = useCallback((msg: string, err = false) => {
    setToast({ msg, err })
    setTimeout(() => setToast(null), err ? 6000 : 2500)
  }, [])
  // Counts in-flight edits so a background refresh never overwrites a change that hasn't reached Microsoft yet.
  const pending = useRef(0)
  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    pending.current++
    try { return await fn() } catch (e) { say(e instanceof Error ? e.message : String(e), true) } finally { pending.current-- }
  }, [say])

  useEffect(() => {
    if (demoMode) return
    currentAccount().then((a) => { setAuthed(!!a); setReady(true) })
  }, [])

  const editingRef = useRef<Task | null>(null)
  editingRef.current = editing

  const lastLoad = useRef(0)
  const backoffUntil = useRef(0)

  const load = useCallback(async (background = false) => {
    lastLoad.current = Date.now()
    if (!background) setLoading(true)
    try {
      const [me, ls] = await Promise.all([api.me(), api.getLists()])
      const all = await api.getAllTasks(ls)
      if (background && pending.current > 0) return
      setUser(me)
      setLists(ls)
      setTasks(all)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/rate-limiting|429/.test(msg)) backoffUntil.current = Date.now() + 5 * 60_000
      if (!background) say(msg, true)
    } finally {
      if (!background) setLoading(false)
    }
  }, [say])
  useEffect(() => { if (authed) void load() }, [authed, load])

  // Auto-refresh: every minute while the tab is open, and right away when you switch back to it.
  useEffect(() => {
    if (!authed || demoMode) return
    const tick = () => {
      const now = Date.now()
      if (document.visibilityState !== 'visible' || editingRef.current || pending.current > 0) return
      // focus + visibilitychange often fire together, and Microsoft throttles chatty apps
      if (now - lastLoad.current < 45_000 || now < backoffUntil.current) return
      void load(true)
    }
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick) }
  }, [authed, load])

  const allLabels = useMemo(() => [...new Set(tasks.flatMap((t) => t.labels))].sort(), [tasks])

  const visibleTasks = useMemo(() => {
    const today = todayStr()
    const weekEnd = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10)
    const q = filters.q.toLowerCase()
    const shared = new Set(lists.filter((l) => l.isShared).map((l) => l.id))
    return tasks
      .filter((t) => {
        if (!filters.showDone && t.status === 'completed') return false
        if (filters.scope === 'mine' && shared.has(t.listId)) return false
        if (filters.scope === 'shared' && !shared.has(t.listId)) return false
        if (filters.scope === 'assigned' && !t.labels.includes(assignLabel)) return false
        if (q && !`${t.title} ${t.notes} ${t.labels.join(' ')}`.toLowerCase().includes(q)) return false
        if (filters.labels.some((l) => !t.labels.includes(l))) return false
        if (filters.due === 'overdue' && !(t.due && t.due < today)) return false
        if (filters.due === 'week' && !(t.due && t.due >= today && t.due <= weekEnd)) return false
        if (filters.due === 'none' && t.due) return false
        return true
      })
      .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  }, [tasks, lists, filters])

  const visibleLists = useMemo(() => {
    const filtering = filters.scope === 'assigned' || filters.labels.length > 0 || filters.q || filters.due !== 'any'
    return lists.filter((l) => {
      if (filters.scope === 'mine' && l.isShared) return false
      if (filters.scope === 'shared' && !l.isShared) return false
      return !filtering || visibleTasks.some((t) => t.listId === l.id)
    })
  }, [lists, filters, visibleTasks])

  const replace = (id: string, next: Task | null) =>
    setTasks((p) => (next ? p.map((t) => (t.id === id ? next : t)) : p.filter((t) => t.id !== id)))

  const move = async (t: Task, listId: string) => {
    replace(t.id, { ...t, listId })
    const moved = await guard(() => api.moveTask(t, listId))
    if (moved) replace(t.id, moved)
    else void load()
  }

  const toggle = async (t: Task) => {
    const next: Task = { ...t, status: t.status === 'completed' ? 'notStarted' : 'completed' }
    replace(t.id, next)
    if (!(await guard(async () => (await api.updateTask(next), true)))) void load()
  }

  const add = async (listId: string, title: string) => {
    const created = await guard(() => api.createTask({
      listId, title, notes: '', due: null, importance: 'normal', status: 'notStarted', labels: [],
    }))
    if (created) setTasks((p) => [...p, created])
  }

  const save = async (t: Task, opts: SaveOpts) => {
    const orig = tasks.find((x) => x.id === t.id)!
    setEditing(null)
    const ok = await guard(async () => {
      if (t.listId !== orig.listId) {
        const moved = await api.moveTask({ ...t, listId: orig.listId }, t.listId)
        replace(t.id, moved)
      } else {
        replace(t.id, t)
        await api.updateTask(t)
      }
      if (opts.notifyIntegrator) {
        await api.sendMail({
          to: config.integratorEmail,
          subject: `New To Do assigned to you: ${t.title}`,
          html: `<p>${user?.name ?? 'Someone'} assigned you a To Do:</p><h3>${t.title}</h3>` +
            (t.due ? `<p><b>Due:</b> ${t.due}</p>` : '') +
            (t.notes ? `<p>${t.notes.replace(/\n/g, '<br>')}</p>` : '') +
            `<p>Find it in your Microsoft To Do under the shared list “${lists.find((l) => l.id === t.listId)?.name ?? ''}”.</p>`,
        })
      }
      return true
    })
    if (ok) say('Saved')
    else void load()
  }

  const remove = async (t: Task) => {
    setEditing(null)
    replace(t.id, null)
    if (!(await guard(async () => (await api.deleteTask(t), true)))) void load()
  }

  const block = async (t: Task, start: Date, minutes: number) => {
    const ev = await guard(() => api.createEvent({
      subject: `Work on: ${t.title}`,
      notes: t.notes || `From To Do list “${lists.find((l) => l.id === t.listId)?.name}”`,
      start, minutes,
    }))
    if (ev) say('Added to your calendar')
    else throw new Error('calendar')
  }

  const newList = async () => {
    const name = prompt('Name for the new list')?.trim()
    if (!name) return
    const l = await guard(() => api.createList(name))
    if (l) setLists((p) => [...p, l])
  }

  if (!ready) return <div className="center"><div className="spinner" /></div>

  if (!authed) {
    return (
      <div className="center">
        <div className="hero">
          <img className="logo" src="/logo.png" alt="HLWT" />
          <h1>ToDoConnection</h1>
          <p>Your Microsoft To Do, as a board.</p>
          <button className="btn primary big" onClick={() => void signIn()}>Sign in with Microsoft</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img className="logo sm" src="/logo.png" alt="HLWT" /> <span className="brand-name">ToDoConnection</span></div>
        {demoMode && <span className="demo">Demo data</span>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={newList} aria-label="New list">+<span className="lbl"> New list</span></button>
        <button className="btn" onClick={() => void load()} disabled={loading} aria-label="Refresh">↻<span className="lbl">{loading ? ' Syncing…' : ' Refresh'}</span></button>
        {!demoMode && (
          <button className="btn ghost" onClick={() => void signOut()}><span className="lbl">{user?.name ?? 'Account'} · </span>Sign out</button>
        )}
      </header>
      <FilterBar f={filters} set={setFilters} allLabels={allLabels} />
      {loading && lists.length === 0
        ? <div className="center"><div className="spinner" /></div>
        : <Board lists={visibleLists} tasks={visibleTasks} onOpen={setEditing} onToggle={toggle} onMove={move} onAdd={add} />}
      {editing && (
        <TaskModal
          task={editing} lists={lists} allLabels={allLabels}
          onClose={() => setEditing(null)} onSave={save} onDelete={remove} onBlock={block}
        />
      )}
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
