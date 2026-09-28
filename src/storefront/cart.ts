import type {
  CartCustomizationValue,
  CartItem,
} from './types'

export const CART_STORAGE_KEY = 'alimar-cart-v1'

export function loadStoredCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((item) => {
      if (
        !item ||
        typeof item.id !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.slug !== 'string' ||
        typeof item.quantity !== 'number' ||
        item.quantity <= 0
      ) {
        return []
      }

      return [
        {
          ...item,
          variants: Array.isArray(item.variants) ? item.variants : [],
          customizationAllowed: item.customizationAllowed === true,
          customizationFields: Array.isArray(item.customizationFields)
            ? item.customizationFields
            : [],
          customizations: Array.isArray(item.customizations)
            ? item.customizations.flatMap((value: unknown) => {
                if (!value || typeof value !== 'object') return []
                const entry = value as Record<string, unknown>
                if (
                  typeof entry.fieldId !== 'string' ||
                  typeof entry.label !== 'string' ||
                  typeof entry.value !== 'string'
                ) {
                  return []
                }

                return [
                  {
                    fieldId: entry.fieldId,
                    label: entry.label,
                    value: entry.value,
                  },
                ]
              })
            : [],
          variantId:
            typeof item.variantId === 'string' ? item.variantId : null,
          variantName:
            typeof item.variantName === 'string' ? item.variantName : null,
          unitPrice:
            typeof item.unitPrice === 'string' || item.unitPrice === null
              ? item.unitPrice
              : typeof item.basePrice === 'string'
                ? item.basePrice
                : null,
        } as CartItem,
      ]
    })
  } catch {
    return []
  }
}

export function formatAmount(amount: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCartItemPrice(item: CartItem) {
  if (!item.unitPrice) return 'Consultar'

  const amount = Number(item.unitPrice)
  if (!Number.isFinite(amount)) return 'Consultar'

  const value = formatAmount(amount)
  return item.pricingMode === 'from' ? `Desde ${value}` : value
}

export function formatCartLinePrice(item: CartItem) {
  if (!item.unitPrice) return 'Consultar'

  const unitPrice = Number(item.unitPrice)
  if (!Number.isFinite(unitPrice)) return 'Consultar'

  return formatAmount(unitPrice * item.quantity)
}

function customizationSignature(
  customizations: CartCustomizationValue[],
) {
  return [...customizations]
    .sort((left, right) => left.fieldId.localeCompare(right.fieldId))
    .map(
      (item) =>
        `${item.fieldId}=${encodeURIComponent(item.value)}`,
    )
    .join('&')
}

export function cartItemKey(
  item: Pick<CartItem, 'id' | 'variantId' | 'customizations'>,
) {
  return `${item.id}:${item.variantId ?? 'base'}:${customizationSignature(
    item.customizations,
  )}`
}
