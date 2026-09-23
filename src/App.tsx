import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { alimarLogoDataUrl } from './brand'
import { site } from './site'
import CheckoutForm from './CheckoutForm'
import {
  clearRecoveredOrder,
  loadRecoveredOrder,
  recoveryWhatsappMessage,
  type RecoveredOrder,
} from './orderRecovery'
import './App.css'

type CatalogVariant = {
  id: string
  name: string
  priceOverride: string | null
}

type CatalogImage = {
  id: string
  url: string
  alt_text: string | null
  is_primary: boolean
}

type CatalogCustomizationField = {
  id: string
  label: string
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select'
  placeholder: string | null
  options: string[]
  required: boolean
  maxLength: number
}

type CartCustomizationValue = {
  fieldId: string
  label: string
  value: string
}

type CatalogProduct = {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  kind: 'service' | 'product'
  pricingMode: 'fixed' | 'from' | 'quote'
  basePrice: string | null
  imageUrl: string | null
  customizationAllowed: boolean
  customizationFields: CatalogCustomizationField[]
  variants: CatalogVariant[]
}

type CartItem = CatalogProduct & {
  variantId: string | null
  variantName: string | null
  unitPrice: string | null
  quantity: number
  note: string
  customizations: CartCustomizationValue[]
}

type CatalogCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  products: CatalogProduct[]
}

type CatalogResponse = {
  categories: CatalogCategory[]
}

type CustomRequestSuccess = {
  requestCode: string
  whatsappMessage: string
}

const CART_STORAGE_KEY = 'alimar-cart-v1'

function loadStoredCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((item) => {
      if (
        !item ||
        typeof item.id !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.slug !== 'string' ||
        typeof item.quantity !== 'number' ||
        item.quantity <= 0
      ) {
        return []
      }

      return [
        {
          ...item,
          variants: Array.isArray(item.variants) ? item.variants : [],
          customizationAllowed: item.customizationAllowed === true,
          customizationFields: Array.isArray(item.customizationFields)
            ? item.customizationFields
            : [],
          customizations: Array.isArray(item.customizations)
            ? item.customizations.flatMap((value: unknown) => {
                if (!value || typeof value !== 'object') return []
                const entry = value as Record<string, unknown>
                if (
                  typeof entry.fieldId !== 'string' ||
                  typeof entry.label !== 'string' ||
                  typeof entry.value !== 'string'
                ) {
                  return []
                }

                return [
                  {
                    fieldId: entry.fieldId,
                    label: entry.label,
                    value: entry.value,
                  },
                ]
              })
            : [],
          variantId: typeof item.variantId === 'string' ? item.variantId : null,
          variantName: typeof item.variantName === 'string' ? item.variantName : null,
          unitPrice:
            typeof item.unitPrice === 'string' || item.unitPrice === null
              ? item.unitPrice
              : typeof item.basePrice === 'string'
                ? item.basePrice
                : null,
        } as CartItem,
      ]
    })
  } catch {
    return []
  }
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

function priceForSelection(product: CatalogProduct, variant: CatalogVariant | null) {
  if (product.pricingMode === 'quote') return null
  return variant?.priceOverride ?? product.basePrice
}

function formatSelectionPrice(product: CatalogProduct, variant: CatalogVariant | null) {
  const price = priceForSelection(product, variant)
  if (!price) return 'Consultar'

  const amount = Number(price)
  if (!Number.isFinite(amount)) return 'Consultar'

  const value = formatAmount(amount)

  return product.pricingMode === 'from' && !variant?.priceOverride
    ? `Desde ${value}`
    : value
}

function formatCartItemPrice(item: CartItem) {
  if (!item.unitPrice) return 'Consultar'

  const amount = Number(item.unitPrice)
  if (!Number.isFinite(amount)) return 'Consultar'

  const value = formatAmount(amount)
  return item.pricingMode === 'from' ? `Desde ${value}` : value
}

function formatCartLinePrice(item: CartItem) {
  if (!item.unitPrice) return 'Consultar'

  const unitPrice = Number(item.unitPrice)
  if (!Number.isFinite(unitPrice)) return 'Consultar'

  return formatAmount(unitPrice * item.quantity)
}

function customizationSignature(customizations: CartCustomizationValue[]) {
  return [...customizations]
    .sort((left, right) => left.fieldId.localeCompare(right.fieldId))
    .map((item) => `${item.fieldId}=${encodeURIComponent(item.value)}`)
    .join('&')
}

