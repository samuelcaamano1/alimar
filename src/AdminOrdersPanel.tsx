import { useCallback, useEffect, useMemo, useState } from 'react'

type OrderStatus =
  | 'new'
  | 'contacted'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'

type AdminOrderItem = {
  id: string
  product_name: string
  kind: 'service' | 'product'
  pricing_mode: 'fixed' | 'from' | 'quote'
  unit_price: string | null
  quantity: number
  line_total: string | null
  customization_note: string | null
}

type AdminOrderEvent = {
  id: string
  event_type: string
  from_status: OrderStatus | null
  to_status: OrderStatus | null
  note: string | null
  created_at: string
}

type AdminOrder = {
  id: string
  public_code: string
  status: OrderStatus
  customer_name: string
  customer_phone: string
  customer_email: string | null
  customer_notes: string | null
  known_total: string
  has_quote: boolean
  created_at: string
  items: AdminOrderItem[]
  events: AdminOrderEvent[]
}

type OrdersResponse = { orders: AdminOrder[] }

const statusLabels: Record<OrderStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  confirmed: 'Confirmado',
  in_progress: 'En proceso',
  ready: 'Listo',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const statusOptions = Object.entries(statusLabels) as Array<[OrderStatus, string]>

function money(value: string | null) {
  if (!value) return 'A consultar'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'A consultar'

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

function dateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
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

export default function AdminOrdersPanel() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | OrderStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)
  const [draftStatus, setDraftStatus] = useState<Record<string, OrderStatus>>({})
  const [draftNote, setDraftNote] = useState<Record<string, string>>({})

  const applyOrders = useCallback((nextOrders: AdminOrder[]) => {
    setOrders(nextOrders)
    setDraftStatus(
      Object.fromEntries(nextOrders.map((order) => [order.id, order.status])) as Record<
        string,
        OrderStatus
      >,
    )
    setState('ready')
  }, [])

  const loadOrders = useCallback(async () => {
    setState('loading')
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders', { cache: 'no-store' })
      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as OrdersResponse
      applyOrders(data.orders)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.')
      setState('error')
    }
  }, [applyOrders])

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/admin/orders', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response))
        return (await response.json()) as OrdersResponse
      })
      .then((data) => {
        if (!controller.signal.aborted) applyOrders(data.orders)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.')
        setState('error')
      })

    return () => controller.abort()
  }, [applyOrders])

  const orderCounts = useMemo(
    () => ({
      all: orders.length,
      new: orders.filter((order) => order.status === 'new').length,
      open: orders.filter((order) =>
        ['contacted', 'confirmed', 'in_progress'].includes(order.status),
      ).length,
      ready: orders.filter((order) => order.status === 'ready').length,
    }),
    [orders],
  )

  const visibleOrders = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('es-AR')

    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'open'
          ? ['contacted', 'confirmed', 'in_progress'].includes(order.status)
          : order.status === statusFilter)

      if (!matchesStatus) return false
      if (!query) return true

      const haystack = [
        order.public_code,
        order.customer_name,
        order.customer_phone,
        order.customer_email ?? '',
        order.customer_notes ?? '',
        ...order.items.map((item) => item.product_name),
      ]
        .join(' ')
        .toLocaleLowerCase('es-AR')

      return haystack.includes(query)
    })
  }, [orders, searchQuery, statusFilter])

  async function saveStatus(order: AdminOrder) {
    const nextStatus = draftStatus[order.id] ?? order.status
    const note = (draftNote[order.id] ?? '').trim()

    if (nextStatus === order.status && !note) return

    setSavingOrderId(order.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          status: nextStatus,
          note,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setDraftNote((current) => ({ ...current, [order.id]: '' }))
      await loadOrders()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el pedido.')
    } finally {
      setSavingOrderId(null)
    }
  }

  return (
    <section className="admin-panel admin-orders-panel">
      <div className="admin-panel-heading admin-orders-heading">
        <span>Pedidos</span>
        <div>
          <h2>Pedidos recibidos</h2>
          <p>Gestioná el estado y consultá el historial de cada pedido.</p>
        </div>

        <button
          className="admin-secondary admin-orders-refresh"
          type="button"
          onClick={() => void loadOrders()}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      <div className="admin-order-stats" aria-label="Resumen de pedidos">
        <button
          type="button"
          className={statusFilter === 'all' ? 'is-active' : ''}
          onClick={() => setStatusFilter('all')}
        >
          <span>Todos</span>
          <strong>{orderCounts.all}</strong>
        </button>

        <button
          type="button"
          className={statusFilter === 'new' ? 'is-active' : ''}
          onClick={() => setStatusFilter('new')}
        >
          <span>Nuevos</span>
          <strong>{orderCounts.new}</strong>
        </button>

        <button
          type="button"
          className={statusFilter === 'open' ? 'is-active' : ''}
          onClick={() => setStatusFilter('open')}
        >
          <span>En curso</span>
          <strong>{orderCounts.open}</strong>
        </button>

        <button
          type="button"
          className={statusFilter === 'ready' ? 'is-active' : ''}
          onClick={() => setStatusFilter('ready')}
        >
          <span>Listos</span>
          <strong>{orderCounts.ready}</strong>
        </button>
      </div>

      <div className="admin-orders-toolbar">
        <label className="admin-order-search">
          Buscar
          <input
            type="search"
            value={searchQuery}
            placeholder="Código, cliente, teléfono o producto"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <label>
          Estado
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | 'open' | OrderStatus)
            }
          >
            <option value="all">Todos</option>
            <option value="open">En curso</option>
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <span>{visibleOrders.length} pedidos visibles</span>
      </div>

      {message && <div className="admin-toast">{message}</div>}
      {state === 'loading' && orders.length === 0 && <div className="admin-empty">Cargando pedidos…</div>}
      {state === 'error' && orders.length === 0 && <div className="admin-empty">No se pudieron cargar los pedidos.</div>}
      {state === 'ready' && visibleOrders.length === 0 && (
        <div className="admin-empty">No hay pedidos para este estado.</div>
      )}

      {visibleOrders.length > 0 && (
        <div className="admin-orders-list">
          {visibleOrders.map((order) => {
            const selectedStatus = draftStatus[order.id] ?? order.status
            const note = draftNote[order.id] ?? ''
            const saving = savingOrderId === order.id

            return (
              <article className="admin-order-card" key={order.id}>
                <div className="admin-order-top">
                  <div>
                    <span className="admin-order-code">{order.public_code}</span>
                    <h3>{order.customer_name}</h3>
                    <p>{dateTime(order.created_at)}</p>
                  </div>

                  <span className={`admin-order-status is-${order.status}`}>
                    {statusLabels[order.status]}
                  </span>
                </div>

                <div className="admin-order-contact">
                  <a
                    href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp: {order.customer_phone} ↗
                  </a>
                  {order.customer_email && <span>{order.customer_email}</span>}
                </div>

                {order.customer_notes && (
                  <p className="admin-order-note">
                    <strong>Nota general:</strong> {order.customer_notes}
                  </p>
                )}

                <div className="admin-order-items">
                  {order.items.map((item) => (
                    <div className="admin-order-item" key={item.id}>
                      <div>
                        <strong>
                          {item.quantity}× {item.product_name}
                        </strong>
                        {item.customization_note && <small>{item.customization_note}</small>}
                      </div>

                      <span>{item.line_total ? money(item.line_total) : 'A consultar'}</span>
                    </div>
                  ))}
                </div>

                <div className="admin-order-total">
                  <span>Subtotal conocido</span>
                  <strong>{money(order.known_total)}</strong>
                </div>

                {order.has_quote && (
                  <p className="admin-order-quote">Incluye ítems que requieren cotización.</p>
                )}

                <div className="admin-order-workflow">
                  <label>
                    Estado del pedido
                    <select
                      value={selectedStatus}
                      onChange={(event) =>
                        setDraftStatus((current) => ({
                          ...current,
                          [order.id]: event.target.value as OrderStatus,
                        }))
                      }
                      disabled={saving}
                    >
                      {statusOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="admin-order-workflow-note">
                    Nota del cambio
                    <input
                      type="text"
                      maxLength={300}
                      value={note}
                      placeholder="Opcional: pago recibido, fecha coordinada, etc."
                      onChange={(event) =>
                        setDraftNote((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                      disabled={saving}
                    />
                  </label>

                  <button
                    className="admin-primary"
                    type="button"
                    onClick={() => void saveStatus(order)}
                    disabled={saving || (selectedStatus === order.status && !note.trim())}
                  >
                    {saving ? 'Guardando…' : 'Guardar cambio'}
                  </button>
                </div>

                <details className="admin-order-history">
                  <summary>Historial · {order.events.length} eventos</summary>

                  <div className="admin-order-history-list">
                    {order.events.map((event) => (
                      <div className="admin-order-event" key={event.id}>
                        <span>{dateTime(event.created_at)}</span>
                        <strong>
                          {event.from_status && event.to_status
                            ? `${statusLabels[event.from_status]} → ${statusLabels[event.to_status]}`
                            : event.to_status
                              ? statusLabels[event.to_status]
                              : event.event_type}
                        </strong>
                        {event.note && <p>{event.note}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
