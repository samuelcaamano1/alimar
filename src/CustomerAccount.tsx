import { useEffect, useState, type FormEvent } from 'react'
import { alimarLogoDataUrl } from './brand'
import type { CustomerSession } from './customerAccount'
import './App.css'

type AccountOrder = {
  code: string
  trackingToken: string
  status: string
  productionStage: string
  promisedFor: string | null
  knownTotal: string
  agreedTotal: string | null
  createdAt: string
}

type AccountCustomRequest = {
  code: string
  status: string
  requestType: string
  neededDate: string | null
  createdAt: string
}

type AccountOverview = {
  account: CustomerSession
  orders: AccountOrder[]
  customRequests: AccountCustomRequest[]
}

const orderStatusLabels: Record<string, string> = {
  new: 'Recibido',
  contacted: 'Contactado',
  confirmed: 'Confirmado',
  in_progress: 'En proceso',
  ready: 'Listo',
  completed: 'Entregado',
  cancelled: 'Cancelado',
}

const productionLabels: Record<string, string> = {
  not_started: 'Sin iniciar',
  design: 'Diseño / armado',
  awaiting_approval: 'Esperando aprobación',
  materials: 'Preparando materiales',
  production: 'En producción',
  finishing: 'Terminaciones',
  ready_for_delivery: 'Listo para entregar',
}

const requestStatusLabels: Record<string, string> = {
  new: 'Recibida',
  reviewing: 'En revisión',
  quoted: 'Presupuestada',
  closed: 'Cerrada',
}

