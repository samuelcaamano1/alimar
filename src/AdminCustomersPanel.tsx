import { useCallback, useEffect, useMemo, useState } from 'react'

type CustomerSummary = {
  id: string
  public_code: string
  customer_name: string
  customer_phone: string
  first_activity_at: string
  last_activity_at: string
  request_count: number
  quote_count: number
  accepted_quote_count: number
  order_count: number
  completed_order_count: number
  open_order_count: number
  total_agreed: string
  total_paid: string
}

type CustomerTimelineItem = {
  kind: 'request' | 'quote' | 'order'
  id: string
  public_code: string
  status: string
  title: string
  amount: string | null
  paid_total: string | null
  promised_for: string | null
  created_at: string
}

type CustomerDetail = {
  customer: CustomerSummary
  timeline: CustomerTimelineItem[]
}

type CustomerFilter = 'all' | 'buyers' | 'repeat' | 'active'

const kindLabels: Record<CustomerTimelineItem['kind'], string> = {
  request: 'Solicitud',
  quote: 'Presupuesto',
  order: 'Pedido',
}

const statusLabels: Record<string, string> = {
  new: 'Nuevo',
  reviewing: 'En revisión',
  quoted: 'Cotizado',
  closed: 'Cerrado',
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Vencido',
  contacted: 'Contactado',
  confirmed: 'Confirmado',
  in_progress: 'En proceso',
  ready: 'Listo',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

function money(value: string | null) {
  const amount = Number(value ?? 0)

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

function dateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function dateOnly(value: string | null) {
  if (!value) return 'Sin fecha'

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
  }).format(date)
}

