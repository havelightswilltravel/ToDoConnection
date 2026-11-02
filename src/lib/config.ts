const env = import.meta.env

export const config = {
  clientId: env.VITE_AZURE_CLIENT_ID as string | undefined,
  tenant: (env.VITE_AZURE_TENANT_ID as string | undefined) || 'common',
}

export const demoMode = !config.clientId

export interface Person { name: string; email: string }

/** The two people who use the board. Everything "assign / share with" is relative to who is signed in. */
export const people: Person[] = [
  { name: (env.VITE_OWNER_NAME as string | undefined) || 'Kyle', email: (env.VITE_OWNER_EMAIL as string | undefined) || 'kyle@hlwt.com' },
  { name: (env.VITE_INTEGRATOR_NAME as string | undefined) || 'Les', email: (env.VITE_INTEGRATOR_EMAIL as string | undefined) || 'lbanks@hlwt.com' },
]

export function who(email?: string) {
  const me = people.find((p) => p.email.toLowerCase() === email?.toLowerCase()) ?? people[0]
  return { me, partner: people.find((p) => p !== me)! }
}

/** Label stamped on a card assigned to that person, e.g. "@Les" */
export const personLabel = (p: Person) => `@${p.name}`
export const isPersonLabel = (l: string) => people.some((p) => personLabel(p) === l)
