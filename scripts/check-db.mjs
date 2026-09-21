import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('DATABASE_URL is not configured.')
  process.exit(1)
}

try {
  const sql = neon(databaseUrl)

  const rows = await sql`
    SELECT
      current_database() AS database,
      current_user AS user,
      current_timestamp AS server_time
  `

  console.log('Database connection OK')
  console.table(rows)
} catch (error) {
  console.error('Database connection failed.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}