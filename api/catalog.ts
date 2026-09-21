import { neon } from '@neondatabase/serverless'

type CatalogRow = {
  category_id: string
  category_name: string
  category_slug: string
  category_description: string | null
  product_id: string | null
  product_name: string | null
  product_slug: string | null
  short_description: string | null
  kind: 'service' | 'product' | null
  pricing_mode: 'fixed' | 'from' | 'quote' | null
  base_price: string | null
  image_url: string | null
}

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    return Response.json({ error: 'Catalog unavailable' }, { status: 503 })
  }

  try {
    const sql = neon(databaseUrl)
    const rows = (await sql`
      SELECT
        c.id::text AS category_id,
        c.name AS category_name,
        c.slug AS category_slug,
        c.description AS category_description,
        p.id::text AS product_id,
        p.name AS product_name,
        p.slug AS product_slug,
        p.short_description,
        p.kind,
        p.pricing_mode,
        p.base_price::text,
        image.image_url
      FROM categories c
      LEFT JOIN products p
        ON p.category_id = c.id
       AND p.active = true
      LEFT JOIN LATERAL (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
        LIMIT 1
      ) image ON true
      WHERE c.active = true
      ORDER BY c.sort_order ASC, c.name ASC, p.featured DESC, p.name ASC
    `) as CatalogRow[]

    const categories = new Map<
      string,
      {
        id: string
        name: string
        slug: string
        description: string | null
        products: Array<{
          id: string
          name: string
          slug: string
          shortDescription: string | null
          kind: 'service' | 'product'
          pricingMode: 'fixed' | 'from' | 'quote'
          basePrice: string | null
          imageUrl: string | null
        }>
      }
    >()

    for (const row of rows) {
      if (!categories.has(row.category_id)) {
        categories.set(row.category_id, {
          id: row.category_id,
          name: row.category_name,
          slug: row.category_slug,
          description: row.category_description,
          products: [],
        })
      }

      if (
        row.product_id &&
        row.product_name &&
        row.product_slug &&
        row.kind &&
        row.pricing_mode
      ) {
        categories.get(row.category_id)?.products.push({
          id: row.product_id,
          name: row.product_name,
          slug: row.product_slug,
          shortDescription: row.short_description,
          kind: row.kind,
          pricingMode: row.pricing_mode,
          basePrice: row.base_price,
          imageUrl: row.image_url,
        })
      }
    }

    return Response.json(
      { categories: Array.from(categories.values()) },
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=30',
        },
      },
    )
  } catch {
    return Response.json({ error: 'Catalog unavailable' }, { status: 500 })
  }
}
