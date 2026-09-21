import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { alimarLogoDataUrl } from './brand'
import './admin.css'

type AdminCategory = {
  id: string
  name: string
  slug: string
  description: string | null
}

type AdminProduct = {
  id: string
  category_id: string | null
  name: string
  slug: string
  short_description: string | null
  kind: 'service' | 'product'
  pricing_mode: 'fixed' | 'from' | 'quote'
  base_price: string | null
  customization_allowed: boolean
  featured: boolean
  image_url: string | null
}

type AdminCatalog = {
  categories: AdminCategory[]
  products: AdminProduct[]
}

type SessionResponse = {
  configured: boolean
  authenticated: boolean
}

const emptyCatalog: AdminCatalog = {
  categories: [],
  products: [],
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

function money(value: string | null) {
  if (!value) return 'Consultar'
  const amount = Number(value)

  if (!Number.isFinite(amount)) return 'Consultar'

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function AdminApp() {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [catalog, setCatalog] = useState<AdminCatalog>(emptyCatalog)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const loadCatalog = useCallback(async () => {
    const response = await fetch('/api/admin/catalog', {
      cache: 'no-store',
    })

    if (response.status === 401) {
      setSession((current) => ({
        configured: current?.configured ?? true,
        authenticated: false,
      }))
      return
    }

    if (!response.ok) throw new Error(await responseMessage(response))

    setCatalog((await response.json()) as AdminCatalog)
  }, [])

  useEffect(() => {
    let active = true

    async function loadSession() {
      try {
        const response = await fetch('/api/admin/session', { cache: 'no-store' })
        if (!response.ok) throw new Error('No se pudo comprobar la sesión.')

        const data = (await response.json()) as SessionResponse
        if (!active) return

        setSession(data)

        if (data.authenticated) {
          await loadCatalog()
        }
      } catch (error) {
        if (!active) return
        setMessage(error instanceof Error ? error.message : 'Error de sesión.')
        setSession({ configured: false, authenticated: false })
      }
    }

    void loadSession()

    return () => {
      active = false
    }
  }, [loadCatalog])

  const productsByCategory = useMemo(() => {
    return catalog.categories.map((category) => ({
      category,
      products: catalog.products.filter((product) => product.category_id === category.id),
    }))
  }, [catalog])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setPassword('')
      setSession({ configured: true, authenticated: true })
      await loadCatalog()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión.')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setBusy(true)

    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } finally {
      setCatalog(emptyCatalog)
      setSession((current) => ({
        configured: current?.configured ?? true,
        authenticated: false,
      }))
      setBusy(false)
    }
  }

  async function handleAddCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          description: form.get('description'),
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      event.currentTarget.reset()
      setMessage('Categoría creada.')
      await loadCatalog()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la categoría.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const form = new FormData(event.currentTarget)
    const pricingMode = String(form.get('pricingMode') ?? 'fixed')

    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: form.get('categoryId'),
          name: form.get('name'),
          shortDescription: form.get('shortDescription'),
          kind: form.get('kind'),
          pricingMode,
          basePrice: pricingMode === 'quote' ? null : form.get('basePrice'),
          imageUrl: form.get('imageUrl'),
          customizationAllowed: form.get('customizationAllowed') === 'on',
          featured: form.get('featured') === 'on',
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      event.currentTarget.reset()
      setMessage('Producto agregado al catálogo.')
      await loadCatalog()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el producto.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveProduct(product: AdminProduct) {
    const confirmed = window.confirm(`¿Quitar "${product.name}" del catálogo?`)
    if (!confirmed) return

    setBusy(true)
    setMessage('')

    try {
      const response = await fetch(`/api/admin/products?id=${encodeURIComponent(product.id)}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setMessage('Producto quitado del catálogo.')
      await loadCatalog()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo quitar el producto.')
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <main className="admin-loading">
        <img src={alimarLogoDataUrl} alt="Alimar" />
        <p>Cargando administración…</p>
      </main>
    )
  }

  if (!session.authenticated) {
    return (
      <main className="admin-login-shell">
        <section className="admin-login-card">
          <img className="admin-login-logo" src={alimarLogoDataUrl} alt="Alimar" />
          <p className="admin-kicker">Administración</p>
          <h1>Catálogo de Alimar</h1>

          {!session.configured && (
            <div className="admin-warning">
              Falta configurar <code>ADMIN_PASSWORD</code> y <code>ADMIN_SESSION_SECRET</code>.
            </div>
          )}

          <form onSubmit={handleLogin}>
            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <button className="admin-primary" type="submit" disabled={busy || !session.configured}>
              Entrar
            </button>
          </form>

          {message && <p className="admin-message">{message}</p>}

          <a href="/">← Volver a la tienda</a>
        </section>
      </main>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a href="/" className="admin-brand">
          <img src={alimarLogoDataUrl} alt="" />
          <span>
            <strong>Alimar</strong>
            <small>Administración</small>
          </span>
        </a>

        <div className="admin-header-actions">
          <a href="/" target="_blank" rel="noreferrer">
            Ver tienda ↗
          </a>
          <button type="button" onClick={handleLogout} disabled={busy}>
            Salir
          </button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-hero">
          <div>
            <p className="admin-kicker">Catálogo dinámico</p>
            <h1>Productos y servicios</h1>
          </div>
          <p>
            Los cambios se guardan directamente en Neon. Quitar un producto lo oculta de la tienda
            sin destruir su registro.
          </p>
        </section>

        {message && <div className="admin-toast">{message}</div>}

        <div className="admin-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <span>01</span>
              <div>
                <h2>Nueva categoría</h2>
                <p>Creá las secciones que después vas a usar para organizar productos.</p>
              </div>
            </div>

            <form className="admin-form" onSubmit={handleAddCategory}>
              <label>
                Nombre
                <input name="name" placeholder="Ej. Cumpleaños" maxLength={80} required />
              </label>

              <label>
                Descripción
                <textarea
                  name="description"
                  placeholder="Descripción breve de la categoría"
                  maxLength={240}
                  rows={3}
                />
              </label>

              <button className="admin-primary" type="submit" disabled={busy}>
                Crear categoría
              </button>
            </form>
          </section>

          <section className="admin-panel admin-panel-product">
            <div className="admin-panel-heading">
              <span>02</span>
              <div>
                <h2>Nuevo producto</h2>
                <p>Agregalo al catálogo público sin tocar código.</p>
              </div>
            </div>

            {catalog.categories.length === 0 ? (
              <div className="admin-empty">
                Primero creá al menos una categoría.
              </div>
            ) : (
              <form className="admin-form admin-product-form" onSubmit={handleAddProduct}>
                <label>
                  Nombre
                  <input name="name" placeholder="Ej. Invitación personalizada" maxLength={120} required />
                </label>

                <label>
                  Categoría
                  <select name="categoryId" required defaultValue="">
                    <option value="" disabled>Elegir categoría</option>
                    {catalog.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Tipo
                  <select name="kind" defaultValue="service">
                    <option value="service">Servicio</option>
                    <option value="product">Producto</option>
                  </select>
                </label>

                <label>
                  Precio
                  <select name="pricingMode" defaultValue="fixed">
                    <option value="fixed">Precio fijo</option>
                    <option value="from">Desde</option>
                    <option value="quote">A consultar</option>
                  </select>
                </label>

                <label>
                  Importe
                  <input
                    name="basePrice"
                    inputMode="decimal"
                    placeholder="Ej. 15000"
                  />
                </label>

                <label className="admin-span-2">
                  Descripción breve
                  <textarea
                    name="shortDescription"
                    placeholder="Qué incluye y para qué sirve"
                    maxLength={280}
                    rows={3}
                  />
                </label>

                <label className="admin-span-2">
                  Imagen
                  <textarea
                    name="imageUrl"
                    placeholder="https://... o data:image/...;base64,..."
                    rows={3}
                  />
                  <small>En la próxima update agregamos carga de archivo con conversión automática.</small>
                </label>

                <label className="admin-check">
                  <input type="checkbox" name="customizationAllowed" />
                  <span>Permite personalización</span>
                </label>

                <label className="admin-check">
                  <input type="checkbox" name="featured" />
                  <span>Destacar producto</span>
                </label>

                <button className="admin-primary admin-span-2" type="submit" disabled={busy}>
                  Agregar al catálogo
                </button>
              </form>
            )}
          </section>
        </div>

        <section className="admin-panel admin-list-panel">
          <div className="admin-panel-heading">
            <span>03</span>
            <div>
              <h2>Catálogo actual</h2>
              <p>{catalog.products.length} productos activos</p>
            </div>
          </div>

          {catalog.products.length === 0 ? (
            <div className="admin-empty">
              Todavía no hay productos cargados.
            </div>
          ) : (
            <div className="admin-category-list">
              {productsByCategory.map(({ category, products }) =>
                products.length > 0 ? (
                  <section key={category.id} className="admin-category-group">
                    <h3>{category.name}</h3>
                    <div className="admin-product-list">
                      {products.map((product) => (
                        <article className="admin-product-row" key={product.id}>
                          <div className="admin-product-thumb">
                            {product.image_url ? (
                              <img src={product.image_url} alt="" />
                            ) : (
                              <span>A</span>
                            )}
                          </div>

                          <div className="admin-product-info">
                            <span>{product.kind === 'service' ? 'Servicio' : 'Producto'}</span>
                            <strong>{product.name}</strong>
                            <small>
                              {product.pricing_mode === 'quote'
                                ? 'Consultar'
                                : product.pricing_mode === 'from'
                                  ? `Desde ${money(product.base_price)}`
                                  : money(product.base_price)}
                            </small>
                          </div>

                          <button
                            className="admin-danger"
                            type="button"
                            onClick={() => handleRemoveProduct(product)}
                            disabled={busy}
                          >
                            Quitar
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null,
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
