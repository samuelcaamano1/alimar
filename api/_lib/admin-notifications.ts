import { neon } from '@neondatabase/serverless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function formatNotification(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    kind: String(row.kind ?? ''),
    title: String(row.title ?? ''),
    message: String(row.message ?? ''),
    entity_type: String(row.entity_type ?? ''),
    entity_id: String(row.entity_id ?? ''),
    entity_code: String(row.entity_code ?? ''),
    read_at:
      row.read_at === null || row.read_at === undefined
        ? null
        : String(row.read_at),
    created_at: String(row.created_at ?? ''),
  }
}

export async function listAdminNotifications(databaseUrl: string) {
  const sql = neon(databaseUrl)

  try {
    const [rows, unreadRows] = await Promise.all([
      sql`
        SELECT
          id::text,
          kind,
          title,
          message,
          entity_type,
          entity_id::text,
          entity_code,
          read_at::text,
          created_at::text
        FROM admin_notifications
        ORDER BY created_at DESC
        LIMIT 100
      `,
      sql`
        SELECT count(*)::int AS total
        FROM admin_notifications
        WHERE read_at IS NULL
      `,
    ])

    return Response.json(
      {
        notifications: (rows as Record<string, unknown>[]).map(formatNotification),
        unreadCount: Number(unreadRows[0]?.total ?? 0),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar las notificaciones.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function markAdminNotificationsRead(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const sql = neon(databaseUrl)

  try {
    if (body.all === true) {
      const rows = await sql`
        UPDATE admin_notifications
        SET read_at = COALESCE(read_at, now())
        WHERE read_at IS NULL
        RETURNING id::text
      `

      return Response.json(
        { ok: true, updated: rows.length },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!UUID_RE.test(id)) {
      return Response.json(
        { error: 'Notificación inválida.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const rows = await sql`
      UPDATE admin_notifications
      SET read_at = COALESCE(read_at, now())
      WHERE id = ${id}::uuid
      RETURNING id::text, read_at::text
    `

    if (rows.length === 0) {
      return Response.json(
        { error: 'Notificación no encontrada.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return Response.json(
      { ok: true, id: String(rows[0].id), readAt: String(rows[0].read_at) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar la notificación.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
