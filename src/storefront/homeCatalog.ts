import type { CatalogCategory, CatalogProduct } from './types'

export function flattenCatalog(catalog: CatalogCategory[]) {
  return catalog.flatMap((category) => category.products)
}

export function catalogProductCount(catalog: CatalogCategory[]) {
  return flattenCatalog(catalog).length
}

export function selectHomeHighlights(
  catalog: CatalogCategory[],
  limit = 6,
): CatalogProduct[] {
  if (limit <= 0) return []

  const products = flattenCatalog(catalog)
  const featured = products.filter((product) => product.featured)
  const featuredIds = new Set(featured.map((product) => product.id))

  return [
    ...featured,
    ...products.filter((product) => !featuredIds.has(product.id)),
  ].slice(0, limit)
}
