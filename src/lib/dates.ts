export const todayStr = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function dueInfo(due: string | null, done: boolean) {
  if (!due) return null
  const today = todayStr()
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000)
  const label = new Date(due + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const tone = done ? 'done' : diff < 0 ? 'overdue' : diff <= 2 ? 'soon' : 'later'
  const text = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : label
  return { text, tone }
}
