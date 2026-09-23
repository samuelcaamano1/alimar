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
  reference_url: string | null
  quote_id: string | null
  created_at: string
  updated_at: string
}

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
  const [statusFilter, setStatusFilter] = useState<'all' | CustomRequestStatus>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-AR')

    return requests.filter((request) => {
      if (statusFilter !== 'all' && request.status !== statusFilter) return false
      if (!query) return true

      return [
        request.public_code,
        request.customer_name,
        request.customer_phone,
        request.description,
        request.theme ?? '',
        typeLabels[request.request_type],
      ]
        .join(' ')
        .toLocaleLowerCase('es-AR')
        .includes(query)
    })
  }, [requests, search, statusFilter])

  async function updateStatus(request: CustomRequest, status: CustomRequestStatus) {
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
        current.map((item) => (item.id === data.request.id ? data.request : item)),
      )
      setMessage(`${data.request.public_code} actualizado.`)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo actualizar la solicitud.',
      )
    } finally {
      setBusyId(null)
    }
  }

  function whatsappUrl(request: CustomRequest) {
    return site.whatsappUrlFor(
      `Hola ${request.customer_name}, vimos tu solicitud ${request.public_code} de ${typeLabels[request.request_type]}.`,
    )
  }

  return (
    <section className="admin-panel admin-custom-requests">
      <div className="admin-custom-requests-heading">
        <div>
          <span className="admin-cost-eyebrow">Entrada de clientes</span>
          <h2>Solicitudes personalizadas</h2>
          <p>
            Ideas que llegan desde la tienda y todavía necesitan revisión antes de convertirse en presupuesto.
          </p>
        </div>

        <span className="admin-custom-requests-count">
          {requests.filter((request) => request.status === 'new').length} nuevas
        </span>
      </div>

      {message && <div className="admin-toast">{message}</div>}

      <div className="admin-custom-requests-toolbar">
        <label>
          Buscar
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Código, cliente, idea..."
          />
        </label>

        <label>
          Estado
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | CustomRequestStatus)
            }
          >
            <option value="all">Todas</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <span>{filtered.length} visibles</span>
      </div>

      {state === 'loading' && requests.length === 0 && (
        <div className="admin-empty">Cargando solicitudes…</div>
      )}

      {state === 'error' && requests.length === 0 && (
        <div className="admin-empty">
          No se pudieron cargar las solicitudes.
          <button className="admin-secondary" type="button" onClick={() => void loadRequests()}>
            Reintentar
          </button>
        </div>
      )}

      {state === 'ready' && filtered.length === 0 && (
        <div className="admin-empty">No hay solicitudes para este filtro.</div>
      )}

      <div className="admin-custom-request-list">
        {filtered.map((request) => (
          <article className="admin-custom-request-card" key={request.id}>
            <div className="admin-custom-request-main">
              <div className="admin-custom-request-code">
                <span>{request.public_code}</span>
                <strong>{request.customer_name}</strong>
              </div>

              <div className="admin-custom-request-meta">
                <span>{typeLabels[request.request_type]}</span>
                {request.quantity !== null && <span>{request.quantity} unidades aprox.</span>}
                <span>Para {dateLabel(request.needed_date)}</span>
                <span>{dateTimeLabel(request.created_at)}</span>
              </div>

              <p>{request.description}</p>

              {(request.dimensions || request.theme) && (
                <div className="admin-custom-request-details">
                  {request.dimensions && <span>Medidas: {request.dimensions}</span>}
                  {request.theme && <span>Tema / colores: {request.theme}</span>}
                </div>
              )}

              {request.reference_url && (
                <a href={request.reference_url} target="_blank" rel="noreferrer">
                  Ver referencia ↗
                </a>
              )}
            </div>

            <div className="admin-custom-request-side">
              <label>
                Estado
                <select
                  value={request.status}
                  disabled={busyId === request.id}
                  onChange={(event) =>
                    void updateStatus(
                      request,
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

              <a
                className="admin-primary admin-custom-request-whatsapp"
                href={whatsappUrl(request)}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>

              <small>{request.customer_phone}</small>

              {request.quote_id ? (
                <span className="admin-custom-request-linked">Presupuesto vinculado</span>
              ) : (
                <button
                  className="admin-secondary admin-custom-request-quote"
                  type="button"
                  onClick={() => onCreateQuote(request)}
                >
                  Crear presupuesto
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
