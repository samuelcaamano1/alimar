import type { CartItem, CatalogBundle } from './types'

export function bundleItemsLabel(bundle: CatalogBundle) {
  return bundle.items
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(' · ')
}

export function bundleToCartItem(bundle: CatalogBundle): CartItem {
  return {
    id: bundle.id,
    name: bundle.name,
    slug: bundle.slug,
    shortDescription: bundle.shortDescription,
    description: null,
    estimatedDays: null,
    kind: 'product',
    pricingMode: 'fixed',
    basePrice: bundle.bundlePrice,
    imageUrl: bundle.imageUrl,
    customizationAllowed: false,
    featured: bundle.featured,
    customizationFields: [],
    variants: [],
    bundleId: bundle.id,
    bundleItems: bundle.items.map(
      (item) => `${item.quantity}x ${item.name}`,
    ),
    variantId: null,
    variantName: null,
    unitPrice: bundle.bundlePrice,
    quantity: 1,
    note: '',
    customizations: [],
  }
}
