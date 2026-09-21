import { neon } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_IMAGE_LENGTH = 1_500_000

type ProductInput = {
  name: string
  categoryId: string
  shortDescription: string | null
  imageUrl: string | null
  kind: 'service' | 'product'
  pricingMode: 'fixed' | 'from' | 'quote'
  priceNumber: number | null
  customizationAllowed: boolean
  featured: boolean
}

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
  if (value.length > MAX_IMAGE_LENGTH) return false
  if (/^https:\/\/[^\s]+$/i.test(value)) return true

  return /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value)
}

function parseProductInput(body: Record<string, unknown>): ProductInput | Response {
  const name = text(body.name, 120)
  const categoryId = text(body.categoryId, 40)
  const shortDescription = text(body.shortDescription, 280) || null
  const imageUrl = text(body.imageUrl, MAX_IMAGE_LENGTH) || null
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

  return {
    name,
    categoryId,
    shortDescription,
    imageUrl,
    kind,
    pricingMode,
    priceNumber,
    customizationAllowed,
    featured,
  }
}

async function categoryExists(sql: ReturnType<typeof neon>, categoryId: string) {
  const rows = await sql`
    SELECT 1
    FROM categories
    WHERE id = ${categoryId}::uuid
      AND active = true
    LIMIT 1
  `

  return rows.length > 0
}

async function uniqueSlug(
  sql: ReturnType<typeof neon>,
  name: string,
  excludedId?: string,
) {
  const base = slugify(name) || 'producto'

  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`

    const rows = excludedId
      ? await sql`
          SELECT 1
          FROM products
          WHERE slug = ${candidate}
            AND id <> ${excludedId}::uuid
          LIMIT 1
        `
      : await sql`
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

  const parsed = parseProductInput(body)
  if (parsed instanceof Response) return parsed

  try {
    const sql = neon(databaseUrl)

    if (!(await categoryExists(sql, parsed.categoryId))) {
      return Response.json({ error: 'Category not found' }, { status: 400 })
    }

    const slug = await uniqueSlug(sql, parsed.name)
    let productId = ''

    if (parsed.imageUrl) {
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
            ${parsed.categoryId}::uuid,
            ${parsed.name},
            ${slug},
            ${parsed.shortDescription},
            ${parsed.kind},
            ${parsed.pricingMode},
            ${parsed.priceNumber},
            ${parsed.customizationAllowed},
            ${parsed.featured}
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
            ${parsed.imageUrl},
            ${parsed.name},
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
          ${parsed.categoryId}::uuid,
          ${parsed.name},
          ${slug},
          ${parsed.shortDescription},
          ${parsed.kind},
          ${parsed.pricingMode},
          ${parsed.priceNumber},
          ${parsed.customizationAllowed},
          ${parsed.featured}
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

export async function PATCH(request: Request) {
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

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const parsed = parseProductInput(body)
  if (parsed instanceof Response) return parsed

  const imageAction =
    body.imageAction === 'replace' || body.imageAction === 'remove'
      ? body.imageAction
      : 'keep'

  if (imageAction === 'replace' && !parsed.imageUrl) {
    return Response.json({ error: 'Replacement image is required' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    if (!(await categoryExists(sql, parsed.categoryId))) {
      return Response.json({ error: 'Category not found' }, { status: 400 })
    }

    const slug = await uniqueSlug(sql, parsed.name, id)

    if (imageAction === 'replace' && parsed.imageUrl) {
      await sql`
        WITH updated AS (
          UPDATE products
          SET
            category_id = ${parsed.categoryId}::uuid,
            name = ${parsed.name},
            slug = ${slug},
            short_description = ${parsed.shortDescription},
            kind = ${parsed.kind},
            pricing_mode = ${parsed.pricingMode},
            base_price = ${parsed.priceNumber},
            customization_allowed = ${parsed.customizationAllowed},
            featured = ${parsed.featured},
            updated_at = now()
          WHERE id = ${id}::uuid
            AND active = true
          RETURNING id
        ),
        removed AS (
          DELETE FROM product_images
          WHERE product_id IN (SELECT id FROM updated)
            AND is_primary = true
        )
        INSERT INTO product_images (
          product_id,
          image_url,
          alt_text,
          sort_order,
          is_primary
        )
        SELECT
          id,
          ${parsed.imageUrl},
          ${parsed.name},
          0,
          true
        FROM updated
      `
    } else if (imageAction === 'remove') {
      await sql`
        WITH updated AS (
          UPDATE products
          SET
            category_id = ${parsed.categoryId}::uuid,
            name = ${parsed.name},
            slug = ${slug},
            short_description = ${parsed.shortDescription},
            kind = ${parsed.kind},
            pricing_mode = ${parsed.pricingMode},
            base_price = ${parsed.priceNumber},
            customization_allowed = ${parsed.customizationAllowed},
            featured = ${parsed.featured},
            updated_at = now()
          WHERE id = ${id}::uuid
            AND active = true
          RETURNING id
        )
        DELETE FROM product_images
        WHERE product_id IN (SELECT id FROM updated)
          AND is_primary = true
      `
    } else {
      const rows = await sql`
        UPDATE products
        SET
          category_id = ${parsed.categoryId}::uuid,
          name = ${parsed.name},
          slug = ${slug},
          short_description = ${parsed.shortDescription},
          kind = ${parsed.kind},
          pricing_mode = ${parsed.pricingMode},
          base_price = ${parsed.priceNumber},
          customization_allowed = ${parsed.customizationAllowed},
          featured = ${parsed.featured},
          updated_at = now()
        WHERE id = ${id}::uuid
          AND active = true
        RETURNING id::text
      `

      if (rows.length === 0) {
        return Response.json({ error: 'Product not found' }, { status: 404 })
      }
    }

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'Could not update product' },
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
