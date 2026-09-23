import { neon } from '@neondatabase/serverless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PAYMENT_METHODS = new Set([
  'cash',
  'transfer',
  'mercadopago',
  'card',
  'other',
])

type OrderStatus =
  | 'new'
  | 'contacted'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'

export type AdminOrderPayment = {
  id: string
  order_id: string
  amount: string
  payment_method: string
  paid_on: string
  reference: string | null
  note: string | null
  voided_at: string | null
  void_reason: string | null
  created_at: string
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function moneyValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= 1_000_000_000_000
      ? value
      : undefined
  }

  if (typeof value !== 'string') return undefined

  const raw = value.trim().replace(/\s+/g, '')
  if (!raw) return undefined

  let normalized = raw

  if (raw.includes(',') && raw.includes('.')) {
    normalized =
      raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '')
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.')
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '')
  }

  const parsed = Number(normalized)

  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000_000_000
    ? parsed
    : undefined
}

function positiveMoney(value: unknown) {
  const parsed = moneyValue(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

function validPaidOn(value: unknown) {
  if (typeof value !== 'string') return undefined

  const paidOn = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return undefined

  const date = new Date(`${paidOn}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return undefined

  return date.toISOString().slice(0, 10) === paidOn ? paidOn : undefined
}

function paymentEventNote({
  amount,
  method,
  reference,
  note,
}: {
  amount: number
  method: string
  reference: string
  note: string
}) {
  return [
    `Cobro: $${amount.toLocaleString('es-AR')}`,
    method,
    reference ? `Ref. ${reference}` : '',
    note,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 300)
}

export async function listRecentOrderPayments(databaseUrl: string) {
  const sql = neon(databaseUrl)

  const rows = (await sql`
    SELECT
      payment.id::text,
      payment.order_id::text,
      payment.amount::text,
      payment.payment_method,
      payment.paid_on::text,
      payment.reference,
      payment.note,
      payment.voided_at::text,
      payment.void_reason,
      payment.created_at::text
    FROM order_payments payment
    WHERE payment.order_id IN (
      SELECT id
      FROM orders
      ORDER BY created_at DESC
      LIMIT 50
    )
    ORDER BY
      payment.paid_on DESC,
      payment.created_at DESC
  `) as Record<string, unknown>[]

  return rows.map(
    (row): AdminOrderPayment => ({
      id: String(row.id ?? ''),
      order_id: String(row.order_id ?? ''),
      amount: String(row.amount ?? '0'),
      payment_method: String(row.payment_method ?? ''),
      paid_on: String(row.paid_on ?? ''),
      reference: row.reference ? String(row.reference) : null,
      note: row.note ? String(row.note) : null,
      voided_at: row.voided_at ? String(row.voided_at) : null,
      void_reason: row.void_reason ? String(row.void_reason) : null,
      created_at: String(row.created_at ?? ''),
    }),
  )
}

export async function updateOrderAgreedTotal(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const orderId = text(body.id, 40)
  const agreedTotal = positiveMoney(body.agreedTotal)

  if (!UUID_RE.test(orderId)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  if (agreedTotal === undefined) {
    return Response.json(
      { error: 'Ingresá un total acordado mayor a cero.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        status,
        agreed_total::text,
        COALESCE(
          (
            SELECT SUM(payment.amount)
            FROM order_payments payment
            WHERE payment.order_id = orders.id
              AND payment.voided_at IS NULL
          ),
          0
        )::text AS paid_total
      FROM orders
      WHERE id = ${orderId}::uuid
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 })
    }

    const row = rows[0] as Record<string, unknown>
    const status = String(row.status ?? '') as OrderStatus
    const paidTotal = Number(row.paid_total ?? 0)
    const previousTotal =
      row.agreed_total === null || row.agreed_total === undefined
        ? null
        : Number(row.agreed_total)

    if (status === 'cancelled') {
      return Response.json(
        { error: 'No se puede cambiar el total de un pedido cancelado.' },
        { status: 409 },
      )
    }

    if (Number.isFinite(paidTotal) && agreedTotal + 0.009 < paidTotal) {
      return Response.json(
        {
          error:
            'El total acordado no puede quedar por debajo de lo ya cobrado.',
        },
        { status: 409 },
      )
    }

    const eventNote = [
      previousTotal === null
        ? `Total acordado: $${agreedTotal.toLocaleString('es-AR')}`
        : `Total acordado: $${previousTotal.toLocaleString('es-AR')} → $${agreedTotal.toLocaleString('es-AR')}`,
    ]
      .join('')
      .slice(0, 300)

    await sql.transaction([
      sql`
        UPDATE orders
        SET
          agreed_total = ${agreedTotal},
          updated_at = now()
        WHERE id = ${orderId}::uuid
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
          'agreed_total_updated',
          ${status},
          ${status},
          ${eventNote}
        )
      `,
    ])

    return Response.json(
      { ok: true, agreedTotal },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo guardar el total acordado.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function createOrderPayment(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const orderId = text(body.id, 40)
  const amount = positiveMoney(body.amount)
  const method = text(body.method, 24)
  const paidOn = validPaidOn(body.paidOn)
  const reference = text(body.reference, 120)
  const note = text(body.note, 500)

  if (!UUID_RE.test(orderId)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  if (amount === undefined) {
    return Response.json(
      { error: 'Ingresá un importe de cobro mayor a cero.' },
      { status: 400 },
    )
  }

  if (!PAYMENT_METHODS.has(method)) {
    return Response.json({ error: 'Medio de pago inválido.' }, { status: 400 })
  }

  if (!paidOn) {
    return Response.json({ error: 'Fecha de cobro inválida.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        status,
        agreed_total::text,
        COALESCE(
          (
            SELECT SUM(payment.amount)
            FROM order_payments payment
            WHERE payment.order_id = orders.id
              AND payment.voided_at IS NULL
          ),
          0
        )::text AS paid_total
      FROM orders
      WHERE id = ${orderId}::uuid
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 })
    }

    const row = rows[0] as Record<string, unknown>
    const status = String(row.status ?? '') as OrderStatus

    if (status === 'cancelled') {
      return Response.json(
        { error: 'No se pueden registrar cobros en un pedido cancelado.' },
        { status: 409 },
      )
    }

    if (row.agreed_total === null || row.agreed_total === undefined) {
      return Response.json(
        { error: 'Definí primero el total acordado del pedido.' },
        { status: 409 },
      )
    }

    const agreedTotal = Number(row.agreed_total)
    const paidTotal = Number(row.paid_total ?? 0)
    const remaining = agreedTotal - paidTotal

    if (
      !Number.isFinite(agreedTotal) ||
      agreedTotal <= 0 ||
      !Number.isFinite(paidTotal)
    ) {
      return Response.json(
        { error: 'El pedido tiene importes inválidos.' },
        { status: 409 },
      )
    }

    if (remaining <= 0.009) {
      return Response.json(
        { error: 'El pedido ya está pagado.' },
        { status: 409 },
      )
    }

    if (amount > remaining + 0.009) {
      return Response.json(
        {
          error: `El cobro supera el saldo pendiente de $${remaining.toLocaleString('es-AR')}.`,
        },
        { status: 409 },
      )
    }

    const eventNote = paymentEventNote({
      amount,
      method,
      reference,
      note,
    })

    await sql.transaction([
      sql`
        INSERT INTO order_payments (
          order_id,
          amount,
          payment_method,
          paid_on,
          reference,
          note
        )
        VALUES (
          ${orderId}::uuid,
          ${amount},
          ${method},
          ${paidOn}::date,
          ${reference || null},
          ${note || null}
        )
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
          'payment_recorded',
          ${status},
          ${status},
          ${eventNote}
        )
      `,
    ])

    return Response.json(
      {
        ok: true,
        paidTotal: paidTotal + amount,
        balanceDue: Math.max(0, remaining - amount),
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo registrar el cobro.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function voidOrderPayment(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const orderId = text(body.id, 40)
  const paymentId = text(body.paymentId, 40)
  const reason = text(body.reason, 500)

  if (!UUID_RE.test(orderId) || !UUID_RE.test(paymentId)) {
    return Response.json({ error: 'Cobro inválido.' }, { status: 400 })
  }

  if (reason.length < 3) {
    return Response.json(
      { error: 'Indicá por qué se anula el cobro.' },
      { status: 400 },
    )
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      SELECT
        payment.amount::text,
        payment.payment_method,
        payment.voided_at::text,
        orders.status
      FROM order_payments payment
      JOIN orders ON orders.id = payment.order_id
      WHERE payment.id = ${paymentId}::uuid
        AND payment.order_id = ${orderId}::uuid
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Cobro no encontrado.' }, { status: 404 })
    }

    const row = rows[0] as Record<string, unknown>

    if (row.voided_at) {
      return Response.json(
        { error: 'Ese cobro ya fue anulado.' },
        { status: 409 },
      )
    }

    const status = String(row.status ?? '') as OrderStatus
    const amount = Number(row.amount ?? 0)
    const method = String(row.payment_method ?? '')

    const eventNote = [
      `Cobro anulado: $${amount.toLocaleString('es-AR')}`,
      method,
      reason,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 300)

    await sql.transaction([
      sql`
        UPDATE order_payments
        SET
          voided_at = now(),
          void_reason = ${reason}
        WHERE id = ${paymentId}::uuid
          AND order_id = ${orderId}::uuid
          AND voided_at IS NULL
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
          'payment_voided',
          ${status},
          ${status},
          ${eventNote}
        )
      `,
    ])

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo anular el cobro.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
