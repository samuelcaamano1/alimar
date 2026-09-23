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
