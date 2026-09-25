import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { createPublicCustomRequest } from './_lib/custom-requests.js'
import { acceptPublicQuote } from './_lib/public-quotes.js'
import {
  getPublicOrderTracking,
  lookupPublicOrderTracking,
  respondPublicOrderFileApproval,
} from './_lib/public-order-tracking.js'
import {
  enforceRateLimit,
  requireJsonBodyWithinLimit,
  requireRequestOrigin,
} from './_lib/request-security.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_ITEMS = 25

type IncomingCustomization = {
  fieldId: string
  value: string
}

type ValidatedCustomization = {
  fieldId: string
  label: string
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select'
  value: string
}

type CustomizationFieldSnapshot = {
  id: string
  label: string
  field_type: 'text' | 'textarea' | 'number' | 'date' | 'select'
  options: unknown
  required: boolean
  max_length: number
}

type IncomingItem = {
  productId: string
  variantId: string | null
  quantity: number
  note: string
  customizations: IncomingCustomization[]
}

type ProductSnapshot = {
  id: string
  name: string
  kind: 'service' | 'product'
  pricing_mode: 'fixed' | 'from' | 'quote'
  base_price: string | null
  has_variants: boolean
  customization_allowed: boolean
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
  customizations: ValidatedCustomization[]
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function validDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
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

    for (const customization of item.customizations) {
      lines.push(`  ${customization.label}: ${customization.value}`)
    }

    if (item.note) {
      lines.push(`  Nota adicional: ${item.note}`)
    }
  }

  lines.push('', `Subtotal conocido: ${money(args.knownTotal)}`)

  if (args.hasQuote) {
    lines.push('Hay ítems que requieren cotización.')
  }

  lines.push('', 'El pedido ya quedó registrado en la web.')

  return lines.join('\n')
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)

  if (requestUrl.searchParams.get('action') !== 'tracking') {
    return Response.json(
      { error: 'Acción inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    return Response.json(
      { error: 'Seguimiento no disponible temporalmente.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const rateLimitError = await enforceRateLimit(request, databaseUrl, {
    scope: 'public-order-tracking',
    limit: 60,
    windowSeconds: 10 * 60,
  })

  if (rateLimitError) return rateLimitError

  return getPublicOrderTracking(
    databaseUrl,
    requestUrl.searchParams.get('token')?.trim() ?? '',
  )
}

export async function POST(request: Request) {
  const originError = requireRequestOrigin(request)
  if (originError) return originError

  const bodyError = await requireJsonBodyWithinLimit(request, 1_300_000)
  if (bodyError) return bodyError

  const requestUrl = new URL(request.url)
  const action = requestUrl.searchParams.get('action')
  const rateDatabaseUrl = process.env.DATABASE_URL

  if (!rateDatabaseUrl) {
    return Response.json(
      { error: 'Servicio temporalmente no disponible.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const rateLimitOptions =
    action === 'file-approval'
      ? {
          scope: 'public-order-file-approval',
          limit: 20,
          windowSeconds: 10 * 60,
        }
      : action === 'tracking-lookup'
      ? {
          scope: 'public-order-tracking-lookup',
          limit: 20,
          windowSeconds: 10 * 60,
        }
      : action === 'custom-request'
        ? {
            scope: 'public-custom-request',
            limit: 8,
            windowSeconds: 30 * 60,
          }
        : action === 'quote-response'
        ? {
            scope: 'public-quote-response',
            limit: 20,
            windowSeconds: 10 * 60,
          }
        : {
            scope: 'public-order',
            limit: 12,
            windowSeconds: 10 * 60,
          }

  const rateLimitError = await enforceRateLimit(
    request,
    rateDatabaseUrl,
    rateLimitOptions,
  )

  if (rateLimitError) return rateLimitError

  if (action === 'file-approval') {
    let body: Record<string, unknown>

    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return Response.json(
        { error: 'Solicitud inválida.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return respondPublicOrderFileApproval(rateDatabaseUrl, body)
  }

  if (action === 'tracking-lookup') {
    let body: Record<string, unknown>

    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return Response.json(
        { error: 'Solicitud inválida.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return lookupPublicOrderTracking(rateDatabaseUrl, body)
  }

  if (requestUrl.searchParams.get('action') === 'quote-response') {
    return acceptPublicQuote(request)
  }

  if (requestUrl.searchParams.get('action') === 'custom-request') {
    return createPublicCustomRequest(request)
  }

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
    const rawCustomizations = Array.isArray(value.customizations)
      ? value.customizations
      : []

    if (rawCustomizations.length > 8) {
      return Response.json(
        { error: 'Hay demasiados campos de personalización en un producto.' },
        { status: 400 },
      )
    }

    const customizations: IncomingCustomization[] = []
    const seenCustomizationIds = new Set<string>()

    for (const rawCustomization of rawCustomizations) {
      if (!rawCustomization || typeof rawCustomization !== 'object') {
        return Response.json({ error: 'Hay una personalización inválida.' }, { status: 400 })
      }

      const customization = rawCustomization as Record<string, unknown>
      const fieldId = text(customization.fieldId, 40)
      const rawValue =
        typeof customization.value === 'string'
          ? customization.value.trim()
          : ''

      if (
        !UUID_RE.test(fieldId) ||
        rawValue.length > 500 ||
        seenCustomizationIds.has(fieldId)
      ) {
        return Response.json({ error: 'Hay una personalización inválida.' }, { status: 400 })
      }

      seenCustomizationIds.add(fieldId)
      customizations.push({ fieldId, value: rawValue })
    }

    if (
      !UUID_RE.test(productId) ||
      (variantId !== null && !UUID_RE.test(variantId)) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return Response.json({ error: 'Hay un producto inválido en el pedido.' }, { status: 400 })
    }

    const customizationKey = JSON.stringify(
      [...customizations]
        .sort((left, right) => left.fieldId.localeCompare(right.fieldId))
        .map((customization) => [customization.fieldId, customization.value]),
    )
    const itemKey = `${productId}:${variantId ?? 'base'}:${customizationKey}`

    if (seen.has(itemKey)) {
      return Response.json({ error: 'El pedido contiene opciones duplicadas.' }, { status: 400 })
    }

    seen.add(itemKey)
    incoming.push({ productId, variantId, quantity, note, customizations })
  }

  const sql = neon(databaseUrl)

  try {
    const existing = await sql`
      SELECT public_code, whatsapp_message, public_tracking_token::text
      FROM orders
      WHERE request_id = ${requestId}::uuid
      LIMIT 1
    `

    if (existing.length > 0) {
      return Response.json(
        {
          orderCode: String(existing[0].public_code),
          whatsappMessage: String(existing[0].whatsapp_message),
          trackingToken: String(existing[0].public_tracking_token),
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
          p.customization_allowed,
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

      const validatedCustomizations: ValidatedCustomization[] = []
      
      if (!product.customization_allowed && item.customizations.length > 0) {
        return Response.json(
          { error: `${product.name} ya no admite personalización. Actualizá el carrito.` },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        )
      }
      
      if (product.customization_allowed) {
        const customizationRows = (await sql`
          SELECT
            id::text,
            label,
            field_type,
            options,
            required,
            max_length
          FROM product_customization_fields
          WHERE product_id = ${item.productId}::uuid
            AND active = true
          ORDER BY sort_order ASC, created_at ASC
        `) as CustomizationFieldSnapshot[]
      
        const definitions = new Map(
          customizationRows.map((field) => [field.id, field]),
        )
        const requested = new Map(
          item.customizations.map((customization) => [
            customization.fieldId,
            customization.value,
          ]),
        )
      
        for (const fieldId of requested.keys()) {
          if (!definitions.has(fieldId)) {
            return Response.json(
              { error: `Una personalización de ${product.name} ya no está disponible.` },
              { status: 409, headers: { 'Cache-Control': 'no-store' } },
            )
          }
        }
      
        for (const field of customizationRows) {
          const value = (requested.get(field.id) ?? '').trim()
      
          if (field.required && !value) {
            return Response.json(
              { error: `Completá "${field.label}" para ${product.name}.` },
              { status: 409, headers: { 'Cache-Control': 'no-store' } },
            )
          }
      
          if (!value) continue
      
          if (
            (field.field_type === 'text' || field.field_type === 'textarea') &&
            value.length > field.max_length
          ) {
            return Response.json(
              { error: `"${field.label}" supera el máximo permitido.` },
              { status: 409, headers: { 'Cache-Control': 'no-store' } },
            )
          }
      
          if (field.field_type === 'number') {
            const normalized = value.replace(',', '.')
            if (!/^-?\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(Number(normalized))) {
              return Response.json(
                { error: `"${field.label}" debe ser un número válido.` },
                { status: 409, headers: { 'Cache-Control': 'no-store' } },
              )
            }
          }
      
          if (field.field_type === 'date' && !validDateValue(value)) {
            return Response.json(
              { error: `"${field.label}" debe ser una fecha válida.` },
              { status: 409, headers: { 'Cache-Control': 'no-store' } },
            )
          }
      
          if (field.field_type === 'select') {
            const options = Array.isArray(field.options)
              ? field.options.filter((option): option is string => typeof option === 'string')
              : []
      
            if (!options.includes(value)) {
              return Response.json(
                { error: `Elegí una opción válida para "${field.label}".` },
                { status: 409, headers: { 'Cache-Control': 'no-store' } },
              )
            }
          }
      
          validatedCustomizations.push({
            fieldId: field.id,
            label: field.label,
            fieldType: field.field_type,
            value,
          })
        }
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
        customizations: validatedCustomizations,
      })
    }

    const knownTotal = items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0)
    const hasQuote = items.some((item) => item.lineTotal === null)
    const orderId = randomUUID()
    const publicCode = createPublicCode()
    const trackingToken = randomUUID()
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
          public_tracking_token,
          request_id,
          status,
          customer_name,
          customer_phone,
          customer_email,
          customer_notes,
          known_total,
          agreed_total,
          has_quote,
          source,
          whatsapp_message
        )
        VALUES (
          ${orderId}::uuid,
          ${publicCode},
          ${trackingToken}::uuid,
          ${requestId}::uuid,
          'new',
          ${customerName},
          ${customerPhone},
          ${customerEmail || null},
          ${customerNotes || null},
          ${knownTotal},
          ${hasQuote ? null : knownTotal},
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
          customization_note,
          customization_values
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
          ${item.note},
          ${JSON.stringify(item.customizations)}::jsonb
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
      { orderCode: publicCode, whatsappMessage, trackingToken, knownTotal, hasQuote },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    try {
      const existing = await sql`
        SELECT public_code, whatsapp_message, public_tracking_token::text
        FROM orders
        WHERE request_id = ${requestId}::uuid
        LIMIT 1
      `

      if (existing.length > 0) {
        return Response.json(
          {
            orderCode: String(existing[0].public_code),
            whatsappMessage: String(existing[0].whatsapp_message),
          trackingToken: String(existing[0].public_tracking_token),
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
