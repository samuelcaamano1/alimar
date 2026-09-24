export type RecoveredOrder = {
  orderCode: string
  trackingToken?: string
  createdAt: string
}

const STORAGE_KEY = 'alimar-last-order-v1'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function isRecoveredOrder(value: unknown): value is RecoveredOrder {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.orderCode === 'string' &&
    /^PED-\d{4}-[A-Z0-9]{6,12}$/.test(candidate.orderCode) &&
    (candidate.trackingToken === undefined ||
      (typeof candidate.trackingToken === 'string' &&
        /^[0-9a-f-]{36}$/i.test(candidate.trackingToken))) &&
    typeof candidate.createdAt === 'string' &&
    Number.isFinite(Date.parse(candidate.createdAt))
  )
}

export function loadRecoveredOrder(): RecoveredOrder | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as unknown
    if (!isRecoveredOrder(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }

    if (Date.now() - Date.parse(parsed.createdAt) > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveRecoveredOrder(
  orderCode: string,
  trackingToken?: string,
): RecoveredOrder {
  const order: RecoveredOrder = {
    orderCode,
    ...(trackingToken ? { trackingToken } : {}),
    createdAt: new Date().toISOString(),
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    // Recovery is best-effort. The order already exists server-side.
  }

  return order
}

export function clearRecoveredOrder() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function recoveryWhatsappMessage(orderCode: string) {
  return `Hola Alimar, quiero continuar con mi pedido ${orderCode}.`
}
