import { neon } from '@neondatabase/serverless'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const STATUSES = new Set(['draft', 'sent', 'accepted', 'rejected', 'expired'])
const JOB_TYPES = new Set(['paper-print', '3d-print', 'manual'])

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function optionalText(value: unknown, max: number) {
  const normalized = text(value, max)
  return normalized || null
}

function integer(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function decimal(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim().replace(',', '.'))
        : Number.NaN

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function dateOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined

  const normalized = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined
}

function formatRow(row: Record<string, unknown>) {
  const number = Number(row.quote_number)

  return {
    id: String(row.id ?? ''),
    public_code: `PRE-${String(number).padStart(6, '0')}`,
    public_token: String(row.public_token ?? ''),
    status: String(row.status ?? 'draft'),
    title: String(row.title ?? ''),
    customer_name: row.customer_name ? String(row.customer_name) : null,
    customer_phone: row.customer_phone ? String(row.customer_phone) : null,
    job_type: String(row.job_type ?? ''),
    quantity: Number(row.quantity ?? 0),
    valid_until: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
    notes: row.notes ? String(row.notes) : null,
    snapshot: row.snapshot,
    direct_cost: String(row.direct_cost ?? '0'),
    light_cost: String(row.light_cost ?? '0'),
    wear_cost: String(row.wear_cost ?? '0'),
    real_cost: String(row.real_cost ?? '0'),
    profit_percent: String(row.profit_percent ?? '0'),
    suggested_unit_price: String(row.suggested_unit_price ?? '0'),
    total_price: String(row.total_price ?? '0'),
    order_code: row.order_code ? String(row.order_code) : null,
    sent_at: row.sent_at ? String(row.sent_at) : null,
    last_reminded_at: row.last_reminded_at ? String(row.last_reminded_at) : null,
    customer_response_reason: row.customer_response_reason
      ? String(row.customer_response_reason)
      : null,
    customer_response_note: row.customer_response_note
      ? String(row.customer_response_note)
      : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function formatCommercialMetrics(row: Record<string, unknown>) {
  return {
    total_count: Number(row.total_count ?? 0),
    sent_count: Number(row.sent_count ?? 0),
    accepted_count: Number(row.accepted_count ?? 0),
    rejected_count: Number(row.rejected_count ?? 0),
    converted_count: Number(row.converted_count ?? 0),
    quoted_value: String(row.quoted_value ?? '0'),
    accepted_value: String(row.accepted_value ?? '0'),
    accepted_real_cost: String(row.accepted_real_cost ?? '0'),
    accepted_profit: String(row.accepted_profit ?? '0'),
    converted_value: String(row.converted_value ?? '0'),
    converted_real_cost: String(row.converted_real_cost ?? '0'),
    converted_profit: String(row.converted_profit ?? '0'),
    average_accepted_ticket: String(row.average_accepted_ticket ?? '0'),
    reject_price_count: Number(row.reject_price_count ?? 0),
    reject_timing_count: Number(row.reject_timing_count ?? 0),
    reject_cancelled_count: Number(row.reject_cancelled_count ?? 0),
    reject_other_count: Number(row.reject_other_count ?? 0),
  }
}

async function commercialMetrics(
  databaseUrl: string,
  period: 'month' | 'all',
) {
  const sql = neon(databaseUrl)

  const rows = period === 'month'
    ? await sql`
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE quote.status = 'sent')::int AS sent_count,
          COUNT(*) FILTER (WHERE quote.status = 'accepted')::int AS accepted_count,
          COUNT(*) FILTER (WHERE quote.status = 'rejected')::int AS rejected_count,
          COUNT(linked_order.id)::int AS converted_count,
          COALESCE(SUM(quote.total_price), 0)::text AS quoted_value,
          COALESCE(
            SUM(quote.total_price) FILTER (WHERE quote.status = 'accepted'),
            0
          )::text AS accepted_value,
          COALESCE(
            SUM(quote.real_cost) FILTER (WHERE quote.status = 'accepted'),
            0
          )::text AS accepted_real_cost,
          COALESCE(
            SUM(quote.total_price - quote.real_cost)
              FILTER (WHERE quote.status = 'accepted'),
            0
          )::text AS accepted_profit,
          COALESCE(
            SUM(quote.total_price) FILTER (WHERE linked_order.id IS NOT NULL),
            0
          )::text AS converted_value,
          COALESCE(
            SUM(quote.real_cost) FILTER (WHERE linked_order.id IS NOT NULL),
            0
          )::text AS converted_real_cost,
          COALESCE(
            SUM(quote.total_price - quote.real_cost)
              FILTER (WHERE linked_order.id IS NOT NULL),
            0
          )::text AS converted_profit,
          COALESCE(
            AVG(quote.total_price) FILTER (WHERE quote.status = 'accepted'),
            0
          )::text AS average_accepted_ticket,
          COUNT(*) FILTER (
            WHERE quote.status = 'rejected'
              AND quote.customer_response_reason = 'price'
          )::int AS reject_price_count,
          COUNT(*) FILTER (
            WHERE quote.status = 'rejected'
              AND quote.customer_response_reason = 'timing'
          )::int AS reject_timing_count,
          COUNT(*) FILTER (
            WHERE quote.status = 'rejected'
              AND quote.customer_response_reason = 'cancelled'
          )::int AS reject_cancelled_count,
          COUNT(*) FILTER (
            WHERE quote.status = 'rejected'
              AND quote.customer_response_reason = 'other'
          )::int AS reject_other_count
        FROM quotes quote
        LEFT JOIN orders linked_order ON linked_order.quote_id = quote.id
        WHERE quote.created_at >= date_trunc('month', CURRENT_DATE)
      `
    : await sql`
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE quote.status = 'sent')::int AS sent_count,
          COUNT(*) FILTER (WHERE quote.status = 'accepted')::int AS accepted_count,
          COUNT(*) FILTER (WHERE quote.status = 'rejected')::int AS rejected_count,
          COUNT(linked_order.id)::int AS converted_count,
          COALESCE(SUM(quote.total_price), 0)::text AS quoted_value,
          COALESCE(
            SUM(quote.total_price) FILTER (WHERE quote.status = 'accepted'),
            0
          )::text AS accepted_value,
          COALESCE(
            SUM(quote.real_cost) FILTER (WHERE quote.status = 'accepted'),
            0
          )::text AS accepted_real_cost,
          COALESCE(
            SUM(quote.total_price - quote.real_cost)
              FILTER (WHERE quote.status = 'accepted'),
            0
          )::text AS accepted_profit,
          COALESCE(
            SUM(quote.total_price) FILTER (WHERE linked_order.id IS NOT NULL),
            0
          )::text AS converted_value,
          COALESCE(
            SUM(quote.real_cost) FILTER (WHERE linked_order.id IS NOT NULL),
            0
          )::text AS converted_real_cost,
          COALESCE(
            SUM(quote.total_price - quote.real_cost)
              FILTER (WHERE linked_order.id IS NOT NULL),
            0
          )::text AS converted_profit,
          COALESCE(
            AVG(quote.total_price) FILTER (WHERE quote.status = 'accepted'),
            0
          )::text AS average_accepted_ticket,
          COUNT(*) FILTER (
            WHERE quote.status = 'rejected'
              AND quote.customer_response_reason = 'price'
          )::int AS reject_price_count,
          COUNT(*) FILTER (
            WHERE quote.status = 'rejected'
              AND quote.customer_response_reason = 'timing'
          )::int AS reject_timing_count,
          COUNT(*) FILTER (
            WHERE quote.status = 'rejected'
              AND quote.customer_response_reason = 'cancelled'
          )::int AS reject_cancelled_count,
          COUNT(*) FILTER (
            WHERE quote.status = 'rejected'
              AND quote.customer_response_reason = 'other'
          )::int AS reject_other_count
        FROM quotes quote
        LEFT JOIN orders linked_order ON linked_order.quote_id = quote.id
      `

  return formatCommercialMetrics(
    (rows[0] ?? {}) as Record<string, unknown>,
  )
}

export async function listAdminQuotes(databaseUrl: string) {
  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        quote.id::text,
        quote.quote_number,
        quote.public_token,
        CASE
          WHEN quote.status IN ('draft', 'sent')
            AND quote.valid_until IS NOT NULL
            AND quote.valid_until < CURRENT_DATE
            THEN 'expired'
          ELSE quote.status
        END AS effective_status,
        quote.title,
        quote.customer_name,
        quote.customer_phone,
        quote.job_type,
        quote.quantity,
        quote.valid_until::text,
        quote.notes,
        quote.snapshot,
        quote.direct_cost::text,
        quote.light_cost::text,
        quote.wear_cost::text,
        quote.real_cost::text,
        quote.profit_percent::text,
        quote.suggested_unit_price::text,
        quote.total_price::text,
        linked_order.public_code AS order_code,
        quote.sent_at::text,
        quote.last_reminded_at::text,
        quote.customer_response_reason,
        quote.customer_response_note,
        quote.created_at::text,
        quote.updated_at::text
      FROM quotes quote
      LEFT JOIN orders linked_order ON linked_order.quote_id = quote.id
      ORDER BY quote.created_at DESC
      LIMIT 100
    `

    const [monthMetrics, allMetrics] = await Promise.all([
      commercialMetrics(databaseUrl, 'month'),
      commercialMetrics(databaseUrl, 'all'),
    ])

    return Response.json(
      {
        quotes: rows.map((row) =>
          formatRow({
            ...(row as Record<string, unknown>),
            status: (row as Record<string, unknown>).effective_status,
          }),
        ),
        metrics: {
          month: monthMetrics,
          all: allMetrics,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar los presupuestos.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function createAdminQuote(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const title = text(body.title, 160)
  const customerName = optionalText(body.customerName, 120)
  const customerPhone = optionalText(body.customerPhone, 40)
  const jobType = text(body.jobType, 24)
  const quantity = integer(body.quantity)
  const validUntil = dateOrNull(body.validUntil)
  const notes = optionalText(body.notes, 3000)
  const sourceRequestId = optionalText(body.sourceRequestId, 40)

  const directCost = decimal(body.directCost)
  const lightCost = decimal(body.lightCost)
  const wearCost = decimal(body.wearCost)
  const realCost = decimal(body.realCost)
  const profitPercent = decimal(body.profitPercent)
  const suggestedUnitPrice = decimal(body.suggestedUnitPrice)
  const totalPrice = decimal(body.totalPrice)

  const snapshot =
    body.snapshot && typeof body.snapshot === 'object' && !Array.isArray(body.snapshot)
      ? body.snapshot
      : null

  if (title.length < 2) {
    return Response.json(
      { error: 'Ingresá un título para el presupuesto.' },
      { status: 400 },
    )
  }

  if (sourceRequestId && !UUID_RE.test(sourceRequestId)) {
    return Response.json(
      { error: 'La solicitud de origen es inválida.' },
      { status: 400 },
    )
  }

  if (!JOB_TYPES.has(jobType)) {
    return Response.json(
      { error: 'Tipo de trabajo inválido.' },
      { status: 400 },
    )
  }

  if (quantity === null) {
    return Response.json(
      { error: 'La cantidad del presupuesto es inválida.' },
      { status: 400 },
    )
  }

  if (validUntil === undefined) {
    return Response.json(
      { error: 'La fecha de validez es inválida.' },
      { status: 400 },
    )
  }

  if (!snapshot) {
    return Response.json(
      { error: 'Falta el snapshot del cálculo.' },
      { status: 400 },
    )
  }

  if (
    directCost === null ||
    lightCost === null ||
    wearCost === null ||
    realCost === null ||
    profitPercent === null ||
    suggestedUnitPrice === null ||
    totalPrice === null
  ) {
    return Response.json(
      { error: 'Los importes del presupuesto son inválidos.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)
    const snapshotJson = JSON.stringify(snapshot)

    const rows = sourceRequestId
      ? await sql`
          WITH source AS (
            SELECT id
            FROM custom_requests
            WHERE id = ${sourceRequestId}::uuid
              AND quote_id IS NULL
            FOR UPDATE
          ),
          inserted AS (
            INSERT INTO quotes (
              title,
              customer_name,
              customer_phone,
              job_type,
              quantity,
              valid_until,
              notes,
              snapshot,
              direct_cost,
              light_cost,
              wear_cost,
              real_cost,
              profit_percent,
              suggested_unit_price,
              total_price
            )
            SELECT
              ${title},
              ${customerName},
              ${customerPhone},
              ${jobType},
              ${quantity},
              ${validUntil},
              ${notes},
              ${snapshotJson}::jsonb,
              ${directCost},
              ${lightCost},
              ${wearCost},
              ${realCost},
              ${profitPercent},
              ${suggestedUnitPrice},
              ${totalPrice}
            FROM source
            RETURNING
              id::text,
              quote_number,
              status,
              title,
              customer_name,
              customer_phone,
              job_type,
              quantity,
              valid_until::text,
              notes,
              snapshot,
              direct_cost::text,
              light_cost::text,
              wear_cost::text,
              real_cost::text,
              profit_percent::text,
              suggested_unit_price::text,
              total_price::text,
              created_at::text,
              updated_at::text
          ),
          linked AS (
            UPDATE custom_requests request
            SET
              quote_id = inserted.id::uuid,
              status = 'quoted',
              updated_at = now()
            FROM inserted
            WHERE request.id = ${sourceRequestId}::uuid
            RETURNING request.id
          )
          SELECT *
          FROM inserted
        `
      : await sql`
          INSERT INTO quotes (
            title,
            customer_name,
            customer_phone,
            job_type,
            quantity,
            valid_until,
            notes,
            snapshot,
            direct_cost,
            light_cost,
            wear_cost,
            real_cost,
            profit_percent,
            suggested_unit_price,
            total_price
          )
          VALUES (
            ${title},
            ${customerName},
            ${customerPhone},
            ${jobType},
            ${quantity},
            ${validUntil},
            ${notes},
            ${snapshotJson}::jsonb,
            ${directCost},
            ${lightCost},
            ${wearCost},
            ${realCost},
            ${profitPercent},
            ${suggestedUnitPrice},
            ${totalPrice}
          )
          RETURNING
            id::text,
            quote_number,
            public_token,
            status,
            title,
            customer_name,
            customer_phone,
            job_type,
            quantity,
            valid_until::text,
            notes,
            snapshot,
            direct_cost::text,
            light_cost::text,
            wear_cost::text,
            real_cost::text,
            profit_percent::text,
            suggested_unit_price::text,
            total_price::text,
            created_at::text,
            updated_at::text
        `

    if (rows.length === 0) {
      return Response.json(
        {
          error:
            'La solicitud ya tiene un presupuesto vinculado o dejó de estar disponible.',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return Response.json(
      { quote: formatRow(rows[0] as Record<string, unknown>) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo guardar el presupuesto.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function updateAdminQuote(
  databaseUrl: string,
  id: string,
  body: Record<string, unknown>,
) {
  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Presupuesto inválido.' }, { status: 400 })
  }

  const status = text(body.status, 20)
  const reminder = body.reminder === true

  if (!STATUSES.has(status)) {
    return Response.json({ error: 'Estado inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      UPDATE quotes
      SET
        status = CASE
          WHEN ${reminder}::boolean THEN status
          ELSE ${status}
        END,
        sent_at = CASE
          WHEN ${reminder}::boolean THEN COALESCE(sent_at, now())
          WHEN ${status} = 'sent' THEN COALESCE(sent_at, now())
          ELSE sent_at
        END,
        last_reminded_at = CASE
          WHEN ${reminder}::boolean THEN now()
          ELSE last_reminded_at
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
        AND (
          ${reminder}::boolean = false
          OR status = 'sent'
        )
      RETURNING
        id::text,
        quote_number,
        public_token,
        CASE
          WHEN status IN ('draft', 'sent')
            AND valid_until IS NOT NULL
            AND valid_until < CURRENT_DATE
            THEN 'expired'
          ELSE status
        END AS status,
        title,
        customer_name,
        customer_phone,
        job_type,
        quantity,
        valid_until::text,
        notes,
        snapshot,
        direct_cost::text,
        light_cost::text,
        wear_cost::text,
        real_cost::text,
        profit_percent::text,
        suggested_unit_price::text,
        total_price::text,
        sent_at::text,
        last_reminded_at::text,
        created_at::text,
        updated_at::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Presupuesto no encontrado.' }, { status: 404 })
    }

    return Response.json(
      { quote: formatRow(rows[0] as Record<string, unknown>) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar el presupuesto.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
