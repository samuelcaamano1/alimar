import { neon } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'
import { createOrderFromQuote } from '../_lib/quote-orders.js'
import {
  listAdminCustomRequests,
  updateAdminCustomRequest,
} from '../_lib/custom-requests.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ORDER_STATUSES = new Set([
  'new',
  'contacted',
  'confirmed',
  'in_progress',
  'ready',
  'completed',
  'cancelled',
])

type OrderStatus =
  | 'new'
  | 'contacted'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'

type OrderCustomizationValue = {
  fieldId: string
  label: string
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select'
  value: string
}

type OrderRow = {
  id: string
  public_code: string
  status: OrderStatus
  customer_name: string
  customer_phone: string
  customer_email: string | null
  customer_notes: string | null
  known_total: string
  has_quote: boolean
  created_at: string
  item_id: string | null
  product_name: string | null
  variant_name: string | null
  kind: 'service' | 'product' | null
  pricing_mode: 'fixed' | 'from' | 'quote' | null
  unit_price: string | null
  quantity: number | null
  line_total: string | null
  customization_note: string | null
  customization_values: unknown
}

type EventRow = {
  id: string
  order_id: string
  event_type: string
  from_status: OrderStatus | null
  to_status: OrderStatus | null
  note: string | null
  created_at: string
}

function parseCustomizationValues(value: unknown): OrderCustomizationValue[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []

    const item = entry as Record<string, unknown>

    if (
      typeof item.fieldId !== 'string' ||
      typeof item.label !== 'string' ||
      typeof item.fieldType !== 'string' ||
      typeof item.value !== 'string'
    ) {
      return []
    }

    if (!['text', 'textarea', 'number', 'date', 'select'].includes(item.fieldType)) {
      return []
    }

    return [
      {
        fieldId: item.fieldId,
        label: item.label,
        fieldType: item.fieldType as OrderCustomizationValue['fieldType'],
        value: item.value,
      },
    ]
  })
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function GET(request: Request) {
  const authError = requireAdmin(request)
  if (authError) return authError

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json(
      { error: 'Database not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const requestUrl = new URL(request.url)

  if (requestUrl.searchParams.get('action') === 'custom-requests') {
    return listAdminCustomRequests(databaseUrl)
  }

  try {
    const sql = neon(databaseUrl)

    const rows = (await sql`
      WITH recent_orders AS (
        SELECT
          id,
          public_code,
          status,
          customer_name,
          customer_phone,
          customer_email,
          customer_notes,
          known_total,
          has_quote,
          created_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT 50
      )
      SELECT
        o.id::text,
        o.public_code,
        o.status,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        o.customer_notes,
        o.known_total::text,
        o.has_quote,
        o.created_at::text,
        i.id::text AS item_id,
        i.product_name,
        i.variant_name,
        i.kind,
        i.pricing_mode,
        i.unit_price::text,
        i.quantity,
        i.line_total::text,
        i.customization_note,
        i.customization_values
      FROM recent_orders o
      LEFT JOIN order_items i ON i.order_id = o.id
      ORDER BY o.created_at DESC, i.created_at ASC
    `) as OrderRow[]

    const events = (await sql`
      SELECT
        e.id::text,
        e.order_id::text,
        e.event_type,
        e.from_status,
        e.to_status,
        e.note,
        e.created_at::text
      FROM order_events e
      WHERE e.order_id IN (
        SELECT id
        FROM orders
        ORDER BY created_at DESC
        LIMIT 50
      )
      ORDER BY e.created_at DESC
    `) as EventRow[]

    const orders = new Map<
      string,
      {
        id: string
        public_code: string
        status: OrderStatus
        customer_name: string
        customer_phone: string
        customer_email: string | null
        customer_notes: string | null
        known_total: string
        has_quote: boolean
        created_at: string
        items: Array<{
          id: string
          product_name: string
          variant_name: string | null
          kind: 'service' | 'product'
          pricing_mode: 'fixed' | 'from' | 'quote'
          unit_price: string | null
          quantity: number
          line_total: string | null
          customization_note: string | null
          customization_values: OrderCustomizationValue[]
        }>
        events: EventRow[]
      }
    >()

    for (const row of rows) {
      if (!orders.has(row.id)) {
        orders.set(row.id, {
          id: row.id,
          public_code: row.public_code,
          status: row.status,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          customer_email: row.customer_email,
          customer_notes: row.customer_notes,
          known_total: row.known_total,
          has_quote: row.has_quote,
          created_at: row.created_at,
          items: [],
          events: [],
        })
      }

      if (row.item_id && row.product_name && row.kind && row.pricing_mode && row.quantity !== null) {
        orders.get(row.id)?.items.push({
          id: row.item_id,
          product_name: row.product_name,
          variant_name: row.variant_name,
          kind: row.kind,
          pricing_mode: row.pricing_mode,
          unit_price: row.unit_price,
          quantity: row.quantity,
          line_total: row.line_total,
          customization_note: row.customization_note,
          customization_values: parseCustomizationValues(row.customization_values),
        })
      }
    }

    for (const event of events) {
      orders.get(event.order_id)?.events.push(event)
    }

    return Response.json(
      { orders: Array.from(orders.values()) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar los pedidos.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const authError = requireAdmin(request)
  if (authError) return authError

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json(
      { error: 'Database not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const requestUrl = new URL(request.url)

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  if (requestUrl.searchParams.get('action') === 'custom-requests') {
    return updateAdminCustomRequest(databaseUrl, body)
  }

  const id = text(body.id, 40)
  const status = text(body.status, 24) as OrderStatus
  const note = text(body.note, 300)

  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  if (!ORDER_STATUSES.has(status)) {
    return Response.json({ error: 'Estado inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const currentRows = await sql`
      SELECT status
      FROM orders
      WHERE id = ${id}::uuid
      LIMIT 1
    `

    if (currentRows.length === 0) {
      return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 })
    }

    const currentStatus = String(currentRows[0].status) as OrderStatus

    if (currentStatus === status && !note) {
      return Response.json(
        { ok: true, unchanged: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const eventType = currentStatus === status ? 'note' : 'status_changed'
    const queries = []

    if (currentStatus !== status) {
      queries.push(sql`
        UPDATE orders
        SET
          status = ${status},
          updated_at = now()
        WHERE id = ${id}::uuid
      `)
    }

    queries.push(sql`
      INSERT INTO order_events (
        order_id,
        event_type,
        from_status,
        to_status,
        note
      )
      VALUES (
        ${id}::uuid,
        ${eventType},
        ${currentStatus},
        ${status},
        ${note || null}
      )
    `)

    await sql.transaction(queries)

    return Response.json(
      { ok: true, status },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar el pedido.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}


export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const authError = requireAdmin(request)
  if (authError) return authError

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json(
      { error: 'Database not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const requestUrl = new URL(request.url)

  if (requestUrl.searchParams.get('action') !== 'from-quote') {
    return Response.json(
      { error: 'Invalid action' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  const quoteId = typeof body.quoteId === 'string' ? body.quoteId.trim() : ''
  return createOrderFromQuote(databaseUrl, quoteId)
}
