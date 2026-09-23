import { neon } from '@neondatabase/serverless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  return origin === new URL(request.url).origin
}

function publicCode(number: unknown) {
  return `PRE-${String(Number(number)).padStart(6, '0')}`
}

function formatPublicQuote(row: Record<string, unknown>) {
  return {
    public_code: publicCode(row.quote_number),
    status: String(row.effective_status ?? row.status ?? 'draft'),
    title: String(row.title ?? ''),
    customer_name: row.customer_name ? String(row.customer_name) : null,
    job_label: row.job_label ? String(row.job_label) : 'Trabajo personalizado',
    quantity: Number(row.quantity ?? 0),
    valid_until: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
    suggested_unit_price: String(row.suggested_unit_price ?? '0'),
    total_price: String(row.total_price ?? '0'),
    customer_responded_at: row.customer_responded_at
      ? String(row.customer_responded_at)
      : null,
    order_code: row.order_code ? String(row.order_code) : null,
    created_at: String(row.created_at ?? ''),
  }
}

async function selectPublicQuote(
  databaseUrl: string,
  token: string,
) {
  const sql = neon(databaseUrl)

  const rows = (await sql`
    SELECT
      quote.quote_number,
      CASE
        WHEN quote.status IN ('draft', 'sent')
          AND quote.valid_until IS NOT NULL
          AND quote.valid_until < CURRENT_DATE
          THEN 'expired'
        ELSE quote.status
      END AS effective_status,
      quote.status,
      quote.title,
      quote.customer_name,
      COALESCE(quote.snapshot ->> 'jobLabel', 'Trabajo personalizado') AS job_label,
      quote.quantity,
      quote.valid_until::text,
      quote.suggested_unit_price::text,
      quote.total_price::text,
      quote.customer_responded_at::text,
      linked_order.public_code AS order_code,
      quote.created_at::text
    FROM quotes quote
    LEFT JOIN orders linked_order ON linked_order.quote_id = quote.id
    WHERE quote.public_token = ${token}::uuid
    LIMIT 1
  `) as Record<string, unknown>[]

  return rows.length > 0
    ? formatPublicQuote(rows[0] as Record<string, unknown>)
    : null
}

export async function getPublicQuote(
  databaseUrl: string,
  token: string,
) {
  if (!UUID_RE.test(token)) {
    return Response.json(
      { error: 'El link de presupuesto no es válido.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const quote = await selectPublicQuote(databaseUrl, token)

    if (!quote) {
      return Response.json(
        { error: 'No encontramos este presupuesto.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return Response.json(
      { quote },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos abrir el presupuesto.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function acceptPublicQuote(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: 'Origen de solicitud inválido.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    return Response.json(
      { error: 'Los presupuestos no están disponibles temporalmente.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json(
      { error: 'Solicitud inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''

  if (!UUID_RE.test(token)) {
    return Response.json(
      { error: 'El link de presupuesto no es válido.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const sql = neon(databaseUrl)
    const current = await selectPublicQuote(databaseUrl, token)

    if (!current) {
      return Response.json(
        { error: 'No encontramos este presupuesto.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (current.status === 'accepted') {
      return Response.json(
        { quote: current, existing: true },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    if (current.status === 'expired') {
      return Response.json(
        { error: 'Este presupuesto venció. Escribinos para actualizarlo.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (!['draft', 'sent'].includes(current.status)) {
      return Response.json(
        { error: 'Este presupuesto ya no está disponible para aceptación.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const updated = await sql`
      UPDATE quotes
      SET
        status = 'accepted',
        customer_responded_at = COALESCE(customer_responded_at, now()),
        updated_at = now()
      WHERE public_token = ${token}::uuid
        AND status IN ('draft', 'sent')
        AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
      RETURNING id::text
    `

    if (updated.length === 0) {
      const latest = await selectPublicQuote(databaseUrl, token)

      if (latest?.status === 'accepted') {
        return Response.json(
          { quote: latest, existing: true },
          { headers: { 'Cache-Control': 'private, no-store' } },
        )
      }

      return Response.json(
        { error: 'El presupuesto cambió de estado. Actualizá la página.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const accepted = await selectPublicQuote(databaseUrl, token)

    return Response.json(
      { quote: accepted, existing: false },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos registrar la aceptación.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
