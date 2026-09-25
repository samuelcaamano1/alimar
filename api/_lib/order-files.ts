import { neon } from '@neondatabase/serverless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FILE_KINDS = new Set([
  'reference',
  'design',
  'production',
  'print',
  '3d',
  'other',
])

export type AdminOrderFile = {
  id: string
  order_id: string
  kind: 'reference' | 'design' | 'production' | 'print' | '3d' | 'other'
  label: string
  url: string
  note: string | null
  customer_visible: boolean
  approval_status: 'not_required' | 'pending' | 'approved' | 'changes_requested'
  approval_comment: string | null
  approval_requested_at: string | null
  approval_responded_at: string | null
  created_at: string
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function httpsUrl(value: unknown) {
  const raw = text(value, 4000)
  if (!raw) return ''

  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

export async function listRecentOrderFiles(databaseUrl: string) {
  const sql = neon(databaseUrl)

  return (await sql`
    SELECT
      f.id::text,
      f.order_id::text,
      f.kind,
      f.label,
      f.url,
      f.note,
      f.customer_visible,
      f.approval_status,
      f.approval_comment,
      f.approval_requested_at::text,
      f.approval_responded_at::text,
      f.created_at::text
    FROM order_files f
    WHERE f.archived_at IS NULL
      AND f.order_id IN (
        SELECT id
        FROM orders
        ORDER BY created_at DESC
        LIMIT 50
      )
    ORDER BY f.created_at DESC
  `) as AdminOrderFile[]
}

export async function createOrderFile(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const orderId = text(body.orderId, 40)
  const kind = text(body.kind, 24) as AdminOrderFile['kind']
  const label = text(body.label, 120)
  const url = httpsUrl(body.url)
  const note = text(body.note, 500)

  if (!UUID_RE.test(orderId)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  if (!FILE_KINDS.has(kind)) {
    return Response.json({ error: 'Tipo de archivo inválido.' }, { status: 400 })
  }

  if (!label) {
    return Response.json(
      { error: 'Ingresá un nombre para el archivo.' },
      { status: 400 },
    )
  }

  if (!url) {
    return Response.json(
      { error: 'Ingresá un enlace HTTPS válido.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    const orderRows = await sql`
      SELECT status
      FROM orders
      WHERE id = ${orderId}::uuid
      LIMIT 1
    `

    if (orderRows.length === 0) {
      return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 })
    }

    const status = String(orderRows[0].status)
    const eventNote = [
      `Archivo: ${label}`,
      `Tipo: ${kind}`,
      note,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 300)

    const rows = await sql.transaction([
      sql`
        INSERT INTO order_files (
          order_id,
          kind,
          label,
          url,
          note
        )
        VALUES (
          ${orderId}::uuid,
          ${kind},
          ${label},
          ${url},
          ${note || null}
        )
        RETURNING
          id::text,
          order_id::text,
          kind,
          label,
          url,
          note,
          customer_visible,
          approval_status,
          approval_comment,
          approval_requested_at::text,
          approval_responded_at::text,
          created_at::text
      `,
      sql`
        INSERT INTO order_events (
          order_id,
          event_type,
          from_status,
          to_status,
          note
        )
        VALUES (
          ${orderId}::uuid,
          'file_added',
          ${status},
          ${status},
          ${eventNote}
        )
      `,
    ])

    const fileRows = rows[0] as AdminOrderFile[]

    return Response.json(
      { file: fileRows[0] },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo agregar el archivo al pedido.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function archiveOrderFile(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const orderId = text(body.orderId, 40)
  const fileId = text(body.fileId, 40)

  if (!UUID_RE.test(orderId) || !UUID_RE.test(fileId)) {
    return Response.json({ error: 'Archivo inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        f.label,
        o.status
      FROM order_files f
      JOIN orders o ON o.id = f.order_id
      WHERE f.id = ${fileId}::uuid
        AND f.order_id = ${orderId}::uuid
        AND f.archived_at IS NULL
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Archivo no encontrado.' }, { status: 404 })
    }

    const status = String(rows[0].status)
    const label = String(rows[0].label)

    await sql.transaction([
      sql`
        UPDATE order_files
        SET
          archived_at = now(),
          updated_at = now()
        WHERE id = ${fileId}::uuid
          AND order_id = ${orderId}::uuid
          AND archived_at IS NULL
      `,
      sql`
        INSERT INTO order_events (
          order_id,
          event_type,
          from_status,
          to_status,
          note
        )
        VALUES (
          ${orderId}::uuid,
          'file_archived',
          ${status},
          ${status},
          ${`Archivo archivado: ${label}`}
        )
      `,
    ])

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo archivar el archivo.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}


export async function setOrderFileVisibility(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const orderId = text(body.orderId, 40)
  const fileId = text(body.fileId, 40)
  const visible = body.visible

  if (!UUID_RE.test(orderId) || !UUID_RE.test(fileId)) {
    return Response.json({ error: 'Archivo inválido.' }, { status: 400 })
  }

  if (typeof visible !== 'boolean') {
    return Response.json(
      { error: 'Visibilidad inválida.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        f.label,
        f.customer_visible,
        o.status
      FROM order_files f
      JOIN orders o ON o.id = f.order_id
      WHERE f.id = ${fileId}::uuid
        AND f.order_id = ${orderId}::uuid
        AND f.archived_at IS NULL
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Archivo no encontrado.' }, { status: 404 })
    }

    const currentVisible = Boolean(rows[0].customer_visible)
    if (currentVisible === visible) {
      return Response.json(
        { ok: true, unchanged: true, customerVisible: visible },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const status = String(rows[0].status)
    const label = String(rows[0].label)
    const eventNote = visible
      ? `Archivo compartido con cliente: ${label}`
      : `Archivo ocultado del cliente: ${label}`

    await sql.transaction([
      sql`
        UPDATE order_files
        SET
          customer_visible = ${visible},
          updated_at = now()
        WHERE id = ${fileId}::uuid
          AND order_id = ${orderId}::uuid
          AND archived_at IS NULL
      `,
      sql`
        INSERT INTO order_events (
          order_id,
          event_type,
          from_status,
          to_status,
          note
        )
        VALUES (
          ${orderId}::uuid,
          'file_visibility_changed',
          ${status},
          ${status},
          ${eventNote}
        )
      `,
    ])

    return Response.json(
      { ok: true, customerVisible: visible },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo cambiar la visibilidad del archivo.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}


export async function requestOrderFileApproval(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const orderId = text(body.orderId, 40)
  const fileId = text(body.fileId, 40)

  if (!UUID_RE.test(orderId) || !UUID_RE.test(fileId)) {
    return Response.json({ error: 'Archivo inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        f.kind,
        f.label,
        f.customer_visible,
        o.status
      FROM order_files f
      JOIN orders o ON o.id = f.order_id
      WHERE f.id = ${fileId}::uuid
        AND f.order_id = ${orderId}::uuid
        AND f.archived_at IS NULL
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Archivo no encontrado.' }, { status: 404 })
    }

    if (String(rows[0].kind) !== 'design') {
      return Response.json(
        { error: 'Sólo los archivos de tipo Diseño pueden pedir aprobación.' },
        { status: 409 },
      )
    }

    if (!Boolean(rows[0].customer_visible)) {
      return Response.json(
        { error: 'Compartí el diseño con el cliente antes de pedir aprobación.' },
        { status: 409 },
      )
    }

    const status = String(rows[0].status)
    const label = String(rows[0].label)

    await sql.transaction([
      sql`
        UPDATE order_files
        SET
          approval_status = 'pending',
          approval_comment = NULL,
          approval_requested_at = now(),
          approval_responded_at = NULL,
          updated_at = now()
        WHERE id = ${fileId}::uuid
          AND order_id = ${orderId}::uuid
          AND archived_at IS NULL
      `,
      sql`
        INSERT INTO order_events (
          order_id,
          event_type,
          from_status,
          to_status,
          note
        )
        VALUES (
          ${orderId}::uuid,
          'file_approval_requested',
          ${status},
          ${status},
          ${`Aprobación solicitada al cliente: ${label}`}
        )
      `,
    ])

    return Response.json(
      { ok: true, approvalStatus: 'pending' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo solicitar la aprobación del diseño.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
