import { createHash, randomBytes } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

const PHONE_RE = /^\d{6,20}$/

function normalizedPhone(value: unknown) {
  if (typeof value !== 'string') return ''
  const digits = value.replace(/\D/g, '').slice(0, 20)
  return digits.length > 10 ? digits.slice(-10) : digits
}

function customerCode(phone: string) {
  return `CLI-${phone.slice(-6).padStart(6, '0')}`
}

function formatCustomerRow(row: Record<string, unknown>) {
  const phone = String(row.normalized_phone ?? '')

  return {
    id: phone,
    public_code: customerCode(phone),
    customer_name: String(row.customer_name ?? 'Cliente'),
    customer_phone: String(row.customer_phone ?? phone),
    first_activity_at: String(row.first_activity_at ?? ''),
    last_activity_at: String(row.last_activity_at ?? ''),
    request_count: Number(row.request_count ?? 0),
    quote_count: Number(row.quote_count ?? 0),
    accepted_quote_count: Number(row.accepted_quote_count ?? 0),
    order_count: Number(row.order_count ?? 0),
    completed_order_count: Number(row.completed_order_count ?? 0),
    open_order_count: Number(row.open_order_count ?? 0),
    total_agreed: String(row.total_agreed ?? '0'),
    total_paid: String(row.total_paid ?? '0'),
  }
}

function formatTimelineRow(row: Record<string, unknown>) {
  return {
    kind: String(row.kind ?? ''),
    id: String(row.id ?? ''),
    public_code: String(row.public_code ?? ''),
    status: String(row.status ?? ''),
    title: String(row.title ?? ''),
    amount: row.amount === null || row.amount === undefined
      ? null
      : String(row.amount),
    paid_total: row.paid_total === null || row.paid_total === undefined
      ? null
      : String(row.paid_total),
    promised_for: row.promised_for
      ? String(row.promised_for).slice(0, 10)
      : null,
    created_at: String(row.created_at ?? ''),
  }
}


async function listCustomers(databaseUrl: string) {
  const sql = neon(databaseUrl)

  const rows = (await sql`
    WITH activity AS (
      SELECT
        regexp_replace(request.customer_phone, '\D', '', 'g') AS normalized_phone,
        request.customer_name,
        request.customer_phone,
        request.created_at,
        'request'::text AS kind,
        request.status::text AS status,
        NULL::numeric AS amount,
        NULL::numeric AS paid_total
      FROM custom_requests request
      WHERE length(regexp_replace(request.customer_phone, '\D', '', 'g')) >= 6

      UNION ALL

      SELECT
        regexp_replace(quote.customer_phone, '\D', '', 'g') AS normalized_phone,
        COALESCE(NULLIF(quote.customer_name, ''), 'Cliente') AS customer_name,
        quote.customer_phone,
        quote.created_at,
        'quote'::text AS kind,
        quote.status::text AS status,
        quote.total_price AS amount,
        NULL::numeric AS paid_total
      FROM quotes quote
      WHERE quote.customer_phone IS NOT NULL
        AND length(regexp_replace(quote.customer_phone, '\D', '', 'g')) >= 6

      UNION ALL

      SELECT
        regexp_replace(order_row.customer_phone, '\D', '', 'g') AS normalized_phone,
        order_row.customer_name,
        order_row.customer_phone,
        order_row.created_at,
        'order'::text AS kind,
        order_row.status::text AS status,
        CASE
          WHEN order_row.status = 'cancelled' THEN NULL
          ELSE COALESCE(order_row.agreed_total, order_row.known_total)
        END AS amount,
        CASE
          WHEN order_row.status = 'cancelled' THEN NULL
          ELSE payment_total.paid_total
        END AS paid_total
      FROM orders order_row
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(payment.amount), 0) AS paid_total
        FROM order_payments payment
        WHERE payment.order_id = order_row.id
          AND payment.voided_at IS NULL
      ) payment_total ON true
      WHERE length(regexp_replace(order_row.customer_phone, '\D', '', 'g')) >= 6
    ),
    latest AS (
      SELECT DISTINCT ON (normalized_phone)
        normalized_phone,
        customer_name,
        customer_phone
      FROM activity
      ORDER BY normalized_phone, created_at DESC
    ),
    metrics AS (
      SELECT
        normalized_phone,
        MIN(created_at)::text AS first_activity_at,
        MAX(created_at)::text AS last_activity_at,
        COUNT(*) FILTER (WHERE kind = 'request')::int AS request_count,
        COUNT(*) FILTER (WHERE kind = 'quote')::int AS quote_count,
        COUNT(*) FILTER (
          WHERE kind = 'quote' AND status = 'accepted'
        )::int AS accepted_quote_count,
        COUNT(*) FILTER (
          WHERE kind = 'order' AND status <> 'cancelled'
        )::int AS order_count,
        COUNT(*) FILTER (
          WHERE kind = 'order' AND status = 'completed'
        )::int AS completed_order_count,
        COUNT(*) FILTER (
          WHERE kind = 'order'
            AND status NOT IN ('completed', 'cancelled')
        )::int AS open_order_count,
        COALESCE(
          SUM(amount) FILTER (
            WHERE kind = 'order' AND status <> 'cancelled'
          ),
          0
        )::text AS total_agreed,
        COALESCE(
          SUM(paid_total) FILTER (
            WHERE kind = 'order' AND status <> 'cancelled'
          ),
          0
        )::text AS total_paid
      FROM activity
      GROUP BY normalized_phone
    )
    SELECT
      metrics.normalized_phone,
      latest.customer_name,
      latest.customer_phone,
      metrics.first_activity_at,
      metrics.last_activity_at,
      metrics.request_count,
      metrics.quote_count,
      metrics.accepted_quote_count,
      metrics.order_count,
      metrics.completed_order_count,
      metrics.open_order_count,
      metrics.total_agreed,
      metrics.total_paid
    FROM metrics
    JOIN latest USING (normalized_phone)
    ORDER BY metrics.last_activity_at DESC
    LIMIT 200
  `) as Record<string, unknown>[]

  return rows.map(formatCustomerRow)
}

