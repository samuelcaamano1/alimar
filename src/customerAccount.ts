export type CustomerSession = {
  id: string
  email: string
  name: string
  phone: string
  isAdmin: boolean
}

export async function loadCustomerSession() {
  try {
    const response = await fetch('/api/orders?action=account-session', {
      cache: 'no-store',
    })
    if (!response.ok) return null

    const data = (await response.json()) as {
      authenticated?: boolean
      account?: CustomerSession | null
    }

    return data.authenticated && data.account ? data.account : null
  } catch {
    return null
  }
}
