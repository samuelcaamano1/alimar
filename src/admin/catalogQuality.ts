import type { AdminProduct } from './app/types'

export type CatalogQualityIssueKey =
  | 'category'
  | 'image'
  | 'description'
  | 'price'
  | 'customization'

export type CatalogQualityIssue = {
  key: CatalogQualityIssueKey
  label: string
}

export function getProductQualityIssues(
  product: AdminProduct,
): CatalogQualityIssue[] {
  const issues: CatalogQualityIssue[] = []

  if (!product.category_id) {
    issues.push({ key: 'category', label: 'Sin categorÃ­a' })
  }

  if (!product.image_url || product.image_count <= 0) {
    issues.push({ key: 'image', label: 'Sin foto' })
  }

  if (!product.short_description?.trim()) {
    issues.push({ key: 'description', label: 'Sin descripciÃ³n breve' })
  }

  if (
    product.pricing_mode !== 'quote' &&
    (!product.base_price || Number(product.base_price) <= 0)
  ) {
    issues.push({ key: 'price', label: 'Sin precio' })
  }

  if (
    product.customization_allowed &&
    product.customization_field_count <= 0
  ) {
    issues.push({
      key: 'customization',
      label: 'PersonalizaciÃ³n sin campos',
    })
  }

  return issues
}

export function summarizeCatalogQuality(products: AdminProduct[]) {
  const issueMap = products.map((product) => ({
    product,
    issues: getProductQualityIssues(product),
  }))

  return {
    total: products.length,
    complete: issueMap.filter(({ issues }) => issues.length === 0).length,
    incomplete: issueMap.filter(({ issues }) => issues.length > 0).length,
    featured: products.filter((product) => product.featured).length,
    customizationPending: issueMap.filter(({ issues }) =>
      issues.some((issue) => issue.key === 'customization'),
    ).length,
    withoutDescription: issueMap.filter(({ issues }) =>
      issues.some((issue) => issue.key === 'description'),
    ).length,
    withoutImage: issueMap.filter(({ issues }) =>
      issues.some((issue) => issue.key === 'image'),
    ).length,
  }
}
