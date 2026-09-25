import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { site } from './site'

type TrackingStatus =
  | 'new'
  | 'contacted'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'

type ProductionStage =
  | 'not_started'
  | 'design'
  | 'awaiting_approval'
  | 'materials'
  | 'production'
  | 'finishing'
  | 'ready_for_delivery'

type PaymentStatus = 'total_pending' | 'unpaid' | 'partial' | 'paid'

type TrackingItem = {
  name: string
  variant: string | null
  quantity: number
}

type TrackingFileKind =
  | 'reference'
  | 'design'
  | 'production'
  | 'print'
  | '3d'
  | 'other'

type TrackingFile = {
  kind: TrackingFileKind
  label: string
  url: string
}

type PublicTrackingOrder = {
  orderCode: string
  status: TrackingStatus
  productionStage: ProductionStage
  promisedFor: string | null
  agreedTotal: string | null
  balanceDue: string | null
  paymentStatus: PaymentStatus
  updatedAt: string
  items: TrackingItem[]
  files: TrackingFile[]
}

const steps = [
  {
    key: 'received',
    label: 'Pedido recibido',
    text: 'Registramos tu pedido y ya forma parte de nuestra agenda.',
  },
  {
    key: 'design',
    label: 'Diseño y preparación',
    text: 'Estamos preparando el diseño, materiales o detalles previos.',
  },
  {
    key: 'production',
    label: 'En producción',
    text: 'Tu trabajo ya está en proceso de producción.',
  },
  {
    key: 'finishing',
    label: 'Terminaciones',
    text: 'Estamos haciendo los últimos detalles y controles.',
  },
  {
    key: 'ready',
    label: 'Listo',
    text: 'Tu pedido está listo para coordinar entrega o retiro.',
  },
] as const

const statusLabels: Record<TrackingStatus, string> = {
  new: 'Pedido recibido',
  contacted: 'En coordinación',
  confirmed: 'Confirmado',
  in_progress: 'En proceso',
  ready: 'Listo',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const paymentLabels: Record<PaymentStatus, string> = {
  total_pending: 'Importe a confirmar',
  unpaid: 'Pendiente de pago',
  partial: 'Pago parcial',
  paid: 'Pagado',
}

const fileKindLabels: Record<TrackingFileKind, string> = {
  reference: 'Referencia',
  design: 'Diseño',
  production: 'Producción',
  print: 'Archivo para imprimir',
  '3d': 'Archivo 3D',
  other: 'Archivo',
}

function currentStep(order: PublicTrackingOrder) {
  if (order.status === 'completed' || order.status === 'ready') return 4
  if (order.status === 'cancelled') return 0

  if (order.productionStage === 'ready_for_delivery') return 4
  if (order.productionStage === 'finishing') return 3

  if (
    order.productionStage === 'materials' ||
    order.productionStage === 'production'
  ) {
    return 2
  }

  if (
    order.productionStage === 'design' ||
    order.productionStage === 'awaiting_approval'
  ) {
    return 1
  }

  return 0
}

function money(value: string | null) {
  if (value === null) return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(number)
}

function dateLabel(value: string | null) {
  if (!value) return null

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function dateTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || 'No pudimos consultar tu pedido.'
  } catch {
    return 'No pudimos consultar tu pedido.'
  }
}

