import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'

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
    .slice(0, 90)
}

async function uniqueSlug(
  sql: NeonQueryFunction<false, false>,
  name: string,
  excludedId?: string,
) {
  const base = slugify(name) || 'categoria'

  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`

    const rows = excludedId
      ? await sql`
          SELECT 1
          FROM categories
          WHERE slug = ${candidate}
            AND id <> ${excludedId}::uuid
          LIMIT 1
        `
      : await sql`
          SELECT 1
          FROM categories
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

  let body: { name?: unknown; description?: unknown }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  const name = text(body.name, 80)
  const description = text(body.description, 240) || null

  if (name.length < 2) {
    return Response.json({ error: 'El nombre de la categoría es obligatorio.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)
    const slug = await uniqueSlug(sql, name)
    const sortRows = await sql`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
      FROM categories
      WHERE active = true
    `
    const nextSort = Number(sortRows[0]?.next_sort ?? 0)

    const [category] = await sql`
      INSERT INTO categories (name, slug, description, sort_order)
      VALUES (${name}, ${slug}, ${description}, ${nextSort})
      RETURNING id::text, name, slug, description, sort_order
    `

    return Response.json(
      { category },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo crear la categoría.' },
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

  try {
    const sql = neon(databaseUrl)

    if (action === 'reorder') {
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds.filter((value): value is string => typeof value === 'string')
        : []

      if (
        orderedIds.length === 0 ||
        orderedIds.length > 100 ||
        orderedIds.some((id) => !UUID_RE.test(id)) ||
        new Set(orderedIds).size !== orderedIds.length
      ) {
        return Response.json({ error: 'Orden de categorías inválido.' }, { status: 400 })
      }

      const activeRows = await sql`
        SELECT id::text
        FROM categories
        WHERE active = true
      `

      const activeIds = new Set(activeRows.map((row) => String(row.id)))

      if (
        activeIds.size !== orderedIds.length ||
        orderedIds.some((id) => !activeIds.has(id))
      ) {
        return Response.json(
          { error: 'La lista de categorías cambió. Actualizá la página e intentá de nuevo.' },
          { status: 409 },
        )
      }

      await sql.transaction(
        orderedIds.map((id, index) => sql`
          UPDATE categories
          SET sort_order = ${index}, updated_at = now()
          WHERE id = ${id}::uuid
            AND active = true
        `),
      )

      return Response.json(
        { ok: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (action !== 'edit') {
      return Response.json({ error: 'Acción de categoría inválida.' }, { status: 400 })
    }

    const id = text(body.id, 40)
    const name = text(body.name, 80)
    const description = text(body.description, 240) || null

    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'Categoría inválida.' }, { status: 400 })
    }

    if (name.length < 2) {
      return Response.json({ error: 'El nombre de la categoría es obligatorio.' }, { status: 400 })
    }

    const currentRows = await sql`
      SELECT id::text
      FROM categories
      WHERE id = ${id}::uuid
        AND active = true
      LIMIT 1
    `

    if (currentRows.length === 0) {
      return Response.json({ error: 'Categoría no encontrada.' }, { status: 404 })
    }

    const slug = await uniqueSlug(sql, name, id)

    const [category] = await sql`
      UPDATE categories
      SET
        name = ${name},
        slug = ${slug},
        description = ${description},
        updated_at = now()
      WHERE id = ${id}::uuid
        AND active = true
      RETURNING id::text, name, slug, description, sort_order
    `

    return Response.json(
      { category },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar la categoría.' },
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
    return Response.json({ error: 'Categoría inválida.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const productRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM products
      WHERE category_id = ${id}::uuid
        AND active = true
    `

    const activeProducts = Number(productRows[0]?.count ?? 0)

    if (activeProducts > 0) {
      return Response.json(
        {
          error:
            activeProducts === 1
              ? 'La categoría tiene 1 producto activo. Movelo o quitalo antes de eliminarla.'
              : `La categoría tiene ${activeProducts} productos activos. Movelos o quitalos antes de eliminarla.`,
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const rows = await sql`
      UPDATE categories
      SET active = false, updated_at = now()
      WHERE id = ${id}::uuid
        AND active = true
      RETURNING id::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Categoría no encontrada.' }, { status: 404 })
    }

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo eliminar la categoría.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
