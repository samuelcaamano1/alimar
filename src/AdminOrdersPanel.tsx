import { useCallback, useEffect, useState } from 'react'

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

type AdminOrder = {
  id: string
  public_code: string
  status: 'new' | 'contacted' | 'confirmed' | 'in_progress' | 'ready' | 'completed' | 'cancelled'
  customer_name: string
  customer_phone: string
  customer_email: string | null
  customer_notes: string | null
  known_total: string
  has_quote: boolean
  created_at: string
  items: AdminOrderItem[]
}

type OrdersResponse = { orders: AdminOrder[] }

const statusLabels: Record<AdminOrder['status'], string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  confirmed: 'Confirmado',
  in_progress: 'En proceso',
  ready: 'Listo',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

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
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export default function AdminOrdersPanel() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const loadOrders = useCallback(async () => {
    setState('loading')
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders', { cache: 'no-store' })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || `Error ${response.status}`)
      }

      const data = (await response.json()) as OrdersResponse
      setOrders(data.orders)
      setState('ready')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.')
      setState('error')
    }
  }, [])

  useEffect(() => { void loadOrders() }, [loadOrders])

  return (
    <section className="admin-panel admin-orders-panel">
      <div className="admin-panel-heading admin-orders-heading">
        <span>Pedidos</span>
        <div>
          <h2>Pedidos recibidos</h2>
          <p>Se muestran los últimos 50 pedidos registrados desde la tienda.</p>
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

      {state === 'error' && <div className="admin-empty">{message}</div>}
      {state === 'loading' && orders.length === 0 && <div className="admin-empty">Cargando pedidos…</div>}
      {state === 'ready' && orders.length === 0 && <div className="admin-empty">Todavía no hay pedidos registrados.</div>}

      {orders.length > 0 && (
        <div className="admin-orders-list">
          {orders.map((order) => (
            <article className="admin-order-card" key={order.id}>
              <div className="admin-order-top">
                <div>
                  <span className="admin-order-code">{order.public_code}</span>
                  <h3>{order.customer_name}</h3>
                  <p>{dateTime(order.created_at)}</p>
                </div>
                <span className={`admin-order-status is-${order.status}`}>{statusLabels[order.status]}</span>
              </div>

              <div className="admin-order-contact">
                <a href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                  WhatsApp: {order.customer_phone} ↗
                </a>
                {order.customer_email && <span>{order.customer_email}</span>}
              </div>

              {order.customer_notes && (
                <p className="admin-order-note"><strong>Nota general:</strong> {order.customer_notes}</p>
              )}

              <div className="admin-order-items">
                {order.items.map((item) => (
                  <div className="admin-order-item" key={item.id}>
                    <div>
                      <strong>{item.quantity}× {item.product_name}</strong>
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

              {order.has_quote && <p className="admin-order-quote">Incluye ítems que requieren cotización.</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
