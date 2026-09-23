import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function createPublicCode() {
  const year = new Date().getFullYear()
  const token = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
  return `PED-${year}-${token}`
}

function money(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function orderWhatsappMessage(args: {
  orderCode: string
  quoteCode: string
  title: string
  quantity: number
  total: number
}) {
  return [
    `Pedido ${args.orderCode} creado desde el presupuesto ${args.quoteCode}.`,
    '',
    `Trabajo: ${args.title}`,
    `Cantidad presupuestada: ${args.quantity}`,
    `Total acordado: ${money(args.total)}`,
    '',
    'El presupuesto fue aceptado y convertido en pedido.',
  ].join('\n')
}

function customerNote(args: {
  quoteCode: string
  quantity: number
  notes: string | null
}) {
  const lines = [
    `Convertido desde ${args.quoteCode}.`,
    `Cantidad presupuestada: ${args.quantity}.`,
  ]

  if (args.notes) lines.push(args.notes)

  return lines.join(' ').slice(0, 500)
}

export async function createOrderFromQuote(
  databaseUrl: string,
  quoteId: string,
) {
  if (!UUID_RE.test(quoteId)) {
    return Response.json({ error: 'Presupuesto inválido.' }, { status: 400 })
  }

  const sql = neon(databaseUrl)

  try {
    const existing = await sql`
      SELECT public_code
      FROM orders
      WHERE quote_id = ${quoteId}::uuid
      LIMIT 1
    `

    if (existing.length > 0) {
      return Response.json(
        {
          orderCode: String(existing[0].public_code),
          existing: true,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const rows = await sql`
      SELECT
        id::text,
        quote_number,
        status,
        title,
        customer_name,
        customer_phone,
        quantity,
        notes,
        suggested_unit_price::text,
        total_price::text
      FROM quotes
      WHERE id = ${quoteId}::uuid
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Presupuesto no encontrado.' }, { status: 404 })
    }

    const quote = rows[0] as Record<string, unknown>
    const status = String(quote.status ?? '')

    if (status !== 'accepted') {
      return Response.json(
        { error: 'El presupuesto debe estar Aceptado antes de convertirlo en pedido.' },
        { status: 409 },
      )
    }

    const customerName = String(quote.customer_name ?? '').trim()
    const customerPhone = String(quote.customer_phone ?? '').trim()

    if (customerName.length < 2 || customerPhone.replace(/\D/g, '').length < 6) {
      return Response.json(
        {
          error:
            'El presupuesto necesita cliente y WhatsApp antes de convertirse en pedido.',
        },
        { status: 409 },
      )
    }

    const quoteNumber = Number(quote.quote_number)
    const quoteCode = `PRE-${String(quoteNumber).padStart(6, '0')}`
    const title = String(quote.title ?? 'Trabajo personalizado')
    const quantity = Math.max(1, Number(quote.quantity ?? 1))
    const totalPrice = Number(quote.total_price ?? 0)
    const suggestedUnitPrice = Number(quote.suggested_unit_price ?? 0)

    if (
      !Number.isFinite(totalPrice) ||
      totalPrice < 0 ||
      !Number.isFinite(suggestedUnitPrice) ||
      suggestedUnitPrice < 0
    ) {
      return Response.json(
        { error: 'El presupuesto tiene importes inválidos.' },
        { status: 409 },
      )
    }

    const orderCode = createPublicCode()
    const requestId = randomUUID()
    const message = orderWhatsappMessage({
      orderCode,
      quoteCode,
      title,
      quantity,
      total: totalPrice,
    })
    const notes = customerNote({
      quoteCode,
      quantity,
      notes: quote.notes ? String(quote.notes) : null,
    })

    const queries = [
      sql`
        INSERT INTO orders (
          public_code,
          request_id,
          quote_id,
          status,
          customer_name,
          customer_phone,
          customer_notes,
          known_total,
          has_quote,
          source,
          whatsapp_message
        )
        VALUES (
          ${orderCode},
          ${requestId}::uuid,
          ${quoteId}::uuid,
          'confirmed',
          ${customerName},
          ${customerPhone},
          ${notes},
          ${totalPrice},
          false,
          'quote',
          ${message}
        )
      `,
      sql`
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name,
          kind,
          pricing_mode,
          unit_price,
          quantity,
          line_total,
          customization_note
        )
        SELECT
          id,
          NULL,
          ${title},
          'service',
          'fixed',
          ${totalPrice},
          1,
          ${totalPrice},
          ${`Presupuesto ${quoteCode} · ${quantity} unidad(es) · ${money(suggestedUnitPrice)} por unidad`}
        FROM orders
        WHERE quote_id = ${quoteId}::uuid
      `,
      sql`
        INSERT INTO order_events (
          order_id,
          event_type,
          from_status,
          to_status,
          note
        )
        SELECT
          id,
          'created_from_quote',
          NULL,
          'confirmed',
          ${`Creado desde ${quoteCode}`}
        FROM orders
        WHERE quote_id = ${quoteId}::uuid
      `,
    ]

    await sql.transaction(queries)

    return Response.json(
      { orderCode, existing: false },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    try {
      const existing = await sql`
        SELECT public_code
        FROM orders
        WHERE quote_id = ${quoteId}::uuid
        LIMIT 1
      `

      if (existing.length > 0) {
        return Response.json(
          {
            orderCode: String(existing[0].public_code),
            existing: true,
          },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }
    } catch {
      // Preserve the original conversion error below.
    }

    return Response.json(
      { error: 'No se pudo convertir el presupuesto en pedido.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
