import { neon } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 125)
}

function validImageUrl(value: string) {
  if (!value) return true
  if (value.length > 1_500_000) return false
  if (/^https:\/\/[^\s]+$/i.test(value)) return true
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value)
}

async function uniqueSlug(sql: ReturnType<typeof neon>, name: string) {
  const base = slugify(name) || 'producto'

  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`
    const rows = await sql`
      SELECT 1
      FROM products
      WHERE slug = ${candidate}
      LIMIT 1
    `
    if (rows.length === 0) return candidate
  }

  throw new Error('Could not generate unique slug')
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const authError = requireAdmin(request)
  if (authError) return authError

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json({ error: 'Database not configured' }, { status: 503 })
  }

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const name = text(body.name, 120)
  const categoryId = text(body.categoryId, 40)
  const shortDescription = text(body.shortDescription, 280) || null
  const imageUrl = text(body.imageUrl, 1_500_000) || null
  const kind = body.kind === 'product' ? 'product' : 'service'
  const pricingMode =
    body.pricingMode === 'from' || body.pricingMode === 'quote'
      ? body.pricingMode
      : 'fixed'
  const customizationAllowed = body.customizationAllowed === true
  const featured = body.featured === true

  const priceNumber =
    pricingMode === 'quote' ? null : Number(String(body.basePrice ?? '').replace(',', '.'))

  if (name.length < 2) {
    return Response.json({ error: 'Product name is required' }, { status: 400 })
  }

  if (!UUID_RE.test(categoryId)) {
    return Response.json({ error: 'Valid category is required' }, { status: 400 })
  }

  if (
    pricingMode !== 'quote' &&
    (!Number.isFinite(priceNumber) || priceNumber === null || priceNumber < 0)
  ) {
    return Response.json({ error: 'Valid price is required' }, { status: 400 })
  }

  if (imageUrl && !validImageUrl(imageUrl)) {
    return Response.json(
      { error: 'Image must be HTTPS or a supported image data URL under 1.5 MB' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    const categoryRows = await sql`
      SELECT 1
      FROM categories
      WHERE id = ${categoryId}::uuid
        AND active = true
      LIMIT 1
    `

    if (categoryRows.length === 0) {
      return Response.json({ error: 'Category not found' }, { status: 400 })
    }

    const slug = await uniqueSlug(sql, name)

    let productId = ''

    if (imageUrl) {
      const rows = await sql`
        WITH new_product AS (
          INSERT INTO products (
            category_id,
            name,
            slug,
            short_description,
            kind,
            pricing_mode,
            base_price,
            customization_allowed,
            featured
          )
          VALUES (
            ${categoryId}::uuid,
            ${name},
            ${slug},
            ${shortDescription},
            ${kind},
            ${pricingMode},
            ${priceNumber},
            ${customizationAllowed},
            ${featured}
          )
          RETURNING id
        ),
        new_image AS (
          INSERT INTO product_images (
            product_id,
            image_url,
            alt_text,
            sort_order,
            is_primary
          )
          SELECT
            id,
            ${imageUrl},
            ${name},
            0,
            true
          FROM new_product
        )
        SELECT id::text
        FROM new_product
      `
      productId = String(rows[0]?.id ?? '')
    } else {
      const rows = await sql`
        INSERT INTO products (
          category_id,
          name,
          slug,
          short_description,
          kind,
          pricing_mode,
          base_price,
          customization_allowed,
          featured
        )
        VALUES (
          ${categoryId}::uuid,
          ${name},
          ${slug},
          ${shortDescription},
          ${kind},
          ${pricingMode},
          ${priceNumber},
          ${customizationAllowed},
          ${featured}
        )
        RETURNING id::text
      `
      productId = String(rows[0]?.id ?? '')
    }

    return Response.json(
      { id: productId },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'Could not create product' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function DELETE(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const authError = requireAdmin(request)
  if (authError) return authError

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json({ error: 'Database not configured' }, { status: 503 })
  }

  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Invalid product id' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      UPDATE products
      SET active = false, updated_at = now()
      WHERE id = ${id}::uuid
        AND active = true
      RETURNING id::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'Could not remove product' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
