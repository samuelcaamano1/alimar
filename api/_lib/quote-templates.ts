import { neon } from '@neondatabase/serverless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function recipeFrom(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const recipe = value as Record<string, unknown>
  if (recipe.version !== 1 || !Array.isArray(recipe.components)) return null
  if (recipe.components.length < 1 || recipe.components.length > 30) return null

  const serialized = JSON.stringify(recipe)
  if (serialized.length > 50_000) return null

  return recipe
}

function format(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    recipe: row.recipe,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function listQuoteTemplates(databaseUrl: string) {
  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      SELECT id::text, name, recipe, created_at::text, updated_at::text
      FROM quote_templates
      ORDER BY updated_at DESC, name ASC
      LIMIT 100
    `

    return Response.json(
      { templates: rows.map((row) => format(row as Record<string, unknown>)) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar las plantillas.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function createQuoteTemplate(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const name = text(body.name, 120)
  const recipe = recipeFrom(body.recipe)

  if (name.length < 2 || !recipe) {
    return Response.json(
      { error: 'Nombre o receta de plantilla inválidos.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      INSERT INTO quote_templates (name, recipe)
      VALUES (${name}, ${JSON.stringify(recipe)}::jsonb)
      RETURNING id::text, name, recipe, created_at::text, updated_at::text
    `

    return Response.json(
      { template: format(rows[0] as Record<string, unknown>) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo guardar la plantilla. Revisá si ya existe ese nombre.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function updateQuoteTemplate(
  databaseUrl: string,
  id: string,
  body: Record<string, unknown>,
) {
  if (!UUID_RE.test(id)) {
    return Response.json(
      { error: 'Plantilla inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const name = text(body.name, 120)
  const recipe = recipeFrom(body.recipe)

  if (name.length < 2 || !recipe) {
    return Response.json(
      { error: 'Nombre o receta de plantilla inválidos.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      UPDATE quote_templates
      SET
        name = ${name},
        recipe = ${JSON.stringify(recipe)}::jsonb,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id::text, name, recipe, created_at::text, updated_at::text
    `

    if (rows.length === 0) {
      return Response.json(
        { error: 'Plantilla no encontrada.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return Response.json(
      { template: format(rows[0] as Record<string, unknown>) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar la plantilla.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function deleteQuoteTemplate(databaseUrl: string, id: string) {
  if (!UUID_RE.test(id)) {
    return Response.json(
      { error: 'Plantilla inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const sql = neon(databaseUrl)
    await sql`
      DELETE FROM quote_templates
      WHERE id = ${id}::uuid
    `

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo borrar la plantilla.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
