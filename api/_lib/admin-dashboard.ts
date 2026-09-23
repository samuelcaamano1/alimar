import { neon } from '@neondatabase/serverless'

function code(prefix: string, value: unknown) {
  return `${prefix}-${String(Number(value)).padStart(6, '0')}`
}

function text(value: unknown) {
  return value === null || value === undefined ? null : String(value)
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getAdminBusinessDashboard(databaseUrl: string) {
  try {
    const sql = neon(databaseUrl)

    const [
      summaryRows,
      expiringRows,
      acceptedRows,
      missingCostRows,
      pendingPaymentRows,
    ] = await Promise.all([
        sql`
          SELECT
            (
              SELECT COUNT(*)::int
              FROM custom_requests
              WHERE status IN ('new', 'reviewing')
            ) AS requests_pending,
            (
              SELECT COUNT(*)::int
              FROM quotes
              WHERE status = 'sent'
                AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
            ) AS quotes_waiting,
            (
              SELECT COUNT(*)::int
              FROM quotes
              WHERE status IN ('draft', 'sent')
                AND valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
            ) AS quotes_expiring,
            (
              SELECT COUNT(*)::int
              FROM quotes quote
              LEFT JOIN orders linked_order ON linked_order.quote_id = quote.id
              WHERE quote.status = 'accepted'
                AND linked_order.id IS NULL
            ) AS quotes_accepted_no_order,
            (
              SELECT COUNT(*)::int
              FROM orders
              WHERE status IN ('new', 'contacted', 'confirmed', 'in_progress', 'ready')
            ) AS orders_open,
            (
              SELECT COUNT(*)::int
              FROM orders
              WHERE quote_id IS NOT NULL
                AND status = 'completed'
                AND actual_cost IS NULL
            ) AS completed_missing_cost,
            (
              SELECT COUNT(*)::int
              FROM orders
              WHERE actual_cost IS NOT NULL
                AND actual_cost_updated_at >= date_trunc('month', CURRENT_DATE)
            ) AS month_actual_count,
            (
              SELECT COUNT(*)::int
              FROM orders order_row
              LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(payment.amount), 0) AS paid_total
                FROM order_payments payment
                WHERE payment.order_id = order_row.id
                  AND payment.voided_at IS NULL
              ) payment_total ON true
              WHERE order_row.status <> 'cancelled'
                AND order_row.agreed_total IS NOT NULL
                AND order_row.agreed_total - payment_total.paid_total > 0.009
            ) AS payments_pending_count,
            (
              SELECT COALESCE(
                SUM(
                  GREATEST(
                    order_row.agreed_total - payment_total.paid_total,
                    0
                  )
                ),
                0
              )::text
              FROM orders order_row
              LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(payment.amount), 0) AS paid_total
                FROM order_payments payment
                WHERE payment.order_id = order_row.id
                  AND payment.voided_at IS NULL
              ) payment_total ON true
              WHERE order_row.status <> 'cancelled'
                AND order_row.agreed_total IS NOT NULL
            ) AS outstanding_balance,
            (
              SELECT COALESCE(SUM(payment.amount), 0)::text
              FROM order_payments payment
              JOIN orders order_row ON order_row.id = payment.order_id
              WHERE payment.voided_at IS NULL
                AND order_row.status <> 'cancelled'
                AND payment.paid_on >= date_trunc('month', CURRENT_DATE)::date
            ) AS month_collected,
            (
              SELECT COUNT(*)::int
              FROM order_payments payment
              JOIN orders order_row ON order_row.id = payment.order_id
              WHERE payment.voided_at IS NULL
                AND order_row.status <> 'cancelled'
                AND payment.paid_on >= date_trunc('month', CURRENT_DATE)::date
            ) AS month_payment_count,
            (
              SELECT COALESCE(SUM(quote.total_price), 0)::text
              FROM orders linked_order
              JOIN quotes quote ON quote.id = linked_order.quote_id
              WHERE linked_order.actual_cost IS NOT NULL
                AND linked_order.actual_cost_updated_at >= date_trunc('month', CURRENT_DATE)
            ) AS month_actual_revenue,
            (
              SELECT COALESCE(
                SUM(quote.total_price - linked_order.actual_cost),
                0
              )::text
              FROM orders linked_order
              JOIN quotes quote ON quote.id = linked_order.quote_id
              WHERE linked_order.actual_cost IS NOT NULL
                AND linked_order.actual_cost_updated_at >= date_trunc('month', CURRENT_DATE)
            ) AS month_actual_profit
        `,
        sql`
          SELECT
            quote.id::text,
            quote.quote_number,
            quote.title,
            quote.customer_name,
            quote.valid_until::text,
            quote.total_price::text
          FROM quotes quote
          WHERE quote.status IN ('draft', 'sent')
            AND quote.valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
          ORDER BY quote.valid_until ASC, quote.created_at ASC
          LIMIT 4
        `,
        sql`
          SELECT
            quote.id::text,
            quote.quote_number,
            quote.title,
            quote.customer_name,
            quote.total_price::text
          FROM quotes quote
          LEFT JOIN orders linked_order ON linked_order.quote_id = quote.id
          WHERE quote.status = 'accepted'
            AND linked_order.id IS NULL
          ORDER BY quote.customer_responded_at ASC NULLS LAST, quote.updated_at ASC
          LIMIT 4
        `,
        sql`
          SELECT
            linked_order.id::text,
            linked_order.public_code,
            linked_order.customer_name,
            linked_order.known_total::text,
            quote.quote_number
          FROM orders linked_order
          JOIN quotes quote ON quote.id = linked_order.quote_id
          WHERE linked_order.status = 'completed'
            AND linked_order.actual_cost IS NULL
          ORDER BY linked_order.updated_at ASC
          LIMIT 4
        `,
        sql`
          SELECT
            order_row.id::text,
            order_row.public_code,
            order_row.customer_name,
            order_row.agreed_total::text,
            payment_total.paid_total::text,
            GREATEST(
              order_row.agreed_total - payment_total.paid_total,
              0
            )::text AS balance_due
          FROM orders order_row
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(payment.amount), 0) AS paid_total
            FROM order_payments payment
            WHERE payment.order_id = order_row.id
              AND payment.voided_at IS NULL
          ) payment_total ON true
          WHERE order_row.status <> 'cancelled'
            AND order_row.agreed_total IS NOT NULL
            AND order_row.agreed_total - payment_total.paid_total > 0.009
          ORDER BY
            GREATEST(
              order_row.agreed_total - payment_total.paid_total,
              0
            ) DESC,
            order_row.updated_at ASC
          LIMIT 4
        `,
      ])

    const summaryRow = (summaryRows[0] ?? {}) as Record<string, unknown>

    return Response.json(
      {
        summary: {
          requests_pending: number(summaryRow.requests_pending),
          quotes_waiting: number(summaryRow.quotes_waiting),
          quotes_expiring: number(summaryRow.quotes_expiring),
          quotes_accepted_no_order: number(summaryRow.quotes_accepted_no_order),
          orders_open: number(summaryRow.orders_open),
          completed_missing_cost: number(summaryRow.completed_missing_cost),
          month_actual_count: number(summaryRow.month_actual_count),
          month_actual_revenue: String(summaryRow.month_actual_revenue ?? '0'),
          month_actual_profit: String(summaryRow.month_actual_profit ?? '0'),
          payments_pending_count: number(summaryRow.payments_pending_count),
          outstanding_balance: String(summaryRow.outstanding_balance ?? '0'),
          month_collected: String(summaryRow.month_collected ?? '0'),
          month_payment_count: number(summaryRow.month_payment_count),
        },
        attention: {
          expiring_quotes: (expiringRows as Record<string, unknown>[]).map((row) => ({
            id: String(row.id ?? ''),
            public_code: code('PRE', row.quote_number),
            title: String(row.title ?? ''),
            customer_name: text(row.customer_name),
            valid_until: text(row.valid_until)?.slice(0, 10) ?? null,
            total_price: String(row.total_price ?? '0'),
          })),
          accepted_quotes: (acceptedRows as Record<string, unknown>[]).map((row) => ({
            id: String(row.id ?? ''),
            public_code: code('PRE', row.quote_number),
            title: String(row.title ?? ''),
            customer_name: text(row.customer_name),
            total_price: String(row.total_price ?? '0'),
          })),
          missing_cost_orders: (missingCostRows as Record<string, unknown>[]).map((row) => ({
            id: String(row.id ?? ''),
            public_code: String(row.public_code ?? ''),
            quote_code: code('PRE', row.quote_number),
            customer_name: String(row.customer_name ?? ''),
            known_total: String(row.known_total ?? '0'),
          })),
          pending_payments: (pendingPaymentRows as Record<string, unknown>[]).map((row) => ({
            id: String(row.id ?? ''),
            public_code: String(row.public_code ?? ''),
            customer_name: String(row.customer_name ?? ''),
            agreed_total: String(row.agreed_total ?? '0'),
            paid_total: String(row.paid_total ?? '0'),
            balance_due: String(row.balance_due ?? '0'),
          })),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo cargar el resumen del negocio.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
