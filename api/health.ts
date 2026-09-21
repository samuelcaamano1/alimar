import { neon } from '@neondatabase/serverless'

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return Response.json({ ok: false, error: 'Database not configured' }, { status: 503 })
  try {
    const sql = neon(databaseUrl)
    const [row] = await sql`SELECT current_database() AS database, current_timestamp AS time`
    return Response.json({ ok: true, service: 'alimar-api', database: row.database, time: row.time })
  } catch {
    return Response.json({ ok: false, error: 'Database unavailable' }, { status: 503 })
  }
}
