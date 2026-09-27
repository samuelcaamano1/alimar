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
  const [accountPanel, setAccountPanel] = useState<'profile' | 'password' | 'claim' | null>(null)

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

  useEffect(() => {
    if (!accountPanel) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setAccountPanel(null)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountPanel, busy])

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

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !overview) return

    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim(),
    }

    setBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/orders?action=account-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await responseError(response))

      const data = (await response.json()) as { account?: CustomerSession }
      if (!data.account) throw new Error('La respuesta de la cuenta fue incompleta.')

      setOverview((current) =>
        current ? { ...current, account: data.account as CustomerSession } : current,
      )
      setAccountPanel(null)
      setMessage('Tus datos quedaron actualizados.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos actualizar tus datos.')
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const currentPassword = String(form.get('currentPassword') ?? '')
    const newPassword = String(form.get('newPassword') ?? '')
    const confirmPassword = String(form.get('confirmPassword') ?? '')

    if (newPassword !== confirmPassword) {
      setMessage('La confirmación de la nueva contraseña no coincide.')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/orders?action=account-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (!response.ok) throw new Error(await responseError(response))

      formElement.reset()
      setAccountPanel(null)
      setMessage('Contraseña actualizada. Cerramos las otras sesiones de tu cuenta.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos cambiar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  async function claimHistoricalOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const orderCode = String(form.get('orderCode') ?? '').trim().toUpperCase()
    const phone = String(form.get('phone') ?? '').trim()

    setBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/orders?action=account-claim-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderCode, phone }),
      })
      if (!response.ok) throw new Error(await responseError(response))

      const data = (await response.json()) as {
        orderCode?: string
        alreadyLinked?: boolean
      }

      formElement.reset()
      setAccountPanel(null)
      await loadOverview()
      setMessage(
        data.alreadyLinked
          ? `${data.orderCode || orderCode} ya estaba vinculado a tu cuenta.`
          : `${data.orderCode || orderCode} quedó vinculado a tu cuenta.`,
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos vincular ese pedido.',
      )
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
      setAccountPanel(null)
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
                <div className="customer-account-profile-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => { setAccountPanel('profile'); setMessage('') }}
                    disabled={busy}
                  >
                    Editar datos
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => { setAccountPanel('password'); setMessage('') }}
                    disabled={busy}
                  >
                    Cambiar contraseña
                  </button>
                  <button className="button button-secondary" type="button" onClick={() => void logout()} disabled={busy}>
                    {busy ? 'Cerrando…' : 'Cerrar sesión'}
                  </button>
                </div>
              </div>
            </section>

            {accountPanel && (
              <div
                className="customer-account-modal-backdrop"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget && !busy) setAccountPanel(null)
                }}
              >
                <section
                  className="customer-account-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="customer-account-modal-title"
                >
                  <div className="customer-account-modal-heading">
                    <div>
                      <span>Mi cuenta</span>
                      <h2 id="customer-account-modal-title">
                        {accountPanel === 'profile'
                          ? 'Editar mis datos'
                          : accountPanel === 'password'
                            ? 'Cambiar contraseña'
                            : 'Vincular pedido anterior'}
                      </h2>
                    </div>
                    <button
                      type="button"
                      className="customer-account-modal-close"
                      onClick={() => setAccountPanel(null)}
                      disabled={busy}
                      aria-label="Cerrar"
                    >
                      ×
                    </button>
                  </div>

                  {accountPanel === 'profile' ? (
                    <form className="customer-account-settings-form" onSubmit={saveProfile}>
                      <label>
                        Nombre
                        <input name="name" autoComplete="name" maxLength={100} defaultValue={overview.account.name} required />
                      </label>
                      <label>
                        WhatsApp
                        <input name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={overview.account.phone} required />
                      </label>
                      <label>
                        Email
                        <input type="email" value={overview.account.email} readOnly aria-readonly="true" />
                        <small>El email identifica tu cuenta y no se cambia desde esta pantalla.</small>
                      </label>
                      <div className="customer-account-modal-actions">
                        <button className="button button-secondary" type="button" onClick={() => setAccountPanel(null)} disabled={busy}>Cancelar</button>
                        <button className="button button-primary" type="submit" disabled={busy}>
                          {busy ? 'Guardando…' : 'Guardar datos'}
                        </button>
                      </div>
                    </form>
                  ) : accountPanel === 'password' ? (
                    <form className="customer-account-settings-form" onSubmit={changePassword}>
                      <label>
                        Contraseña actual
                        <input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required />
                      </label>
                      <label>
                        Nueva contraseña
                        <input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
                        <small>Mínimo 8 caracteres.</small>
                      </label>
                      <label>
                        Repetir nueva contraseña
                        <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
                      </label>
                      <p className="customer-account-security-note">
                        Al cambiarla, las otras sesiones abiertas de esta cuenta se cierran automáticamente.
                      </p>
                      <div className="customer-account-modal-actions">
                        <button className="button button-secondary" type="button" onClick={() => setAccountPanel(null)} disabled={busy}>Cancelar</button>
                        <button className="button button-primary" type="submit" disabled={busy}>
                          {busy ? 'Actualizando…' : 'Cambiar contraseña'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form className="customer-account-settings-form" onSubmit={claimHistoricalOrder}>
                      <p className="customer-account-claim-copy">
                        Si hiciste un pedido antes de crear tu cuenta, podés incorporarlo usando el código PED y el mismo WhatsApp que figura en ese pedido.
                      </p>
                      <label>
                        Código del pedido
                        <input
                          name="orderCode"
                          autoCapitalize="characters"
                          autoComplete="off"
                          maxLength={32}
                          placeholder="PED-2026-XXXXXXXX"
                          required
                        />
                      </label>
                      <label>
                        WhatsApp usado en el pedido
                        <input
                          name="phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          maxLength={40}
                          placeholder="Ej. 11 1234 5678"
                          required
                        />
                      </label>
                      <p className="customer-account-security-note">
                        Sólo se puede vincular un PED que todavía no pertenezca a ninguna cuenta. No movemos pedidos entre usuarios.
                      </p>
                      <div className="customer-account-modal-actions">
                        <button className="button button-secondary" type="button" onClick={() => setAccountPanel(null)} disabled={busy}>Cancelar</button>
                        <button className="button button-primary" type="submit" disabled={busy}>
                          {busy ? 'Verificando…' : 'Vincular pedido'}
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              </div>
            )}

            {message && <p className="customer-account-message">{message}</p>}

            <section className="customer-account-card">
              <div className="customer-account-section-heading">
                <div>
                  <span>Pedidos</span>
                  <h2>Mis PED</h2>
                </div>
                <div className="customer-account-section-actions">
                  <strong>{overview.orders.length}</strong>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => { setAccountPanel('claim'); setMessage('') }}
                    disabled={busy}
                  >
                    Vincular pedido anterior
                  </button>
                </div>
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
              Los pedidos anteriores a la creación de cuentas no se reasignan automáticamente. Si son tuyos, podés vincularlos de forma explícita con el código PED y el WhatsApp original.
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
