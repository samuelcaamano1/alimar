import { neon } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth'

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
  sql: ReturnType<typeof neon>,
  name: string,
) {
  const base = slugify(name) || 'categoria'

  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`
    const rows = await sql`
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
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const name = text(body.name, 80)
  const description = text(body.description, 240) || null

  if (name.length < 2) {
    return Response.json({ error: 'Category name is required' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)
    const slug = await uniqueSlug(sql, name)

    const [category] = await sql`
      INSERT INTO categories (name, slug, description)
      VALUES (${name}, ${slug}, ${description})
      RETURNING id::text, name, slug, description
    `

    return Response.json(
      { category },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'Could not create category' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
