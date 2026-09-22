import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_ITEMS = 25

type IncomingItem = {
  productId: string
  variantId: string | null
  quantity: number
  note: string
}

type ProductSnapshot = {
  id: string
  name: string
  kind: 'service' | 'product'
  pricing_mode: 'fixed' | 'from' | 'quote'
  base_price: string | null
  has_variants: boolean
}

type VariantSnapshot = {
  id: string
  name: string
  price_override: string | null
}

type ValidatedItem = ProductSnapshot & {
  quantity: number
  note: string | null
  variantId: string | null
  variantName: string | null
  unitPrice: number | null
  lineTotal: number | null
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  return origin === new URL(request.url).origin
}

function money(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}

function createPublicCode() {
  const year = new Date().getFullYear()
  const token = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
  return `PED-${year}-${token}`
}

function buildWhatsappMessage(args: {
  code: string
  customerName: string
  customerPhone: string
  items: ValidatedItem[]
  knownTotal: number
  hasQuote: boolean
}) {
  const lines = [
    `Hola Alimar, realicé el pedido ${args.code}.`,
    '',
    `Nombre: ${args.customerName}`,
    `Teléfono: ${args.customerPhone}`,
    '',
    'Pedido:',
  ]

  for (const item of args.items) {
    const price = item.lineTotal === null ? 'A consultar' : money(item.lineTotal)
    const variant = item.variantName ? ` · ${item.variantName}` : ''
    lines.push(`- ${item.quantity}x ${item.name}${variant} — ${price}`)

    if (item.note) {
      lines.push(`  Personalización: ${item.note}`)
    }
  }

  lines.push('', `Subtotal conocido: ${money(args.knownTotal)}`)

  if (args.hasQuote) {
    lines.push('Hay ítems que requieren cotización.')
  }

  lines.push('', 'El pedido ya quedó registrado en la web.')

  return lines.join('\n')
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: 'Origen de solicitud inválido.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json(
      { error: 'Pedidos no disponibles temporalmente.' },
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

  const requestId = text(body.requestId, 40)
  const customer =
    body.customer && typeof body.customer === 'object'
      ? (body.customer as Record<string, unknown>)
      : {}
  const rawItems = Array.isArray(body.items) ? body.items : []

  const customerName = text(customer.name, 100)
  const customerPhone = text(customer.phone, 40)
  const customerEmail = text(customer.email, 160)
  const customerNotes = text(customer.notes, 500)

  if (!UUID_RE.test(requestId)) {
    return Response.json({ error: 'Identificador de pedido inválido.' }, { status: 400 })
  }

  if (customerName.length < 2) {
    return Response.json({ error: 'Ingresá tu nombre.' }, { status: 400 })
  }

  if (customerPhone.replace(/\D/g, '').length < 6) {
    return Response.json({ error: 'Ingresá un WhatsApp válido.' }, { status: 400 })
  }

  if (customerEmail && !EMAIL_RE.test(customerEmail)) {
    return Response.json({ error: 'El email no es válido.' }, { status: 400 })
  }

  if (rawItems.length < 1 || rawItems.length > MAX_ITEMS) {
    return Response.json(
      { error: `El pedido debe tener entre 1 y ${MAX_ITEMS} productos.` },
      { status: 400 },
    )
  }

  const incoming: IncomingItem[] = []
  const seen = new Set<string>()

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object') {
      return Response.json({ error: 'Hay un producto inválido en el pedido.' }, { status: 400 })
    }

    const value = rawItem as Record<string, unknown>
    const productId = text(value.id ?? value.productId, 40)
    const rawVariantId = text(value.variantId, 40)
    const variantId = rawVariantId || null
    const quantity = Number(value.quantity)
    const note = text(value.note, 240)

    if (
      !UUID_RE.test(productId) ||
      (variantId !== null && !UUID_RE.test(variantId)) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return Response.json({ error: 'Hay un producto inválido en el pedido.' }, { status: 400 })
    }

    const itemKey = `${productId}:${variantId ?? 'base'}`

    if (seen.has(itemKey)) {
      return Response.json({ error: 'El pedido contiene opciones duplicadas.' }, { status: 400 })
    }

    seen.add(itemKey)
    incoming.push({ productId, variantId, quantity, note })
  }

  const sql = neon(databaseUrl)

  try {
    const existing = await sql`
      SELECT public_code, whatsapp_message
      FROM orders
      WHERE request_id = ${requestId}::uuid
      LIMIT 1
    `

    if (existing.length > 0) {
      return Response.json(
        {
          orderCode: String(existing[0].public_code),
          whatsappMessage: String(existing[0].whatsapp_message),
          existing: true,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const items: ValidatedItem[] = []

    for (const item of incoming) {
      const rows = await sql`
        SELECT
          p.id::text,
          p.name,
          p.kind,
          p.pricing_mode,
          p.base_price::text,
          EXISTS (
            SELECT 1
            FROM product_variants pv
            WHERE pv.product_id = p.id
              AND pv.active = true
          ) AS has_variants
        FROM products p
        WHERE p.id = ${item.productId}::uuid
          AND p.active = true
        LIMIT 1
      `

      if (rows.length === 0) {
        return Response.json(
          { error: 'Uno de los productos ya no está disponible. Actualizá el catálogo.' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      const product = rows[0] as ProductSnapshot
      let variant: VariantSnapshot | null = null

      if (product.has_variants && !item.variantId) {
        return Response.json(
          { error: `Elegí una variante válida para ${product.name}.` },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      if (item.variantId) {
        const variantRows = await sql`
          SELECT
            id::text,
            name,
            price_override::text
          FROM product_variants
          WHERE id = ${item.variantId}::uuid
            AND product_id = ${item.productId}::uuid
            AND active = true
          LIMIT 1
        `

        if (variantRows.length === 0) {
          return Response.json(
            { error: `La variante elegida para ${product.name} ya no está disponible.` },
            { status: 409, headers: { 'Cache-Control': 'no-store' } },
          )
        }

        variant = variantRows[0] as VariantSnapshot
      }

      const priceSource =
        product.pricing_mode === 'quote'
          ? null
          : variant?.price_override ?? product.base_price

      const numericPrice = priceSource === null ? null : Number(priceSource)

      if (
        product.pricing_mode !== 'quote' &&
        (numericPrice === null || !Number.isFinite(numericPrice) || numericPrice < 0)
      ) {
        return Response.json(
          { error: 'No se pudo validar el precio de un producto.' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      items.push({
        ...product,
        quantity: item.quantity,
        note: item.note || null,
        variantId: variant?.id ?? null,
        variantName: variant?.name ?? null,
        unitPrice: numericPrice,
        lineTotal: numericPrice === null ? null : numericPrice * item.quantity,
      })
    }

    const knownTotal = items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0)
    const hasQuote = items.some((item) => item.lineTotal === null)
    const orderId = randomUUID()
    const publicCode = createPublicCode()
    const whatsappMessage = buildWhatsappMessage({
      code: publicCode,
      customerName,
      customerPhone,
      items,
      knownTotal,
      hasQuote,
    })

    const queries = [
      sql`
        INSERT INTO orders (
          id,
          public_code,
          request_id,
          status,
          customer_name,
          customer_phone,
          customer_email,
          customer_notes,
          known_total,
          has_quote,
          source,
          whatsapp_message
        )
        VALUES (
          ${orderId}::uuid,
          ${publicCode},
          ${requestId}::uuid,
          'new',
          ${customerName},
          ${customerPhone},
          ${customerEmail || null},
          ${customerNotes || null},
          ${knownTotal},
          ${hasQuote},
          'web',
          ${whatsappMessage}
        )
      `,
      ...items.map((item) => sql`
        INSERT INTO order_items (
          order_id,
          product_id,
          variant_id,
          product_name,
          variant_name,
          kind,
          pricing_mode,
          unit_price,
          quantity,
          line_total,
          customization_note
        )
        VALUES (
          ${orderId}::uuid,
          ${item.id}::uuid,
          ${item.variantId}::uuid,
          ${item.name},
          ${item.variantName},
          ${item.kind},
          ${item.pricing_mode},
          ${item.unitPrice},
          ${item.quantity},
          ${item.lineTotal},
          ${item.note}
        )
      `),
      sql`
        INSERT INTO order_events (
          order_id,
          event_type,
          to_status,
          note
        )
        VALUES (
          ${orderId}::uuid,
          'created',
          'new',
          'Pedido creado desde la tienda web'
        )
      `,
    ]

    await sql.transaction(queries)

    return Response.json(
      { orderCode: publicCode, whatsappMessage, knownTotal, hasQuote },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    try {
      const existing = await sql`
        SELECT public_code, whatsapp_message
        FROM orders
        WHERE request_id = ${requestId}::uuid
        LIMIT 1
      `

      if (existing.length > 0) {
        return Response.json(
          {
            orderCode: String(existing[0].public_code),
            whatsappMessage: String(existing[0].whatsapp_message),
            existing: true,
          },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }
    } catch {
      // Fall through to the generic error below.
    }

    return Response.json(
      { error: 'No se pudo registrar el pedido. Probá nuevamente.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
