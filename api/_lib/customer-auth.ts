import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import { neon } from '@neondatabase/serverless'

const COOKIE_NAME = 'alimar_customer'
const SESSION_SECONDS = 60 * 60 * 24 * 14
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const scryptAsync = promisify(scryptCallback)

export type CustomerAccount = {
  id: string
  email: string
  name: string
  phone: string
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeEmail(value: unknown) {
  return text(value, 160).toLowerCase()
}

function parseCookies(request: Request) {
  const result = new Map<string, string>()
  const raw = request.headers.get('cookie') ?? ''

  for (const part of raw.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    result.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim())
  }

  return result
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function sessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}; Priority=High${secure}`
}

function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Priority=High${secure}`
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split('$')
  if (algorithm !== 'scrypt' || !salt || !expectedHex || !/^[0-9a-f]+$/i.test(expectedHex)) {
    return false
  }

  const expected = Buffer.from(expectedHex, 'hex')
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

async function createSession(databaseUrl: string, accountId: string) {
  const sql = neon(databaseUrl)
  const token = randomBytes(32).toString('base64url')
  const hash = tokenHash(token)
  const sessionId = randomUUID()

  await sql.transaction([
    sql`
      DELETE FROM customer_sessions
      WHERE expires_at <= now()
    `,
    sql`
      INSERT INTO customer_sessions (
        id,
        account_id,
        token_hash,
        expires_at
      )
      VALUES (
        ${sessionId}::uuid,
        ${accountId}::uuid,
        ${hash},
        now() + (${SESSION_SECONDS} * INTERVAL '1 second')
      )
    `,
  ])

  return token
}

export async function getCustomerAccount(
  databaseUrl: string,
  request: Request,
): Promise<CustomerAccount | null> {
  const token = parseCookies(request).get(COOKIE_NAME)
  if (!token || token.length < 20 || token.length > 200) return null

  const sql = neon(databaseUrl)
  const hash = tokenHash(token)

  try {
    const rows = await sql`
      SELECT
        account.id::text,
        account.email,
        account.name,
        account.phone
      FROM customer_sessions session
      JOIN customer_accounts account ON account.id = session.account_id
      WHERE session.token_hash = ${hash}
        AND session.expires_at > now()
        AND account.active = true
      LIMIT 1
    `

    if (rows.length === 0) return null

    return {
      id: String(rows[0].id),
      email: String(rows[0].email),
      name: String(rows[0].name),
      phone: String(rows[0].phone),
    }
  } catch {
    return null
  }
}

export function customerUnauthorized() {
  return Response.json(
    { error: 'Iniciá sesión para continuar.' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function customerSessionResponse(
  databaseUrl: string,
  request: Request,
) {
  const account = await getCustomerAccount(databaseUrl, request)
  return Response.json(
    { authenticated: Boolean(account), account },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function registerCustomer(
  databaseUrl: string,
  request: Request,
  body: Record<string, unknown>,
) {
  const email = normalizeEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : ''
  const name = text(body.name, 100)
  const phone = text(body.phone, 40)

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: 'Ingresá un email válido.' }, { status: 400 })
  }
  if (password.length < 8 || password.length > 128) {
    return Response.json(
      { error: 'La contraseña debe tener entre 8 y 128 caracteres.' },
      { status: 400 },
    )
  }
  if (name.length < 2) {
    return Response.json({ error: 'Ingresá tu nombre.' }, { status: 400 })
  }
  if (phone.replace(/\D/g, '').length < 6) {
    return Response.json({ error: 'Ingresá un WhatsApp válido.' }, { status: 400 })
  }

  const sql = neon(databaseUrl)
  const accountId = randomUUID()
  const passwordHash = await hashPassword(password)

  try {
    const existing = await sql`
      SELECT 1
      FROM customer_accounts
      WHERE lower(email) = ${email}
      LIMIT 1
    `

    if (existing.length > 0) {
      return Response.json(
        { error: 'Ya existe una cuenta con ese email.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    await sql`
      INSERT INTO customer_accounts (
        id,
        email,
        password_hash,
        name,
        phone
      )
      VALUES (
        ${accountId}::uuid,
        ${email},
        ${passwordHash},
        ${name},
        ${phone}
      )
    `

    const token = await createSession(databaseUrl, accountId)
    const account: CustomerAccount = { id: accountId, email, name, phone }

    return Response.json(
      { ok: true, account },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': sessionCookie(request, token),
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos crear la cuenta. Probá nuevamente.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function loginCustomer(
  databaseUrl: string,
  request: Request,
  body: Record<string, unknown>,
) {
  const email = normalizeEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : ''

  if (!EMAIL_RE.test(email) || password.length < 1 || password.length > 128) {
    return Response.json(
      { error: 'Email o contraseña incorrectos.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const sql = neon(databaseUrl)

  try {
    const rows = await sql`
      SELECT id::text, email, password_hash, name, phone
      FROM customer_accounts
      WHERE lower(email) = ${email}
        AND active = true
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json(
        { error: 'Email o contraseña incorrectos.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const row = rows[0]
    const valid = await verifyPassword(password, String(row.password_hash ?? ''))

    if (!valid) {
      return Response.json(
        { error: 'Email o contraseña incorrectos.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const account: CustomerAccount = {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      phone: String(row.phone),
    }
    const token = await createSession(databaseUrl, account.id)

    return Response.json(
      { ok: true, account },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': sessionCookie(request, token),
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos iniciar sesión. Probá nuevamente.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function logoutCustomer(databaseUrl: string, request: Request) {
  const token = parseCookies(request).get(COOKIE_NAME)

  if (token) {
    try {
      const sql = neon(databaseUrl)
      await sql`
        DELETE FROM customer_sessions
        WHERE token_hash = ${tokenHash(token)}
      `
    } catch {
      // The browser cookie is still cleared even if server cleanup fails.
    }
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': clearSessionCookie(request),
      },
    },
  )
}

export async function customerOverviewResponse(
  databaseUrl: string,
  request: Request,
) {
  const account = await getCustomerAccount(databaseUrl, request)
  if (!account) return customerUnauthorized()

  const sql = neon(databaseUrl)

  try {
    const [orders, requests] = await Promise.all([
      sql`
        SELECT
          public_code,
          public_tracking_token::text AS tracking_token,
          status,
          production_stage,
          promised_for::text,
          known_total::text,
          agreed_total::text,
          created_at::text
        FROM orders
        WHERE customer_account_id = ${account.id}::uuid
        ORDER BY created_at DESC
        LIMIT 50
      `,
      sql`
        SELECT
          request_number,
          status,
          request_type,
          needed_date::text,
          created_at::text
        FROM custom_requests
        WHERE customer_account_id = ${account.id}::uuid
        ORDER BY created_at DESC
        LIMIT 50
      `,
    ])

    return Response.json(
      {
        account,
        orders: orders.map((row) => ({
          code: String(row.public_code),
          trackingToken: String(row.tracking_token),
          status: String(row.status),
          productionStage: String(row.production_stage ?? 'not_started'),
          promisedFor: row.promised_for ? String(row.promised_for).slice(0, 10) : null,
          knownTotal: String(row.known_total ?? '0'),
          agreedTotal: row.agreed_total === null ? null : String(row.agreed_total),
          createdAt: String(row.created_at),
        })),
        customRequests: requests.map((row) => ({
          code: `SOL-${String(Number(row.request_number)).padStart(6, '0')}`,
          status: String(row.status),
          requestType: String(row.request_type),
          neededDate: row.needed_date ? String(row.needed_date).slice(0, 10) : null,
          createdAt: String(row.created_at),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos cargar tu cuenta.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