function cartItemKey(
  item: Pick<CartItem, 'id' | 'variantId' | 'customizations'>,
) {
  return `${item.id}:${item.variantId ?? 'base'}:${customizationSignature(item.customizations)}`
}

const serviceLines = [
  {
    number: '01',
    title: 'Diseño gráfico',
    text: 'Piezas visuales pensadas para comunicar, celebrar y destacar.',
  },
  {
    number: '02',
    title: 'Papelería',
    text: 'Invitaciones, detalles y piezas personalizadas para cada ocasión.',
  },
  {
    number: '03',
    title: 'Eventos',
    text: 'Diseño y producción creativa para cumpleaños y momentos especiales.',
  },
  {
    number: '04',
    title: 'Impresión 3D',
    text: 'Objetos y detalles físicos que llevan una idea a otra dimensión.',
  },
]

function formatPrice(product: CatalogProduct) {
  if (product.pricingMode === 'quote') return 'Consultar'

  const priceSources =
    product.variants.length > 0
      ? product.variants.map((variant) => variant.priceOverride ?? product.basePrice)
      : [product.basePrice]

  const amounts = priceSources
    .map((value) => (value === null ? Number.NaN : Number(value)))
    .filter((value) => Number.isFinite(value) && value >= 0)

  if (amounts.length === 0) return 'Consultar'

  const minimum = Math.min(...amounts)
  const formatted = formatAmount(minimum)
  const hasOptions = product.variants.length > 0

  return product.pricingMode === 'from' || hasOptions ? `Desde ${formatted}` : formatted
}

function catalogPriceLabel(product: CatalogProduct) {
  if (product.variants.length === 0) return formatPrice(product)

  const label = product.variants.length === 1 ? '1 opción' : `${product.variants.length} opciones`
  return `${formatPrice(product)} · ${label}`
}

function productWhatsappUrl(product: CatalogProduct, variant: CatalogVariant | null = null) {
  const price = formatSelectionPrice(product, variant)
  const variantLabel = variant ? ` · ${variant.name}` : ''

  return site.whatsappUrlFor(
    `Hola, quiero consultar por "${product.name}${variantLabel}" (${price}).`,
  )
}

