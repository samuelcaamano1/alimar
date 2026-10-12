import type { NeonQueryFunction } from '@neondatabase/serverless'

export type ProductBundleItemSnapshot = {
  productId: string
  name: string
  quantity: number
}

export type ProductBundleSnapshot = {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  bundlePrice: string
  featured: boolean
  imageUrl: string | null
  items: ProductBundleItemSnapshot[]
}

type BundleRow = {
  id: string
  name: string
  slug: string
  short_description: string | null
  bundle_price: string
  featured: boolean
  image_url: string | null
}

type BundleItemRow = {
  bundle_id: string
  product_id: string
  product_name: string
  quantity: number
}

export async function loadActiveProductBundles(
  sql: NeonQueryFunction<false, false>,
): Promise<ProductBundleSnapshot[]> {
  const rows = (await sql`
    SELECT
      bundle.id::text,
      bundle.name,
      bundle.slug,
      bundle.short_description,
      bundle.bundle_price::text,
      bundle.featured,
      cover.image_url
    FROM product_bundles bundle
    LEFT JOIN LATERAL (
      SELECT image.image_url
      FROM product_bundle_items bundle_item
      INNER JOIN products product
        ON product.id = bundle_item.product_id
       AND product.active = true
      INNER JOIN product_images image
        ON image.product_id = product.id
      WHERE bundle_item.bundle_id = bundle.id
      ORDER BY
        bundle_item.sort_order ASC,
        image.is_primary DESC,
        image.sort_order ASC,
        image.created_at ASC
      LIMIT 1
    ) cover ON true
    WHERE bundle.active = true
      AND (
        SELECT COUNT(*)
        FROM product_bundle_items bundle_count
        WHERE bundle_count.bundle_id = bundle.id
      ) >= 2
      AND NOT EXISTS (
        SELECT 1
        FROM product_bundle_items unavailable_item
        INNER JOIN products unavailable_product
          ON unavailable_product.id = unavailable_item.product_id
        WHERE unavailable_item.bundle_id = bundle.id
          AND unavailable_product.active = false
      )
    ORDER BY bundle.featured DESC, bundle.sort_order ASC, bundle.name ASC
  `) as BundleRow[]

  if (rows.length === 0) return []

  const itemRows = (await sql`
    SELECT
      bundle_item.bundle_id::text,
      product.id::text AS product_id,
      product.name AS product_name,
      bundle_item.quantity
    FROM product_bundle_items bundle_item
    INNER JOIN product_bundles bundle
      ON bundle.id = bundle_item.bundle_id
     AND bundle.active = true
    INNER JOIN products product
      ON product.id = bundle_item.product_id
     AND product.active = true
    ORDER BY
      bundle_item.bundle_id,
      bundle_item.sort_order ASC,
      bundle_item.created_at ASC
  `) as BundleItemRow[]

  const itemsByBundle = new Map<string, ProductBundleItemSnapshot[]>()

  for (const item of itemRows) {
    const current = itemsByBundle.get(item.bundle_id) ?? []
    current.push({
      productId: item.product_id,
      name: item.product_name,
      quantity: Number(item.quantity),
    })
    itemsByBundle.set(item.bundle_id, current)
  }

  return rows.flatMap((row) => {
    const items = itemsByBundle.get(row.id) ?? []
    if (items.length < 2) return []

    return [{
      id: row.id,
      name: row.name,
      slug: row.slug,
      shortDescription: row.short_description,
      bundlePrice: row.bundle_price,
      featured: row.featured,
      imageUrl: row.image_url,
      items,
    }]
  })
}
