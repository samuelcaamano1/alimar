export type FulfillmentMethod = 'pickup' | 'delivery'

export const fulfillmentLabels: Record<FulfillmentMethod, string> = {
  pickup: 'Retiro a coordinar',
  delivery: 'Entrega/envío a coordinar',
}

export function parseFulfillmentMethod(
  value: string,
): FulfillmentMethod | null {
  return value === 'pickup' || value === 'delivery' ? value : null
}

export function fulfillmentLabel(value: string | null) {
  const method = value ? parseFulfillmentMethod(value) : null
  return method ? fulfillmentLabels[method] : 'A coordinar'
}

export function normalizeDeliveryArea(
  method: FulfillmentMethod | null,
  value: string,
) {
  if (method !== 'delivery') return null

  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized ? normalized.slice(0, 120) : null
}

export function fulfillmentSummary(
  value: string | null,
  deliveryArea: string | null,
) {
  const label = fulfillmentLabel(value)

  if (value !== 'delivery' || !deliveryArea?.trim()) {
    return label
  }

  return `${label} · ${deliveryArea.trim()}`
}
