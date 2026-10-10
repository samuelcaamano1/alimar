import type { CatalogCategory, CatalogProduct } from './types'

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function searchCatalogProducts(
  catalog: CatalogCategory[],
  query: string,
  categorySlug = 'all',
): CatalogProduct[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)

  return catalog
    .filter(
      (category) =>
        categorySlug === 'all' || category.slug === categorySlug,
    )
    .flatMap((category) => {
      if (terms.length === 0) return category.products

      const categoryText = normalizeSearch(
        [category.name, category.slug, category.description ?? ''].join(' '),
      )

      return category.products.filter((product) => {
        const haystack = normalizeSearch(
          [
            categoryText,
            product.name,
            product.slug,
            product.shortDescription ?? '',
          ].join(' '),
        )

        return terms.every((term) => haystack.includes(term))
      })
    })
}

export function catalogSearchLabel(count: number) {
  return count === 1 ? '1 resultado' : `${count} resultados`
}
