import { useCallback, useEffect, useMemo, useState } from 'react'
import { site } from './site'

export type CustomRequestStatus = 'new' | 'reviewing' | 'quoted' | 'closed'

export type CustomRequest = {
  id: string
  public_code: string
  status: CustomRequestStatus
  customer_name: string
  customer_phone: string
  request_type: 'paper' | '3d' | 'event' | 'design' | 'other'
  quantity: number | null
  needed_date: string | null
  dimensions: string | null
  theme: string | null
  description: string
  example_id: string | null
  example_title: string | null
  reference_url: string | null
  reference_image_url: string | null
  quote_id: string | null
  created_at: string
  updated_at: string
}

type InboxFilter =
  | 'attention'
  | 'overdue'
  | 'new'
  | 'reviewing'
  | 'quoted'
  | 'closed'
  | 'all'

type RequestTypeFilter = 'all' | CustomRequest['request_type']

type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'unscheduled'

const statusLabels: Record<CustomRequestStatus, string> = {
  new: 'Nueva',
  reviewing: 'Revisando',
  quoted: 'Presupuestada',
  closed: 'Cerrada',
}

const typeLabels: Record<CustomRequest['request_type'], string> = {
  paper: 'Papelería / impresión',
  '3d': 'Impresión 3D',
  event: 'Evento',
  design: 'Diseño gráfico',
  other: 'Otro personalizado',
}

const filterLabels: Record<InboxFilter, string> = {
  attention: 'Por atender',
  overdue: 'Fecha vencida',
  new: 'Nuevas',
  reviewing: 'Revisando',
  quoted: 'Presupuestadas',
  closed: 'Cerradas',
  all: 'Todas',
}

const dueLabels: Record<DueState, string> = {
  overdue: 'Fecha vencida',
  today: 'Para hoy',
  soon: 'Próximos 7 días',
  later: 'Más adelante',
  unscheduled: 'Sin fecha',
}