export default function PublicOrderTracking({ token }: { token: string }) {
  const [activeToken, setActiveToken] = useState(token)
  const [order, setOrder] = useState<PublicTrackingOrder | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    token ? 'loading' : 'idle',
  )
  const [message, setMessage] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)

  useEffect(() => {
    if (!activeToken) {
      setState('idle')
      setOrder(null)
      return
    }

    const controller = new AbortController()
    setState('loading')
    setMessage('')

    fetch(
      `/api/orders?action=tracking&token=${encodeURIComponent(activeToken)}`,
      {
        signal: controller.signal,
        cache: 'no-store',
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response))

        return (await response.json()) as { order: PublicTrackingOrder }
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setOrder(data.order)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof DOMException && error.name === 'AbortError') return

        setMessage(
          error instanceof Error
            ? error.message
            : 'No pudimos consultar tu pedido.',
        )
        setOrder(null)
        setState('error')
      })

    return () => controller.abort()
  }, [activeToken])

  const progress = useMemo(
    () => (order ? currentStep(order) : 0),
    [order],
  )

  async function lookupOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lookupBusy) return

    const form = new FormData(event.currentTarget)
    const orderCode = String(form.get('orderCode') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()

    setLookupBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/orders?action=tracking-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderCode, phone }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as {
        trackingToken?: string
        order?: PublicTrackingOrder
      }

      if (!data.trackingToken || !data.order) {
        throw new Error('La respuesta de seguimiento fue incompleta.')
      }

      setActiveToken(data.trackingToken)
      setOrder(data.order)
      setState('ready')
      window.history.replaceState(
        null,
        '',
        `/?pedido=${encodeURIComponent(data.trackingToken)}`,
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos consultar tu pedido.',
      )
      setState('error')
    } finally {
      setLookupBusy(false)
    }
  }

  return (
    <main className="tracking-page">
      <section className="tracking-shell">
        <header className="tracking-header">
          <a className="tracking-brand" href="/">
            Alimar
          </a>
          <a href="/" className="tracking-back">
            Volver a la tienda
          </a>
        </header>

        {!activeToken && (
          <section className="tracking-lookup">
            <p className="tracking-eyebrow">Seguimiento de pedido</p>
            <h1>¿Cómo viene tu pedido?</h1>
            <p>
              Ingresá el código PED y el WhatsApp que usaste al hacer el pedido.
            </p>

            <form onSubmit={lookupOrder}>
              <label>
                Código del pedido
                <input
                  name="orderCode"
                  placeholder="PED-2026-XXXXXXXX"
                  autoCapitalize="characters"
                  required
                />
              </label>

              <label>
                WhatsApp
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="11 1234 5678"
                  required
                />
              </label>

              <button
                className="button button-primary"
                type="submit"
                disabled={lookupBusy}
              >
                {lookupBusy ? 'Buscando…' : 'Ver seguimiento'}
              </button>
            </form>

            {message && <div className="tracking-error">{message}</div>}
          </section>
        )}

        {activeToken && state === 'loading' && (
          <section className="tracking-loading">
            <span />
            <strong>Cargando tu pedido…</strong>
          </section>
        )}

        {activeToken && state === 'error' && (
          <section className="tracking-lookup">
            <p className="tracking-eyebrow">Seguimiento de pedido</p>
            <h1>No pudimos abrir este seguimiento.</h1>
            <p>{message}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setActiveToken('')
                setOrder(null)
                setState('idle')
                setMessage('')
                window.history.replaceState(null, '', '/?seguimiento=1')
              }}
            >
              Buscar con código PED
            </button>
          </section>
        )}

        {activeToken && order && state === 'ready' && (
          <>
            <section
              className={`tracking-summary is-${order.status}`}
              aria-live="polite"
            >
              <div>
                <p className="tracking-eyebrow">Seguimiento de pedido</p>
                <span className="tracking-code">{order.orderCode}</span>
                <h1>{statusLabels[order.status]}</h1>
                <p>
                  Acá podés ver el avance que Alimar va registrando para tu
                  pedido.
                </p>
              </div>

              <div className="tracking-summary-side">
                {order.promisedFor && order.status !== 'cancelled' && (
                  <div>
                    <span>Fecha prevista</span>
                    <strong>{dateLabel(order.promisedFor)}</strong>
                  </div>
                )}

                <div>
                  <span>Última actualización</span>
                  <strong>{dateTimeLabel(order.updatedAt) || 'Reciente'}</strong>
                </div>
              </div>
            </section>

            {order.status === 'cancelled' ? (
              <section className="tracking-cancelled">
                <strong>Este pedido figura como cancelado.</strong>
                <p>
                  Si necesitás revisarlo o creés que hay un error, escribinos por
                  WhatsApp.
                </p>
              </section>
            ) : (
              <section className="tracking-progress">
                {steps.map((step, index) => {
                  const complete = index < progress
                  const active = index === progress
                  const completedOrder = order.status === 'completed'

                  return (
                    <article
                      key={step.key}
                      className={[
                        complete || completedOrder ? 'is-complete' : '',
                        active && !completedOrder ? 'is-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className="tracking-step-marker">
                        <span>{complete || completedOrder ? '✓' : index + 1}</span>
                      </div>

                      <div>
                        <strong>{step.label}</strong>
                        <p>{step.text}</p>
                      </div>
                    </article>
                  )
                })}
              </section>
            )}

            <section className="tracking-details">
              <div className="tracking-detail-card">
                <span>Tu pedido</span>
                <div className="tracking-items">
                  {order.items.length > 0 ? (
                    order.items.map((item, index) => (
                      <div key={`${item.name}-${index}`}>
                        <strong>
                          {item.quantity}× {item.name}
                        </strong>
                        {item.variant && <small>{item.variant}</small>}
                      </div>
                    ))
                  ) : (
                    <p>Trabajo personalizado</p>
                  )}
                </div>
              </div>

              <div className="tracking-detail-card">
                <span>Pagos</span>
                <strong>{paymentLabels[order.paymentStatus]}</strong>

                {order.agreedTotal !== null && (
                  <small>Total acordado: {money(order.agreedTotal)}</small>
                )}

                {order.balanceDue !== null && order.paymentStatus !== 'paid' && (
                  <small>Saldo pendiente: {money(order.balanceDue)}</small>
                )}
              </div>
            </section>

            {order.files.length > 0 && (
              <section className="tracking-files">
                <div className="tracking-files-heading">
                  <div>
                    <span>Archivos compartidos</span>
                    <strong>Material disponible para tu pedido</strong>
                  </div>
                  <small>Alimar comparte acá sólo los archivos habilitados para vos.</small>
                </div>

                <div className="tracking-files-list">
                  {order.files.map((file) => (
                    <article key={file.url}>
                      <div>
                        <span>{fileKindLabels[file.kind]}</span>
                        <strong>{file.label}</strong>
                      </div>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        Abrir archivo ↗
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="tracking-help">
              <div>
                <span>¿Necesitás coordinar algo?</span>
                <strong>Seguimos hablando por WhatsApp.</strong>
              </div>
              <a
                className="button button-primary"
                href={site.whatsappUrlFor(
                  `Hola Alimar, quiero consultar por mi pedido ${order.orderCode}.`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                Consultar por WhatsApp ↗
              </a>
            </section>

            <p className="tracking-privacy-note">
              Este link es privado. Compartilo solamente con personas que deban
              ver el seguimiento de tu pedido.
            </p>
          </>
        )}
      </section>
    </main>
  )
}
