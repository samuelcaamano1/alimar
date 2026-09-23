import { useEffect, useMemo, useState } from 'react'
import { alimarLogoDataUrl } from './brand'
import { site } from './site'

type PublicQuoteStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'

type PublicQuote = {
  public_code: string
  status: PublicQuoteStatus
  title: string
  customer_name: string | null
  job_label: string
  quantity: number
  valid_until: string | null
  suggested_unit_price: string
  total_price: string
  customer_responded_at: string | null
  customer_response_reason: string | null
  customer_response_note: string | null
  order_code: string | null
  created_at: string
}

type PublicQuoteViewProps = {
  token: string
}

function money(value: string) {
  const amount = Number(value)

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

function dateLabel(value: string | null) {
  if (!value) return 'Sin vencimiento'

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function statusLabel(status: PublicQuoteStatus) {
  switch (status) {
    case 'accepted':
      return 'Aceptado'
    case 'expired':
      return 'Vencido'
    case 'rejected':
      return 'No vigente'
    case 'sent':
      return 'Esperando tu confirmación'
    default:
      return 'Listo para revisar'
  }
}

function safeFirstName(value: string | null) {
  const normalized = value?.trim()
  if (!normalized) return ''
  return normalized.split(/\s+/)[0] ?? ''
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

export default function PublicQuoteView({ token }: PublicQuoteViewProps) {
  const [quote, setQuote] = useState<PublicQuote | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineNote, setDeclineNote] = useState('')
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadQuote() {
      setState('loading')
      setMessage('')

      try {
        const response = await fetch(
          `/api/catalog?view=quote&token=${encodeURIComponent(token)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        )

        if (!response.ok) throw new Error(await responseMessage(response))

        const data = (await response.json()) as { quote: PublicQuote }
        setQuote(data.quote)
        setState('ready')

        document.title = `${data.quote.public_code} · Alimar`
      } catch (error) {
        if (controller.signal.aborted) return

        setMessage(
          error instanceof Error ? error.message : 'No pudimos abrir el presupuesto.',
        )
        setState('error')
      }
    }

    void loadQuote()

    return () => controller.abort()
  }, [token])

  const consultationUrl = useMemo(() => {
    if (!quote) return site.whatsappUrl

    return site.whatsappUrlFor(
      `Hola Alimar, tengo una consulta sobre el presupuesto ${quote.public_code} (${quote.title}).`,
    )
  }, [quote])

  const acceptedWhatsappUrl = useMemo(() => {
    if (!quote) return site.whatsappUrl

    return site.whatsappUrlFor(
      `Hola Alimar, ya acepté el presupuesto ${quote.public_code} desde la web.`,
    )
  }, [quote])

  async function respondToQuote(decision: 'accept' | 'reject') {
    if (!quote || accepting) return

    setAccepting(true)
    setMessage('')

    try {
      const response = await fetch('/api/orders?action=quote-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          decision,
          reason: decision === 'reject' ? declineReason : null,
          note: decision === 'reject' ? declineNote : null,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { quote: PublicQuote | null }

      if (!data.quote) {
        throw new Error('La aceptación se registró, pero no pudimos actualizar la vista.')
      }

      setQuote(data.quote)
      setConfirming(false)
      setDeclining(false)
      setMessage(
        decision === 'reject'
          ? 'Gracias por contarnos. Tu respuesta quedó registrada.'
          : 'Presupuesto aceptado correctamente.',
      )
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No pudimos registrar la aceptación.',
      )
    } finally {
      setAccepting(false)
    }
  }

  if (state === 'loading') {
    return (
      <main className="public-quote-shell">
        <section className="public-quote-loading">
          <img src={alimarLogoDataUrl} alt="Alimar" />
          <span>Abriendo presupuesto…</span>
        </section>
      </main>
    )
  }

  if (state === 'error' || !quote) {
    return (
      <main className="public-quote-shell">
        <section className="public-quote-error">
          <img src={alimarLogoDataUrl} alt="Alimar" />
          <span>Presupuesto</span>
          <h1>No pudimos abrir este link.</h1>
          <p>{message || 'El presupuesto no está disponible.'}</p>
          <a className="button button-primary" href={site.whatsappUrl}>
            Consultar por WhatsApp
          </a>
        </section>
      </main>
    )
  }

  const firstName = safeFirstName(quote.customer_name)
  const canAccept = quote.status === 'draft' || quote.status === 'sent'
  const accepted = quote.status === 'accepted'

  return (
    <main className="public-quote-shell">
      <section className="public-quote-page">
        <header className="public-quote-brand">
          <img src={alimarLogoDataUrl} alt="Alimar" />
          <div>
            <span>Presupuesto digital</span>
            <strong>{quote.public_code}</strong>
          </div>
        </header>

        <div className="public-quote-hero">
          <span className={`public-quote-status is-${quote.status}`}>
            {statusLabel(quote.status)}
          </span>

          <p className="eyebrow">Una propuesta hecha para vos</p>
          <h1>
            {firstName ? `${firstName}, ` : ''}
            este es tu presupuesto.
          </h1>
          <p className="public-quote-intro">
            Revisá el trabajo, la cantidad y el precio acordado. Los costos internos de
            producción quedan siempre dentro de Alimar.
          </p>
        </div>

        <div className="public-quote-work">
          <span>Trabajo</span>
          <strong>{quote.title}</strong>
          <small>{quote.job_label}</small>
        </div>

        <div className="public-quote-grid">
          <div>
            <span>Cantidad</span>
            <strong>{quote.quantity}</strong>
            <small>unidad(es) presupuestadas</small>
          </div>

          <div>
            <span>Precio por unidad</span>
            <strong>{money(quote.suggested_unit_price)}</strong>
            <small>según cantidad presupuestada</small>
          </div>

          <div>
            <span>Vigencia</span>
            <strong>{dateLabel(quote.valid_until)}</strong>
            <small>Después de esa fecha puede requerir actualización.</small>
          </div>
        </div>

        <div className="public-quote-total">
          <span>Total presupuestado</span>
          <strong>{money(quote.total_price)}</strong>
          <small>Precio final del trabajo indicado arriba.</small>
        </div>

        {message && (
          <div
            className={`public-quote-message ${
              accepted ? 'is-success' : ''
            }`}
          >
            {message}
          </div>
        )}

        {accepted ? (
          <div className="public-quote-accepted">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Presupuesto aceptado</strong>
              <p>
                Tu respuesta ya quedó registrada. Alimar puede convertir este presupuesto
                en pedido y coordinar los próximos pasos.
              </p>
              {quote.order_code && (
                <small>Pedido vinculado: {quote.order_code}</small>
              )}
            </div>
          </div>
        ) : quote.status === 'expired' ? (
          <div className="public-quote-expired">
            <strong>Este presupuesto venció.</strong>
            <p>
              Escribinos y revisamos los costos actuales para enviarte una propuesta actualizada.
            </p>
          </div>
        ) : quote.status === 'rejected' ? (
          <div className="public-quote-expired">
            <strong>Este presupuesto ya no está vigente.</strong>
            <p>Podemos preparar uno nuevo si querés retomar el proyecto.</p>
          </div>
        ) : null}

        {declining && canAccept && (
          <div className="public-quote-confirm public-quote-decline">
            <div>
              <span>Antes de cerrar</span>
              <strong>¿Por qué no vas a avanzar?</strong>
              <p>
                Nos ayuda a mejorar futuros presupuestos. No modifica ningún otro dato.
              </p>
            </div>

            <label>
              Motivo
              <select
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
              >
                <option value="">Elegir motivo</option>
                <option value="price">El precio no me sirve</option>
                <option value="timing">No llegamos con los tiempos</option>
                <option value="cancelled">Ya no necesito el trabajo</option>
                <option value="other">Otro motivo</option>
              </select>
            </label>

            <label>
              Comentario opcional
              <textarea
                rows={3}
                maxLength={500}
                value={declineNote}
                onChange={(event) => setDeclineNote(event.target.value)}
                placeholder="Si querés, contanos un poco más."
              />
            </label>

            <div>
              <button
                className="button button-secondary"
                type="button"
                disabled={accepting}
                onClick={() => setDeclining(false)}
              >
                Volver
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={accepting || !declineReason}
                onClick={() => void respondToQuote('reject')}
              >
                {accepting ? 'Registrando…' : 'Confirmar que no voy a avanzar'}
              </button>
            </div>
          </div>
        )}

        {confirming && canAccept && (
          <div className="public-quote-confirm">
            <div>
              <span>Confirmación</span>
              <strong>¿Querés avanzar por {money(quote.total_price)}?</strong>
              <p>
                Al confirmar, Alimar verá este presupuesto como aceptado. El pago y la entrega
                se coordinan aparte.
              </p>
            </div>

            <div>
              <button
                className="button button-secondary"
                type="button"
                disabled={accepting}
                onClick={() => setConfirming(false)}
              >
                Volver
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={accepting}
                onClick={() => void respondToQuote('accept')}
              >
                {accepting ? 'Registrando…' : 'Sí, aceptar presupuesto'}
              </button>
            </div>
          </div>
        )}

        <div className="public-quote-actions">
          {canAccept && !confirming && !declining && (
            <>
              <button
                className="button button-primary"
                type="button"
                onClick={() => setConfirming(true)}
              >
                Aceptar presupuesto
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setDeclining(true)}
              >
                No voy a avanzar
              </button>
            </>
          )}

          {accepted && (
            <a
              className="button button-primary"
              href={acceptedWhatsappUrl}
              target="_blank"
              rel="noreferrer"
            >
              Avisar por WhatsApp
            </a>
          )}

          <a
            className="button button-secondary"
            href={consultationUrl}
            target="_blank"
            rel="noreferrer"
          >
            Tengo una consulta
          </a>
        </div>

        <footer className="public-quote-footer">
          <strong>Alimar</strong>
          <span>Ideas que se vuelven recuerdos.</span>
          <small>
            Este link es privado. Si lo compartís, otra persona podría ver y aceptar el presupuesto.
          </small>
        </footer>
      </section>
    </main>
  )
}
