import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Pool } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is not configured.')
  process.exit(1)
}

const migrationsDir = join(process.cwd(), 'db', 'migrations')
const mode = process.argv[2] ?? 'up'
const pool = new Pool({ connectionString: databaseUrl })
const client = await pool.connect()

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()

  const { rows } = await client.query(
    'SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename'
  )
  const applied = new Map(rows.map((row) => [row.filename, row]))

  const plans = []
  for (const filename of files) {
    const sql = await readFile(join(migrationsDir, filename), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    const previous = applied.get(filename)

    if (previous && previous.checksum.trim() !== checksum) {
      throw new Error(`Checksum mismatch for applied migration: ${filename}`)
    }

    plans.push({ filename, sql, checksum, applied: Boolean(previous) })
  }

  if (mode === 'status') {
    for (const migration of plans) {
      console.log(`${migration.applied ? 'APPLIED' : 'PENDING'}  ${migration.filename}`)
    }
    const unknown = rows.filter((row) => !files.includes(row.filename))
    for (const row of unknown) console.log(`MISSING  ${row.filename}`)
    process.exitCode = unknown.length ? 1 : 0
  } else if (mode === 'up') {
    for (const migration of plans.filter((item) => !item.applied)) {
      console.log(`Applying ${migration.filename}...`)
      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [migration.filename, migration.checksum]
        )
        await client.query('COMMIT')
        console.log(`Applied ${migration.filename}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
    console.log('Migrations OK')
  } else {
    throw new Error(`Unknown migration mode: ${mode}`)
  }
} catch (error) {
  console.error('Migration failed.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