function dateLabel(value: string | null) {
  if (!value) return 'Sin fecha'

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function dateTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function relativeDateLabel(value: string) {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()

  if (!Number.isFinite(diff) || diff < 0) return dateTimeLabel(value)

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`

  return dateLabel(value.slice(0, 10))
}

function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dayDifference(value: string, today: string) {
  const target = new Date(`${value}T12:00:00`)
  const base = new Date(`${today}T12:00:00`)

  if (Number.isNaN(target.getTime()) || Number.isNaN(base.getTime())) {
    return Number.POSITIVE_INFINITY
  }

  return Math.round((target.getTime() - base.getTime()) / 86_400_000)
}

function dueState(request: CustomRequest, today: string): DueState {
  if (!request.needed_date) return 'unscheduled'

  const days = dayDifference(request.needed_date, today)

  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 7) return 'soon'
  return 'later'
}

function dueSortValue(request: CustomRequest) {
  if (!request.needed_date) return Number.MAX_SAFE_INTEGER

  const value = new Date(`${request.needed_date}T12:00:00`).getTime()
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

function statusSortValue(status: CustomRequestStatus) {
  if (status === 'new') return 0
  if (status === 'reviewing') return 1
  if (status === 'quoted') return 2
  return 3
}

function requestHeadline(request: CustomRequest) {
  if (request.example_title) return request.example_title

  const clean = request.description.replace(/\s+/g, ' ').trim()
  if (clean.length <= 72) return clean || typeLabels[request.request_type]

  return `${clean.slice(0, 69)}…`
}

function phoneHref(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits ? `tel:+${digits}` : undefined
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

type AdminCustomRequestsProps = {
  onCreateQuote: (request: CustomRequest) => void
  refreshToken?: number
}

export default function AdminCustomRequests({
  onCreateQuote,
  refreshToken = 0,
}: AdminCustomRequestsProps) {
  const [requests, setRequests] = useState<CustomRequest[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('attention')
  const [typeFilter, setTypeFilter] = useState<RequestTypeFilter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    setState('loading')

    try {
      const response = await fetch('/api/admin/orders?action=custom-requests', {
        cache: 'no-store',
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { requests: CustomRequest[] }
      setRequests(data.requests)
      setState('ready')
      setMessage('')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar las solicitudes personalizadas.',
      )
      setState('error')
    }
  }, [])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests, refreshToken])

  useEffect(() => {
    function refreshFromQuoteChange() {
      void loadRequests()
    }

    window.addEventListener(
      'alimar:quote-metrics-changed',
      refreshFromQuoteChange,
    )

    return () => {
      window.removeEventListener(
        'alimar:quote-metrics-changed',
        refreshFromQuoteChange,
      )
    }
  }, [loadRequests])

  const today = todayKey()

  const summary = useMemo(() => {
    const active = requests.filter(
      (request) => request.status === 'new' || request.status === 'reviewing',
    )

    return {
      attention: active.length,
      new: requests.filter((request) => request.status === 'new').length,
      reviewing: requests.filter((request) => request.status === 'reviewing')
        .length,
      quoted: requests.filter((request) => request.status === 'quoted').length,
      overdue: active.filter(
        (request) => dueState(request, today) === 'overdue',
      ).length,
    }
  }, [requests, today])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-AR')

    return requests
      .filter((request) => {
        if (
          inboxFilter === 'attention' &&
          request.status !== 'new' &&
          request.status !== 'reviewing'
        ) {
          return false
        }

        if (
          inboxFilter === 'overdue' &&
          (
            (request.status !== 'new' && request.status !== 'reviewing') ||
            dueState(request, today) !== 'overdue'
          )
        ) {
          return false
        }

        if (
          inboxFilter !== 'attention' &&
          inboxFilter !== 'overdue' &&
          inboxFilter !== 'all' &&
          request.status !== inboxFilter
        ) {
          return false
        }

        if (typeFilter !== 'all' && request.request_type !== typeFilter) {
          return false
        }

        if (!query) return true

        return [
          request.public_code,
          request.customer_name,
          request.customer_phone,
          request.description,
          request.theme ?? '',
          request.dimensions ?? '',
          request.example_title ?? '',
          typeLabels[request.request_type],
        ]
          .join(' ')
          .toLocaleLowerCase('es-AR')
          .includes(query)
      })
      .sort((left, right) => {
        const statusDiff =
          statusSortValue(left.status) - statusSortValue(right.status)

        if (statusDiff !== 0) return statusDiff

        const dueDiff = dueSortValue(left) - dueSortValue(right)
        if (dueDiff !== 0) return dueDiff

        return (
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime()
        )
      })
  }, [inboxFilter, requests, search, typeFilter])

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedRequestId(null)
      return
    }

    if (!filtered.some((request) => request.id === selectedRequestId)) {
      setSelectedRequestId(filtered[0].id)
    }
  }, [filtered, selectedRequestId])

  const selectedRequest =
    filtered.find((request) => request.id === selectedRequestId) ?? null

  async function updateStatus(
    request: CustomRequest,
    status: CustomRequestStatus,
  ) {
    if (request.status === status) return

    setBusyId(request.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=custom-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: request.id, status }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { request: CustomRequest }
      setRequests((current) =>
        current.map((item) =>
          item.id === data.request.id ? data.request : item,
        ),
      )
      setMessage(
        `${data.request.public_code} · ${statusLabels[data.request.status]}.`,
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar la solicitud.',
      )
    } finally {
      setBusyId(null)
    }
  }

  function whatsappUrl(request: CustomRequest) {
    return site.whatsappUrlFor(
      `Hola ${request.customer_name}, vimos tu Pedido Personalizado ${request.public_code} de ${typeLabels[request.request_type]}.`,
    )
  }

  function selectAndFocus(request: CustomRequest) {
    setSelectedRequestId(request.id)

    if (window.innerWidth <= 900) {
      window.setTimeout(() => {
        document
          .querySelector('.admin-request-inbox-detail')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 20)
    }
  }

  const selectedDueState = selectedRequest
    ? dueState(selectedRequest, today)
    : 'unscheduled'

  return (
    <section className="admin-panel admin-custom-requests admin-request-inbox">
      <div className="admin-request-inbox-heading">
        <div>
          <span className="admin-cost-eyebrow">Bandeja de trabajo</span>
          <h2>Solicitudes de trabajo</h2>
          <p>
            Priorizá lo que todavía necesita respuesta, revisá la idea completa y
            convertí una solicitud en presupuesto sin perder contexto.
          </p>
        </div>

        <button
          className="admin-secondary"
          type="button"
          onClick={() => void loadRequests()}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      <div className="admin-request-inbox-summary">
        <button
          type="button"
          className={inboxFilter === 'attention' ? 'is-active' : ''}
          onClick={() => setInboxFilter('attention')}
        >
          <span>Por atender</span>
          <strong>{summary.attention}</strong>
          <small>Nuevas + revisando</small>
        </button>

        <button
          type="button"
          className={inboxFilter === 'new' ? 'is-active' : ''}
          onClick={() => setInboxFilter('new')}
        >
          <span>Nuevas</span>
          <strong>{summary.new}</strong>
          <small>Sin tomar todavía</small>
        </button>

        <button
          type="button"
          className={inboxFilter === 'reviewing' ? 'is-active' : ''}
          onClick={() => setInboxFilter('reviewing')}
        >
          <span>Revisando</span>
          <strong>{summary.reviewing}</strong>
          <small>En análisis</small>
        </button>

        <button
          type="button"
          className={inboxFilter === 'quoted' ? 'is-active' : ''}
          onClick={() => setInboxFilter('quoted')}
        >
          <span>Con PRE</span>
          <strong>{summary.quoted}</strong>
          <small>Ya cotizadas</small>
        </button>

        <button
          type="button"
          className={inboxFilter === 'overdue' ? 'is-danger is-active' : 'is-danger'}
          onClick={() => {
            setInboxFilter('overdue')
            setTypeFilter('all')
          }}
        >
          <span>Fecha vencida</span>
          <strong>{summary.overdue}</strong>
          <small>Requieren atención</small>
        </button>
      </div>

      {message && <div className="admin-toast">{message}</div>}

      <div className="admin-request-inbox-toolbar">
        <label className="admin-request-inbox-search">
          Buscar solicitud
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="SOL, cliente, teléfono, idea..."
          />
        </label>

        <label>
          Trabajo
          <select
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as RequestTypeFilter)
            }
          >
            <option value="all">Todos los tipos</option>
            {(
              Object.entries(typeLabels) as Array<
                [CustomRequest['request_type'], string]
              >
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Bandeja
          <select
            value={inboxFilter}
            onChange={(event) =>
              setInboxFilter(event.target.value as InboxFilter)
            }
          >
            {(
              Object.entries(filterLabels) as Array<[InboxFilter, string]>
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {(search || typeFilter !== 'all' || inboxFilter !== 'attention') && (
          <button
            className="admin-text-button"
            type="button"
            onClick={() => {
              setSearch('')
              setTypeFilter('all')
              setInboxFilter('attention')
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="admin-request-inbox-result-line">
        <strong>{filtered.length}</strong>
        <span>
          {filtered.length === 1
            ? 'solicitud visible'
            : 'solicitudes visibles'}
        </span>
        <small>
          Ordenadas por estado, fecha necesaria y antigüedad.
        </small>
      </div>

      {state === 'loading' && requests.length === 0 && (
        <div className="admin-empty">Cargando solicitudes…</div>
      )}

      {state === 'error' && requests.length === 0 && (
        <div className="admin-empty">
          No se pudieron cargar las solicitudes.
          <button
            className="admin-secondary"
            type="button"
            onClick={() => void loadRequests()}
          >
            Reintentar
          </button>
        </div>
      )}

      {state === 'ready' && filtered.length === 0 && (
        <div className="admin-empty">
          <strong>No hay solicitudes en esta bandeja.</strong>
          <span>Probá limpiando los filtros o revisando otro estado.</span>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="admin-request-inbox-layout">
          <div
            className="admin-request-inbox-list"
            aria-label="Solicitudes de trabajo"
          >
            {filtered.map((request) => {
              const requestDueState = dueState(request, today)
              const active = request.id === selectedRequestId

              return (
                <button
                  className={`admin-request-inbox-row${
                    active ? ' is-selected' : ''
                  }`}
                  type="button"
                  key={request.id}
                  onClick={() => selectAndFocus(request)}
                  aria-pressed={active}
                >
                  <div className="admin-request-inbox-row-top">
                    <span
                      className={`admin-request-status is-${request.status}`}
                    >
                      {statusLabels[request.status]}
                    </span>
                    <strong>{request.public_code}</strong>
                    <small>{relativeDateLabel(request.created_at)}</small>
                  </div>

                  <div className="admin-request-inbox-row-customer">
                    <strong>{request.customer_name}</strong>
                    <span>{requestHeadline(request)}</span>
                  </div>

                  <div className="admin-request-inbox-row-meta">
                    <span>{typeLabels[request.request_type]}</span>
                    <span
                      className={`admin-request-due is-${requestDueState}`}
                    >
                      {request.needed_date
                        ? `${dueLabels[requestDueState]} · ${dateLabel(
                            request.needed_date,
                          )}`
                        : dueLabels[requestDueState]}
                    </span>
                  </div>

                  <div className="admin-request-inbox-row-foot">
                    <span>{request.customer_phone}</span>
                    {request.reference_image_url && <span>📎 Imagen</span>}
                    {request.quote_id && <span>PRE vinculado</span>}
                  </div>
                </button>
              )
            })}
          </div>

          {selectedRequest && (
            <article className="admin-request-inbox-detail">
              <header className="admin-request-detail-header">
                <div>
                  <div className="admin-request-detail-code">
                    <span>{selectedRequest.public_code}</span>
                    <span
                      className={`admin-request-status is-${selectedRequest.status}`}
                    >
                      {statusLabels[selectedRequest.status]}
                    </span>
                    <span
                      className={`admin-request-due is-${selectedDueState}`}
                    >
                      {dueLabels[selectedDueState]}
                    </span>
                  </div>

                  <h3>{requestHeadline(selectedRequest)}</h3>
                  <p>
                    {typeLabels[selectedRequest.request_type]} · recibida{' '}
                    {relativeDateLabel(selectedRequest.created_at)}
                  </p>
                </div>

                {selectedRequest.reference_image_url && (
                  <a
                    className="admin-request-detail-thumb"
                    href={selectedRequest.reference_image_url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Abrir imagen de referencia"
                  >
                    <img
                      src={selectedRequest.reference_image_url}
                      alt="Referencia enviada por el cliente"
                    />
                  </a>
                )}
              </header>

              <section className="admin-request-detail-client">
                <div>
                  <span>Cliente</span>
                  <strong>{selectedRequest.customer_name}</strong>
                  <a href={phoneHref(selectedRequest.customer_phone)}>
                    {selectedRequest.customer_phone}
                  </a>
                </div>

                <div className="admin-request-detail-actions">
                  <a
                    className="admin-primary"
                    href={whatsappUrl(selectedRequest)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>

                  {!selectedRequest.quote_id && (
                    <button
                      className="admin-secondary"
                      type="button"
                      onClick={() => onCreateQuote(selectedRequest)}
                    >
                      Crear presupuesto
                    </button>
                  )}
                </div>
              </section>

              <section className="admin-request-detail-facts">
                <div>
                  <span>Cantidad aprox.</span>
                  <strong>
                    {selectedRequest.quantity !== null
                      ? selectedRequest.quantity
                      : 'No indicó'}
                  </strong>
                </div>
                <div>
                  <span>Lo necesita para</span>
                  <strong>{dateLabel(selectedRequest.needed_date)}</strong>
                </div>
                <div>
                  <span>Tamaño</span>
                  <strong>{selectedRequest.dimensions || 'No indicó'}</strong>
                </div>
                <div>
                  <span>Estilo / tema</span>
                  <strong>{selectedRequest.theme || 'No indicó'}</strong>
                </div>
              </section>

              {selectedRequest.example_title && (
                <section className="admin-request-detail-example">
                  <span>Inspiración elegida</span>
                  <strong>{selectedRequest.example_title}</strong>
                  <small>
                    Es una referencia del cliente, no un producto con precio.
                  </small>
                </section>
              )}

              <section className="admin-request-detail-description">
                <span>Qué necesita</span>
                <p>{selectedRequest.description}</p>
              </section>

              {(selectedRequest.reference_image_url ||
                selectedRequest.reference_url) && (
                <section className="admin-request-detail-references">
                  <div>
                    <span>Referencias</span>
                    <strong>Material enviado por el cliente</strong>
                  </div>

                  <div>
                    {selectedRequest.reference_image_url && (
                      <a
                        href={selectedRequest.reference_image_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver imagen ↗
                      </a>
                    )}

                    {selectedRequest.reference_url && (
                      <a
                        href={selectedRequest.reference_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir link ↗
                      </a>
                    )}
                  </div>
                </section>
              )}

              <section className="admin-request-detail-workflow">
                <div>
                  <span>Seguimiento</span>
                  <strong>¿En qué punto está esta solicitud?</strong>
                </div>

                <div className="admin-request-detail-workflow-controls">
                  {selectedRequest.status === 'new' && (
                    <button
                      className="admin-primary"
                      type="button"
                      disabled={busyId === selectedRequest.id}
                      onClick={() =>
                        void updateStatus(selectedRequest, 'reviewing')
                      }
                    >
                      {busyId === selectedRequest.id
                        ? 'Guardando…'
                        : 'Tomar solicitud'}
                    </button>
                  )}

                  <label>
                    Estado
                    <select
                      value={selectedRequest.status}
                      disabled={busyId === selectedRequest.id}
                      onChange={(event) =>
                        void updateStatus(
                          selectedRequest,
                          event.target.value as CustomRequestStatus,
                        )
                      }
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {selectedRequest.quote_id ? (
                  <div className="admin-request-linked-quote">
                    <span>✓</span>
                    <div>
                      <strong>Presupuesto vinculado</strong>
                      <small>
                        Esta solicitud ya tiene un PRE asociado.
                      </small>
                    </div>
                  </div>
                ) : (
                  <div className="admin-request-next-step">
                    <span>Siguiente paso sugerido</span>
                    <strong>
                      Revisar alcance y crear el presupuesto cuando tengas la
                      información necesaria.
                    </strong>
                  </div>
                )}
              </section>

              <footer className="admin-request-detail-footer">
                <span>
                  Creada {dateTimeLabel(selectedRequest.created_at)}
                </span>
                <span>
                  Último cambio {dateTimeLabel(selectedRequest.updated_at)}
                </span>
              </footer>
            </article>
          )}
        </div>
      )}
    </section>
  )
}
