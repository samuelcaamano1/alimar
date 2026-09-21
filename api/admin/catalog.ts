import { neon } from '@neondatabase/serverless'
import { requireAdmin } from '../_lib/admin-auth'

type CategoryRow = {
  id: string
  name: string
  slug: string
  description: string | null
}

type ProductRow = {
  id: string
  category_id: string | null
  name: string
  slug: string
  short_description: string | null
  kind: 'service' | 'product'
  pricing_mode: 'fixed' | 'from' | 'quote'
  base_price: string | null
  customization_allowed: boolean
  featured: boolean
  image_url: string | null
}

export async function GET(request: Request) {
  const authError = requireAdmin(request)
  if (authError) return authError

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const sql = neon(databaseUrl)

    const categories = (await sql`
      SELECT
        id::text,
        name,
        slug,
        description
      FROM categories
      WHERE active = true
      ORDER BY sort_order ASC, name ASC
    `) as CategoryRow[]

    const products = (await sql`
      SELECT
        p.id::text,
        p.category_id::text,
        p.name,
        p.slug,
        p.short_description,
        p.kind,
        p.pricing_mode,
        p.base_price::text,
        p.customization_allowed,
        p.featured,
        image.image_url
      FROM products p
      LEFT JOIN LATERAL (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
        LIMIT 1
      ) image ON true
      WHERE p.active = true
      ORDER BY p.featured DESC, p.name ASC
    `) as ProductRow[]

    return Response.json(
      { categories, products },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'Admin catalog unavailable' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
