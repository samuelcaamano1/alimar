import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import { neon } from '@neondatabase/serverless'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const scryptAsync = promisify(scryptCallback)

export type AdminAccount = {
  id: string
  email: string
  name: string
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeEmail(value: unknown) {
  return text(value, 160).toLowerCase()
}

async function hashPassword(password: string) {
  const salt = cryptoRandomHex(16)
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

function cryptoRandomHex(bytes: number) {
  return randomBytes(bytes).toString('hex')
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split('$')
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !expectedHex ||
    !/^[0-9a-f]+$/i.test(expectedHex)
  ) {
    return false
  }

  const expected = Buffer.from(expectedHex, 'hex')
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

function accountFromRow(row: Record<string, unknown>): AdminAccount {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
  }
}

export async function countActiveAdminAccounts(databaseUrl: string) {
  const sql = neon(databaseUrl)
  const rows = await sql`
    SELECT count(*)::int AS total
    FROM admin_accounts
    WHERE active = true
  `
  return Number(rows[0]?.total ?? 0)
}

export async function getActiveAdminAccount(
  databaseUrl: string,
  accountId: string,
): Promise<AdminAccount | null> {
  const sql = neon(databaseUrl)
  const rows = await sql`
    SELECT id::text, email, name
    FROM admin_accounts
    WHERE id = ${accountId}::uuid
      AND active = true
    LIMIT 1
  `
  return rows.length > 0 ? accountFromRow(rows[0]) : null
}

export async function getActiveAdminAccountByEmail(
  databaseUrl: string,
  email: string,
): Promise<AdminAccount | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return null

  const sql = neon(databaseUrl)
  const rows = await sql`
    SELECT id::text, email, name
    FROM admin_accounts
    WHERE lower(email) = ${normalizedEmail}
      AND active = true
    LIMIT 1
  `

  return rows.length > 0 ? accountFromRow(rows[0]) : null
}

export async function bootstrapAdminAccount(
  databaseUrl: string,
  body: Record<string, unknown>,
): Promise<{ account?: AdminAccount; error?: string; status?: number }> {
  const email = normalizeEmail(body.email)
  const name = text(body.name, 100)
  const password = typeof body.password === 'string' ? body.password : ''

  if (!EMAIL_RE.test(email)) {
    return { error: 'Ingresá un email válido.', status: 400 }
  }
  if (name.length < 2) {
    return { error: 'Ingresá el nombre del administrador.', status: 400 }
  }
  if (password.length < 8 || password.length > 128) {
    return {
      error: 'La contraseña debe tener entre 8 y 128 caracteres.',
      status: 400,
    }
  }

  const sql = neon(databaseUrl)
  const current = await countActiveAdminAccounts(databaseUrl)
  if (current > 0) {
    return { error: 'La cuenta administrativa ya fue creada.', status: 409 }
  }

  const accountId = randomUUID()
  const passwordHash = await hashPassword(password)

  try {
    const rows = await sql`
      INSERT INTO admin_accounts (
        id,
        email,
        password_hash,
        name,
        active,
        last_login_at
      )
      VALUES (
        ${accountId}::uuid,
        ${email},
        ${passwordHash},
        ${name},
        true,
        now()
      )
      RETURNING id::text, email, name
    `

    return { account: accountFromRow(rows[0]) }
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''

    if (code === '23505') {
      return { error: 'La cuenta administrativa ya fue creada.', status: 409 }
    }
    throw error
  }
}

export async function authenticateAdminAccount(
  databaseUrl: string,
  body: Record<string, unknown>,
): Promise<{ account?: AdminAccount; error?: string; status?: number }> {
  const email = normalizeEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : ''

  if (!EMAIL_RE.test(email) || password.length < 1 || password.length > 128) {
    return { error: 'Email o contraseña incorrectos.', status: 401 }
  }

  const sql = neon(databaseUrl)
  const rows = await sql`
    SELECT id::text, email, name, password_hash
    FROM admin_accounts
    WHERE lower(email) = ${email}
      AND active = true
    LIMIT 1
  `

  if (rows.length === 0) {
    return { error: 'Email o contraseña incorrectos.', status: 401 }
  }

  const valid = await verifyPassword(password, String(rows[0].password_hash ?? ''))
  if (!valid) {
    return { error: 'Email o contraseña incorrectos.', status: 401 }
  }

  const account = accountFromRow(rows[0])
  await sql`
    UPDATE admin_accounts
    SET last_login_at = now(), updated_at = now()
    WHERE id = ${account.id}::uuid
  `

  return { account }
}

export async function updateAdminAccountProfile(
  databaseUrl: string,
  accountId: string,
  body: Record<string, unknown>,
): Promise<{ account?: AdminAccount; error?: string; status?: number }> {
  const name = text(body.name, 100)

  if (name.length < 2) {
    return { error: 'Ingresá el nombre del administrador.', status: 400 }
  }

  const sql = neon(databaseUrl)

  try {
    const rows = await sql`
      UPDATE admin_accounts
      SET name = ${name}, updated_at = now()
      WHERE id = ${accountId}::uuid
        AND active = true
      RETURNING id::text, email, name
    `

    if (rows.length === 0) {
      return { error: 'La cuenta administrativa no está disponible.', status: 401 }
    }

    return { account: accountFromRow(rows[0]) }
  } catch {
    return { error: 'No pudimos actualizar la cuenta administrativa.', status: 500 }
  }
}

export async function changeAdminAccountPassword(
  databaseUrl: string,
  accountId: string,
  body: Record<string, unknown>,
): Promise<{ ok?: true; error?: string; status?: number }> {
  const currentPassword =
    typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword =
    typeof body.newPassword === 'string' ? body.newPassword : ''

  if (currentPassword.length < 1 || currentPassword.length > 128) {
    return { error: 'Ingresá tu contraseña actual.', status: 400 }
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return {
      error: 'La nueva contraseña debe tener entre 8 y 128 caracteres.',
      status: 400,
    }
  }
  if (currentPassword === newPassword) {
    return { error: 'La nueva contraseña debe ser distinta de la actual.', status: 400 }
  }

  const sql = neon(databaseUrl)

  try {
    const rows = await sql`
      SELECT password_hash
      FROM admin_accounts
      WHERE id = ${accountId}::uuid
        AND active = true
      LIMIT 1
    `

    if (rows.length === 0) {
      return { error: 'La cuenta administrativa no está disponible.', status: 401 }
    }

    const valid = await verifyPassword(
      currentPassword,
      String(rows[0].password_hash ?? ''),
    )

    if (!valid) {
      return { error: 'La contraseña actual no es correcta.', status: 401 }
    }

    const passwordHash = await hashPassword(newPassword)
    await sql`
      UPDATE admin_accounts
      SET password_hash = ${passwordHash}, updated_at = now()
      WHERE id = ${accountId}::uuid
        AND active = true
    `

    return { ok: true }
  } catch {
    return { error: 'No pudimos cambiar la contraseña administrativa.', status: 500 }
  }
}
