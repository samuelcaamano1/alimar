import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'
import { parseAdminMoney } from '../_lib/money.js'

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
  const rawImageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
  const imageUrl = rawImageUrl || null
  const kind = body.kind === 'product' ? 'product' : 'service'
  const pricingMode =
    body.pricingMode === 'from' || body.pricingMode === 'quote'
      ? body.pricingMode
      : 'fixed'
  const customizationAllowed = body.customizationAllowed === true
  const featured = body.featured === true
  const priceNumber =
    pricingMode === 'quote' ? null : parseAdminMoney(body.basePrice)

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

async function categoryExists(sql: NeonQueryFunction<false, false>, categoryId: string) {
  const rows = await sql`
    SELECT 1
    FROM categories
    WHERE id = ${categoryId}::uuid
      AND active = true
    LIMIT 1
  `

  return rows.length > 0
}

async function productExists(
  sql: NeonQueryFunction<false, false>,
  productId: string,
) {
  const rows = await sql`
    SELECT 1
    FROM products
    WHERE id = ${productId}::uuid
      AND active = true
    LIMIT 1
  `

  return rows.length > 0
}

async function uniqueSlug(
  sql: NeonQueryFunction<false, false>,
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

async function handleProductOrder(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : ''
  const orderedIds = Array.isArray(body.orderedIds)
    ? body.orderedIds.filter((value): value is string => typeof value === 'string')
    : []

  if (!UUID_RE.test(categoryId)) {
    return Response.json({ error: 'Categoría inválida.' }, { status: 400 })
  }

  if (
    orderedIds.length === 0 ||
    orderedIds.length > 500 ||
    orderedIds.some((id) => !UUID_RE.test(id)) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    return Response.json({ error: 'Orden de productos inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const activeRows = await sql`
      SELECT id::text
      FROM products
      WHERE category_id = ${categoryId}::uuid
        AND active = true
    `

    const activeIds = new Set(activeRows.map((row) => String(row.id)))

    if (
      activeIds.size !== orderedIds.length ||
      orderedIds.some((id) => !activeIds.has(id))
    ) {
      return Response.json(
        { error: 'La lista de productos cambió. Actualizá el catálogo e intentá de nuevo.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    await sql.transaction(
      orderedIds.map((id, index) => sql`
        UPDATE products
        SET sort_order = ${index}, updated_at = now()
        WHERE id = ${id}::uuid
          AND category_id = ${categoryId}::uuid
          AND active = true
      `),
    )

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar el orden de productos.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
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

  if (new URL(request.url).searchParams.get('action') === 'order') {
    return handleProductOrder(databaseUrl, body)
  }

  const parsed = parseProductInput(body)
  if (parsed instanceof Response) return parsed

  try {
    const sql = neon(databaseUrl)

    if (!(await categoryExists(sql, parsed.categoryId))) {
      return Response.json({ error: 'Category not found' }, { status: 400 })
    }

    const slug = await uniqueSlug(sql, parsed.name)
    const nextSortRows = await sql`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
      FROM products
      WHERE category_id = ${parsed.categoryId}::uuid
        AND active = true
    `
    const nextSort = Number(nextSortRows[0]?.next_sort ?? 0)
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
            featured,
            sort_order
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
            ${parsed.featured},
            ${nextSort}
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
          featured,
          sort_order
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
          ${parsed.featured},
          ${nextSort}
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

    if (!(await productExists(sql, id))) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    const currentRows = await sql`
      SELECT category_id::text
      FROM products
      WHERE id = ${id}::uuid
        AND active = true
      LIMIT 1
    `

    const currentCategoryId = String(currentRows[0]?.category_id ?? '')
    let targetSortOrder: number | null = null

    if (currentCategoryId !== parsed.categoryId) {
      const targetSortRows = await sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
        FROM products
        WHERE category_id = ${parsed.categoryId}::uuid
          AND active = true
      `
      targetSortOrder = Number(targetSortRows[0]?.next_sort ?? 0)
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
            sort_order = COALESCE(${targetSortOrder}, sort_order),
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
            sort_order = COALESCE(${targetSortOrder}, sort_order),
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
          sort_order = COALESCE(${targetSortOrder}, sort_order),
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
