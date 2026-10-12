import { useEffect, useRef, useState, type FormEvent } from 'react'
import { saveRecoveredOrder, type RecoveredOrder } from './orderRecovery'
import type { CustomerSession } from './customerAccount'
import { site } from './site'
import {
  checkoutAuthEndpoint,
  checkoutAuthPayload,
  type CheckoutAuthMode,
} from './storefront/checkoutAuth'

type CheckoutItem = {
  id: string
  bundleId?: string | null
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

type AuthResponse = {
  error?: string
  account?: CustomerSession
}

type CheckoutFormProps = {
  items: CheckoutItem[]
  session: CustomerSession | null
  sessionReady: boolean
  onSessionChanged: (account: CustomerSession | null) => void
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
  onSessionChanged,
  onCreated,
}: CheckoutFormProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [authMode, setAuthMode] = useState<CheckoutAuthMode>('register')
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const requestId = useRef(crypto.randomUUID())
  const cartSignature = items
    .map(
      (item) =>
        `${item.bundleId ? `bundle:${item.bundleId}` : `product:${item.id}`}:${item.variantId ?? 'base'}:${item.quantity}:${item.note}`,
    )
    .join('|')

  useEffect(() => {
    requestId.current = crypto.randomUUID()
  }, [cartSignature])

  function changeAuthMode(mode: CheckoutAuthMode) {
    setAuthMode(mode)
    setAuthMessage('')
  }

  async function handleInlineAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (authBusy) return

    const form = new FormData(event.currentTarget)
    const payload = checkoutAuthPayload(authMode, {
      name: String(form.get('name') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    })

    setAuthBusy(true)
    setAuthMessage('')

    try {
      const response = await fetch(checkoutAuthEndpoint(authMode), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      let data: AuthResponse = {}

      try {
        data = (await response.json()) as AuthResponse
      } catch {
        // A generic message is shown below if the body is not JSON.
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            (authMode === 'register'
              ? 'No pudimos crear tu cuenta.'
              : 'No pudimos iniciar sesión.'),
        )
      }

      if (!data.account) {
        throw new Error('La cuenta se creó, pero la respuesta fue incompleta.')
      }

      onSessionChanged(data.account)
      setMessage('')
      setAuthMessage('')
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos validar tu cuenta.',
      )
    } finally {
      setAuthBusy(false)
    }
  }

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
        setBusy(false)
        setAuthMode('login')
        setAuthMessage(
          'Tu sesión venció. Ingresá de nuevo; el carrito sigue guardado.',
        )
        onSessionChanged(null)
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
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo registrar el pedido.',
      )
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
      <div className="checkout-login-gate checkout-inline-auth">
        <div className="checkout-inline-auth-heading">
          <span>Último paso</span>
          <strong>Terminá tu pedido acá mismo</strong>
          <p>
            Creá tu cuenta o ingresá sin salir del carrito. Así el pedido queda
            guardado en “Mi cuenta” y podés seguirlo después.
          </p>
        </div>

        <div
          className="checkout-inline-auth-tabs"
          role="tablist"
          aria-label="Acceso para confirmar el pedido"
        >
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'register'}
            className={authMode === 'register' ? 'is-active' : ''}
            onClick={() => changeAuthMode('register')}
          >
            Crear cuenta
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'login'}
            className={authMode === 'login' ? 'is-active' : ''}
            onClick={() => changeAuthMode('login')}
          >
            Ya tengo cuenta
          </button>
        </div>

        <form className="checkout-inline-auth-form" onSubmit={handleInlineAuth}>
          {authMode === 'register' && (
            <div className="checkout-inline-auth-grid">
              <label>
                Nombre
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={100}
                  required
                  placeholder="Tu nombre"
                />
              </label>
              <label>
                WhatsApp
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={40}
                  required
                  placeholder="11 1234 5678"
                />
              </label>
            </div>
          )}

          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={160}
              required
              placeholder="tu@email.com"
            />
          </label>

          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete={
                authMode === 'register'
                  ? 'new-password'
                  : 'current-password'
              }
              minLength={authMode === 'register' ? 8 : undefined}
              maxLength={128}
              required
              placeholder={
                authMode === 'register'
                  ? 'Mínimo 8 caracteres'
                  : 'Tu contraseña'
              }
            />
          </label>

          {authMessage && (
            <p className="checkout-inline-auth-error" role="alert">
              {authMessage}
            </p>
          )}

          <button
            className="button button-primary checkout-inline-auth-submit"
            type="submit"
            disabled={authBusy}
          >
            {authBusy
              ? 'Validando…'
              : authMode === 'register'
                ? 'Crear cuenta y continuar'
                : 'Ingresar y continuar'}
            {!authBusy && <span aria-hidden="true">→</span>}
          </button>
        </form>

        <small className="checkout-inline-auth-note">
          Tu carrito no se pierde. Después de ingresar vas a poder confirmar el
          pedido desde este mismo lugar.
        </small>

        {authMode === 'login' && (
          <a className="checkout-inline-auth-account-link" href="/cuenta">
            ¿Necesitás recuperar tu contraseña? Ir a Mi cuenta
          </a>
        )}
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

      <button
        className="button button-primary checkout-submit"
        type="submit"
        disabled={busy}
      >
        {busy ? 'Registrando pedido…' : 'Confirmar pedido y abrir WhatsApp'}
        {!busy && <span aria-hidden="true">↗</span>}
      </button>

      <small className="checkout-safe-note">
        El precio se valida nuevamente desde el catálogo antes de guardar el pedido.
      </small>
    </form>
  )
}
