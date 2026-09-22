import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_IMAGE_LENGTH = 1_500_000
const MAX_IMAGES_PER_PRODUCT = 6

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function validImageUrl(value: string) {
  if (!value || value.length > MAX_IMAGE_LENGTH) return false
  if (/^https:\/\/[^\s]+$/i.test(value)) return true
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value)
}

async function productExists(sql: NeonQueryFunction<false, false>, productId: string) {
  const rows = await sql`
    SELECT 1
    FROM products
    WHERE id = ${productId}::uuid
      AND active = true
    LIMIT 1
  `
  return Array.isArray(rows) && rows.length > 0
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
        image_url,
        alt_text,
        sort_order,
        is_primary,
        created_at
      FROM product_images
      WHERE product_id = ${productId}::uuid
      ORDER BY is_primary DESC, sort_order ASC, created_at ASC
    `

    return Response.json(
      { images: rows },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo cargar la galería.' },
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
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
  const altText = text(body.altText, 180) || null

  if (!UUID_RE.test(productId)) {
    return Response.json({ error: 'Producto inválido.' }, { status: 400 })
  }

  if (!validImageUrl(imageUrl)) {
    return Response.json(
      { error: 'La imagen debe ser HTTPS o una imagen compatible menor a 1.5 MB.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    if (!(await productExists(sql, productId))) {
      return Response.json({ error: 'Producto no encontrado.' }, { status: 404 })
    }

    const stats = await sql`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(MAX(sort_order), -1) + 1 AS next_sort,
        COALESCE(BOOL_OR(is_primary), false) AS has_primary
      FROM product_images
      WHERE product_id = ${productId}::uuid
    `

    const count = Number(stats[0]?.count ?? 0)
    const nextSort = Number(stats[0]?.next_sort ?? 0)
    const makePrimary = stats[0]?.has_primary !== true

    if (count >= MAX_IMAGES_PER_PRODUCT) {
      return Response.json(
        { error: `La galería admite hasta ${MAX_IMAGES_PER_PRODUCT} imágenes.` },
        { status: 409 },
      )
    }

    const [image] = await sql`
      INSERT INTO product_images (
        product_id,
        image_url,
        alt_text,
        sort_order,
        is_primary
      )
      VALUES (
        ${productId}::uuid,
        ${imageUrl},
        ${altText},
        ${nextSort},
        ${makePrimary}
      )
      RETURNING
        id::text,
        product_id::text,
        image_url,
        alt_text,
        sort_order,
        is_primary,
        created_at
    `

    return Response.json(
      { image },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo agregar la imagen.' },
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

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  const action = text(body.action, 20)
  const productId = text(body.productId, 40)

  if (!UUID_RE.test(productId)) {
    return Response.json({ error: 'Producto inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    if (action === 'primary') {
      const id = text(body.id, 40)

      if (!UUID_RE.test(id)) {
        return Response.json({ error: 'Imagen inválida.' }, { status: 400 })
      }

      const rows = await sql`
        SELECT 1
        FROM product_images
        WHERE id = ${id}::uuid
          AND product_id = ${productId}::uuid
        LIMIT 1
      `

      if (rows.length === 0) {
        return Response.json({ error: 'Imagen no encontrada.' }, { status: 404 })
      }

      await sql.transaction([
        sql`
          UPDATE product_images
          SET is_primary = false
          WHERE product_id = ${productId}::uuid
        `,
        sql`
          UPDATE product_images
          SET is_primary = true
          WHERE id = ${id}::uuid
            AND product_id = ${productId}::uuid
        `,
      ])

      return Response.json(
        { ok: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (action === 'reorder') {
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds.filter((value): value is string => typeof value === 'string')
        : []

      if (
        orderedIds.length === 0 ||
        orderedIds.length > MAX_IMAGES_PER_PRODUCT ||
        orderedIds.some((id) => !UUID_RE.test(id)) ||
        new Set(orderedIds).size !== orderedIds.length
      ) {
        return Response.json({ error: 'Orden de imágenes inválido.' }, { status: 400 })
      }

      const rows = await sql`
        SELECT id::text
        FROM product_images
        WHERE product_id = ${productId}::uuid
      `
      const currentIds = new Set(rows.map((row) => String(row.id)))

      if (
        currentIds.size !== orderedIds.length ||
        orderedIds.some((id) => !currentIds.has(id))
      ) {
        return Response.json(
          { error: 'La galería cambió. Actualizala e intentá de nuevo.' },
          { status: 409 },
        )
      }

      await sql.transaction(
        orderedIds.map((id, index) => sql`
          UPDATE product_images
          SET sort_order = ${index}
          WHERE id = ${id}::uuid
            AND product_id = ${productId}::uuid
        `),
      )

      return Response.json(
        { ok: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return Response.json({ error: 'Acción de imagen inválida.' }, { status: 400 })
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar la galería.' },
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
    return Response.json({ error: 'Imagen inválida.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT product_id::text, is_primary
      FROM product_images
      WHERE id = ${id}::uuid
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Imagen no encontrada.' }, { status: 404 })
    }

    const productId = String(rows[0]?.product_id ?? '')
    const wasPrimary = rows[0]?.is_primary === true

    if (wasPrimary) {
      await sql.transaction([
        sql`
          DELETE FROM product_images
          WHERE id = ${id}::uuid
        `,
        sql`
          UPDATE product_images
          SET is_primary = true
          WHERE id = (
            SELECT id
            FROM product_images
            WHERE product_id = ${productId}::uuid
              AND id <> ${id}::uuid
            ORDER BY sort_order ASC, created_at ASC
            LIMIT 1
          )
        `,
      ])
    } else {
      await sql`
        DELETE FROM product_images
        WHERE id = ${id}::uuid
      `
    }

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo quitar la imagen.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
