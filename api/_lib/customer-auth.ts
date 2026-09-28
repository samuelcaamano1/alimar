import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import { neon } from '@neondatabase/serverless'
import { clearAdminSessionCookie } from './admin-auth.js'

const COOKIE_NAME = 'alimar_customer'
const SESSION_SECONDS = 60 * 60 * 24 * 14
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ORDER_CODE_RE = /^PED-\d{4}-[A-Z0-9]{6,12}$/i
const scryptAsync = promisify(scryptCallback)

export type CustomerAccount = {
  id: string
  email: string
  name: string
  phone: string
  isAdmin: boolean
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
        account.phone,
        EXISTS (
          SELECT 1
          FROM admin_accounts admin
          WHERE lower(admin.email) = lower(account.email)
            AND admin.active = true
            AND admin.password_hash = account.password_hash
        ) AS is_admin
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
      isAdmin: Boolean(rows[0].is_admin),
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
    return Response.json(
      { error: 'Ingresá un WhatsApp válido.' },
      { status: 400 },
    )
  }

  const sql = neon(databaseUrl)

  try {
    const reservedAdmin = await sql`
      SELECT 1
      FROM admin_accounts
      WHERE lower(email) = ${email}
        AND active = true
      LIMIT 1
    `

    if (reservedAdmin.length > 0) {
      return Response.json(
        {
          error:
            'Este email corresponde a la cuenta administrativa. Usá Iniciar sesión.',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

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

    const accountId = randomUUID()
    const passwordHash = await hashPassword(password)

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
    const account: CustomerAccount = {
      id: accountId,
      email,
      name,
      phone,
      isAdmin: false,
    }

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
    const adminRows = await sql`
      SELECT id::text, email, password_hash, name
      FROM admin_accounts
      WHERE lower(email) = ${email}
        AND active = true
      LIMIT 1
    `

    if (adminRows.length > 0) {
      const validAdmin = await verifyPassword(
        password,
        String(adminRows[0].password_hash ?? ''),
      )

      if (!validAdmin) {
        return Response.json(
          { error: 'Email o contraseña incorrectos.' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      const adminHash = String(adminRows[0].password_hash)
      const adminName = String(adminRows[0].name)

      let customerRows = await sql`
        SELECT id::text, email, name, phone
        FROM customer_accounts
        WHERE lower(email) = ${email}
        LIMIT 1
      `

      if (customerRows.length === 0) {
        customerRows = await sql`
          INSERT INTO customer_accounts (
            email,
            password_hash,
            name,
            phone,
            active
          )
          VALUES (
            ${String(adminRows[0].email)},
            ${adminHash},
            ${adminName},
            '',
            true
          )
          RETURNING id::text, email, name, phone
        `
      } else {
        await sql`
          UPDATE customer_accounts
          SET
            password_hash = ${adminHash},
            active = true,
            updated_at = now()
          WHERE id = ${String(customerRows[0].id)}::uuid
        `
      }

      await sql`
        UPDATE admin_accounts
        SET last_login_at = now(), updated_at = now()
        WHERE id = ${String(adminRows[0].id)}::uuid
      `

      const row = customerRows[0]
      const account: CustomerAccount = {
        id: String(row.id),
        email: String(row.email),
        name: String(row.name),
        phone: String(row.phone),
        isAdmin: true,
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
    }

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
    const valid = await verifyPassword(
      password,
      String(row.password_hash ?? ''),
    )

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
      isAdmin: false,
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

export async function logoutCustomer(
  databaseUrl: string,
  request: Request,
) {
  const token = parseCookies(request).get(COOKIE_NAME)

  if (token) {
    try {
      const sql = neon(databaseUrl)
      await sql`
        DELETE FROM customer_sessions
        WHERE token_hash = ${tokenHash(token)}
      `
    } catch {
      // Las cookies igual se limpian si falla el cleanup del servidor.
    }
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', clearSessionCookie(request))
  headers.append('Set-Cookie', clearAdminSessionCookie(request))

  return Response.json({ ok: true }, { headers })
}

export async function updateCustomerProfile(
  databaseUrl: string,
  request: Request,
  body: Record<string, unknown>,
) {
  const account = await getCustomerAccount(databaseUrl, request)
  if (!account) return customerUnauthorized()

  const name = text(body.name, 100)
  const phone = text(body.phone, 40)

  if (name.length < 2) {
    return Response.json({ error: 'Ingresá tu nombre.' }, { status: 400 })
  }
  if (phone.replace(/\D/g, '').length < 6) {
    return Response.json({ error: 'Ingresá un WhatsApp válido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)
    await sql`
      UPDATE customer_accounts
      SET
        name = ${name},
        phone = ${phone},
        updated_at = now()
      WHERE id = ${account.id}::uuid
        AND active = true
    `

    return Response.json(
      {
        ok: true,
        account: {
          ...account,
          name,
          phone,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos actualizar tus datos.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function changeCustomerPassword(
  databaseUrl: string,
  request: Request,
  body: Record<string, unknown>,
) {
  const account = await getCustomerAccount(databaseUrl, request)
  if (!account) return customerUnauthorized()

  const currentPassword =
    typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword =
    typeof body.newPassword === 'string' ? body.newPassword : ''

  if (currentPassword.length < 1 || currentPassword.length > 128) {
    return Response.json(
      { error: 'Ingresá tu contraseña actual.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (newPassword.length < 8 || newPassword.length > 128) {
    return Response.json(
      { error: 'La nueva contraseña debe tener entre 8 y 128 caracteres.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      SELECT password_hash
      FROM customer_accounts
      WHERE id = ${account.id}::uuid
        AND active = true
      LIMIT 1
    `

    if (rows.length === 0) return customerUnauthorized()

    const valid = await verifyPassword(
      currentPassword,
      String(rows[0].password_hash ?? ''),
    )

    if (!valid) {
      return Response.json(
        { error: 'La contraseña actual no es correcta.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const passwordHash = await hashPassword(newPassword)
    const token = randomBytes(32).toString('base64url')
    const hash = tokenHash(token)
    const sessionId = randomUUID()

    await sql.transaction([
      sql`
        UPDATE customer_accounts
        SET
          password_hash = ${passwordHash},
          updated_at = now()
        WHERE id = ${account.id}::uuid
      `,
      ...(account.isAdmin
        ? [
            sql`
              UPDATE admin_accounts
              SET
                password_hash = ${passwordHash},
                updated_at = now()
              WHERE lower(email) = lower(${account.email})
                AND active = true
            `,
          ]
        : []),
      sql`
        DELETE FROM customer_sessions
        WHERE account_id = ${account.id}::uuid
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
          ${account.id}::uuid,
          ${hash},
          now() + (${SESSION_SECONDS} * INTERVAL '1 second')
        )
      `,
    ])

    return Response.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': sessionCookie(request, token),
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos cambiar la contraseña.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function resetCustomerPasswordWithToken(
  databaseUrl: string,
  request: Request,
  body: Record<string, unknown>,
) {
  const resetToken =
    typeof body.token === 'string' ? body.token.trim() : ''
  const newPassword =
    typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!/^[A-Za-z0-9_-]{40,100}$/.test(resetToken)) {
    return Response.json(
      { error: 'Este enlace de recuperación no es válido o ya venció.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (newPassword.length < 8 || newPassword.length > 128) {
    return Response.json(
      { error: 'La nueva contraseña debe tener entre 8 y 128 caracteres.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const passwordHash = await hashPassword(newPassword)
  const resetHash = tokenHash(resetToken)
  const sessionToken = randomBytes(32).toString('base64url')
  const sessionHash = tokenHash(sessionToken)
  const sessionId = randomUUID()

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      WITH claimed AS (
        UPDATE customer_password_resets reset
        SET used_at = now()
        FROM customer_accounts account
        WHERE reset.token_hash = ${resetHash}
          AND reset.account_id = account.id
          AND reset.used_at IS NULL
          AND reset.expires_at > now()
          AND account.active = true
        RETURNING reset.account_id
      ),
      linked_admin AS (
        SELECT admin.id
        FROM claimed
        JOIN customer_accounts account
          ON account.id = claimed.account_id
        JOIN admin_accounts admin
          ON lower(admin.email) = lower(account.email)
        WHERE admin.active = true
          AND admin.password_hash = account.password_hash
        LIMIT 1
      ),
      updated AS (
        UPDATE customer_accounts account
        SET
          password_hash = ${passwordHash},
          updated_at = now()
        FROM claimed
        WHERE account.id = claimed.account_id
        RETURNING
          account.id,
          account.email,
          account.name,
          account.phone
      ),
      updated_admin AS (
        UPDATE admin_accounts admin
        SET
          password_hash = ${passwordHash},
          updated_at = now()
        FROM linked_admin
        WHERE admin.id = linked_admin.id
        RETURNING admin.id
      ),
      deleted_sessions AS (
        DELETE FROM customer_sessions session
        USING updated
        WHERE session.account_id = updated.id
        RETURNING session.id
      ),
      inserted_session AS (
        INSERT INTO customer_sessions (
          id,
          account_id,
          token_hash,
          expires_at
        )
        SELECT
          ${sessionId}::uuid,
          updated.id,
          ${sessionHash},
          now() + (${SESSION_SECONDS} * INTERVAL '1 second')
        FROM updated
        RETURNING account_id
      )
      SELECT
        updated.id::text,
        updated.email,
        updated.name,
        updated.phone,
        EXISTS (SELECT 1 FROM updated_admin) AS is_admin
      FROM updated
      JOIN inserted_session
        ON inserted_session.account_id = updated.id
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json(
        {
          error:
            'Este enlace de recuperación no es válido, ya fue usado o venció.',
        },
        { status: 410, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const account: CustomerAccount = {
      id: String(rows[0].id),
      email: String(rows[0].email),
      name: String(rows[0].name),
      phone: String(rows[0].phone),
      isAdmin: Boolean(rows[0].is_admin),
    }

    return Response.json(
      { ok: true, account },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': sessionCookie(request, sessionToken),
        },
      },
    )
  } catch {
    return Response.json(
      {
        error:
          'No pudimos restablecer la contraseña. Pedí un enlace nuevo.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function claimHistoricalOrder(
  databaseUrl: string,
  request: Request,
  body: Record<string, unknown>,
) {
  const account = await getCustomerAccount(databaseUrl, request)
  if (!account) return customerUnauthorized()

  const orderCode =
    typeof body.orderCode === 'string'
      ? body.orderCode.trim().toUpperCase().slice(0, 32)
      : ''
  const phone =
    typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : ''

  if (!ORDER_CODE_RE.test(orderCode)) {
    return Response.json(
      { error: 'Ingresá un código PED válido.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (phone.length < 10) {
    return Response.json(
      { error: 'Ingresá el WhatsApp usado en ese pedido.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      SELECT
        id::text,
        status,
        customer_account_id::text,
        public_tracking_token::text
      FROM orders
      WHERE UPPER(public_code) = ${orderCode}
        AND RIGHT(
          regexp_replace(customer_phone, '[^0-9]', '', 'g'),
          10
        ) = RIGHT(${phone}, 10)
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json(
        { error: 'No encontramos un PED con ese código y WhatsApp.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const row = rows[0]
    const currentOwner = row.customer_account_id
      ? String(row.customer_account_id)
      : null
    const trackingToken = String(row.public_tracking_token ?? '')

    if (currentOwner === account.id) {
      return Response.json(
        {
          ok: true,
          alreadyLinked: true,
          orderCode,
          trackingToken,
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    if (currentOwner) {
      return Response.json(
        { error: 'Ese PED ya está vinculado a otra cuenta.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const claimed = await sql`
      WITH updated AS (
        UPDATE orders
        SET
          customer_account_id = ${account.id}::uuid,
          updated_at = now()
        WHERE id = ${String(row.id)}::uuid
          AND customer_account_id IS NULL
        RETURNING id, status
      )
      INSERT INTO order_events (
        order_id,
        event_type,
        from_status,
        to_status,
        note
      )
      SELECT
        id,
        'customer_account_linked',
        status,
        status,
        'Pedido histórico vinculado desde Mi cuenta'
      FROM updated
      RETURNING order_id::text
    `

    if (claimed.length === 0) {
      return Response.json(
        { error: 'Ese PED acaba de ser vinculado a otra cuenta.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return Response.json(
      {
        ok: true,
        alreadyLinked: false,
        orderCode,
        trackingToken,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos vincular ese pedido a tu cuenta.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
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
