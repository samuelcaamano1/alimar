import type { CatalogCategory, CatalogProduct } from './types'

export function findCatalogProductBySlug(
  categories: CatalogCategory[],
  slug: string,
): CatalogProduct | null {
  const normalized = slug.trim().toLowerCase()
  if (!normalized) return null

  for (const category of categories) {
    const product = category.products.find(
      (item) => item.slug.toLowerCase() === normalized,
    )
    if (product) return product
  }

  return null
}

export function productUrlPath(href: string, slug: string | null) {
  const url = new URL(href)

  if (slug) {
    url.searchParams.set('producto', slug)
  } else {
    url.searchParams.delete('producto')
  }

  return `${url.pathname}${url.search}${url.hash}`
}

export function productShareUrl(href: string, slug: string) {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('producto', slug)
  return url.toString()
}

export function productShareText(name: string) {
  return `Mirá ${name} en Alimar`
}
