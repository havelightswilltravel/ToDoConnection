export const config = {
  clientId: import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined,
  tenant: (import.meta.env.VITE_AZURE_TENANT_ID as string | undefined) || 'common',
  integratorName: (import.meta.env.VITE_INTEGRATOR_NAME as string | undefined) || 'Les',
  integratorEmail: (import.meta.env.VITE_INTEGRATOR_EMAIL as string | undefined) || '',
}

export const demoMode = !config.clientId
/** Label stamped on a card when it is assigned to the integrator */
export const assignLabel = `@${config.integratorName}`