async function customerDetail(databaseUrl: string, phone: string) {
  const sql = neon(databaseUrl)

  const summaryRows = (await sql`
    WITH activity AS (
      SELECT
        regexp_replace(request.customer_phone, '\D', '', 'g') AS normalized_phone,
        request.customer_name,
        request.customer_phone,
        request.created_at,
        'request'::text AS kind,
        request.status::text AS status,
        NULL::numeric AS amount,
        NULL::numeric AS paid_total
      FROM custom_requests request
      WHERE regexp_replace(request.customer_phone, '\D', '', 'g') = ${phone}

      UNION ALL

      SELECT
        regexp_replace(quote.customer_phone, '\D', '', 'g') AS normalized_phone,
        COALESCE(NULLIF(quote.customer_name, ''), 'Cliente') AS customer_name,
        quote.customer_phone,
        quote.created_at,
        'quote'::text AS kind,
        quote.status::text AS status,
        quote.total_price AS amount,
        NULL::numeric AS paid_total
      FROM quotes quote
      WHERE regexp_replace(COALESCE(quote.customer_phone, ''), '\D', '', 'g') = ${phone}

      UNION ALL

      SELECT
        regexp_replace(order_row.customer_phone, '\D', '', 'g') AS normalized_phone,
        order_row.customer_name,
        order_row.customer_phone,
        order_row.created_at,
        'order'::text AS kind,
        order_row.status::text AS status,
        CASE
          WHEN order_row.status = 'cancelled' THEN NULL
          ELSE COALESCE(order_row.agreed_total, order_row.known_total)
        END AS amount,
        CASE
          WHEN order_row.status = 'cancelled' THEN NULL
          ELSE payment_total.paid_total
        END AS paid_total
      FROM orders order_row
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(payment.amount), 0) AS paid_total
        FROM order_payments payment
        WHERE payment.order_id = order_row.id
          AND payment.voided_at IS NULL
      ) payment_total ON true
      WHERE regexp_replace(order_row.customer_phone, '\D', '', 'g') = ${phone}
    ),
    latest AS (
      SELECT
        customer_name,
        customer_phone
      FROM activity
      ORDER BY created_at DESC
      LIMIT 1
    )
    SELECT
      ${phone}::text AS normalized_phone,
      latest.customer_name,
      latest.customer_phone,
      MIN(activity.created_at)::text AS first_activity_at,
      MAX(activity.created_at)::text AS last_activity_at,
      COUNT(*) FILTER (WHERE activity.kind = 'request')::int AS request_count,
      COUNT(*) FILTER (WHERE activity.kind = 'quote')::int AS quote_count,
      COUNT(*) FILTER (
        WHERE activity.kind = 'quote' AND activity.status = 'accepted'
      )::int AS accepted_quote_count,
      COUNT(*) FILTER (
        WHERE activity.kind = 'order' AND activity.status <> 'cancelled'
      )::int AS order_count,
      COUNT(*) FILTER (
        WHERE activity.kind = 'order' AND activity.status = 'completed'
      )::int AS completed_order_count,
      COUNT(*) FILTER (
        WHERE activity.kind = 'order'
          AND activity.status NOT IN ('completed', 'cancelled')
      )::int AS open_order_count,
      COALESCE(
        SUM(activity.amount) FILTER (
          WHERE activity.kind = 'order' AND activity.status <> 'cancelled'
        ),
        0
      )::text AS total_agreed,
      COALESCE(
        SUM(activity.paid_total) FILTER (
          WHERE activity.kind = 'order' AND activity.status <> 'cancelled'
        ),
        0
      )::text AS total_paid
    FROM activity
    CROSS JOIN latest
    GROUP BY latest.customer_name, latest.customer_phone
  `) as Record<string, unknown>[]

  if (summaryRows.length === 0) return null

  const timelineRows = (await sql`
    WITH activity AS (
      SELECT
        'request'::text AS kind,
        request.id::text AS id,
        'SOL-' || LPAD(request.request_number::text, 6, '0') AS public_code,
        request.status::text AS status,
        CASE request.request_type
          WHEN 'paper' THEN 'Solicitud de papelería'
          WHEN '3d' THEN 'Solicitud 3D'
          WHEN 'event' THEN 'Solicitud para evento'
          WHEN 'design' THEN 'Solicitud de diseño'
          ELSE 'Solicitud personalizada'
        END::text AS title,
        NULL::numeric AS amount,
        NULL::numeric AS paid_total,
        request.needed_date AS promised_for,
        request.created_at
      FROM custom_requests request
      WHERE regexp_replace(request.customer_phone, '\D', '', 'g') = ${phone}

      UNION ALL

      SELECT
        'quote'::text AS kind,
        quote.id::text AS id,
        'PRE-' || LPAD(quote.quote_number::text, 6, '0') AS public_code,
        quote.status::text AS status,
        quote.title::text AS title,
        quote.total_price AS amount,
        NULL::numeric AS paid_total,
        quote.valid_until AS promised_for,
        quote.created_at
      FROM quotes quote
      WHERE regexp_replace(COALESCE(quote.customer_phone, ''), '\D', '', 'g') = ${phone}

      UNION ALL

      SELECT
        'order'::text AS kind,
        order_row.id::text AS id,
        order_row.public_code::text AS public_code,
        order_row.status::text AS status,
        'Pedido'::text AS title,
        COALESCE(order_row.agreed_total, order_row.known_total) AS amount,
        payment_total.paid_total AS paid_total,
        order_row.promised_for AS promised_for,
        order_row.created_at
      FROM orders order_row
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(payment.amount), 0) AS paid_total
        FROM order_payments payment
        WHERE payment.order_id = order_row.id
          AND payment.voided_at IS NULL
      ) payment_total ON true
      WHERE regexp_replace(order_row.customer_phone, '\D', '', 'g') = ${phone}
    )
    SELECT
      kind,
      id,
      public_code,
      status,
      title,
      amount::text,
      paid_total::text,
      promised_for::text,
      created_at::text
    FROM activity
    ORDER BY created_at DESC
    LIMIT 100
  `) as Record<string, unknown>[]

  return {
    customer: formatCustomerRow(summaryRows[0]),
    timeline: timelineRows.map(formatTimelineRow),
  }
}


function formatAccountRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    email: String(row.email ?? ''),
    name: String(row.name ?? 'Cliente'),
    phone: String(row.phone ?? ''),
    active: Boolean(row.active),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    order_count: Number(row.order_count ?? 0),
    request_count: Number(row.request_count ?? 0),
    active_session_count: Number(row.active_session_count ?? 0),
    last_session_at:
      row.last_session_at === null || row.last_session_at === undefined
        ? null
        : String(row.last_session_at),
  }
}

export async function listAdminCustomerAccounts(databaseUrl: string) {
  const sql = neon(databaseUrl)

  try {
    const rows = (await sql`
      SELECT
        account.id::text,
        account.email,
        account.name,
        account.phone,
        account.active,
        account.created_at::text,
        account.updated_at::text,
        COUNT(DISTINCT order_row.id)::int AS order_count,
        COUNT(DISTINCT request.id)::int AS request_count,
        COUNT(DISTINCT session.id) FILTER (
          WHERE session.expires_at > now()
        )::int AS active_session_count,
        MAX(session.created_at)::text AS last_session_at
      FROM customer_accounts account
      LEFT JOIN orders order_row
        ON order_row.customer_account_id = account.id
      LEFT JOIN custom_requests request
        ON request.customer_account_id = account.id
      LEFT JOIN customer_sessions session
        ON session.account_id = account.id
      GROUP BY account.id
      ORDER BY account.created_at DESC
      LIMIT 500
    `) as Record<string, unknown>[]

    return Response.json(
      { accounts: rows.map(formatAccountRow) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar las cuentas de clientes.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function updateAdminCustomerAccountStatus(
  databaseUrl: string,
  accountId: string,
  body: Record<string, unknown>,
) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(accountId)) {
    return Response.json(
      { error: 'Cuenta de cliente inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (typeof body.active !== 'boolean') {
    return Response.json(
      { error: 'Estado de cuenta inválido.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const sql = neon(databaseUrl)

  try {
    const updateQuery = sql`
      UPDATE customer_accounts
      SET
        active = ${body.active},
        updated_at = now()
      WHERE id = ${accountId}::uuid
      RETURNING id::text
    `

    let updatedRows: Record<string, unknown>[]
    if (body.active) {
      updatedRows = (await updateQuery) as Record<string, unknown>[]
    } else {
      const results = await sql.transaction([
        updateQuery,
        sql`
          DELETE FROM customer_sessions
          WHERE account_id = ${accountId}::uuid
        `,
      ])
      updatedRows = results[0] as Record<string, unknown>[]
    }

    if (updatedRows.length === 0) {
      return Response.json(
        { error: 'Cuenta de cliente no encontrada.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return Response.json(
      { ok: true, accountId, active: body.active },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar la cuenta de cliente.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function getAdminCustomers(
  databaseUrl: string,
  requestUrl: URL,
) {
  const phone = normalizedPhone(requestUrl.searchParams.get('phone'))

  try {
    if (phone) {
      if (!PHONE_RE.test(phone)) {
        return Response.json(
          { error: 'WhatsApp de cliente inválido.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      const detail = await customerDetail(databaseUrl, phone)

      if (!detail) {
        return Response.json(
          { error: 'Cliente no encontrado.' },
          { status: 404, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      return Response.json(detail, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    return Response.json(
      { customers: await listCustomers(databaseUrl) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo cargar el historial de clientes.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function createAdminCustomerPasswordReset(
  databaseUrl: string,
  accountId: string,
) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(accountId)) {
    return Response.json(
      { error: 'Cuenta de cliente inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const sql = neon(databaseUrl)

  try {
    const accounts = await sql`
      SELECT id::text, email, name, phone, active
      FROM customer_accounts
      WHERE id = ${accountId}::uuid
      LIMIT 1
    `

    if (accounts.length === 0) {
      return Response.json(
        { error: 'Cuenta de cliente no encontrada.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (!Boolean(accounts[0].active)) {
      return Response.json(
        { error: 'Reactivá la cuenta antes de generar un enlace de recuperación.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const results = await sql.transaction([
      sql`
        DELETE FROM customer_password_resets
        WHERE account_id = ${accountId}::uuid
      `,
      sql`
        INSERT INTO customer_password_resets (
          account_id,
          token_hash,
          expires_at
        )
        VALUES (
          ${accountId}::uuid,
          ${tokenHash},
          now() + INTERVAL '30 minutes'
        )
        RETURNING expires_at::text
      `,
    ])

    const created = results[1] as Record<string, unknown>[]
    const account = accounts[0]

    return Response.json(
      {
        ok: true,
        token,
        resetPath: `/cuenta?reset=${encodeURIComponent(token)}`,
        expiresAt: String(created[0]?.expires_at ?? ''),
        account: {
          id: String(account.id),
          email: String(account.email),
          name: String(account.name),
          phone: String(account.phone),
        },
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo generar el enlace de recuperación.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
