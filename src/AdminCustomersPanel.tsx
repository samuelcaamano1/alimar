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

type CustomerAccountSummary = {
  id: string
  email: string
  name: string
  phone: string
  active: boolean
  created_at: string
  updated_at: string
  order_count: number
  request_count: number
  active_session_count: number
  last_session_at: string | null
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
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [accounts, setAccounts] = useState<CustomerAccountSummary[]>([])
  const [accountQuery, setAccountQuery] = useState('')
  const [accountState, setAccountState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [accountMessage, setAccountMessage] = useState('')
  const [accountBusyId, setAccountBusyId] = useState<string | null>(null)

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

  const loadCustomerAccounts = useCallback(async () => {
    setAccountState('loading')
    setAccountMessage('')

    try {
      const response = await fetch('/api/admin/catalog?action=customer-accounts', {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { accounts: CustomerAccountSummary[] }
      setAccounts(data.accounts)
      setAccountState('ready')
    } catch (error) {
      setAccountMessage(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar las cuentas de clientes.',
      )
      setAccountState('error')
    }
  }, [])

  function openCustomerAccounts() {
    setAccountDialogOpen(true)
    setAccountQuery('')
    void loadCustomerAccounts()
  }

  async function setCustomerAccountActive(
    account: CustomerAccountSummary,
    active: boolean,
  ) {
    if (accountBusyId) return

    if (!active) {
      const confirmed = window.confirm(
        `¿Desactivar la cuenta de ${account.name}? Se cerrarán sus sesiones, pero no se borrará ningún pedido.`,
      )
      if (!confirmed) return
    }

    setAccountBusyId(account.id)
    setAccountMessage('')

    try {
      const response = await fetch(
        `/api/admin/catalog?action=customer-account-status&id=${encodeURIComponent(account.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active }),
        },
      )
      if (!response.ok) throw new Error(await responseMessage(response))

      await loadCustomerAccounts()
      setAccountMessage(
        active
          ? `Cuenta de ${account.name} reactivada.`
          : `Cuenta de ${account.name} desactivada.`,
      )
    } catch (error) {
      setAccountMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar la cuenta.',
      )
    } finally {
      setAccountBusyId(null)
    }
  }

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
    if (!accountDialogOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !accountBusyId) {
        setAccountDialogOpen(false)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
    }
  }, [accountBusyId, accountDialogOpen])

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

  const visibleAccounts = useMemo(() => {
    const normalized = accountQuery.trim().toLocaleLowerCase('es-AR')
    if (!normalized) return accounts

    return accounts.filter((account) =>
      [account.name, account.email, account.phone]
        .join(' ')
        .toLocaleLowerCase('es-AR')
        .includes(normalized),
    )
  }, [accountQuery, accounts])

  const accountTotals = useMemo(
    () => ({
      total: accounts.length,
      active: accounts.filter((account) => account.active).length,
      inactive: accounts.filter((account) => !account.active).length,
    }),
    [accounts],
  )

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

        <div className="admin-customers-heading-actions">
          <button
            className="admin-primary"
            type="button"
            onClick={openCustomerAccounts}
          >
            Cuentas registradas
          </button>
          <button
            className="admin-secondary"
            type="button"
            onClick={() => void loadCustomers()}
            disabled={state === 'loading'}
          >
            {state === 'loading' ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
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

      {accountDialogOpen && (
        <div
          className="admin-customer-accounts-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !accountBusyId) {
              setAccountDialogOpen(false)
            }
          }}
        >
          <section
            className="admin-customer-accounts-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-accounts-title"
          >
            <header>
              <div>
                <span className="admin-kicker">Accesos de clientes</span>
                <h3 id="customer-accounts-title">Cuentas registradas</h3>
                <p>
                  Administrá el acceso sin borrar pedidos, pagos, archivos ni historial.
                </p>
              </div>
              <button
                className="admin-customer-accounts-close"
                type="button"
                onClick={() => setAccountDialogOpen(false)}
                disabled={Boolean(accountBusyId)}
                aria-label="Cerrar cuentas de clientes"
              >
                ×
              </button>
            </header>

            <div className="admin-customer-accounts-summary">
              <span>Total <strong>{accountTotals.total}</strong></span>
              <span>Activas <strong>{accountTotals.active}</strong></span>
              <span>Desactivadas <strong>{accountTotals.inactive}</strong></span>
            </div>

            <div className="admin-customer-accounts-toolbar">
              <label>
                Buscar cuenta
                <input
                  type="search"
                  value={accountQuery}
                  placeholder="Nombre, email o WhatsApp"
                  onChange={(event) => setAccountQuery(event.target.value)}
                />
              </label>
              <button
                className="admin-secondary"
                type="button"
                onClick={() => void loadCustomerAccounts()}
                disabled={accountState === 'loading' || Boolean(accountBusyId)}
              >
                {accountState === 'loading' ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>

            {accountMessage && (
              <div className="admin-customer-accounts-message">
                {accountMessage}
              </div>
            )}

            <div className="admin-customer-accounts-list">
              {accountState === 'loading' && accounts.length === 0 && (
                <div className="admin-empty">Cargando cuentas…</div>
              )}

              {accountState === 'error' && accounts.length === 0 && (
                <div className="admin-empty">No se pudieron cargar las cuentas.</div>
              )}

              {accountState === 'ready' && visibleAccounts.length === 0 && (
                <div className="admin-empty">No hay cuentas para esta búsqueda.</div>
              )}

              {visibleAccounts.map((account) => (
                <article
                  className={`admin-customer-account-card${account.active ? '' : ' is-inactive'}`}
                  key={account.id}
                >
                  <div className="admin-customer-account-main">
                    <div>
                      <span className={`admin-customer-account-status${account.active ? ' is-active' : ' is-inactive'}`}>
                        {account.active ? 'Activa' : 'Desactivada'}
                      </span>
                      <strong>{account.name}</strong>
                      <small>{account.email}</small>
                      <small>{account.phone}</small>
                    </div>

                    <div className="admin-customer-account-metrics">
                      <span>PED <strong>{account.order_count}</strong></span>
                      <span>SOL <strong>{account.request_count}</strong></span>
                      <span>Sesiones <strong>{account.active_session_count}</strong></span>
                    </div>
                  </div>

                  <div className="admin-customer-account-footer">
                    <small>
                      Alta {dateTime(account.created_at)}
                      {account.last_session_at
                        ? ` · Última sesión ${dateTime(account.last_session_at)}`
                        : ' · Sin sesión activa registrada'}
                    </small>
                    <button
                      className={account.active ? 'admin-danger-soft' : 'admin-primary'}
                      type="button"
                      onClick={() => void setCustomerAccountActive(account, !account.active)}
                      disabled={Boolean(accountBusyId)}
                    >
                      {accountBusyId === account.id
                        ? 'Guardando…'
                        : account.active
                          ? 'Desactivar'
                          : 'Reactivar'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
