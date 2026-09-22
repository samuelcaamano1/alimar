import { useEffect, useMemo, useState } from 'react'
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

type CatalogProduct = {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  kind: 'service' | 'product'
  pricingMode: 'fixed' | 'from' | 'quote'
  basePrice: string | null
  imageUrl: string | null
}

type CartItem = CatalogProduct & {
  quantity: number
  note: string
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

const CART_STORAGE_KEY = 'alimar-cart-v1'

function loadStoredCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (item): item is CartItem =>
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.slug === 'string' &&
        typeof item.quantity === 'number' &&
        item.quantity > 0,
    )
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
  if (product.pricingMode === 'quote' || !product.basePrice) return 'Consultar'

  const amount = Number(product.basePrice)
  if (!Number.isFinite(amount)) return 'Consultar'

  const value = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)

  return product.pricingMode === 'from' ? `Desde ${value}` : value
}

function productWhatsappUrl(product: CatalogProduct) {
  const price = formatPrice(product)
  return site.whatsappUrlFor(
    `Hola, quiero consultar por "${product.name}" (${price}).`,
  )
}

function App() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null)
  const [cart, setCart] = useState<CartItem[]>(() => loadStoredCart())
  const [cartOpen, setCartOpen] = useState(false)
  const [recoveredOrder, setRecoveredOrder] = useState<RecoveredOrder | null>(() =>
    loadRecoveredOrder(),
  )

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
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  }, [cart])

  const cartCount = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart],
  )

  const cartKnownTotal = useMemo(
    () =>
      cart.reduce((total, item) => {
        if (item.pricingMode === 'quote' || !item.basePrice) return total

        const price = Number(item.basePrice)
        return Number.isFinite(price) ? total + price * item.quantity : total
      }, 0),
    [cart],
  )

  const cartHasQuote = useMemo(
    () => cart.some((item) => item.pricingMode === 'quote' || !item.basePrice),
    [cart],
  )

  function addToCart(product: CatalogProduct) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)

      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, 99) }
            : item,
        )
      }

      return [...current, { ...product, quantity: 1, note: '' }]
    })

    setSelectedProduct(null)
    setCartOpen(true)
  }

  function changeCartQuantity(productId: string, delta: number) {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.id !== productId) return [item]

        const quantity = item.quantity + delta
        return quantity > 0 ? [{ ...item, quantity: Math.min(quantity, 99) }] : []
      }),
    )
  }

  function updateCartNote(productId: string, note: string) {
    setCart((current) =>
      current.map((item) =>
        item.id === productId ? { ...item, note: note.slice(0, 240) } : item,
      ),
    )
  }

  function removeCartItem(productId: string) {
    setCart((current) => current.filter((item) => item.id !== productId))
  }

  const featuredProducts = useMemo(() => {
    const source =
      activeCategory === 'all'
        ? catalog
        : catalog.filter((category) => category.slug === activeCategory)

    return source.flatMap((category) => category.products).slice(0, 9)
  }, [catalog, activeCategory])

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
            <a href={site.instagramUrl} target="_blank" rel="noreferrer">
              Instagram ↗
            </a>
          </div>
        </details>

        <a
          className="header-cta"
          href={site.instagramUrl}
          target="_blank"
          rel="noreferrer"
        >
          Instagram
          <span aria-hidden="true">↗</span>
        </a>
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
              <a
                className="button button-secondary"
                href={site.whatsappUrl}
                target="_blank"
                rel="noreferrer"
              >
                Consultar por WhatsApp
                <span aria-hidden="true">↗</span>
              </a>
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
                  onClick={() => setSelectedProduct(product)}
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
                  </div>
                  <div className="product-content">
                    <h3>{product.name}</h3>
                    {product.shortDescription && <p>{product.shortDescription}</p>}
                    <div className="product-meta">
                      <strong>{formatPrice(product)}</strong>
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

              <div className="product-dialog-image">
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt="" />
                ) : (
                  <span>Alimar</span>
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
                <strong className="product-dialog-price">
                  {formatPrice(selectedProduct)}
                </strong>

                <div className="product-dialog-actions">
                  <button
                    type="button"
                    className="button button-primary product-dialog-cta"
                    onClick={() => addToCart(selectedProduct)}
                  >
                    Agregar al pedido
                    <span aria-hidden="true">+</span>
                  </button>

                  <a
                    className="button button-secondary product-dialog-cta"
                    href={productWhatsappUrl(selectedProduct)}
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
                  {cart.map((item) => (
                    <article className="cart-item" key={item.id}>
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
                          </div>

                          <button
                            type="button"
                            className="cart-remove"
                            onClick={() => removeCartItem(item.id)}
                          >
                            Quitar
                          </button>
                        </div>

                        <div className="cart-item-row">
                          <div className="cart-quantity" aria-label={`Cantidad de ${item.name}`}>
                            <button
                              type="button"
                              aria-label="Restar uno"
                              onClick={() => changeCartQuantity(item.id, -1)}
                            >
                              −
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              type="button"
                              aria-label="Sumar uno"
                              onClick={() => changeCartQuantity(item.id, 1)}
                            >
                              +
                            </button>
                          </div>

                          <strong>{formatPrice(item)}</strong>
                        </div>

                        <label className="cart-note">
                          Personalización / nota
                          <textarea
                            value={item.note}
                            maxLength={240}
                            rows={2}
                            placeholder="Ej. nombre, fecha, colores o detalle especial"
                            onChange={(event) => updateCartNote(item.id, event.target.value)}
                          />
                        </label>
                      </div>
                    </article>
                  ))}
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
                      quantity: item.quantity,
                      note: item.note,
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

