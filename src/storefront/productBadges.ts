import type { CatalogProduct } from './types'

export type ProductBadgeTone =
  | 'featured'
  | 'customizable'
  | 'service'
  | 'options'

export type ProductBadge = {
  key: ProductBadgeTone
  label: string
  tone: ProductBadgeTone
}

export function getProductBadges(
  product: Pick<
    CatalogProduct,
    'featured' | 'customizationAllowed' | 'kind' | 'variants'
  >,
): ProductBadge[] {
  const badges: ProductBadge[] = []

  if (product.featured) {
    badges.push({
      key: 'featured',
      label: 'Destacado',
      tone: 'featured',
    })
  }

  if (product.customizationAllowed) {
    badges.push({
      key: 'customizable',
      label: 'Personalizable',
      tone: 'customizable',
    })
  }

  if (product.kind === 'service') {
    badges.push({
      key: 'service',
      label: 'Servicio',
      tone: 'service',
    })
  }

  if (product.variants.length > 0) {
    badges.push({
      key: 'options',
      label:
        product.variants.length === 1
          ? '1 opción'
          : `${product.variants.length} opciones`,
      tone: 'options',
    })
  }

  return badges
}
