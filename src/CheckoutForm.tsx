import { useEffect, useRef, useState, type FormEvent } from 'react'
import { saveRecoveredOrder, type RecoveredOrder } from './orderRecovery'
import type { CustomerSession } from './customerAccount'
import { site } from './site'

type CheckoutItem = {
  id: string
  variantId: string | null
  quantity: number
  note: string
  customizations: Array<{ fieldId: string; value: string }>
}

type CreateOrderResponse = {
  orderCode: string
  whatsappMessage: string
  trackingToken: string
}

type CheckoutFormProps = {
  items: CheckoutItem[]
  session: CustomerSession | null
  sessionReady: boolean
  onCreated: (order: RecoveredOrder) => void
}

async function errorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `No se pudo registrar el pedido (${response.status}).`
  } catch {
    return `No se pudo registrar el pedido (${response.status}).`
  }
}

export default function CheckoutForm({
  items,
  session,
  sessionReady,
  onCreated,
}: CheckoutFormProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const requestId = useRef(crypto.randomUUID())
  const cartSignature = items
    .map((item) => `${item.id}:${item.variantId ?? 'base'}:${item.quantity}:${item.note}`)
    .join('|')

  useEffect(() => {
    requestId.current = crypto.randomUUID()
  }, [cartSignature])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (items.length === 0 || busy || !session) return

    setBusy(true)
    setMessage('')

    const form = new FormData(event.currentTarget)
    const payload = {
      requestId: requestId.current,
      customer: {
        notes: String(form.get('notes') ?? '').trim(),
      },
      items,
    }

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.status === 401) {
        window.location.assign('/cuenta?next=/')
        return
      }

      if (!response.ok) throw new Error(await errorMessage(response))

      const data = (await response.json()) as CreateOrderResponse
      if (!data.orderCode || !data.whatsappMessage || !data.trackingToken) {
        throw new Error('El pedido se registró pero la respuesta fue incompleta.')
      }

      const recoveredOrder = saveRecoveredOrder(
        data.orderCode,
        data.trackingToken,
      )
      onCreated(recoveredOrder)
      window.location.assign(site.whatsappUrlFor(data.whatsappMessage))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el pedido.')
      setBusy(false)
    }
  }

  if (!sessionReady) {
    return (
      <div className="checkout-login-gate is-loading">
        <strong>Verificando tu cuenta…</strong>
        <span>Tu carrito queda guardado mientras preparamos el checkout.</span>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="checkout-login-gate">
        <div>
          <span>Cuenta requerida</span>
          <strong>Iniciá sesión para confirmar el pedido</strong>
          <p>
            Así el PED queda guardado en “Mi cuenta” y podés volver al seguimiento sin buscar el código.
          </p>
        </div>
        <a className="button button-primary" href="/cuenta?next=/">
          Ingresar o crear cuenta
          <span aria-hidden="true">→</span>
        </a>
        <small>Tu carrito queda guardado en este dispositivo.</small>
      </div>
    )
  }

  return (
    <form className="checkout-form" onSubmit={handleSubmit}>
      <div className="checkout-heading">
        <span>Confirmación</span>
        <strong>Pedido para {session.name}</strong>
        <p>El pedido va a quedar vinculado automáticamente a tu cuenta.</p>
      </div>

      <div className="checkout-account-summary">
        <div>
          <span>Cuenta</span>
          <strong>{session.email}</strong>
        </div>
        <div>
          <span>WhatsApp</span>
          <strong>{session.phone}</strong>
        </div>
        <a href="/cuenta">Mi cuenta</a>
      </div>

      <label className="checkout-note-only">
        Nota general
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          placeholder="Fecha del evento, aclaraciones generales, etc."
        />
      </label>

      {message && <p className="checkout-error">{message}</p>}

      <button className="button button-primary checkout-submit" type="submit" disabled={busy}>
        {busy ? 'Registrando pedido…' : 'Confirmar pedido y abrir WhatsApp'}
        {!busy && <span aria-hidden="true">↗</span>}
      </button>

      <small className="checkout-safe-note">
        El precio se valida nuevamente desde el catálogo antes de guardar el pedido.
      </small>
    </form>
  )
}