const requestTypeLabels: Record<string, string> = {
  paper: 'Papelería / impresión',
  '3d': 'Impresión 3D',
  event: 'Evento',
  design: 'Diseño gráfico',
  other: 'Personalizado',
}

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha'
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`)
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function formatMoney(value: string | null) {
  if (value === null) return 'A confirmar'
  const number = Number(value)
  if (!Number.isFinite(number)) return 'A confirmar'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(number)
}

async function responseError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || 'No pudimos completar la operación.'
  } catch {
    return 'No pudimos completar la operación.'
  }
}

function safeNextPath() {
  const candidate = new URLSearchParams(window.location.search).get('next')
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return null
  return candidate
}

export default function CustomerAccount() {
  const [overview, setOverview] = useState<AccountOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function loadOverview() {
    setLoading(true)
    try {
      const response = await fetch('/api/orders?action=account-overview', {
        cache: 'no-store',
      })
      if (response.status === 401) {
        setOverview(null)
        return
      }
      if (!response.ok) throw new Error(await responseError(response))
      setOverview((await response.json()) as AccountOverview)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar tu cuenta.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setMessage('')
    const form = new FormData(event.currentTarget)
    const payload =
      mode === 'register'
        ? {
            name: String(form.get('name') ?? '').trim(),
            phone: String(form.get('phone') ?? '').trim(),
            email: String(form.get('email') ?? '').trim(),
            password: String(form.get('password') ?? ''),
          }
        : {
            email: String(form.get('email') ?? '').trim(),
            password: String(form.get('password') ?? ''),
          }

    try {
      const response = await fetch(
        `/api/orders?action=${mode === 'register' ? 'account-register' : 'account-login'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      if (!response.ok) throw new Error(await responseError(response))

      const next = safeNextPath()
      if (next && next !== '/cuenta') {
        window.location.assign(next)
        return
      }

      await loadOverview()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos iniciar sesión.')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    if (busy) return
    setBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/orders?action=account-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) throw new Error(await responseError(response))
      setOverview(null)
      setMode('login')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos cerrar la sesión.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="customer-account-page">
      <header className="customer-account-header">
        <a className="brand" href="/" aria-label="Alimar, volver a la tienda">
          <img className="brand-logo" src={alimarLogoDataUrl} alt="" />
          <span>Alimar</span>
        </a>
        <a className="button button-secondary" href="/">
          Volver a la tienda
        </a>
      </header>

      <main className="customer-account-main">
        {loading ? (
          <section className="customer-account-card customer-account-loading">
            <strong>Cargando tu cuenta…</strong>
          </section>
        ) : overview ? (
          <>
            <section className="customer-account-hero">
              <div>
                <span className="eyebrow">Mi cuenta</span>
                <h1>Hola, {overview.account.name}.</h1>
                <p>
                  Tus pedidos y solicitudes nuevas quedan reunidos acá para que puedas seguirlos sin buscar códigos.
                </p>
              </div>
              <div className="customer-account-profile">
                <span>{overview.account.email}</span>
                <strong>{overview.account.phone}</strong>
                <button className="button button-secondary" type="button" onClick={() => void logout()} disabled={busy}>
                  {busy ? 'Cerrando…' : 'Cerrar sesión'}
                </button>
              </div>
            </section>

            {message && <p className="customer-account-message">{message}</p>}

            <section className="customer-account-card">
              <div className="customer-account-section-heading">
                <div>
                  <span>Pedidos</span>
                  <h2>Mis PED</h2>
                </div>
                <strong>{overview.orders.length}</strong>
              </div>

              {overview.orders.length === 0 ? (
                <div className="customer-account-empty">
                  <strong>Todavía no hay pedidos en esta cuenta.</strong>
                  <p>Agregá productos al carrito y confirmalos mientras estés conectado.</p>
                  <a className="button button-primary" href="/#catalogo">Ver catálogo</a>
                </div>
              ) : (
                <div className="customer-order-list">
                  {overview.orders.map((order) => (
                    <article className="customer-order-card" key={order.code}>
                      <div className="customer-order-top">
                        <div>
                          <span>{order.code}</span>
                          <strong>{orderStatusLabels[order.status] ?? order.status}</strong>
                        </div>
                        <span className="customer-order-stage">
                          {productionLabels[order.productionStage] ?? order.productionStage}
                        </span>
                      </div>
                      <div className="customer-order-meta">
                        <span>Entrega <strong>{formatDate(order.promisedFor)}</strong></span>
                        <span>Total <strong>{formatMoney(order.agreedTotal ?? order.knownTotal)}</strong></span>
                      </div>
                      <a className="button button-primary" href={`/?pedido=${encodeURIComponent(order.trackingToken)}`}>
                        Ver seguimiento
                      </a>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="customer-account-card">
              <div className="customer-account-section-heading">
                <div>
                  <span>Personalizados</span>
                  <h2>Mis solicitudes</h2>
                </div>
                <strong>{overview.customRequests.length}</strong>
              </div>

              {overview.customRequests.length === 0 ? (
                <div className="customer-account-empty compact">
                  <p>No tenés solicitudes personalizadas nuevas en esta cuenta.</p>
                </div>
              ) : (
                <div className="customer-request-account-list">
                  {overview.customRequests.map((request) => (
                    <article key={request.code}>
                      <div>
                        <span>{request.code}</span>
                        <strong>{requestTypeLabels[request.requestType] ?? request.requestType}</strong>
                      </div>
                      <span>{requestStatusLabels[request.status] ?? request.status}</span>
                      <small>Necesario: {formatDate(request.neededDate)}</small>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <p className="customer-account-legacy-note">
              Los pedidos anteriores a la creación de cuentas siguen funcionando con su enlace de seguimiento original; no se reasignan automáticamente por seguridad.
            </p>
          </>
        ) : (
          <section className="customer-auth-layout">
            <div className="customer-auth-copy">
              <span className="eyebrow">Cuenta Alimar</span>
              <h1>Pedí y seguí todo desde un solo lugar.</h1>
              <p>
                Iniciá sesión para confirmar compras, enviar pedidos personalizados y ver tus PED sin guardar códigos aparte.
              </p>
              <ul>
                <li>Tus pedidos quedan vinculados a tu cuenta.</li>
                <li>Entrás al seguimiento con un botón.</li>
                <li>La administración permanece separada y privada.</li>
              </ul>
            </div>

            <div className="customer-auth-card">
              <div className="customer-auth-tabs" role="tablist" aria-label="Acceso a la cuenta">
                <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setMessage('') }}>
                  Ingresar
                </button>
                <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => { setMode('register'); setMessage('') }}>
                  Crear cuenta
                </button>
              </div>

              <form onSubmit={submitAuth}>
                {mode === 'register' && (
                  <>
                    <label>
                      Nombre
                      <input name="name" autoComplete="name" maxLength={100} required />
                    </label>
                    <label>
                      WhatsApp
                      <input name="phone" type="tel" autoComplete="tel" maxLength={40} required />
                    </label>
                  </>
                )}

                <label>
                  Email
                  <input name="email" type="email" autoComplete="email" maxLength={160} required />
                </label>
                <label>
                  Contraseña
                  <input
                    name="password"
                    type="password"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    minLength={mode === 'register' ? 8 : undefined}
                    maxLength={128}
                    required
                  />
                  {mode === 'register' && <small>Mínimo 8 caracteres.</small>}
                </label>

                {message && <p className="customer-auth-error">{message}</p>}

                <button className="button button-primary" type="submit" disabled={busy}>
                  {busy
                    ? 'Procesando…'
                    : mode === 'register'
                      ? 'Crear cuenta y continuar'
                      : 'Ingresar'}
                </button>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
