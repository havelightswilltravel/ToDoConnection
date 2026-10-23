import type { Task, TaskList } from './types'

type Call = <T>(path: string, init?: RequestInit) => Promise<T>

interface Sub { id: string; status: number; headers?: Record<string, string>; body: any }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const RETRYABLE = new Set([429, 503, 504])

/**
 * Loads the tasks of every list using Graph JSON batching (20 lists per HTTP request instead of one
 * request per list), retrying only the sub-requests Microsoft throttles, after the delay it asks for.
 */
export async function fetchAllTasks(
  call: Call,
  lists: TaskList[],
  parse: (listId: string, raw: any) => Task,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<Task[]> {
  const out: Task[] = []
  for (let i = 0; i < lists.length; i += 20) {
    let todo = lists.slice(i, i + 20)
    for (let attempt = 0; todo.length && attempt < 4; attempt++) {
      const res = await call<{ responses: Sub[] }>('/$batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: todo.map((l, n) => ({ id: String(n), method: 'GET', url: `/me/todo/lists/${l.id}/tasks?$top=100` })),
        }),
      })
      const retry: TaskList[] = []
      let delay = 0
      for (const r of res.responses) {
        const list = todo[Number(r.id)]
        if (r.status === 200) {
          out.push(...r.body.value.map((g: unknown) => parse(list.id, g)))
          let next: string | undefined = r.body['@odata.nextLink']
          while (next) {
            const page: { value: unknown[]; '@odata.nextLink'?: string } = await call(next)
            out.push(...page.value.map((g) => parse(list.id, g)))
            next = page['@odata.nextLink']
          }
        } else if (RETRYABLE.has(r.status)) {
          retry.push(list)
          delay = Math.max(delay, Number(r.headers?.['Retry-After'] ?? 2 ** (attempt + 1)))
        } else {
          throw new Error(`Microsoft Graph ${r.status} loading "${list.name}": ${JSON.stringify(r.body)}`)
        }
      }
      todo = retry
      if (todo.length) await wait(Math.min(delay, 20) * 1000)
    }
    if (todo.length) throw new Error('Microsoft is rate-limiting requests (429). Wait a minute, then press Refresh.')
  }
  return out
}