function App() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [selectedCustomizationValues, setSelectedCustomizationValues] = useState<
    Record<string, string>
  >({})
  const [selectedCustomizationMessage, setSelectedCustomizationMessage] = useState('')
  const [productImages, setProductImages] = useState<CatalogImage[]>([])
  const [selectedProductImageUrl, setSelectedProductImageUrl] = useState('')
  const [cart, setCart] = useState<CartItem[]>(() => loadStoredCart())
  const [cartOpen, setCartOpen] = useState(false)
  const [recoveredOrder, setRecoveredOrder] = useState<RecoveredOrder | null>(() =>
    loadRecoveredOrder(),
  )
  const [customRequestOpen, setCustomRequestOpen] = useState(false)
  const [customRequestId, setCustomRequestId] = useState('')
  const [customRequestBusy, setCustomRequestBusy] = useState(false)
  const [customRequestMessage, setCustomRequestMessage] = useState('')
  const [customRequestSuccess, setCustomRequestSuccess] =
    useState<CustomRequestSuccess | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCatalog() {
      try {
        const response = await fetch('/api/catalog', { signal: controller.signal })
        if (!response.ok) throw new Error('Catalog request failed')

        const data = (await response.json()) as CatalogResponse
        setCatalog(data.categories)
        setCatalogState('ready')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setCatalogState('error')
      }
    }

    loadCatalog()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    try {
      const persistedCart = cart.map((item) => ({
        ...item,
        imageUrl: item.imageUrl?.startsWith('data:') ? null : item.imageUrl,
        customizationFields: [],
        variants: [],
      }))

      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(persistedCart))
    } catch {
      // Cart persistence is best-effort. The in-memory cart remains usable.
    }
  }, [cart])

  useEffect(() => {
    if (!selectedProduct) {
      setProductImages([])
      setSelectedProductImageUrl('')
      return
    }

    const controller = new AbortController()
    setProductImages([])
    setSelectedProductImageUrl(selectedProduct.imageUrl ?? '')

    fetch(`/api/catalog?view=images&productId=${encodeURIComponent(selectedProduct.id)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Gallery request failed')
        return (await response.json()) as { images: CatalogImage[] }
      })
      .then((data) => {
        if (controller.signal.aborted) return

        setProductImages(data.images)
        const cover = data.images.find((image) => image.is_primary) ?? data.images[0]
        setSelectedProductImageUrl(cover?.url ?? selectedProduct.imageUrl ?? '')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setProductImages([])
      })

    return () => controller.abort()
  }, [selectedProduct])

  const cartCount = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart],
  )

  const cartKnownTotal = useMemo(
    () =>
      cart.reduce((total, item) => {
        if (!item.unitPrice) return total

        const price = Number(item.unitPrice)
        return Number.isFinite(price) ? total + price * item.quantity : total
      }, 0),
    [cart],
  )

  const cartHasQuote = useMemo(
    () => cart.some((item) => !item.unitPrice),
    [cart],
  )

  function openProduct(product: CatalogProduct) {
    setSelectedProduct(product)
    setSelectedVariantId(product.variants.length === 1 ? product.variants[0].id : '')
    setSelectedCustomizationValues({})
    setSelectedCustomizationMessage('')
  }

  function addToCart(product: CatalogProduct, variantId: string) {
    const variant = product.variants.find((item) => item.id === variantId) ?? null

    if (product.variants.length > 0 && !variant) return

    const missingCustomization = product.customizationFields.find(
      (field) =>
        product.customizationAllowed &&
        field.required &&
        !(selectedCustomizationValues[field.id] ?? '').trim(),
    )

    if (missingCustomization) {
      setSelectedCustomizationMessage(
        `Completá "${missingCustomization.label}" antes de agregar el producto.`,
      )
      return
    }

    const customizations = product.customizationAllowed
      ? product.customizationFields.flatMap((field) => {
          const value = (selectedCustomizationValues[field.id] ?? '').trim()
          return value
            ? [
                {
                  fieldId: field.id,
                  label: field.label,
                  value,
                },
              ]
            : []
        })
      : []

    setSelectedCustomizationMessage('')

    const nextItem: CartItem = {
      ...product,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      unitPrice: priceForSelection(product, variant),
      quantity: 1,
      note: '',
      customizations,
    }

    const key = cartItemKey(nextItem)

    setCart((current) => {
      const existing = current.find((item) => cartItemKey(item) === key)

      if (existing) {
        return current.map((item) =>
          cartItemKey(item) === key
            ? { ...item, quantity: Math.min(item.quantity + 1, 99) }
            : item,
        )
      }

      return [...current, nextItem]
    })

    setSelectedProduct(null)
    setSelectedVariantId('')
    setSelectedCustomizationValues({})
    setSelectedCustomizationMessage('')
    setCartOpen(true)
  }

  function changeCartQuantity(itemKey: string, delta: number) {
    setCart((current) =>
      current.flatMap((item) => {
        if (cartItemKey(item) !== itemKey) return [item]

        const quantity = item.quantity + delta
        return quantity > 0 ? [{ ...item, quantity: Math.min(quantity, 99) }] : []
      }),
    )
  }

  function updateCartNote(itemKey: string, note: string) {
    setCart((current) =>
      current.map((item) =>
        cartItemKey(item) === itemKey ? { ...item, note: note.slice(0, 240) } : item,
      ),
    )
  }

  function removeCartItem(itemKey: string) {
    setCart((current) => current.filter((item) => cartItemKey(item) !== itemKey))
  }

  function openCustomRequest() {
    setCustomRequestId(crypto.randomUUID())
    setCustomRequestMessage('')
    setCustomRequestSuccess(null)
    setCustomRequestOpen(true)
  }

  async function submitCustomRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formElement = event.currentTarget
    const form = new FormData(formElement)

    setCustomRequestBusy(true)
    setCustomRequestMessage('')

    try {
      const response = await fetch('/api/orders?action=custom-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: customRequestId || crypto.randomUUID(),
          customerName: form.get('customerName'),
          customerPhone: form.get('customerPhone'),
          requestType: form.get('requestType'),
          quantity: form.get('quantity'),
          neededDate: form.get('neededDate'),
          dimensions: form.get('dimensions'),
          theme: form.get('theme'),
          description: form.get('description'),
          referenceUrl: form.get('referenceUrl'),
        }),
      })

      const data = (await response.json()) as {
        error?: string
        requestCode?: string
        whatsappMessage?: string
      }

      if (!response.ok) {
        throw new Error(data.error || 'No pudimos guardar tu solicitud.')
      }

      if (!data.requestCode || !data.whatsappMessage) {
        throw new Error('La solicitud se guardó, pero no pudimos recuperar el comprobante.')
      }

      setCustomRequestSuccess({
        requestCode: data.requestCode,
        whatsappMessage: data.whatsappMessage,
      })
      setCustomRequestMessage('')
      formElement.reset()
    } catch (error) {
      setCustomRequestMessage(
        error instanceof Error ? error.message : 'No pudimos guardar tu solicitud.',
      )
    } finally {
      setCustomRequestBusy(false)
    }
  }

  const featuredProducts = useMemo(() => {
    const source =
      activeCategory === 'all'
        ? catalog
        : catalog.filter((category) => category.slug === activeCategory)

    return source.flatMap((category) => category.products)
  }, [catalog, activeCategory])

  const selectedVariant =
    selectedProduct?.variants.find((variant) => variant.id === selectedVariantId) ?? null

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Alimar, inicio">
          <img className="brand-logo" src={alimarLogoDataUrl} alt="" />
          <span>Alimar</span>
        </a>

        <nav className="main-nav" aria-label="Navegación principal">
          <a href="#servicios">Qué hacemos</a>
          <a href="#catalogo">Catálogo</a>
          <a href="#como-trabajamos">Cómo trabajamos</a>
        </nav>

        
        <details className="mobile-menu">
          <summary>Menú</summary>
          <div className="mobile-menu-panel">
            <a href="#servicios">Qué hacemos</a>
            <a href="#catalogo">Catálogo</a>
            <a href="#como-trabajamos">Cómo trabajamos</a>
            <a href="/admin">
              Repositorio
            </a>
            <a href={site.instagramUrl} target="_blank" rel="noreferrer">
              Instagram ↗
            </a>
          </div>
        </details>

        <div className="header-actions">
          <a className="repository-cta" href="/admin">
            Repositorio
            <span aria-hidden="true">→</span>
          </a>

          <a
            className="header-cta"
            href={site.instagramUrl}
            target="_blank"
            rel="noreferrer"
          >
            Instagram
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main>
        <section className="hero-section" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow">Diseño · Papel · Detalles · 3D</p>
            <h1>
              Ideas que se vuelven
              <span> Recuerdos</span>
            </h1>
            <p className="hero-description">
              Diseño gráfico, papelería y objetos personalizados hechos con una mirada creativa
              para cumpleaños, eventos y momentos que merecen sentirse únicos.
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href="#catalogo">
                Ver catálogo
                <span aria-hidden="true">↓</span>
              </a>
              <button
                className="button button-secondary"
                type="button"
                onClick={openCustomRequest}
              >
                Quiero algo personalizado
                <span aria-hidden="true">✦</span>
              </button>
            </div>

            <div className="hero-note">
              <span className="hero-note-dot" aria-hidden="true" />
              Pedidos personalizados · Atención directa por WhatsApp
            </div>
          </div>

          <div className="hero-art" aria-label="Composición gráfica de Alimar">
            <img className="hero-brand-logo" src={alimarLogoDataUrl} alt="Logo de Alimar" />
            <div className="paper paper-back">
              <span>hecho</span>
              <strong>para vos</strong>
            </div>
            <div className="paper paper-main">
              <span className="paper-kicker">ALIMAR</span>
              <strong>Diseñar también es celebrar.</strong>
              <span className="paper-signature">ideas + manos + detalle</span>
            </div>
            <div className="paper-sticker">✦</div>
            <div className="paper-tape" aria-hidden="true" />
          </div>
        </section>

        <section className="manifesto-strip" aria-label="Características de Alimar">
          <span>Personalizado</span>
          <i aria-hidden="true">✦</i>
          <span>Hecho con detalle</span>
          <i aria-hidden="true">✦</i>
          <span>Diseño con intención</span>
          <i aria-hidden="true">✦</i>
          <span>Producción artesanal</span>
        </section>

        <section className="section services-section" id="servicios">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Lo que hacemos</p>
              <h2>Una idea, distintas formas de hacerla realidad.</h2>
            </div>
            <p>
              Cada trabajo puede adaptarse al estilo, la ocasión y lo que quieras contar.
            </p>
          </div>

          <div className="service-grid">
            {serviceLines.map((service) => (
              <article className="service-card" key={service.number}>
                <span className="service-number">{service.number}</span>
                <div>
                  <h3>{service.title}</h3>
                  <p>{service.text}</p>
                </div>
                <span className="service-arrow" aria-hidden="true">↗</span>
              </article>
            ))}
          </div>
        </section>

        <section className="section catalog-section" id="catalogo">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Catálogo</p>
              <h2>Elegí tu próximo detalle.</h2>
            </div>
            <p>
              El catálogo se conecta directamente con nuestra base de productos.
            </p>
          </div>

          {catalogState === 'ready' && catalog.length > 0 && (
            <div className="catalog-filters" aria-label="Filtrar por categoría">
              <button
                type="button"
                className={activeCategory === 'all' ? 'is-active' : ''}
                aria-pressed={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
              >
                Todos
              </button>
              {catalog.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={activeCategory === category.slug ? 'is-active' : ''}
                  aria-pressed={activeCategory === category.slug}
                  onClick={() => setActiveCategory(category.slug)}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}

          {catalogState === 'loading' && (
            <div className="product-grid" aria-label="Cargando catálogo">
              {[1, 2, 3].map((item) => (
                <div className="product-card product-card-skeleton" key={item} />
              ))}
            </div>
          )}

          {catalogState === 'error' && (
            <div className="catalog-message">
              <span>Ahora mismo estamos acomodando el catálogo.</span>
              <strong>Podés ver nuestros trabajos y consultarnos por Instagram.</strong>
            </div>
          )}

          {catalogState === 'ready' && featuredProducts.length === 0 && (
            <div className="catalog-empty">
              <div>
                <span className="catalog-empty-label">Muy pronto</span>
                <h3>Estamos preparando la primera selección de Alimar.</h3>
              </div>
              <p>
                La tienda ya está conectada a nuestro catálogo. En el próximo paso vamos a cargar
                los primeros productos reales y sus imágenes.
              </p>
              <a
                className="button button-secondary"
                href={site.instagramUrl}
                target="_blank"
                rel="noreferrer"
              >
                Mientras tanto, ver Instagram ↗
              </a>
            </div>
          )}

          {catalogState === 'ready' && featuredProducts.length > 0 && (
            <div className="product-grid">
              {featuredProducts.map((product) => (
                <button
                  type="button"
                  className="product-card product-card-button"
                  key={product.id}
                  onClick={() => openProduct(product)}
                  aria-label={`Ver detalles de ${product.name}`}
                >
                  <div className="product-image">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span>Alimar</span>
                    )}
                    <span className="product-kind">
                      {product.kind === 'service' ? 'Servicio' : 'Producto'}
                    </span>
                    {product.variants.length > 0 && (
                      <span className="product-options-count">
                        {product.variants.length === 1
                          ? '1 opción'
                          : `${product.variants.length} opciones`}
                      </span>
                    )}
                  </div>
                  <div className="product-content">
                    <h3>{product.name}</h3>
                    {product.shortDescription && <p>{product.shortDescription}</p>}
                    <div className="product-meta">
                      <strong>{catalogPriceLabel(product)}</strong>
                      <span aria-hidden="true">Ver ↗</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="section process-section" id="como-trabajamos">
          <div className="process-intro">
            <p className="eyebrow">Simple de pedir</p>
            <h2>De tu idea a nuestro taller, sin vueltas.</h2>
          </div>

          <ol className="process-list">
            <li>
              <span>01</span>
              <div>
                <strong>Elegís</strong>
                <p>Explorás el catálogo y seleccionás lo que querés.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Personalizás</strong>
                <p>Nos contás los detalles necesarios para preparar tu pedido.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Coordinamos</strong>
                <p>Registramos el pedido y continuamos la conversación por WhatsApp.</p>
              </div>
            </li>
          </ol>
        </section>

        {customRequestOpen && (
          <div className="custom-request-overlay" role="presentation">
            <section
              className="custom-request-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="custom-request-title"
            >
              <header className="custom-request-header">
                <div>
                  <p className="eyebrow">Proyecto a medida</p>
                  <h2 id="custom-request-title">Contanos qué imaginaste.</h2>
                  <p>
                    No necesitás saber todos los detalles. Con esta información podemos entender
                    la idea y preparar un presupuesto.
                  </p>
                </div>

                <button
                  type="button"
                  className="custom-request-close"
                  onClick={() => setCustomRequestOpen(false)}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </header>

              {customRequestSuccess ? (
                <div className="custom-request-success">
                  <span>Solicitud recibida</span>
                  <strong>{customRequestSuccess.requestCode}</strong>
                  <p>
                    Ya quedó registrada en Alimar. Podés continuar por WhatsApp usando el mismo código.
                  </p>

                  <div>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => setCustomRequestOpen(false)}
                    >
                      Cerrar
                    </button>
                    <a
                      className="button button-primary"
                      href={site.whatsappUrlFor(customRequestSuccess.whatsappMessage)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Continuar por WhatsApp ↗
                    </a>
                  </div>
                </div>
              ) : (
                <form className="custom-request-form" onSubmit={submitCustomRequest}>
                  <div className="custom-request-fields">
                    <label>
                      ¿Qué necesitás?
                      <select name="requestType" defaultValue="paper" required>
                        <option value="paper">Papelería / impresión</option>
                        <option value="3d">Impresión 3D</option>
                        <option value="event">Evento / cumpleaños</option>
                        <option value="design">Diseño gráfico</option>
                        <option value="other">Otro personalizado</option>
                      </select>
                    </label>

                    <label>
                      Cantidad aproximada
                      <input
                        name="quantity"
                        type="number"
                        min={1}
                        max={9999}
                        placeholder="Ej. 30"
                      />
                    </label>

                    <label>
                      ¿Para cuándo lo necesitás?
                      <input name="neededDate" type="date" />
                    </label>

                    <label>
                      Medidas aproximadas
                      <input name="dimensions" maxLength={120} placeholder="Ej. A5, 10 × 15 cm..." />
                    </label>

                    <label className="custom-request-span-2">
                      Tema, colores o estilo
                      <input
                        name="theme"
                        maxLength={240}
                        placeholder="Ej. dinosaurios, tonos pastel, minimalista..."
                      />
                    </label>

                    <label className="custom-request-span-2">
                      Contanos la idea
                      <textarea
                        name="description"
                        rows={4}
                        minLength={10}
                        maxLength={3000}
                        placeholder="Qué querés hacer, cómo lo imaginás y cualquier detalle importante."
                        required
                      />
                    </label>

                    <label className="custom-request-span-2">
                      Link de referencia
                      <input
                        name="referenceUrl"
                        type="url"
                        maxLength={500}
                        placeholder="https://... (opcional)"
                      />
                    </label>

                    <label>
                      Tu nombre
                      <input
                        name="customerName"
                        autoComplete="name"
                        maxLength={120}
                        required
                      />
                    </label>

                    <label>
                      WhatsApp
                      <input
                        name="customerPhone"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={40}
                        placeholder="Ej. 11 3568 2635"
                        required
                      />
                    </label>
                  </div>

                  {customRequestMessage && (
                    <div className="custom-request-error">{customRequestMessage}</div>
                  )}

                  <footer className="custom-request-footer">
                    <a href={site.whatsappUrl} target="_blank" rel="noreferrer">
                      Prefiero hablar directo por WhatsApp ↗
                    </a>

                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={customRequestBusy}
                    >
                      {customRequestBusy ? 'Enviando…' : 'Enviar solicitud'}
                    </button>
                  </footer>
                </form>
              )}
            </section>
          </div>
        )}

        {selectedProduct && (
          <div
            className="product-dialog-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedProduct(null)
            }}
          >
            <section
              className="product-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-dialog-title"
            >
              <button
                type="button"
                className="product-dialog-close"
                aria-label="Cerrar detalle"
                onClick={() => setSelectedProduct(null)}
              >
                ×
              </button>

              <div className="product-dialog-gallery">
                <div className="product-dialog-image">
                  {selectedProductImageUrl ? (
                    <img src={selectedProductImageUrl} alt={selectedProduct.name} />
                  ) : (
                    <span>Alimar</span>
                  )}
                </div>

                {productImages.length > 1 && (
                  <div className="product-dialog-thumbnails" aria-label="Galería del producto">
                    {productImages.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        className={selectedProductImageUrl === image.url ? 'is-active' : ''}
                        onClick={() => setSelectedProductImageUrl(image.url)}
                        aria-label={`Ver imagen ${index + 1} de ${selectedProduct.name}`}
                      >
                        <img
                          src={image.url}
                          alt={image.alt_text ?? `${selectedProduct.name}, imagen ${index + 1}`}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="product-dialog-content">
                <span className="product-dialog-kind">
                  {selectedProduct.kind === 'service' ? 'Servicio personalizado' : 'Producto'}
                </span>
                <h3 id="product-dialog-title">{selectedProduct.name}</h3>
                {selectedProduct.shortDescription && (
                  <p>{selectedProduct.shortDescription}</p>
                )}
                {selectedProduct.variants.length > 0 && (
                  <label className="product-variant-picker">
                    Elegí una opción
                    <select
                      value={selectedVariantId}
                      onChange={(event) => setSelectedVariantId(event.target.value)}
                    >
                      <option value="" disabled>
                        Seleccionar variante
                      </option>
                      {selectedProduct.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.name} · {formatSelectionPrice(selectedProduct, variant)}
                        </option>
                      ))}
                    </select>

                    <span className="product-variant-selection">
                      {selectedVariant
                        ? `Elegiste: ${selectedVariant.name}`
                        : `Este producto tiene ${selectedProduct.variants.length} opciones.`}
                    </span>
                  </label>
                )}

                {selectedProduct.customizationAllowed &&
                  selectedProduct.customizationFields.length > 0 && (
                    <div className="product-customization-fields">
                      <div className="product-customization-heading">
                        <strong>Personalización</strong>
                        <span>Completá los datos para este producto.</span>
                      </div>
                
                      {selectedProduct.customizationFields.map((field) => {
                        const value = selectedCustomizationValues[field.id] ?? ''
                        const commonProps = {
                          value,
                          required: field.required,
                          onChange: (
                            event:
                              | ChangeEvent<HTMLInputElement>
                              | ChangeEvent<HTMLTextAreaElement>
                              | ChangeEvent<HTMLSelectElement>,
                          ) => {
                            setSelectedCustomizationValues((current) => ({
                              ...current,
                              [field.id]: event.target.value,
                            }))
                            setSelectedCustomizationMessage('')
                          },
                        }
                
                        if (field.fieldType === 'textarea') {
                          return (
                            <label key={field.id}>
                              {field.label}
                              {field.required && <span aria-hidden="true"> *</span>}
                              <textarea
                                {...commonProps}
                                rows={3}
                                maxLength={field.maxLength}
                                placeholder={field.placeholder ?? ''}
                              />
                            </label>
                          )
                        }
                
                        if (field.fieldType === 'select') {
                          return (
                            <label key={field.id}>
                              {field.label}
                              {field.required && <span aria-hidden="true"> *</span>}
                              <select {...commonProps}>
                                <option value="">
                                  {field.placeholder || 'Seleccionar'}
                                </option>
                                {field.options.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )
                        }
                
                        return (
                          <label key={field.id}>
                            {field.label}
                            {field.required && <span aria-hidden="true"> *</span>}
                            <input
                              {...commonProps}
                              type={
                                field.fieldType === 'number'
                                  ? 'number'
                                  : field.fieldType === 'date'
                                    ? 'date'
                                    : 'text'
                              }
                              maxLength={field.fieldType === 'text' ? field.maxLength : undefined}
                              placeholder={field.placeholder ?? ''}
                            />
                          </label>
                        )
                      })}
                
                      {selectedCustomizationMessage && (
                        <p className="product-customization-error">
                          {selectedCustomizationMessage}
                        </p>
                      )}
                    </div>
                  )}
                                <strong className="product-dialog-price" aria-live="polite">
                  {formatSelectionPrice(selectedProduct, selectedVariant)}
                </strong>

                <div className="product-dialog-actions">
                  <button
                    type="button"
                    className="button button-primary product-dialog-cta"
                    onClick={() => addToCart(selectedProduct, selectedVariantId)}
                    disabled={selectedProduct.variants.length > 0 && !selectedVariant}
                  >
                    Agregar al pedido
                    <span aria-hidden="true">+</span>
                  </button>

                  <a
                    className="button button-secondary product-dialog-cta"
                    href={productWhatsappUrl(selectedProduct, selectedVariant)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Consultar
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {recoveredOrder && (
        <aside className="order-recovery" aria-label="Último pedido registrado">
          <div>
            <span>Pedido registrado</span>
            <strong>{recoveredOrder.orderCode}</strong>
            <p>Si WhatsApp no se abrió o cerraste la conversación, podés retomarla desde acá.</p>
          </div>

          <div className="order-recovery-actions">
            <a
              href={site.whatsappUrlFor(recoveryWhatsappMessage(recoveredOrder.orderCode))}
              target="_blank"
              rel="noreferrer"
            >
              Continuar por WhatsApp ↗
            </a>

            <button
              type="button"
              onClick={() => {
                clearRecoveredOrder()
                setRecoveredOrder(null)
              }}
            >
              Ocultar
            </button>
          </div>
        </aside>
      )}

      <button
        type="button"
        className="cart-fab"
        onClick={() => setCartOpen(true)}
        aria-label={`Abrir pedido con ${cartCount} productos`}
      >
        <span>Pedido</span>
        <strong>{cartCount}</strong>
      </button>

      {cartOpen && (
        <div
          className="cart-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCartOpen(false)
          }}
        >
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
          >
            <div className="cart-header">
              <div>
                <span className="cart-kicker">Tu selección</span>
                <h2 id="cart-title">Pedido</h2>
              </div>

              <button
                type="button"
                className="cart-close"
                aria-label="Cerrar pedido"
                onClick={() => setCartOpen(false)}
              >
                ×
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="cart-empty">
                <strong>Todavía no agregaste nada.</strong>
                <p>Explorá el catálogo y sumá productos o servicios a tu pedido.</p>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setCartOpen(false)
                    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                >
                  Ver catálogo
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => {
                    const itemKey = cartItemKey(item)

                    return (
                    <article className="cart-item" key={itemKey}>
                      <div className="cart-item-image">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" />
                        ) : (
                          <span>Alimar</span>
                        )}
                      </div>

                      <div className="cart-item-content">
                        <div className="cart-item-heading">
                          <div>
                            <span>{item.kind === 'service' ? 'Servicio' : 'Producto'}</span>
                            <strong>{item.name}</strong>
                            {item.variantName && (
                              <small className="cart-item-variant">{item.variantName}</small>
                            )}
                          </div>

                          <button
                            type="button"
                            className="cart-remove"
                            onClick={() => removeCartItem(itemKey)}
                          >
                            Quitar
                          </button>
                        </div>

                        <div className="cart-item-row">
                          <div className="cart-quantity" aria-label={`Cantidad de ${item.name}`}>
                            <button
                              type="button"
                              aria-label="Restar uno"
                              onClick={() => changeCartQuantity(itemKey, -1)}
                            >
                              −
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              type="button"
                              aria-label="Sumar uno"
                              onClick={() => changeCartQuantity(itemKey, 1)}
                            >
                              +
                            </button>
                          </div>

                          <div className="cart-item-price">
                            {item.quantity > 1 && item.unitPrice && (
                              <small>{formatCartItemPrice(item)} c/u</small>
                            )}
                            <strong>{formatCartLinePrice(item)}</strong>
                          </div>
                        </div>

                        {item.customizations.length > 0 && (
                          <div className="cart-customizations">
                            {item.customizations.map((customization) => (
                              <small key={customization.fieldId}>
                                <strong>{customization.label}:</strong> {customization.value}
                              </small>
                            ))}
                          </div>
                        )}

                        <label className="cart-note">
                          Personalización / nota
                          <textarea
                            value={item.note}
                            maxLength={240}
                            rows={2}
                            placeholder="Ej. nombre, fecha, colores o detalle especial"
                            onChange={(event) => updateCartNote(itemKey, event.target.value)}
                          />
                        </label>
                      </div>
                    </article>
                    )
                  })}
                </div>

                <div className="cart-summary">
                  <div>
                    <span>Subtotal conocido</span>
                    <strong>{formatAmount(cartKnownTotal)}</strong>
                  </div>

                  {cartHasQuote && (
                    <p>
                      Hay productos a consultar. El precio final se confirma antes de producir.
                    </p>
                  )}

                  <CheckoutForm
                    items={cart.map((item) => ({
                      id: item.id,
                      variantId: item.variantId,
                      quantity: item.quantity,
                      note: item.note,
                      customizations: item.customizations.map((customization) => ({
                        fieldId: customization.fieldId,
                        value: customization.value,
                      })),
                    }))}
                    onCreated={(order) => {
                      window.localStorage.removeItem(CART_STORAGE_KEY)
                      setCart([])
                      setRecoveredOrder(order)
                      setCartOpen(false)
                    }}
                  />
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <footer className="site-footer">
        <div>
          <a className="brand brand-footer" href="#inicio">
            <img className="brand-logo" src={alimarLogoDataUrl} alt="" />
            <span>Alimar</span>
          </a>
          <p>Diseño y detalles personalizados para momentos con identidad.</p>
        </div>

        <div className="footer-links">
          <a href="#servicios">Servicios</a>
          <a href="#catalogo">Catálogo</a>
          <a href={site.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp ↗</a>
          <a
            href={site.instagramUrl}
            target="_blank"
            rel="noreferrer"
          >
            @alimar.imp ↗
          </a>
        </div>

        <span className="footer-copy">© {new Date().getFullYear()} Alimar</span>
      </footer>
    </div>
  )
}

export default App

