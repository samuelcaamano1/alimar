import { site } from '../site'
import { formatAmount } from './cart'
import type {
  CatalogProduct,
  CatalogVariant,
} from './types'

export function priceForSelection(
  product: CatalogProduct,
  variant: CatalogVariant | null,
) {
  if (product.pricingMode === 'quote') return null
  return variant?.priceOverride ?? product.basePrice
}

export function formatSelectionPrice(
  product: CatalogProduct,
  variant: CatalogVariant | null,
) {
  const price = priceForSelection(product, variant)
  if (!price) return 'Consultar'

  const amount = Number(price)
  if (!Number.isFinite(amount)) return 'Consultar'

  const value = formatAmount(amount)

  return product.pricingMode === 'from' && !variant?.priceOverride
    ? `Desde ${value}`
    : value
}

function formatPrice(product: CatalogProduct) {
  if (product.pricingMode === 'quote') return 'Consultar'

  const priceSources =
    product.variants.length > 0
      ? product.variants.map(
          (variant) => variant.priceOverride ?? product.basePrice,
        )
      : [product.basePrice]

  const amounts = priceSources
    .map((value) =>
      value === null ? Number.NaN : Number(value),
    )
    .filter((value) => Number.isFinite(value) && value >= 0)

  if (amounts.length === 0) return 'Consultar'

  const minimum = Math.min(...amounts)
  const formatted = formatAmount(minimum)
  const hasOptions = product.variants.length > 0

  return product.pricingMode === 'from' || hasOptions
    ? `Desde ${formatted}`
    : formatted
}

export function catalogPriceLabel(product: CatalogProduct) {
  if (product.variants.length === 0) return formatPrice(product)

  const label =
    product.variants.length === 1
      ? '1 opción'
      : `${product.variants.length} opciones`

  return `${formatPrice(product)} · ${label}`
}

export function productWhatsappUrl(
  product: CatalogProduct,
  variant: CatalogVariant | null = null,
) {
  const price = formatSelectionPrice(product, variant)
  const variantLabel = variant ? ` · ${variant.name}` : ''

  return site.whatsappUrlFor(
    `Hola, quiero consultar por "${product.name}${variantLabel}" (${price}).`,
  )
}
