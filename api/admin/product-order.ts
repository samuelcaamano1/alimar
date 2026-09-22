import { neon } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
