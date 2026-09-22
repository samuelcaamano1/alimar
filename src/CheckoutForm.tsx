import { useEffect, useRef, useState, type FormEvent } from 'react'
import { site } from './site'

type CheckoutItem = { id: string; quantity: number; note: string }
type CreateOrderResponse = { orderCode: string; whatsappMessage: string }
type CheckoutFormProps = { items: CheckoutItem[]; onCreated: () => void }

async function errorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `No se pudo registrar el pedido (${response.status}).`
  } catch {
    return `No se pudo registrar el pedido (${response.status}).`
  }
}

export default function CheckoutForm({ items, onCreated }: CheckoutFormProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const requestId = useRef(crypto.randomUUID())
  const cartSignature = items.map((item) => `${item.id}:${item.quantity}:${item.note}`).join('|')

  useEffect(() => {
    requestId.current = crypto.randomUUID()
  }, [cartSignature])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (items.length === 0 || busy) return

    setBusy(true)
    setMessage('')

    const form = new FormData(event.currentTarget)
    const payload = {
      requestId: requestId.current,
      customer: {
        name: String(form.get('name') ?? '').trim(),
        phone: String(form.get('phone') ?? '').trim(),
        email: String(form.get('email') ?? '').trim(),
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

      if (!response.ok) throw new Error(await errorMessage(response))

      const data = (await response.json()) as CreateOrderResponse
      if (!data.orderCode || !data.whatsappMessage) {
        throw new Error('El pedido se registró pero la respuesta fue incompleta.')
      }

      onCreated()
      window.location.assign(site.whatsappUrlFor(data.whatsappMessage))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el pedido.')
      setBusy(false)
    }
  }

  return (
    <form className="checkout-form" onSubmit={handleSubmit}>
      <div className="checkout-heading">
        <span>Confirmación</span>
        <strong>Dejanos tus datos</strong>
        <p>Primero registramos el pedido y después abrimos WhatsApp con el resumen listo.</p>
      </div>

      <div className="checkout-grid">
        <label>
          Nombre *
          <input name="name" type="text" autoComplete="name" maxLength={100} placeholder="Tu nombre" required />
        </label>

        <label>
          WhatsApp *
          <input name="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="Ej. 11 1234 5678" required />
        </label>

        <label className="checkout-span-2">
          Email
          <input name="email" type="email" autoComplete="email" maxLength={160} placeholder="Opcional" />
        </label>

        <label className="checkout-span-2">
          Nota general
          <textarea name="notes" rows={2} maxLength={500} placeholder="Fecha del evento, aclaraciones generales, etc." />
        </label>
      </div>

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
