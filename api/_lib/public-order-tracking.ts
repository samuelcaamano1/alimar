import { neon } from '@neondatabase/serverless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ORDER_CODE_RE = /^PED-\d{4}-[A-Z0-9]{6,12}$/i

type TrackingItem = {
  name: string
  variant: string | null
  quantity: number
}

type TrackingApprovalStatus =
  | 'not_required'
  | 'pending'
  | 'approved'
  | 'changes_requested'

type TrackingFile = {
  id: string
  kind: 'reference' | 'design' | 'production' | 'print' | '3d' | 'other'
  label: string
  url: string
  approvalStatus: TrackingApprovalStatus
  approvalComment: string | null
  approvalRequestedAt: string | null
  approvalRespondedAt: string | null
}

const TRACKING_APPROVAL_STATUSES = new Set([
  'not_required',
  'pending',
  'approved',
  'changes_requested',
])

const TRACKING_FILE_KINDS = new Set([
  'reference',
  'design',
  'production',
  'print',
  '3d',
  'other',
])

function phoneDigits(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

function orderCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function formatTrackingRow(row: Record<string, unknown>) {
  const items = Array.isArray(row.items)
    ? row.items.flatMap((entry): TrackingItem[] => {
        if (!entry || typeof entry !== 'object') return []

        const item = entry as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name : ''
        const quantity = Number(item.quantity)

        if (!name || !Number.isFinite(quantity) || quantity <= 0) return []

        return [
          {
            name,
            variant: typeof item.variant === 'string' ? item.variant : null,
            quantity,
          },
        ]
      })
    : []

  const files = Array.isArray(row.files)
    ? row.files.flatMap((entry): TrackingFile[] => {
        if (!entry || typeof entry !== 'object') return []

        const file = entry as Record<string, unknown>
        const id = typeof file.id === 'string' ? file.id : ''
        const kind = typeof file.kind === 'string' ? file.kind : ''
        const label = typeof file.label === 'string' ? file.label.trim() : ''
        const rawUrl = typeof file.url === 'string' ? file.url : ''
        const approvalStatusRaw =
          typeof file.approvalStatus === 'string'
            ? file.approvalStatus
            : 'not_required'

        if (
          !UUID_RE.test(id) ||
          !TRACKING_FILE_KINDS.has(kind) ||
          !label ||
          !rawUrl ||
          !TRACKING_APPROVAL_STATUSES.has(approvalStatusRaw)
        ) return []

        try {
          const url = new URL(rawUrl)
          if (url.protocol !== 'https:') return []

          return [
            {
              id,
              kind: kind as TrackingFile['kind'],
              label,
              url: url.toString(),
              approvalStatus: approvalStatusRaw as TrackingApprovalStatus,
              approvalComment:
                typeof file.approvalComment === 'string'
                  ? file.approvalComment.slice(0, 500)
                  : null,
              approvalRequestedAt:
                typeof file.approvalRequestedAt === 'string'
                  ? file.approvalRequestedAt
                  : null,
              approvalRespondedAt:
                typeof file.approvalRespondedAt === 'string'
                  ? file.approvalRespondedAt
                  : null,
            },
          ]
        } catch {
          return []
        }
      })
    : []

  return {
    orderCode: String(row.public_code ?? ''),
    status: String(row.status ?? 'new'),
    productionStage: String(row.production_stage ?? 'not_started'),
    promisedFor: row.promised_for ? String(row.promised_for).slice(0, 10) : null,
    agreedTotal:
      row.agreed_total === null || row.agreed_total === undefined
        ? null
        : String(row.agreed_total),
    balanceDue:
      row.balance_due === null || row.balance_due === undefined
        ? null
        : String(row.balance_due),
    paymentStatus: String(row.payment_status ?? 'total_pending'),
    updatedAt: String(row.updated_at ?? ''),
    items,
    files,
  }
}

async function selectPublicOrderTracking(
  databaseUrl: string,
  token: string,
) {
  const sql = neon(databaseUrl)

  const rows = (await sql`
    SELECT
      o.public_code,
      o.status,
      o.production_stage,
      o.promised_for::text,
      o.agreed_total::text,
      CASE
        WHEN o.agreed_total IS NULL THEN NULL
        ELSE GREATEST(
          0,
          o.agreed_total - COALESCE((
            SELECT SUM(p.amount)
            FROM order_payments p
            WHERE p.order_id = o.id
              AND p.voided_at IS NULL
          ), 0)
        )::text
      END AS balance_due,
      CASE
        WHEN o.agreed_total IS NULL THEN 'total_pending'
        WHEN COALESCE((
          SELECT SUM(p.amount)
          FROM order_payments p
          WHERE p.order_id = o.id
            AND p.voided_at IS NULL
        ), 0) <= 0.009 THEN 'unpaid'
        WHEN GREATEST(
          0,
          o.agreed_total - COALESCE((
            SELECT SUM(p.amount)
            FROM order_payments p
            WHERE p.order_id = o.id
              AND p.voided_at IS NULL
          ), 0)
        ) > 0.009 THEN 'partial'
        ELSE 'paid'
      END AS payment_status,
      GREATEST(
        o.created_at,
        COALESCE(o.schedule_updated_at, o.created_at),
        COALESCE(o.production_stage_updated_at, o.created_at),
        COALESCE((
          SELECT MAX(e.created_at)
          FROM order_events e
          WHERE e.order_id = o.id
        ), o.created_at)
      )::text AS updated_at,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', i.product_name,
            'variant', i.variant_name,
            'quantity', i.quantity
          )
          ORDER BY i.created_at ASC
        )
        FROM order_items i
        WHERE i.order_id = o.id
      ), '[]'::jsonb) AS items,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', f.id::text,
            'kind', f.kind,
            'label', f.label,
            'url', f.url,
            'approvalStatus', f.approval_status,
            'approvalComment', f.approval_comment,
            'approvalRequestedAt', f.approval_requested_at::text,
            'approvalRespondedAt', f.approval_responded_at::text
          )
          ORDER BY f.created_at DESC
        )
        FROM order_files f
        WHERE f.order_id = o.id
          AND f.archived_at IS NULL
          AND f.customer_visible IS TRUE
      ), '[]'::jsonb) AS files
    FROM orders o
    WHERE o.public_tracking_token = ${token}::uuid
    LIMIT 1
  `) as Record<string, unknown>[]

  return rows.length > 0 ? formatTrackingRow(rows[0]) : null
}

export async function getPublicOrderTracking(
  databaseUrl: string,
  token: string,
) {
  if (!UUID_RE.test(token)) {
    return Response.json(
      { error: 'El link de seguimiento no es válido.' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  try {
    const order = await selectPublicOrderTracking(databaseUrl, token)

    if (!order) {
      return Response.json(
        { error: 'No encontramos este pedido.' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    return Response.json(
      { order },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos cargar el seguimiento del pedido.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function lookupPublicOrderTracking(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const code = orderCode(body.orderCode)
  const digits = phoneDigits(body.phone)

  if (!ORDER_CODE_RE.test(code)) {
    return Response.json(
      { error: 'Ingresá un código PED válido.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (digits.length < 10) {
    return Response.json(
      { error: 'Ingresá el WhatsApp usado en el pedido.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT public_tracking_token::text
      FROM orders
      WHERE UPPER(public_code) = ${code}
        AND RIGHT(
          regexp_replace(customer_phone, '[^0-9]', '', 'g'),
          10
        ) = RIGHT(${digits}, 10)
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json(
        {
          error:
            'No encontramos un pedido con ese código y WhatsApp.',
        },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const trackingToken = String(rows[0].public_tracking_token ?? '')

    if (!UUID_RE.test(trackingToken)) {
      return Response.json(
        { error: 'El seguimiento todavía no está disponible para este pedido.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const order = await selectPublicOrderTracking(databaseUrl, trackingToken)

    if (!order) {
      return Response.json(
        { error: 'No encontramos este pedido.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return Response.json(
      { trackingToken, order },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos consultar el seguimiento.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}


export async function respondPublicOrderFileApproval(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const fileId = typeof body.fileId === 'string' ? body.fileId.trim() : ''
  const decision =
    body.decision === 'approved' || body.decision === 'changes_requested'
      ? body.decision
      : ''
  const comment =
    typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : ''

  if (!UUID_RE.test(token) || !UUID_RE.test(fileId)) {
    return Response.json(
      { error: 'La solicitud de aprobación no es válida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (!decision) {
    return Response.json(
      { error: 'Elegí aprobar el diseño o pedir cambios.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (decision === 'changes_requested' && !comment) {
    return Response.json(
      { error: 'Contanos qué cambios necesitás.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        f.order_id::text,
        f.label,
        f.approval_status,
        o.status
      FROM order_files f
      JOIN orders o ON o.id = f.order_id
      WHERE f.id = ${fileId}::uuid
        AND o.public_tracking_token = ${token}::uuid
        AND f.kind = 'design'
        AND f.customer_visible IS TRUE
        AND f.archived_at IS NULL
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json(
        { error: 'No encontramos este diseño para aprobación.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (String(rows[0].approval_status) !== 'pending') {
      return Response.json(
        { error: 'Esta aprobación ya fue respondida o ya no está pendiente.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const orderId = String(rows[0].order_id)
    const orderStatus = String(rows[0].status)
    const label = String(rows[0].label)
    const eventType =
      decision === 'approved' ? 'file_approved' : 'file_changes_requested'
    const eventNote = [
      decision === 'approved'
        ? `Diseño aprobado por el cliente: ${label}`
        : `Cambios solicitados por el cliente: ${label}`,
      comment,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 300)

    await sql.transaction([
      sql`
        UPDATE order_files
        SET
          approval_status = ${decision},
          approval_comment = ${comment || null},
          approval_responded_at = now(),
          updated_at = now()
        WHERE id = ${fileId}::uuid
          AND order_id = ${orderId}::uuid
          AND approval_status = 'pending'
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
          ${eventType},
          ${orderStatus},
          ${orderStatus},
          ${eventNote}
        )
      `,
    ])

    return Response.json(
      { ok: true, approvalStatus: decision },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos guardar tu respuesta de aprobación.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
