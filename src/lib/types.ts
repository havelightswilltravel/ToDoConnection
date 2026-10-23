export interface TaskList {
  id: string
  name: string
  isShared: boolean
  isOwner: boolean
}

export type Status = 'notStarted' | 'inProgress' | 'completed'
export type Importance = 'low' | 'normal' | 'high'

export interface Task {
  id: string
  listId: string
  title: string
  notes: string
  /** yyyy-mm-dd */
  due: string | null
  importance: Importance
  status: Status
  /** Microsoft To Do "categories" — used here as keywords/labels */
  labels: string[]
  modified: string
}

export type NewTask = Omit<Task, 'id' | 'modified'>

export interface Api {
  getLists(): Promise<TaskList[]>
  getTasks(listId: string): Promise<Task[]>
  getAllTasks(lists: TaskList[]): Promise<Task[]>
  createList(name: string): Promise<TaskList>
  createTask(t: NewTask): Promise<Task>
  updateTask(t: Task): Promise<void>
  /** To Do has no "move" endpoint: copy into the target list, then delete the original. */
  moveTask(t: Task, toListId: string): Promise<Task>
  deleteTask(t: Task): Promise<void>
  createEvent(e: { subject: string; notes: string; start: Date; minutes: number }): Promise<{ webLink?: string }>
  sendMail(e: { to: string; subject: string; html: string }): Promise<void>
  me(): Promise<{ name: string; email: string }>
}
