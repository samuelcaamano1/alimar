import { neon } from '@neondatabase/serverless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent'])
const PRODUCTION_STAGES = new Set([
  'not_started',
  'design',
  'awaiting_approval',
  'materials',
  'production',
  'finishing',
  'ready_for_delivery',
])

type OrderStatus =
  | 'new'
  | 'contacted'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'

type ProductionPriority = 'low' | 'normal' | 'high' | 'urgent'
type ProductionStage =
  | 'not_started'
  | 'design'
  | 'awaiting_approval'
  | 'materials'
  | 'production'
  | 'finishing'
  | 'ready_for_delivery'

const priorityLabels: Record<ProductionPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

const productionStageLabels: Record<ProductionStage, string> = {
  not_started: 'Sin iniciar',
  design: 'Diseño / armado',
  awaiting_approval: 'Esperando aprobación',
  materials: 'Preparando materiales',
  production: 'En producción',
  finishing: 'Terminaciones',
  ready_for_delivery: 'Listo para entregar',
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined

  const raw = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined

  const [year, month, day] = raw.split('-').map(Number)

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 2020 ||
    year > 2100
  ) {
    return undefined
  }

  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }

  return raw
}

function scheduleEventNote({
  promisedFor,
  priority,
  note,
}: {
  promisedFor: string | null
  priority: ProductionPriority
  note: string
}) {
  const delivery = promisedFor
    ? new Intl.DateTimeFormat('es-AR', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(`${promisedFor}T12:00:00Z`))
    : 'sin fecha'

  return [
    `Entrega: ${delivery}`,
    `Prioridad: ${priorityLabels[priority]}`,
    note,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 300)
}

export async function updateOrderSchedule(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const id = text(body.id, 40)
  const promisedFor = optionalDate(body.promisedFor)
  const priority = text(body.priority, 12) as ProductionPriority
  const note = text(body.note, 500)

  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  if (promisedFor === undefined) {
    return Response.json(
      { error: 'Fecha prometida inválida.' },
      { status: 400 },
    )
  }

  if (!PRIORITIES.has(priority)) {
    return Response.json(
      { error: 'Prioridad de producción inválida.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        status,
        promised_for::text,
        production_priority,
        delivery_note
      FROM orders
      WHERE id = ${id}::uuid
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 })
    }

    const current = rows[0] as Record<string, unknown>
    const status = String(current.status ?? '') as OrderStatus

    if (status === 'cancelled') {
      return Response.json(
        { error: 'No se puede programar un pedido cancelado.' },
        { status: 409 },
      )
    }

    const previousPromisedFor = current.promised_for
      ? String(current.promised_for).slice(0, 10)
      : null
    const previousPriority = String(
      current.production_priority ?? 'normal',
    ) as ProductionPriority
    const previousNote = current.delivery_note
      ? String(current.delivery_note)
      : ''

    if (
      previousPromisedFor === promisedFor &&
      previousPriority === priority &&
      previousNote === note
    ) {
      return Response.json(
        {
          ok: true,
          unchanged: true,
          promisedFor,
          priority,
          note,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const eventNote = scheduleEventNote({
      promisedFor,
      priority,
      note,
    })

    await sql.transaction([
      sql`
        UPDATE orders
        SET
          promised_for = ${promisedFor}::date,
          production_priority = ${priority},
          delivery_note = ${note || null},
          schedule_updated_at = now(),
          updated_at = now()
        WHERE id = ${id}::uuid
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
          ${id}::uuid,
          'schedule_updated',
          ${status},
          ${status},
          ${eventNote}
        )
      `,
    ])

    return Response.json(
      {
        ok: true,
        promisedFor,
        priority,
        note,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo guardar la planificación del pedido.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}


export async function updateOrderProductionStage(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const id = text(body.id, 40)
  const stage = text(body.stage, 24) as ProductionStage
  const note = text(body.note, 500)

  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  if (!PRODUCTION_STAGES.has(stage)) {
    return Response.json({ error: 'Etapa de producción inválida.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT status, production_stage, production_stage_note
      FROM orders
      WHERE id = ${id}::uuid
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 })
    }

    const current = rows[0] as Record<string, unknown>
    const status = String(current.status ?? '') as OrderStatus

    if (!['confirmed', 'in_progress', 'ready'].includes(status)) {
      return Response.json(
        {
          error:
            status === 'cancelled'
              ? 'No se puede actualizar producción en un pedido cancelado.'
              : 'Confirmá el pedido antes de iniciar el seguimiento de producción.',
        },
        { status: 409 },
      )
    }

    const previousStage = String(
      current.production_stage ?? 'not_started',
    ) as ProductionStage
    const previousNote = current.production_stage_note
      ? String(current.production_stage_note)
      : ''

    if (previousStage === stage && previousNote === note) {
      return Response.json(
        { ok: true, unchanged: true, stage, note },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const eventNote = [
      `Etapa: ${productionStageLabels[stage]}`,
      note,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 300)

    await sql.transaction([
      sql`
        UPDATE orders
        SET
          production_stage = ${stage},
          production_stage_note = ${note || null},
          production_stage_updated_at = now(),
          updated_at = now()
        WHERE id = ${id}::uuid
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
          ${id}::uuid,
          'production_stage_updated',
          ${status},
          ${status},
          ${eventNote}
        )
      `,
    ])

    return Response.json(
      { ok: true, stage, note },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar la etapa de producción.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