function whatsappUrl(customer: CustomerSummary) {
  const phone = customer.customer_phone.replace(/\D/g, '')
  const message = `Hola ${customer.customer_name}, te escribo de Alimar.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

export default function AdminCustomersPanel() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CustomerFilter>('all')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detailState, setDetailState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [message, setMessage] = useState('')

  const loadCustomers = useCallback(async () => {
    setState('loading')
    setMessage('')

    try {
      const response = await fetch('/api/admin/catalog?action=customers', {
        cache: 'no-store',
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as {
        customers: CustomerSummary[]
      }

      setCustomers(data.customers)
      setState('ready')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el historial de clientes.',
      )
      setState('error')
    }
  }, [])

  const loadCustomerDetail = useCallback(async (phone: string) => {
    setDetailState('loading')
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/catalog?action=customers&phone=${encodeURIComponent(phone)}`,
        { cache: 'no-store' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      setDetail((await response.json()) as CustomerDetail)
      setDetailState('ready')
    } catch (error) {
      setDetail(null)
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el historial del cliente.',
      )
      setDetailState('error')
    }
  }, [])

  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])

  useEffect(() => {
    if (!selectedPhone) {
      setDetail(null)
      setDetailState('idle')
      return
    }

    void loadCustomerDetail(selectedPhone)
  }, [loadCustomerDetail, selectedPhone])

  useEffect(() => {
    function refreshCustomers() {
      void loadCustomers()

      if (selectedPhone) {
        void loadCustomerDetail(selectedPhone)
      }
    }

    window.addEventListener('alimar:orders-changed', refreshCustomers)
    window.addEventListener('alimar:payments-changed', refreshCustomers)
    window.addEventListener('alimar:schedule-changed', refreshCustomers)
    window.addEventListener('alimar:quote-metrics-changed', refreshCustomers)

    return () => {
      window.removeEventListener('alimar:orders-changed', refreshCustomers)
      window.removeEventListener('alimar:payments-changed', refreshCustomers)
      window.removeEventListener('alimar:schedule-changed', refreshCustomers)
      window.removeEventListener('alimar:quote-metrics-changed', refreshCustomers)
    }
  }, [loadCustomerDetail, loadCustomers, selectedPhone])

  const totals = useMemo(
    () => ({
      customers: customers.length,
      buyers: customers.filter((customer) => customer.order_count > 0).length,
      repeat: customers.filter((customer) => customer.order_count >= 2).length,
      active: customers.filter((customer) => customer.open_order_count > 0).length,
      paid: customers.reduce(
        (sum, customer) => sum + Number(customer.total_paid || 0),
        0,
      ),
    }),
    [customers],
  )

  const visibleCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-AR')

    return customers.filter((customer) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'buyers' && customer.order_count > 0) ||
        (filter === 'repeat' && customer.order_count >= 2) ||
        (filter === 'active' && customer.open_order_count > 0)

      if (!matchesFilter) return false
      if (!normalizedQuery) return true

      return [
        customer.public_code,
        customer.customer_name,
        customer.customer_phone,
      ]
        .join(' ')
        .toLocaleLowerCase('es-AR')
        .includes(normalizedQuery)
    })
  }, [customers, filter, query])

  return (
    <section className="admin-panel admin-customers">
      <div className="admin-customers-heading">
        <div>
          <span className="admin-kicker">Clientes</span>
          <h2>Historial comercial</h2>
          <p>
            Unificamos solicitudes, presupuestos y pedidos por WhatsApp para ver
            relación, compras y actividad de cada cliente.
          </p>
        </div>

        <button
          className="admin-secondary"
          type="button"
          onClick={() => void loadCustomers()}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {message && <div className="admin-message">{message}</div>}

      <div className="admin-customers-summary">
        <div>
          <span>Clientes</span>
          <strong>{totals.customers}</strong>
        </div>
        <div>
          <span>Con pedidos</span>
          <strong>{totals.buyers}</strong>
        </div>
        <div>
          <span>Recurrentes</span>
          <strong>{totals.repeat}</strong>
        </div>
        <div>
          <span>Con PED activo</span>
          <strong>{totals.active}</strong>
        </div>
        <div>
          <span>Cobrado histórico</span>
          <strong>{money(String(totals.paid))}</strong>
        </div>
      </div>

      <div className="admin-customers-toolbar">
        <label>
          Buscar
          <input
            type="search"
            value={query}
            placeholder="Nombre, WhatsApp o CLI"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="admin-customers-filters">
          <button
            type="button"
            className={filter === 'all' ? 'is-active' : ''}
            onClick={() => setFilter('all')}
          >
            Todos
          </button>
          <button
            type="button"
            className={filter === 'buyers' ? 'is-active' : ''}
            onClick={() => setFilter('buyers')}
          >
            Con pedidos
          </button>
          <button
            type="button"
            className={filter === 'repeat' ? 'is-active' : ''}
            onClick={() => setFilter('repeat')}
          >
            Recurrentes
          </button>
          <button
            type="button"
            className={filter === 'active' ? 'is-active' : ''}
            onClick={() => setFilter('active')}
          >
            PED activo
          </button>
        </div>

        <span>{visibleCustomers.length} visible(s)</span>
      </div>

      <div className="admin-customers-layout">
        <div className="admin-customer-list">
          {state === 'loading' && customers.length === 0 && (
            <div className="admin-empty">Cargando clientes…</div>
          )}

          {state === 'error' && customers.length === 0 && (
            <div className="admin-empty">
              No se pudo cargar el historial de clientes.
            </div>
          )}

          {state === 'ready' && visibleCustomers.length === 0 && (
            <div className="admin-empty">
              No hay clientes para este filtro.
            </div>
          )}

          {visibleCustomers.map((customer) => (
            <button
              type="button"
              className={`admin-customer-card${
                selectedPhone === customer.id ? ' is-selected' : ''
              }`}
              key={customer.id}
              onClick={() => setSelectedPhone(customer.id)}
            >
              <div className="admin-customer-card-head">
                <span>{customer.public_code}</span>
                <strong>{customer.customer_name}</strong>
                {customer.order_count >= 2 && <small>Recurrente</small>}
              </div>

              <span className="admin-customer-phone">
                {customer.customer_phone}
              </span>

              <div className="admin-customer-card-metrics">
                <span>
                  PED <strong>{customer.order_count}</strong>
                </span>
                <span>
                  PRE <strong>{customer.quote_count}</strong>
                </span>
                <span>
                  SOL <strong>{customer.request_count}</strong>
                </span>
                <span>
                  Cobrado <strong>{money(customer.total_paid)}</strong>
                </span>
              </div>

              <small>
                Última actividad {dateTime(customer.last_activity_at)}
              </small>
            </button>
          ))}
        </div>

        <aside className="admin-customer-detail">
          {!selectedPhone && (
            <div className="admin-customer-detail-empty">
              <strong>Elegí un cliente</strong>
              <span>
                Acá aparece su historial completo de solicitudes, PRE y PED.
              </span>
            </div>
          )}

          {selectedPhone && detailState === 'loading' && (
            <div className="admin-customer-detail-empty">
              Cargando historial…
            </div>
          )}

          {detail && detailState === 'ready' && (
            <>
              <div className="admin-customer-detail-head">
                <div>
                  <span>{detail.customer.public_code}</span>
                  <h3>{detail.customer.customer_name}</h3>
                  <small>{detail.customer.customer_phone}</small>
                </div>

                <a
                  className="admin-primary"
                  href={whatsappUrl(detail.customer)}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </div>

              <div className="admin-customer-detail-money">
                <div>
                  <span>Total acordado</span>
                  <strong>{money(detail.customer.total_agreed)}</strong>
                </div>
                <div>
                  <span>Total cobrado</span>
                  <strong>{money(detail.customer.total_paid)}</strong>
                </div>
              </div>

              <div className="admin-customer-detail-stats">
                <span>
                  Pedidos <strong>{detail.customer.order_count}</strong>
                </span>
                <span>
                  Completados{' '}
                  <strong>{detail.customer.completed_order_count}</strong>
                </span>
                <span>
                  PED activos <strong>{detail.customer.open_order_count}</strong>
                </span>
                <span>
                  Presupuestos <strong>{detail.customer.quote_count}</strong>
                </span>
                <span>
                  PRE aceptados{' '}
                  <strong>{detail.customer.accepted_quote_count}</strong>
                </span>
                <span>
                  Solicitudes <strong>{detail.customer.request_count}</strong>
                </span>
              </div>

              <div className="admin-customer-detail-dates">
                <span>
                  Primer contacto{' '}
                  <strong>{dateTime(detail.customer.first_activity_at)}</strong>
                </span>
                <span>
                  Última actividad{' '}
                  <strong>{dateTime(detail.customer.last_activity_at)}</strong>
                </span>
              </div>

              <div className="admin-customer-timeline">
                <div className="admin-customer-timeline-title">
                  <strong>Historial</strong>
                  <span>{detail.timeline.length} movimiento(s)</span>
                </div>

                {detail.timeline.map((item) => (
                  <article
                    className={`admin-customer-timeline-item is-${item.kind}`}
                    key={`${item.kind}-${item.id}`}
                  >
                    <span>{kindLabels[item.kind]}</span>

                    <div>
                      <strong>{item.public_code}</strong>
                      <small>{item.title}</small>
                      <small>
                        {statusLabels[item.status] ?? item.status} ·{' '}
                        {dateTime(item.created_at)}
                      </small>

                      {item.promised_for && (
                        <small>
                          {item.kind === 'quote' ? 'Válido / fecha' : 'Fecha'}:{' '}
                          {dateOnly(item.promised_for)}
                        </small>
                      )}
                    </div>

                    <div className="admin-customer-timeline-money">
                      {item.amount && <strong>{money(item.amount)}</strong>}
                      {item.kind === 'order' && item.paid_total !== null && (
                        <small>Cobrado {money(item.paid_total)}</small>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  )
}
