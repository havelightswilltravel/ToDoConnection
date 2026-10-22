import {
  PublicClientApplication,
  BrowserAuthError,
  InteractionRequiredAuthError,
  type AccountInfo,
} from '@azure/msal-browser'
import { config } from './config'
import type { Api, NewTask, Task, TaskList } from './types'

const SCOPES = [
  'User.Read',
  'Tasks.ReadWrite',
  'Tasks.ReadWrite.Shared',
  'Calendars.ReadWrite',
  'Mail.Send',
]
const GRAPH = 'https://graph.microsoft.com/v1.0'
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

let msal: PublicClientApplication | null = null

async function getMsal() {
  if (!msal) {
    msal = new PublicClientApplication({
      auth: {
        clientId: config.clientId!,
        authority: `https://login.microsoftonline.com/${config.tenant}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    })
    await msal.initialize()
    await msal.handleRedirectPromise()
  }
  return msal
}

export async function currentAccount(): Promise<AccountInfo | null> {
  const m = await getMsal()
  return m.getActiveAccount() ?? m.getAllAccounts()[0] ?? null
}

export async function signIn() {
  const m = await getMsal()
  await m.loginRedirect({ scopes: SCOPES })
}

export async function signOut() {
  const m = await getMsal()
  await m.logoutRedirect()
}

async function token(): Promise<string> {
  const m = await getMsal()
  const account = m.getActiveAccount() ?? m.getAllAccounts()[0]
  if (!account) throw new Error('Not signed in')
  try {
    return (await m.acquireTokenSilent({ scopes: SCOPES, account })).accessToken
  } catch (e) {
    // Silent renewal can fail (expired session) or time out (browsers that block the hidden
    // sign-in frame: Safari, Brave, strict Chrome). Fall back to a normal Microsoft sign-in page.
    const needsSignIn =
      e instanceof InteractionRequiredAuthError ||
      (e instanceof BrowserAuthError && e.errorCode !== 'interaction_in_progress')
    if (needsSignIn && !redirectedRecently()) {
      await m.acquireTokenRedirect({ scopes: SCOPES, account })
      return new Promise<string>(() => {}) // page is navigating away
    }
    throw e
  }
}

// Guards against a redirect loop if sign-in keeps failing.
function redirectedRecently() {
  try {
    const last = Number(sessionStorage.getItem('todoconnection.lastRedirect') ?? 0)
    if (Date.now() - last < 60_000) return true
    sessionStorage.setItem('todoconnection.lastRedirect', String(Date.now()))
  } catch { /* storage unavailable */ }
  return false
}

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith('http') ? path : GRAPH + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${await res.text()}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

async function all<T>(path: string): Promise<T[]> {
  const out: T[] = []
  let next: string | undefined = path
  while (next) {
    const page: { value: T[]; '@odata.nextLink'?: string } = await call(next)
    out.push(...page.value)
    next = page['@odata.nextLink']
  }
  return out
}

interface GTask {
  id: string
  title: string
  body?: { content: string }
  dueDateTime?: { dateTime: string }
  importance: Task['importance']
  status: string
  categories?: string[]
  lastModifiedDateTime: string
}

const fromGraph = (listId: string, g: GTask): Task => ({
  id: g.id,
  listId,
  title: g.title,
  notes: g.body?.content ?? '',
  due: g.dueDateTime ? g.dueDateTime.dateTime.slice(0, 10) : null,
  importance: g.importance,
  status: (['notStarted', 'inProgress', 'completed'].includes(g.status)
    ? g.status
    : 'notStarted') as Task['status'],
  labels: g.categories ?? [],
  modified: g.lastModifiedDateTime,
})

const toGraph = (t: Omit<NewTask, 'listId'>) => ({
  title: t.title,
  body: { content: t.notes, contentType: 'text' },
  // To Do stores a due *date*; midnight UTC keeps it on the same calendar day everywhere.
  dueDateTime: t.due ? { dateTime: `${t.due}T00:00:00.0000000`, timeZone: 'UTC' } : null,
  importance: t.importance,
  status: t.status,
  categories: t.labels,
})

export const graphApi: Api = {
  async getLists() {
    const lists = await all<{ id: string; displayName: string; isOwner: boolean; isShared: boolean }>(
      '/me/todo/lists',
    )
    return lists.map<TaskList>((l) => ({
      id: l.id,
      name: l.displayName,
      isOwner: l.isOwner,
      isShared: l.isShared,
    }))
  },
  async getTasks(listId) {
    const tasks = await all<GTask>(`/me/todo/lists/${listId}/tasks?$top=100`)
    return tasks.map((t) => fromGraph(listId, t))
  },
  async createList(name) {
    const l = await call<{ id: string; displayName: string }>('/me/todo/lists', {
      method: 'POST',
      body: JSON.stringify({ displayName: name }),
    })
    return { id: l.id, name: l.displayName, isOwner: true, isShared: false }
  },
  async createTask(t) {
    const g = await call<GTask>(`/me/todo/lists/${t.listId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(toGraph(t)),
    })
    return fromGraph(t.listId, g)
  },
  async updateTask(t) {
    await call(`/me/todo/lists/${t.listId}/tasks/${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify(toGraph(t)),
    })
  },
  async moveTask(t, toListId) {
    const created = await this.createTask({ ...t, listId: toListId })
    await this.deleteTask(t)
    return created
  },
  async deleteTask(t) {
    await call(`/me/todo/lists/${t.listId}/tasks/${t.id}`, { method: 'DELETE' })
  },
  async createEvent({ subject, notes, start, minutes }) {
    const end = new Date(start.getTime() + minutes * 60_000)
    const iso = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`
    }
    return call<{ webLink?: string }>('/me/events', {
      method: 'POST',
      body: JSON.stringify({
        subject,
        body: { contentType: 'text', content: notes },
        start: { dateTime: iso(start), timeZone: TZ },
        end: { dateTime: iso(end), timeZone: TZ },
        showAs: 'busy',
        categories: ['ToDoConnection'],
      }),
    })
  },
  async sendMail({ to, subject, html }) {
    await call('/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    })
  },
  async me() {
    const u = await call<{ displayName: string; mail?: string; userPrincipalName: string }>('/me')
    return { name: u.displayName, email: u.mail ?? u.userPrincipalName }
  },
}
