import { neon } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ProductInfo = {
  id: string
  pricing_mode: 'fixed' | 'from' | 'quote'
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function parsePrice(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const price = Number(String(value).replace(',', '.'))

  if (!Number.isFinite(price) || price < 0) {
    return Number.NaN
  }

  return price
}

async function productInfo(sql: ReturnType<typeof neon>, productId: string) {
  const rows = await sql`
    SELECT id::text, pricing_mode
    FROM products
    WHERE id = ${productId}::uuid
      AND active = true
    LIMIT 1
  `

  return (rows[0] ?? null) as ProductInfo | null
}

function validateVariantForProduct(
  product: ProductInfo,
  name: string,
  priceOverride: number | null,
) {
  if (name.length < 1) {
    return Response.json({ error: 'El nombre de la variante es obligatorio.' }, { status: 400 })
  }

  if (Number.isNaN(priceOverride)) {
    return Response.json({ error: 'El precio de la variante no es válido.' }, { status: 400 })
  }

  if (product.pricing_mode === 'quote' && priceOverride !== null) {
    return Response.json(
      { error: 'Los productos a consultar no pueden tener precio fijo por variante.' },
      { status: 400 },
    )
  }

  return null
}

export async function GET(request: Request) {
  const authError = requireAdmin(request)
  if (authError) return authError

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json({ error: 'Database not configured' }, { status: 503 })
  }

  const productId = new URL(request.url).searchParams.get('productId') ?? ''

  if (!UUID_RE.test(productId)) {
    return Response.json({ error: 'Producto inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        id::text,
        product_id::text,
        name,
        price_override::text,
        sort_order,
        active
      FROM product_variants
      WHERE product_id = ${productId}::uuid
        AND active = true
      ORDER BY sort_order ASC, name ASC
    `

    return Response.json(
      { variants: rows },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar las variantes.' },
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
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  const productId = text(body.productId, 40)
  const name = text(body.name, 80)
  const priceOverride = parsePrice(body.priceOverride)

  if (!UUID_RE.test(productId)) {
    return Response.json({ error: 'Producto inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)
    const product = await productInfo(sql, productId)

    if (!product) {
      return Response.json({ error: 'Producto no encontrado.' }, { status: 404 })
    }

    const validationError = validateVariantForProduct(product, name, priceOverride)
    if (validationError) return validationError

    const sortRows = await sql`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
      FROM product_variants
      WHERE product_id = ${productId}::uuid
    `

    const nextSort = Number(sortRows[0]?.next_sort ?? 0)

    const rows = await sql`
      INSERT INTO product_variants (
        product_id,
        name,
        price_override,
        sort_order
      )
      VALUES (
        ${productId}::uuid,
        ${name},
        ${priceOverride},
        ${nextSort}
      )
      RETURNING
        id::text,
        product_id::text,
        name,
        price_override::text,
        sort_order,
        active
    `

    return Response.json(
      { variant: rows[0] },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo crear la variante. Revisá que el nombre no esté repetido.' },
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
    return Response.json({ error: 'Variante inválida.' }, { status: 400 })
  }

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  const name = text(body.name, 80)
  const priceOverride = parsePrice(body.priceOverride)

  try {
    const sql = neon(databaseUrl)

    const currentRows = await sql`
      SELECT product_id::text
      FROM product_variants
      WHERE id = ${id}::uuid
        AND active = true
      LIMIT 1
    `

    if (currentRows.length === 0) {
      return Response.json({ error: 'Variante no encontrada.' }, { status: 404 })
    }

    const productId = String(currentRows[0].product_id)
    const product = await productInfo(sql, productId)

    if (!product) {
      return Response.json({ error: 'Producto no encontrado.' }, { status: 404 })
    }

    const validationError = validateVariantForProduct(product, name, priceOverride)
    if (validationError) return validationError

    const rows = await sql`
      UPDATE product_variants
      SET
        name = ${name},
        price_override = ${priceOverride},
        updated_at = now()
      WHERE id = ${id}::uuid
        AND active = true
      RETURNING
        id::text,
        product_id::text,
        name,
        price_override::text,
        sort_order,
        active
    `

    return Response.json(
      { variant: rows[0] },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar la variante. Revisá que el nombre no esté repetido.' },
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
    return Response.json({ error: 'Variante inválida.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      UPDATE product_variants
      SET
        active = false,
        updated_at = now()
      WHERE id = ${id}::uuid
        AND active = true
      RETURNING id::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Variante no encontrada.' }, { status: 404 })
    }

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo quitar la variante.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
