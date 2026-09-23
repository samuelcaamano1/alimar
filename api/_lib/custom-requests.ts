import { neon } from '@neondatabase/serverless'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REQUEST_TYPES = new Set(['paper', '3d', 'event', 'design', 'other'])
const STATUSES = new Set(['new', 'reviewing', 'quoted', 'closed'])

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function integerOrNull(value: unknown) {
  if (value === '' || value === null || value === undefined) return null

  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN

  return Number.isInteger(parsed) && parsed > 0 && parsed <= 9999 ? parsed : undefined
}

function dateOrNull(value: unknown) {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value !== 'string') return undefined

  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined

  const date = new Date(`${normalized}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === normalized
    ? normalized
    : undefined
}

function validReferenceUrl(value: string) {
  if (!value) return true

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function validReferenceImage(value: string) {
  if (!value) return true
  if (value.length > 1_000_000) return false
  if (/^https:\/\/[^\s]+$/i.test(value)) return true

  return /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(
    value,
  )
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  return origin === new URL(request.url).origin
}

function typeLabel(value: string) {
  const labels: Record<string, string> = {
    paper: 'Papelería / impresión',
    '3d': 'Impresión 3D',
    event: 'Evento',
    design: 'Diseño gráfico',
    other: 'Otro personalizado',
  }

  return labels[value] ?? value
}

function publicCode(number: unknown) {
  return `SOL-${String(Number(number)).padStart(6, '0')}`
}

function buildWhatsappMessage(args: {
  code: string
  name: string
  exampleTitle: string | null
  hasReferenceImage: boolean
  requestType: string
  quantity: number | null
  neededDate: string | null
  description: string
}) {
  const lines = [
    `Hola Alimar, envié la solicitud personalizada ${args.code}.`,
    '',
    `Nombre: ${args.name}`,
    `Trabajo: ${typeLabel(args.requestType)}`,
  ]

  if (args.exampleTitle) lines.push(`Ejemplo: ${args.exampleTitle}`)
  if (args.quantity !== null) lines.push(`Cantidad aproximada: ${args.quantity}`)
  if (args.neededDate) lines.push(`Lo necesito para: ${args.neededDate}`)
  if (args.hasReferenceImage) lines.push('Adjunté una imagen de referencia en la solicitud.')

  lines.push('', 'Idea:', args.description, '', 'La solicitud ya quedó registrada en la web.')

  return lines.join('\n')
}

function formatRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    public_code: publicCode(row.request_number),
    status: String(row.status ?? 'new'),
    customer_name: String(row.customer_name ?? ''),
    customer_phone: String(row.customer_phone ?? ''),
    request_type: String(row.request_type ?? ''),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    needed_date: row.needed_date ? String(row.needed_date).slice(0, 10) : null,
    dimensions: row.dimensions ? String(row.dimensions) : null,
    theme: row.theme ? String(row.theme) : null,
    description: String(row.description ?? ''),
    example_id: row.example_id ? String(row.example_id) : null,
    example_title: row.example_title ? String(row.example_title) : null,
    reference_url: row.reference_url ? String(row.reference_url) : null,
    reference_image_url: row.reference_image_url
      ? String(row.reference_image_url)
      : null,
    quote_id: row.quote_id ? String(row.quote_id) : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function createPublicCustomRequest(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: 'Origen de solicitud inválido.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json(
      { error: 'Las solicitudes personalizadas no están disponibles temporalmente.' },
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
  const customerName = text(body.customerName, 120)
  const customerPhone = text(body.customerPhone, 40)
  const requestType = text(body.requestType, 24)
  const quantity = integerOrNull(body.quantity)
  const neededDate = dateOrNull(body.neededDate)
  const dimensions = text(body.dimensions, 120) || null
  const theme = text(body.theme, 240) || null
  const description = text(body.description, 3000)
  const exampleId = text(body.exampleId, 40) || null
  const incomingExampleTitle = text(body.exampleTitle, 100) || null
  const referenceUrl = text(body.referenceUrl, 500) || null
  const referenceImageUrl =
    typeof body.referenceImageUrl === 'string'
      ? body.referenceImageUrl.trim()
      : ''

  if (!UUID_RE.test(requestId)) {
    return Response.json({ error: 'Identificador de solicitud inválido.' }, { status: 400 })
  }

  if (customerName.length < 2) {
    return Response.json({ error: 'Ingresá tu nombre.' }, { status: 400 })
  }

  if (customerPhone.replace(/\D/g, '').length < 6) {
    return Response.json({ error: 'Ingresá un WhatsApp válido.' }, { status: 400 })
  }

  if (!REQUEST_TYPES.has(requestType)) {
    return Response.json({ error: 'Elegí un tipo de trabajo válido.' }, { status: 400 })
  }

  if (quantity === undefined) {
    return Response.json({ error: 'La cantidad aproximada es inválida.' }, { status: 400 })
  }

  if (neededDate === undefined) {
    return Response.json({ error: 'La fecha indicada es inválida.' }, { status: 400 })
  }

  if (description.length < 10) {
    return Response.json(
      { error: 'Contanos un poco más sobre lo que necesitás.' },
      { status: 400 },
    )
  }

  if (referenceUrl && !validReferenceUrl(referenceUrl)) {
    return Response.json(
      { error: 'El link de referencia debe comenzar con http:// o https://.' },
      { status: 400 },
    )
  }

  if (exampleId && !UUID_RE.test(exampleId)) {
    return Response.json({ error: 'Ejemplo personalizado inválido.' }, { status: 400 })
  }

  if (referenceImageUrl && !validReferenceImage(referenceImageUrl)) {
    return Response.json(
      { error: 'Referencia visual inválida. Usá JPG, PNG o WebP menor a 1 MB.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    let resolvedRequestType = requestType
    let resolvedExampleTitle = incomingExampleTitle
    let resolvedExampleId = exampleId

    if (exampleId) {
      const exampleRows = await sql`
        SELECT id::text, title, request_type
        FROM custom_request_examples
        WHERE id = ${exampleId}::uuid
          AND active = true
        LIMIT 1
      `

      if (exampleRows.length === 0) {
        return Response.json(
          { error: 'Ese ejemplo ya no está disponible. Elegí otro.' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      resolvedRequestType = String(exampleRows[0].request_type)
      resolvedExampleTitle = String(exampleRows[0].title)
      resolvedExampleId = String(exampleRows[0].id)
    }

    const existing = await sql`
      SELECT request_number
      FROM custom_requests
      WHERE request_id = ${requestId}::uuid
      LIMIT 1
    `

    if (existing.length > 0) {
      const code = publicCode(existing[0].request_number)
      return Response.json(
        {
          requestCode: code,
          existing: true,
          whatsappMessage: buildWhatsappMessage({
            code,
            name: customerName,
            exampleTitle: resolvedExampleTitle,
            hasReferenceImage: Boolean(referenceImageUrl),
            requestType: resolvedRequestType,
            quantity: quantity ?? null,
            neededDate: neededDate ?? null,
            description,
          }),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const [row] = await sql`
      INSERT INTO custom_requests (
        request_id,
        customer_name,
        customer_phone,
        request_type,
        quantity,
        needed_date,
        dimensions,
        theme,
        description,
        example_id,
        example_title,
        reference_url,
        reference_image_url
      )
      VALUES (
        ${requestId}::uuid,
        ${customerName},
        ${customerPhone},
        ${resolvedRequestType},
        ${quantity},
        ${neededDate},
        ${dimensions},
        ${theme},
        ${description},
        ${resolvedExampleId}::uuid,
        ${resolvedExampleTitle},
        ${referenceUrl},
        ${referenceImageUrl || null}
      )
      RETURNING request_number
    `

    const code = publicCode(row.request_number)

    return Response.json(
      {
        requestCode: code,
        whatsappMessage: buildWhatsappMessage({
            code,
            name: customerName,
            exampleTitle: resolvedExampleTitle,
            hasReferenceImage: Boolean(referenceImageUrl),
            requestType: resolvedRequestType,
          quantity: quantity ?? null,
          neededDate: neededDate ?? null,
          description,
        }),
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos guardar tu solicitud. Probá nuevamente.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function listAdminCustomRequests(databaseUrl: string) {
  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        id::text,
        request_number,
        status,
        customer_name,
        customer_phone,
        request_type,
        quantity,
        needed_date::text,
        dimensions,
        theme,
        description,
        example_id::text,
        example_title,
        reference_url,
        reference_image_url,
        quote_id::text,
        created_at::text,
        updated_at::text
      FROM custom_requests
      ORDER BY created_at DESC
      LIMIT 100
    `

    return Response.json(
      { requests: rows.map((row) => formatRow(row as Record<string, unknown>)) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar las solicitudes personalizadas.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function updateAdminCustomRequest(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const id = text(body.id, 40)
  const status = text(body.status, 20)

  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Solicitud personalizada inválida.' }, { status: 400 })
  }

  if (!STATUSES.has(status)) {
    return Response.json({ error: 'Estado inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      UPDATE custom_requests
      SET status = ${status}, updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id::text,
        request_number,
        status,
        customer_name,
        customer_phone,
        request_type,
        quantity,
        needed_date::text,
        dimensions,
        theme,
        description,
        example_id::text,
        example_title,
        reference_url,
        reference_image_url,
        quote_id::text,
        created_at::text,
        updated_at::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Solicitud no encontrada.' }, { status: 404 })
    }

    return Response.json(
      { request: formatRow(rows[0] as Record<string, unknown>) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar la solicitud personalizada.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
