import { assignLabel } from './config'
import type { Api, Task, TaskList } from './types'

const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

let lists: TaskList[] = [
  { id: 'l1', name: 'Inbox', isOwner: true, isShared: false },
  { id: 'l2', name: 'This Week', isOwner: true, isShared: false },
  { id: 'l3', name: 'Waiting On', isOwner: true, isShared: false },
  { id: 'l4', name: 'Shared with Les', isOwner: true, isShared: true },
]

const t = (id: string, listId: string, title: string, o: Partial<Task> = {}): Task => ({
  id, listId, title, notes: '', due: null, importance: 'normal', status: 'notStarted',
  labels: [], modified: new Date().toISOString(), ...o,
})

let tasks: Task[] = [
  t('t1', 'l1', 'Review Q4 vendor contracts', { due: day(2), importance: 'high', labels: ['contracts', 'finance'], notes: 'Focus on renewal terms and auto-renew clauses.' }),
  t('t2', 'l1', 'Book travel for site visit', { due: day(9), labels: ['travel'] }),
  t('t3', 'l2', 'Prep board update deck', { due: day(1), importance: 'high', labels: ['board'], status: 'inProgress' }),
  t('t4', 'l2', 'Approve marketing budget', { due: day(-1), labels: ['finance'] }),
  t('t5', 'l3', 'Signed NDA from partner', { due: day(5), labels: ['contracts'] }),
  t('t6', 'l4', 'Set up CRM integration', { due: day(4), importance: 'high', labels: ['integrations', assignLabel], notes: 'Sync HubSpot deals with the project tracker.' }),
  t('t7', 'l4', 'Document onboarding workflow', { due: day(7), labels: ['process', assignLabel] }),
  t('t8', 'l4', 'Audit Zapier automations', { labels: ['integrations'] }),
]

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120))
let n = 100

export const mockApi: Api = {
  getLists: () => wait([...lists]),
  getTasks: (id) => wait(tasks.filter((x) => x.listId === id)),
  async createList(name) {
    const l = { id: `l${++n}`, name, isOwner: true, isShared: false }
    lists.push(l)
    return wait(l)
  },
  async createTask(nt) {
    const task = { ...nt, id: `t${++n}`, modified: new Date().toISOString() }
    tasks.push(task)
    return wait(task)
  },
  async updateTask(task) {
    tasks = tasks.map((x) => (x.id === task.id ? task : x))
    return wait(undefined)
  },
  async moveTask(task, toListId) {
    const moved = { ...task, listId: toListId, id: `t${++n}` }
    tasks = tasks.filter((x) => x.id !== task.id).concat(moved)
    return wait(moved)
  },
  async deleteTask(task) {
    tasks = tasks.filter((x) => x.id !== task.id)
    return wait(undefined)
  },
  async createEvent() {
    return wait({})
  },
  async sendMail() {
    return wait(undefined)
  },
  me: () => wait({ name: 'Kyle', email: 'kyle@hlwt.com' }),
}
