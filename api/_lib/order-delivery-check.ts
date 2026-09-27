import { neon } from '@neondatabase/serverless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function updateOrderDeliveryCheck(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const id = text(body.id, 40)
  const checked = body.checked
  const note = text(body.note, 500)

  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  if (typeof checked !== 'boolean') {
    return Response.json(
      { error: 'Estado del control final inválido.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      SELECT
        status,
        production_stage,
        delivery_checked_at::text,
        delivery_check_note
      FROM orders
      WHERE id = ${id}::uuid
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 })
    }

    const current = rows[0] as Record<string, unknown>
    const status = String(current.status ?? '')
    const productionStage = String(current.production_stage ?? 'not_started')
    const previousChecked = Boolean(current.delivery_checked_at)
    const previousNote = current.delivery_check_note
      ? String(current.delivery_check_note)
      : ''

    if (status === 'cancelled' || status === 'completed') {
      return Response.json(
        {
          error:
            status === 'cancelled'
              ? 'No se puede controlar la entrega de un pedido cancelado.'
              : 'El pedido ya está completado.',
        },
        { status: 409 },
      )
    }

    if (checked && productionStage !== 'ready_for_delivery') {
      return Response.json(
        { error: 'Terminá la producción antes de confirmar el control final.' },
        { status: 409 },
      )
    }

    const nextNote = checked ? note : ''

    if (previousChecked === checked && previousNote === nextNote) {
      return Response.json(
        {
          ok: true,
          unchanged: true,
          checked,
          checkedAt: current.delivery_checked_at
            ? String(current.delivery_checked_at)
            : null,
          note: nextNote,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const eventType = checked
      ? 'delivery_check_completed'
      : 'delivery_check_reopened'
    const eventNote = checked
      ? ['Control final de entrega confirmado', note].filter(Boolean).join(' · ')
      : 'Control final de entrega reabierto'

    await sql.transaction([
      sql`
        UPDATE orders
        SET
          delivery_checked_at = CASE WHEN ${checked} THEN now() ELSE NULL END,
          delivery_check_note = CASE
            WHEN ${checked} THEN ${note || null}
            ELSE NULL
          END,
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
          ${eventType},
          ${status},
          ${status},
          ${eventNote.slice(0, 300)}
        )
      `,
    ])

    return Response.json(
      {
        ok: true,
        checked,
        note: nextNote,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo guardar el control final de entrega.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
