import { neon } from '@neondatabase/serverless'
import { requireAdmin } from '../_lib/admin-auth.js'

type OrderRow = {
  id: string
  public_code: string
  status: 'new' | 'contacted' | 'confirmed' | 'in_progress' | 'ready' | 'completed' | 'cancelled'
  customer_name: string
  customer_phone: string
  customer_email: string | null
  customer_notes: string | null
  known_total: string
  has_quote: boolean
  created_at: string
  item_id: string | null
  product_name: string | null
  kind: 'service' | 'product' | null
  pricing_mode: 'fixed' | 'from' | 'quote' | null
  unit_price: string | null
  quantity: number | null
  line_total: string | null
  customization_note: string | null
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
        i.kind,
        i.pricing_mode,
        i.unit_price::text,
        i.quantity,
        i.line_total::text,
        i.customization_note
      FROM recent_orders o
      LEFT JOIN order_items i ON i.order_id = o.id
      ORDER BY o.created_at DESC, i.created_at ASC
    `) as OrderRow[]

    const orders = new Map<string, {
      id: string
      public_code: string
      status: OrderRow['status']
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
        kind: 'service' | 'product'
        pricing_mode: 'fixed' | 'from' | 'quote'
        unit_price: string | null
        quantity: number
        line_total: string | null
        customization_note: string | null
      }>
    }>()

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
        })
      }

      if (row.item_id && row.product_name && row.kind && row.pricing_mode && row.quantity !== null) {
        orders.get(row.id)?.items.push({
          id: row.item_id,
          product_name: row.product_name,
          kind: row.kind,
          pricing_mode: row.pricing_mode,
          unit_price: row.unit_price,
          quantity: row.quantity,
          line_total: row.line_total,
          customization_note: row.customization_note,
        })
      }
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
