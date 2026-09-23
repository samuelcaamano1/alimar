import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { alimarLogoDataUrl } from './brand'
import { compressAdminImage } from './adminImage'
import AdminOrdersPanel from './AdminOrdersPanel'
import AdminCostCalculator from './AdminCostCalculator'
import AdminCustomRequests, { type CustomRequest } from './AdminCustomRequests'
import AdminCategoriesPanel from './AdminCategoriesPanel'
import AdminProductVariants from './AdminProductVariants'
import AdminProductGallery from './AdminProductGallery'
import AdminProductCustomizations from './AdminProductCustomizations'
import './admin.css'

type AdminCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number
}

type AdminProduct = {
  id: string
  category_id: string | null
  sort_order: number
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

type ImageState = {
  dataUrl: string
  label: string
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

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  return `${Math.round(value / 1024)} KB`
}

export default function AdminApp() {
  const [quoteSource, setQuoteSource] = useState<CustomRequest | null>(null)
  const [customRequestRefreshToken, setCustomRequestRefreshToken] = useState(0)
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [catalog, setCatalog] = useState<AdminCatalog>(emptyCatalog)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [createPricingMode, setCreatePricingMode] =
    useState<'fixed' | 'from' | 'quote'>('fixed')
  const [createImage, setCreateImage] = useState<ImageState | null>(null)
  const [createImageBusy, setCreateImageBusy] = useState(false)

  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null)
  const [editPricingMode, setEditPricingMode] =
    useState<'fixed' | 'from' | 'quote'>('fixed')
  const [editImage, setEditImage] = useState<ImageState | null>(null)
  const [editImageAction, setEditImageAction] =
    useState<'keep' | 'replace' | 'remove'>('keep')
  const [editImageBusy, setEditImageBusy] = useState(false)
  const [productOrderBusyId, setProductOrderBusyId] = useState<string | null>(null)

  const loadCatalog = useCallback(async () => {
    const response = await fetch('/api/admin/catalog', {
      cache: 'no-store',
    })

    if (response.status === 401) {
      setSession((current) => ({
        configured: current?.configured ?? true,
        authenticated: false,
      }))
      throw new Error('Tu sesión venció. Volvé a iniciar sesión.')
    }

    if (!response.ok) throw new Error(await responseMessage(response))

    setCatalog((await response.json()) as AdminCatalog)
  }, [])

  useEffect(() => {
    let active = true

    async function loadSession() {
      let data: SessionResponse

      try {
        const response = await fetch('/api/admin/session', { cache: 'no-store' })
        if (!response.ok) throw new Error('No se pudo comprobar la sesión.')

        data = (await response.json()) as SessionResponse
      } catch (error) {
        if (!active) return
        setMessage(error instanceof Error ? error.message : 'Error de sesión.')
        setSession({ configured: false, authenticated: false })
        return
      }

      if (!active) return
      setSession(data)

      if (data.authenticated) {
        try {
          await loadCatalog()
        } catch (error) {
          if (!active) return
          setMessage(
            error instanceof Error
              ? error.message
              : 'La sesión está activa, pero no se pudo cargar el catálogo.',
          )
        }
      }
    }

    void loadSession()

    return () => {
      active = false
    }
  }, [loadCatalog])

  async function refreshCatalogAfterMutation(successMessage: string) {
    try {
      await loadCatalog()
      setMessage(successMessage)
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'No se pudo actualizar la vista del catálogo.'
      setMessage(`${successMessage} ${detail}`)
    }
  }

  const productsByCategory = useMemo(() => {
    return catalog.categories.map((category) => ({
      category,
      products: catalog.products.filter((product) => product.category_id === category.id),
    }))
  }, [catalog])

  async function compressSelectedImage(
    event: ChangeEvent<HTMLInputElement>,
    target: 'create' | 'edit',
  ) {
    const file = event.target.files?.[0]
    if (!file) return

    const setImageBusy = target === 'create' ? setCreateImageBusy : setEditImageBusy
    setImageBusy(true)
    setMessage('')

    try {
      const result = await compressAdminImage(file)
      const nextImage = {
        dataUrl: result.dataUrl,
        label: `${result.width}×${result.height} · ${formatBytes(result.outputBytes)}`,
      }

      if (target === 'create') {
        setCreateImage(nextImage)
      } else {
        setEditImage(nextImage)
        setEditImageAction('replace')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo procesar la imagen.')
    } finally {
      setImageBusy(false)
      event.target.value = ''
    }
  }

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

      try {
        await loadCatalog()
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'La sesión se inició, pero no se pudo cargar el catálogo.',
        )
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión.')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/logout', { method: 'POST' })
      if (!response.ok) throw new Error(await responseMessage(response))

      setCatalog(emptyCatalog)
      setSession((current) => ({
        configured: current?.configured ?? true,
        authenticated: false,
      }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const formElement = event.currentTarget
    const form = new FormData(formElement)

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

      formElement.reset()
      await refreshCatalogAfterMutation('Categoría creada.')
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

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const pastedImage = String(form.get('imageUrl') ?? '').trim()
    const imageUrl = createImage?.dataUrl || pastedImage || null

    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: form.get('categoryId'),
          name: form.get('name'),
          shortDescription: form.get('shortDescription'),
          kind: form.get('kind'),
          pricingMode: createPricingMode,
          basePrice: createPricingMode === 'quote' ? null : form.get('basePrice'),
          imageUrl,
          customizationAllowed: form.get('customizationAllowed') === 'on',
          featured: form.get('featured') === 'on',
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      formElement.reset()
      setCreatePricingMode('fixed')
      setCreateImage(null)
      await refreshCatalogAfterMutation('Producto agregado al catálogo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el producto.')
    } finally {
      setBusy(false)
    }
  }

  function openEdit(product: AdminProduct) {
    setEditingProduct(product)
    setEditPricingMode(product.pricing_mode)
    setEditImage(null)
    setEditImageAction('keep')
    setMessage('')
  }

  function closeEdit() {
    if (busy || editImageBusy) return
    setEditingProduct(null)
    setEditImage(null)
    setEditImageAction('keep')
  }

  async function handleEditProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingProduct) return

    setBusy(true)
    setMessage('')

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch(
        `/api/admin/products?id=${encodeURIComponent(editingProduct.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: form.get('categoryId'),
            name: form.get('name'),
            shortDescription: form.get('shortDescription'),
            kind: form.get('kind'),
            pricingMode: editPricingMode,
            basePrice: editPricingMode === 'quote' ? null : form.get('basePrice'),
            imageAction: editImageAction,
            imageUrl: editImageAction === 'replace' ? editImage?.dataUrl : null,
            customizationAllowed: form.get('customizationAllowed') === 'on',
            featured: form.get('featured') === 'on',
          }),
        },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      setEditingProduct(null)
      setEditImage(null)
      setEditImageAction('keep')
      await refreshCatalogAfterMutation('Producto actualizado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el producto.')
    } finally {
      setBusy(false)
    }
  }

  async function handleMoveProduct(
    product: AdminProduct,
    siblings: AdminProduct[],
    direction: -1 | 1,
  ) {
    if (!product.category_id) return

    const currentIndex = siblings.findIndex((item) => item.id === product.id)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) return

    const next = [...siblings]
    const [moved] = next.splice(currentIndex, 1)
    next.splice(nextIndex, 0, moved)

    setProductOrderBusyId(product.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/products?action=order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: product.category_id,
          orderedIds: next.map((item) => item.id),
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await refreshCatalogAfterMutation('Orden de productos actualizado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reordenar el producto.')
    } finally {
      setProductOrderBusyId(null)
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

      await refreshCatalogAfterMutation('Producto quitado del catálogo.')
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
            <label className="admin-username-autofill">
              Usuario
              <input
                type="text"
                name="username"
                value="admin"
                autoComplete="username"
                tabIndex={-1}
                readOnly
                aria-hidden="true"
              />
            </label>

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
            Cargá fotos desde tu dispositivo, editá productos y mantené el catálogo actualizado
            sin tocar código.
          </p>
        </section>

        {message && <div className="admin-toast">{message}</div>}

        <AdminCostCalculator
          quoteSource={quoteSource}
          onQuoteSourceConsumed={() => {
            setQuoteSource(null)
            setCustomRequestRefreshToken((current) => current + 1)
          }}
        />

        <AdminCustomRequests
          refreshToken={customRequestRefreshToken}
          onCreateQuote={(request) => {
            setQuoteSource(request)

            requestAnimationFrame(() => {
              document
                .querySelector('.admin-cost-calculator')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
          }}
        />

        <AdminOrdersPanel />

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
                <p>Agregalo al catálogo público y subí su foto desde el dispositivo.</p>
              </div>
            </div>

            {catalog.categories.length === 0 ? (
              <div className="admin-empty">Primero creá al menos una categoría.</div>
            ) : (
              <form className="admin-form admin-product-form" onSubmit={handleAddProduct}>
                <label>
                  Nombre
                  <input
                    name="name"
                    placeholder="Ej. Invitación personalizada"
                    maxLength={120}
                    required
                  />
                </label>

                <label>
                  Categoría
                  <select name="categoryId" required defaultValue="">
                    <option value="" disabled>
                      Elegir categoría
                    </option>
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
                  <select
                    name="pricingMode"
                    value={createPricingMode}
                    onChange={(event) =>
                      setCreatePricingMode(event.target.value as 'fixed' | 'from' | 'quote')
                    }
                  >
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
                    disabled={createPricingMode === 'quote'}
                    required={createPricingMode !== 'quote'}
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

                <div className="admin-span-2 admin-image-field">
                  <span className="admin-field-label">Imagen</span>

                  <label className="admin-file-picker">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => void compressSelectedImage(event, 'create')}
                      disabled={createImageBusy}
                    />
                    <span>{createImageBusy ? 'Procesando…' : 'Elegir foto del dispositivo'}</span>
                  </label>

                  <span className="admin-image-or">o</span>

                  <label>
                    URL HTTPS opcional
                    <input name="imageUrl" placeholder="https://..." disabled={Boolean(createImage)} />
                  </label>

                  {createImage && (
                    <div className="admin-image-preview">
                      <img src={createImage.dataUrl} alt="Vista previa" />
                      <div>
                        <strong>Foto optimizada</strong>
                        <small>{createImage.label}</small>
                        <button type="button" onClick={() => setCreateImage(null)}>
                          Quitar foto
                        </button>
                      </div>
                    </div>
                  )}

                  <small>
                    La foto se reduce automáticamente a WebP antes de enviarse.
                  </small>
                </div>

                <label className="admin-check">
                  <input type="checkbox" name="customizationAllowed" />
                  <span>Permite personalización</span>
                </label>

                <label className="admin-check">
                  <input type="checkbox" name="featured" />
                  <span>Destacar producto</span>
                </label>

                <button
                  className="admin-primary admin-span-2"
                  type="submit"
                  disabled={busy || createImageBusy}
                >
                  Agregar al catálogo
                </button>
              </form>
            )}
          </section>
        </div>

        <AdminCategoriesPanel
          categories={catalog.categories}
          products={catalog.products}
          onChanged={loadCatalog}
        />

        <section className="admin-panel admin-list-panel">
          <div className="admin-panel-heading">
            <span>04</span>
            <div>
              <h2>Catálogo actual</h2>
              <p>{catalog.products.length} productos activos</p>
            </div>
          </div>

          {catalog.products.length === 0 ? (
            <div className="admin-empty">Todavía no hay productos cargados.</div>
          ) : (
            <div className="admin-category-list">
              {productsByCategory.map(({ category, products }) =>
                products.length > 0 ? (
                  <section key={category.id} className="admin-category-group">
                    <h3>{category.name}</h3>

                    <div className="admin-product-list">
                      {products.map((product, productIndex) => (
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

                          <div className="admin-row-actions">
                            <button
                              className="admin-secondary admin-order-arrow"
                              type="button"
                              aria-label={`Subir ${product.name}`}
                              onClick={() => void handleMoveProduct(product, products, -1)}
                              disabled={
                                busy ||
                                productOrderBusyId !== null ||
                                productIndex === 0
                              }
                            >
                              ↑
                            </button>

                            <button
                              className="admin-secondary admin-order-arrow"
                              type="button"
                              aria-label={`Bajar ${product.name}`}
                              onClick={() => void handleMoveProduct(product, products, 1)}
                              disabled={
                                busy ||
                                productOrderBusyId !== null ||
                                productIndex === products.length - 1
                              }
                            >
                              ↓
                            </button>

                            <button
                              className="admin-edit"
                              type="button"
                              onClick={() => openEdit(product)}
                              disabled={busy}
                            >
                              Editar
                            </button>

                            <button
                              className="admin-danger"
                              type="button"
                              onClick={() => handleRemoveProduct(product)}
                              disabled={busy}
                            >
                              Quitar
                            </button>
                          </div>
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

      {editingProduct && (
        <div
          className="admin-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEdit()
          }}
        >
          <section
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-edit-title"
          >
            <button
              className="admin-dialog-close"
              type="button"
              aria-label="Cerrar edición"
              onClick={closeEdit}
              disabled={busy || editImageBusy}
            >
              ×
            </button>

            <div className="admin-dialog-heading">
              <p className="admin-kicker">Editar producto</p>
              <h2 id="admin-edit-title">{editingProduct.name}</h2>
            </div>

            <form className="admin-form admin-product-form" onSubmit={handleEditProduct}>
              <label>
                Nombre
                <input name="name" defaultValue={editingProduct.name} maxLength={120} required />
              </label>

              <label>
                Categoría
                <select
                  name="categoryId"
                  defaultValue={editingProduct.category_id ?? ''}
                  required
                >
                  {catalog.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Tipo
                <select name="kind" defaultValue={editingProduct.kind}>
                  <option value="service">Servicio</option>
                  <option value="product">Producto</option>
                </select>
              </label>

              <label>
                Precio
                <select
                  name="pricingMode"
                  value={editPricingMode}
                  onChange={(event) =>
                    setEditPricingMode(event.target.value as 'fixed' | 'from' | 'quote')
                  }
                >
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
                  defaultValue={editingProduct.base_price ?? ''}
                  disabled={editPricingMode === 'quote'}
                  required={editPricingMode !== 'quote'}
                />
              </label>

              <label className="admin-span-2">
                Descripción breve
                <textarea
                  name="shortDescription"
                  defaultValue={editingProduct.short_description ?? ''}
                  maxLength={280}
                  rows={3}
                />
              </label>

              <div className="admin-span-2 admin-image-field">
                <span className="admin-field-label">Imagen</span>

                <div className="admin-edit-image-current">
                  {editImageAction === 'replace' && editImage ? (
                    <img src={editImage.dataUrl} alt="Nueva vista previa" />
                  ) : editImageAction === 'remove' ? (
                    <div className="admin-no-image">Sin imagen</div>
                  ) : editingProduct.image_url ? (
                    <img src={editingProduct.image_url} alt="Imagen actual" />
                  ) : (
                    <div className="admin-no-image">Sin imagen</div>
                  )}
                </div>

                <div className="admin-image-actions">
                  <label className="admin-file-picker">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => void compressSelectedImage(event, 'edit')}
                      disabled={editImageBusy}
                    />
                    <span>{editImageBusy ? 'Procesando…' : 'Reemplazar foto'}</span>
                  </label>

                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => {
                      setEditImage(null)
                      setEditImageAction('remove')
                    }}
                    disabled={editImageBusy}
                  >
                    Quitar imagen
                  </button>

                  {editImageAction !== 'keep' && (
                    <button
                      type="button"
                      className="admin-text-button"
                      onClick={() => {
                        setEditImage(null)
                        setEditImageAction('keep')
                      }}
                    >
                      Conservar original
                    </button>
                  )}
                </div>

                {editImage && <small>Nueva foto: {editImage.label}</small>}
              </div>

              <label className="admin-check">
                <input
                  type="checkbox"
                  name="customizationAllowed"
                  defaultChecked={editingProduct.customization_allowed}
                />
                <span>Permite personalización</span>
              </label>

              <label className="admin-check">
                <input
                  type="checkbox"
                  name="featured"
                  defaultChecked={editingProduct.featured}
                />
                <span>Destacar producto</span>
              </label>

              <div className="admin-dialog-actions admin-span-2">
                <button
                  className="admin-secondary"
                  type="button"
                  onClick={closeEdit}
                  disabled={busy || editImageBusy}
                >
                  Cancelar
                </button>

                <button
                  className="admin-primary"
                  type="submit"
                  disabled={busy || editImageBusy}
                >
                  Guardar cambios
                </button>
              </div>
            </form>

            <AdminProductCustomizations
              key={`customizations-${editingProduct.id}`}
              product={editingProduct}
            />

            <AdminProductGallery
              key={`gallery-${editingProduct.id}`}
              product={editingProduct}
              onChanged={loadCatalog}
            />

            <AdminProductVariants
              key={editingProduct.id}
              product={editingProduct}
            />
          </section>
        </div>
      )}
    </div>
  )
}
