import { useCallback, useEffect, useMemo, useState } from 'react'

type DashboardSummary = {
  requests_pending: number
  quotes_waiting: number
  quotes_expiring: number
  quotes_accepted_no_order: number
  orders_open: number
  completed_missing_cost: number
  month_actual_count: number
  month_actual_revenue: string
  month_actual_profit: string
}

type DashboardQuote = {
  id: string
  public_code: string
  title: string
  customer_name: string | null
  valid_until?: string | null
  total_price: string
}

type DashboardOrder = {
  id: string
  public_code: string
  quote_code: string
  customer_name: string
  known_total: string
}

type DashboardResponse = {
  summary: DashboardSummary
  attention: {
    expiring_quotes: DashboardQuote[]
    accepted_quotes: DashboardQuote[]
    missing_cost_orders: DashboardOrder[]
  }
}

function money(value: string) {
  const amount = Number(value)

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha'

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date)
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

function scrollToSection(selector: string) {
  document.querySelector(selector)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

export default function AdminBusinessDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const loadDashboard = useCallback(async () => {
    setState('loading')
    setMessage('')

    try {
      const response = await fetch('/api/admin/catalog?action=dashboard', {
        cache: 'no-store',
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setData((await response.json()) as DashboardResponse)
      setState('ready')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el resumen del negocio.',
      )
      setState('error')
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    function refreshFromBusinessChange() {
      void loadDashboard()
    }

    function refreshOnFocus() {
      void loadDashboard()
    }

    window.addEventListener('alimar:orders-changed', refreshFromBusinessChange)
    window.addEventListener('alimar:quote-metrics-changed', refreshFromBusinessChange)
    window.addEventListener('focus', refreshOnFocus)

    return () => {
      window.removeEventListener('alimar:orders-changed', refreshFromBusinessChange)
      window.removeEventListener('alimar:quote-metrics-changed', refreshFromBusinessChange)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [loadDashboard])

  const attentionCount = useMemo(() => {
    if (!data) return 0

    return (
      data.summary.requests_pending +
      data.summary.quotes_expiring +
      data.summary.quotes_accepted_no_order +
      data.summary.completed_missing_cost
    )
  }, [data])

  const actualMargin = useMemo(() => {
    if (!data) return null

    const revenue = Number(data.summary.month_actual_revenue)
    const profit = Number(data.summary.month_actual_profit)

    if (!Number.isFinite(revenue) || revenue <= 0 || !Number.isFinite(profit)) {
      return null
    }

    return (profit / revenue) * 100
  }, [data])

  return (
    <section className="admin-panel admin-business-dashboard">
      <div className="admin-business-dashboard-heading">
        <div>
          <span className="admin-kicker">Resumen del negocio</span>
          <h2>Qué necesita atención ahora</h2>
          <p>
            Solicitudes, presupuestos, pedidos y rentabilidad real en una sola vista.
          </p>
        </div>

        <button
          className="admin-secondary"
          type="button"
          onClick={() => void loadDashboard()}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {message && <div className="admin-message">{message}</div>}

      {data && (
        <>
          <div className="admin-business-dashboard-status">
            <span className={attentionCount > 0 ? 'is-alert' : 'is-clear'}>
              {attentionCount > 0
                ? `${attentionCount} pendiente(s) para revisar`
                : 'Sin pendientes críticos'}
            </span>
          </div>

          <div className="admin-business-dashboard-grid">
            <button
              type="button"
              onClick={() => scrollToSection('.admin-custom-requests')}
            >
              <span>Solicitudes por revisar</span>
              <strong>{data.summary.requests_pending}</strong>
              <small>Nuevas o en revisión</small>
            </button>

            <button
              type="button"
              onClick={() => scrollToSection('.admin-cost-calculator')}
            >
              <span>Esperando cliente</span>
              <strong>{data.summary.quotes_waiting}</strong>
              <small>PRE enviados</small>
            </button>

            <button
              type="button"
              className={data.summary.quotes_expiring > 0 ? 'is-alert' : ''}
              onClick={() => scrollToSection('.admin-cost-calculator')}
            >
              <span>Vencen en 3 días</span>
              <strong>{data.summary.quotes_expiring}</strong>
              <small>PRE para seguir</small>
            </button>

            <button
              type="button"
              className={
                data.summary.quotes_accepted_no_order > 0 ? 'is-alert' : ''
              }
              onClick={() => scrollToSection('.admin-cost-calculator')}
            >
              <span>Aceptados sin pedido</span>
              <strong>{data.summary.quotes_accepted_no_order}</strong>
              <small>Listos para convertir a PED</small>
            </button>

            <button
              type="button"
              onClick={() => scrollToSection('.admin-orders-panel')}
            >
              <span>Pedidos en curso</span>
              <strong>{data.summary.orders_open}</strong>
              <small>Abiertos hasta listo</small>
            </button>

            <button
              type="button"
              className={
                data.summary.completed_missing_cost > 0 ? 'is-alert' : ''
              }
              onClick={() => scrollToSection('.admin-orders-panel')}
            >
              <span>Cerrados sin costo real</span>
              <strong>{data.summary.completed_missing_cost}</strong>
              <small>Completados con PRE vinculado</small>
            </button>
          </div>

          <section className="admin-business-real-month">
            <div>
              <span>Rentabilidad real · este mes</span>
              <strong>
                {data.summary.month_actual_count > 0
                  ? money(data.summary.month_actual_profit)
                  : '—'}
              </strong>
              <small>
                {data.summary.month_actual_count} PED con costo real cargado
              </small>
            </div>

            <dl>
              <div>
                <dt>Ingreso analizado</dt>
                <dd>{money(data.summary.month_actual_revenue)}</dd>
              </div>
              <div>
                <dt>Margen real</dt>
                <dd>
                  {actualMargin === null
                    ? '—'
                    : `${Math.round(actualMargin)}%`}
                </dd>
              </div>
            </dl>
          </section>

          {(data.attention.expiring_quotes.length > 0 ||
            data.attention.accepted_quotes.length > 0 ||
            data.attention.missing_cost_orders.length > 0) && (
            <div className="admin-business-attention">
              {data.attention.expiring_quotes.length > 0 && (
                <section>
                  <div className="admin-business-attention-title">
                    <strong>Presupuestos por vencer</strong>
                    <button
                      type="button"
                      onClick={() => scrollToSection('.admin-cost-calculator')}
                    >
                      Ir a PRE
                    </button>
                  </div>

                  {data.attention.expiring_quotes.map((quote) => (
                    <div className="admin-business-attention-row" key={quote.id}>
                      <span>{quote.public_code}</span>
                      <div>
                        <strong>{quote.customer_name || quote.title}</strong>
                        <small>Vence {dateLabel(quote.valid_until)}</small>
                      </div>
                      <strong>{money(quote.total_price)}</strong>
                    </div>
                  ))}
                </section>
              )}

              {data.attention.accepted_quotes.length > 0 && (
                <section>
                  <div className="admin-business-attention-title">
                    <strong>Aceptados sin pedido</strong>
                    <button
                      type="button"
                      onClick={() => scrollToSection('.admin-cost-calculator')}
                    >
                      Convertir
                    </button>
                  </div>

                  {data.attention.accepted_quotes.map((quote) => (
                    <div className="admin-business-attention-row" key={quote.id}>
                      <span>{quote.public_code}</span>
                      <div>
                        <strong>{quote.customer_name || quote.title}</strong>
                        <small>{quote.title}</small>
                      </div>
                      <strong>{money(quote.total_price)}</strong>
                    </div>
                  ))}
                </section>
              )}

              {data.attention.missing_cost_orders.length > 0 && (
                <section>
                  <div className="admin-business-attention-title">
                    <strong>Pedidos cerrados sin costo</strong>
                    <button
                      type="button"
                      onClick={() => scrollToSection('.admin-orders-panel')}
                    >
                      Completar
                    </button>
                  </div>

                  {data.attention.missing_cost_orders.map((order) => (
                    <div className="admin-business-attention-row" key={order.id}>
                      <span>{order.public_code}</span>
                      <div>
                        <strong>{order.customer_name}</strong>
                        <small>{order.quote_code}</small>
                      </div>
                      <strong>{money(order.known_total)}</strong>
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
