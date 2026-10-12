import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type IncomingBundleItem = {
  productId: string
  quantity: number
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
    .slice(0, 120)
}

async function uniqueSlug(
  sql: NeonQueryFunction<false, false>,
  name: string,
  excludedId?: string,
) {
  const base = slugify(name) || 'combo'

  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`
    const rows = excludedId
      ? await sql`
          SELECT 1
          FROM product_bundles
          WHERE slug = ${candidate}
            AND id <> ${excludedId}::uuid
          LIMIT 1
        `
      : await sql`
          SELECT 1
          FROM product_bundles
          WHERE slug = ${candidate}
          LIMIT 1
        `

    if (rows.length === 0) return candidate
  }

  throw new Error('Could not generate bundle slug')
}

function parseItems(value: unknown): IncomingBundleItem[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) return null

  const items: IncomingBundleItem[] = []
  const seen = new Set<string>()

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const entry = raw as Record<string, unknown>
    const productId = text(entry.productId, 40)
    const quantity = Number(entry.quantity)

    if (
      !UUID_RE.test(productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 20 ||
      seen.has(productId)
    ) {
      return null
    }

    seen.add(productId)
    items.push({ productId, quantity })
  }

  return items
}

async function validateProducts(
  sql: NeonQueryFunction<false, false>,
  items: IncomingBundleItem[],
) {
  for (const item of items) {
    const rows = await sql`
      SELECT 1
      FROM products
      WHERE id = ${item.productId}::uuid
        AND active = true
      LIMIT 1
    `

    if (rows.length === 0) return false
  }

  return true
}

async function listBundles(sql: NeonQueryFunction<false, false>) {
  const bundles = await sql`
    SELECT
      id::text,
      name,
      slug,
      short_description,
      bundle_price::text,
      featured,
      sort_order
    FROM product_bundles
    WHERE active = true
    ORDER BY featured DESC, sort_order ASC, name ASC
  `

  const items = await sql`
    SELECT
      item.bundle_id::text,
      product.id::text AS product_id,
      product.name AS product_name,
      item.quantity,
      item.sort_order
    FROM product_bundle_items item
    INNER JOIN product_bundles bundle
      ON bundle.id = item.bundle_id
     AND bundle.active = true
    INNER JOIN products product
      ON product.id = item.product_id
    ORDER BY item.bundle_id, item.sort_order ASC, item.created_at ASC
  `

  const itemsByBundle = new Map<string, Array<{
    productId: string
    productName: string
    quantity: number
  }>>()

  for (const item of items) {
    const bundleId = String(item.bundle_id)
    const current = itemsByBundle.get(bundleId) ?? []
    current.push({
      productId: String(item.product_id),
      productName: String(item.product_name),
      quantity: Number(item.quantity),
    })
    itemsByBundle.set(bundleId, current)
  }

  return bundles.map((bundle) => ({
    id: String(bundle.id),
    name: String(bundle.name),
    slug: String(bundle.slug),
    shortDescription:
      typeof bundle.short_description === 'string'
        ? bundle.short_description
        : null,
    bundlePrice: String(bundle.bundle_price),
    featured: bundle.featured === true,
    sortOrder: Number(bundle.sort_order),
    items: itemsByBundle.get(String(bundle.id)) ?? [],
  }))
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
    return Response.json(
      { bundles: await listBundles(sql) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar los combos.' },
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

  const name = text(body.name, 120)
  const shortDescription = text(body.shortDescription, 320) || null
  const bundlePrice = Number(body.bundlePrice)
  const featured = body.featured === true
  const items = parseItems(body.items)

  if (name.length < 2) {
    return Response.json({ error: 'El nombre del combo es obligatorio.' }, { status: 400 })
  }

  if (!Number.isFinite(bundlePrice) || bundlePrice < 0) {
    return Response.json({ error: 'Ingresá un precio válido para el combo.' }, { status: 400 })
  }

  if (!items) {
    return Response.json(
      { error: 'Elegí entre 2 y 8 productos distintos para el combo.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    if (!(await validateProducts(sql, items))) {
      return Response.json(
        { error: 'Uno de los productos seleccionados ya no está activo.' },
        { status: 409 },
      )
    }

    const slug = await uniqueSlug(sql, name)
    const sortRows = await sql`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
      FROM product_bundles
      WHERE active = true
    `
    const nextSort = Number(sortRows[0]?.next_sort ?? 0)
    const bundleIdRows = await sql`SELECT gen_random_uuid()::text AS id`
    const bundleId = String(bundleIdRows[0]?.id ?? '')

    if (!UUID_RE.test(bundleId)) throw new Error('Could not create bundle id')

    const queries = [
      sql`
        INSERT INTO product_bundles (
          id,
          name,
          slug,
          short_description,
          bundle_price,
          featured,
          sort_order
        )
        VALUES (
          ${bundleId}::uuid,
          ${name},
          ${slug},
          ${shortDescription},
          ${bundlePrice},
          ${featured},
          ${nextSort}
        )
      `,
      ...items.map((item, index) => sql`
        INSERT INTO product_bundle_items (
          bundle_id,
          product_id,
          quantity,
          sort_order
        )
        VALUES (
          ${bundleId}::uuid,
          ${item.productId}::uuid,
          ${item.quantity},
          ${index}
        )
      `),
    ]

    await sql.transaction(queries)

    return Response.json(
      { bundles: await listBundles(sql) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo crear el combo.' },
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

  const id = text(body.id, 40)
  const name = text(body.name, 120)
  const shortDescription = text(body.shortDescription, 320) || null
  const bundlePrice = Number(body.bundlePrice)
  const featured = body.featured === true
  const items = parseItems(body.items)

  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Combo inválido.' }, { status: 400 })
  }

  if (name.length < 2) {
    return Response.json({ error: 'El nombre del combo es obligatorio.' }, { status: 400 })
  }

  if (!Number.isFinite(bundlePrice) || bundlePrice < 0) {
    return Response.json({ error: 'Ingresá un precio válido para el combo.' }, { status: 400 })
  }

  if (!items) {
    return Response.json(
      { error: 'Elegí entre 2 y 8 productos distintos para el combo.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    const current = await sql`
      SELECT 1
      FROM product_bundles
      WHERE id = ${id}::uuid
        AND active = true
      LIMIT 1
    `
    if (current.length === 0) {
      return Response.json({ error: 'Combo no encontrado.' }, { status: 404 })
    }

    if (!(await validateProducts(sql, items))) {
      return Response.json(
        { error: 'Uno de los productos seleccionados ya no está activo.' },
        { status: 409 },
      )
    }

    const slug = await uniqueSlug(sql, name, id)

    await sql.transaction([
      sql`
        UPDATE product_bundles
        SET
          name = ${name},
          slug = ${slug},
          short_description = ${shortDescription},
          bundle_price = ${bundlePrice},
          featured = ${featured},
          updated_at = now()
        WHERE id = ${id}::uuid
          AND active = true
      `,
      sql`
        DELETE FROM product_bundle_items
        WHERE bundle_id = ${id}::uuid
      `,
      ...items.map((item, index) => sql`
        INSERT INTO product_bundle_items (
          bundle_id,
          product_id,
          quantity,
          sort_order
        )
        VALUES (
          ${id}::uuid,
          ${item.productId}::uuid,
          ${item.quantity},
          ${index}
        )
      `),
    ])

    return Response.json(
      { bundles: await listBundles(sql) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar el combo.' },
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
    return Response.json({ error: 'Combo inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      UPDATE product_bundles
      SET active = false, updated_at = now()
      WHERE id = ${id}::uuid
        AND active = true
      RETURNING id::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Combo no encontrado.' }, { status: 404 })
    }

    return Response.json(
      { bundles: await listBundles(sql) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo eliminar el combo.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
