import {
  lazy,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { alimarLogoDataUrl } from './brand'
import { site } from './site'
import CheckoutForm from './CheckoutForm'
import {
  loadCustomerSession,
  type CustomerSession,
} from './customerAccount'
import {
  clearRecoveredOrder,
  loadRecoveredOrder,
  recoveryWhatsappMessage,
  type RecoveredOrder,
} from './orderRecovery'
import { compressImageFile } from './imageDataUrl'
import {
  CART_STORAGE_KEY,
  cartItemKey,
  formatAmount,
  formatCartItemPrice,
  formatCartLinePrice,
  loadStoredCart,
} from './storefront/cart'
import {
  catalogPriceLabel,
  formatSelectionPrice,
  priceForSelection,
  productWhatsappUrl,
} from './storefront/catalog'
import { catalogProductCount } from './storefront/homeCatalog'
import {
  catalogSearchLabel,
  searchCatalogProducts,
} from './storefront/catalogSearch'
import { getProductBadges } from './storefront/productBadges'
import {
  productGalleryLabel,
  productLeadTimeLabel,
} from './storefront/productDetails'
import {
  findCatalogProductBySlug,
  productShareText,
  productShareUrl,
  productUrlPath,
} from './storefront/productSharing'
import { bundleToCartItem } from './storefront/bundles'
import {
  DIRECT_CUSTOM_REQUEST_KEY,
  directCustomRequestExample,
  fallbackCustomRequestExamples,
} from './storefront/customRequests'
import { serviceLines } from './storefront/content'
import type {
  CartItem,
  CatalogBundle,
  CatalogCategory,
  CatalogImage,
  CatalogProduct,
  CatalogResponse,
  CustomRequestExample,
  CustomRequestExampleKey,
  CustomRequestSuccess,
} from './storefront/types'
import './styles/public/storefront.css'

const PublicQuoteView = lazy(() => import('./PublicQuoteView'))
const PublicOrderTracking = lazy(() => import('./PublicOrderTracking'))

/* ALIMAR 1CAT.22 - COMPLETE PRODUCT DETAIL */
type CatalogProductCardProps = {
  product: CatalogProduct
  onOpen: (product: CatalogProduct) => void
}

/* ALIMAR 1SHOP.11 - COMMERCIAL BADGES */
function ProductBadges({
  product,
  dialog = false,
}: {
  product: CatalogProduct
  dialog?: boolean
}) {
  const badges = getProductBadges(product)

  if (badges.length === 0) return null

  return (
    <div
      className={`product-badges${dialog ? ' product-badges-dialog' : ''}`}
      aria-label={badges.map((badge) => badge.label).join(', ')}
    >
      {badges.map((badge) => (
        <span
          className={`product-badge is-${badge.tone}`}
          key={badge.key}
        >
          {badge.label}
        </span>
      ))}
    </div>
  )
}

function CatalogProductCard({ product, onOpen }: CatalogProductCardProps) {
  return (
    <button
      type="button"
      className="product-card product-card-button"
      onClick={() => onOpen(product)}
      aria-label={`Ver detalles de ${product.name}`}
    >
      <div className="product-image">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" loading="lazy" />
        ) : (
          <span>Alimar</span>
        )}
        <ProductBadges product={product} />
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
  )
}

function StorefrontApp() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [bundles, setBundles] = useState<CatalogBundle[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [selectedCustomizationValues, setSelectedCustomizationValues] = useState<
    Record<string, string>
  >({})
  const [selectedCustomizationMessage, setSelectedCustomizationMessage] = useState('')
  const [productShareMessage, setProductShareMessage] = useState('')
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
  const [selectedCustomRequestExampleKey, setSelectedCustomRequestExampleKey] =
    useState<CustomRequestExampleKey | null>(null)
  const [customRequestExamples, setCustomRequestExamples] =
    useState<CustomRequestExample[]>(fallbackCustomRequestExamples)
  const [customReferenceImageUrl, setCustomReferenceImageUrl] = useState('')
  const [customReferenceImageName, setCustomReferenceImageName] = useState('')
  const [customReferenceImageBusy, setCustomReferenceImageBusy] = useState(false)
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null)
  const [customerSessionReady, setCustomerSessionReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    void loadCustomerSession().then((account) => {
      if (cancelled) return
      setCustomerSession(account)
      setCustomerSessionReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const overlayOpen = Boolean(selectedProduct || customRequestOpen || cartOpen)
    if (!overlayOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      if (selectedProduct) {
        closeProduct()
        return
      }

      if (customRequestOpen) {
        setCustomRequestOpen(false)
        return
      }

      setCartOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedProduct, customRequestOpen, cartOpen])

  useEffect(() => {
    const controller = new AbortController()

    async function loadCatalog() {
      try {
        const response = await fetch('/api/catalog', { signal: controller.signal })
        if (!response.ok) throw new Error('Catalog request failed')

        const data = (await response.json()) as CatalogResponse
        setCatalog(data.categories)
        setBundles(Array.isArray(data.bundles) ? data.bundles : [])
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
    if (catalogState !== 'ready') return

    const slug = new URLSearchParams(window.location.search)
      .get('producto')
      ?.trim() ?? ''
    if (!slug) return

    const product = findCatalogProductBySlug(catalog, slug)
    if (!product) return

    setSelectedProduct((current) =>
      current?.id === product.id ? current : product,
    )
    setSelectedVariantId(
      product.variants.length === 1 ? product.variants[0].id : '',
    )
    setSelectedCustomizationValues({})
    setSelectedCustomizationMessage('')
    setProductShareMessage('')
  }, [catalog, catalogState])

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
    window.history.replaceState(
      window.history.state,
      '',
      productUrlPath(window.location.href, product.slug),
    )
    setSelectedProduct(product)
    setSelectedVariantId(product.variants.length === 1 ? product.variants[0].id : '')
    setSelectedCustomizationValues({})
    setSelectedCustomizationMessage('')
    setProductShareMessage('')
  }

  function closeProduct() {
    window.history.replaceState(
      window.history.state,
      '',
      productUrlPath(window.location.href, null),
    )
    setSelectedProduct(null)
    setSelectedVariantId('')
    setSelectedCustomizationValues({})
    setSelectedCustomizationMessage('')
    setProductShareMessage('')
  }

  async function shareProduct(product: CatalogProduct) {
    const url = productShareUrl(window.location.href, product.slug)
    const shareData = {
      title: `${product.name} | Alimar`,
      text: productShareText(product.name),
      url,
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData)
        setProductShareMessage('Producto compartido.')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setProductShareMessage('Enlace copiado. Ya podés pegarlo donde quieras.')
    } catch {
      setProductShareMessage(`Copiá este enlace: ${url}`)
    }
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
      bundleId: null,
      bundleItems: [],
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

    closeProduct()
    setCartOpen(true)
  }

  function addBundleToCart(bundle: CatalogBundle) {
    const nextItem = bundleToCartItem(bundle)
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

  useEffect(() => {
    let cancelled = false

    async function loadCustomExamples() {
      try {
        const response = await fetch('/api/catalog?view=custom-examples', {
          cache: 'no-store',
        })

        if (!response.ok) return

        const data = (await response.json()) as {
          examples?: CustomRequestExample[]
        }

        if (!cancelled && Array.isArray(data.examples) && data.examples.length > 0) {
          setCustomRequestExamples(data.examples)
        }
      } catch {
        // The seeded fallback remains available if the gallery cannot be loaded.
      }
    }

    void loadCustomExamples()

    function refreshCustomExamples() {
      void loadCustomExamples()
    }

    window.addEventListener('alimar:custom-examples-changed', refreshCustomExamples)

    return () => {
      cancelled = true
      window.removeEventListener(
        'alimar:custom-examples-changed',
        refreshCustomExamples,
      )
    }
  }, [])

  function openCustomRequest() {
    if (!customerSessionReady || !customerSession) {
      window.location.assign('/cuenta?next=/')
      return
    }

    setCustomRequestId(crypto.randomUUID())
    setCustomRequestMessage('')
    setCustomRequestSuccess(null)
    setSelectedCustomRequestExampleKey(null)
    setCustomReferenceImageUrl('')
    setCustomReferenceImageName('')
    setCustomRequestOpen(true)
  }

  async function chooseCustomReferenceImage(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    setCustomReferenceImageBusy(true)
    setCustomRequestMessage('')

    try {
      const imageUrl = await compressImageFile(file, {
        maxDimension: 1280,
        maxDataUrlLength: 900_000,
      })

      setCustomReferenceImageUrl(imageUrl)
      setCustomReferenceImageName(file.name)
    } catch (error) {
      setCustomRequestMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos preparar la imagen de referencia.',
      )
    } finally {
      setCustomReferenceImageBusy(false)
    }
  }

  async function submitCustomRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const rawDescription = String(form.get('description') ?? '').trim()
    const isDirectCustomRequest =
      selectedCustomRequestExampleKey === DIRECT_CUSTOM_REQUEST_KEY
    const selectedExample = isDirectCustomRequest
      ? directCustomRequestExample
      : customRequestExamples.find(
          (example) => example.key === selectedCustomRequestExampleKey,
        )
    const requestDescription = rawDescription

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
          requestType: selectedExample?.requestType ?? form.get('requestType'),
          exampleId: isDirectCustomRequest ? null : selectedExample?.id ?? null,
          exampleTitle: isDirectCustomRequest
            ? null
            : selectedExample?.title ?? null,
          quantity: form.get('quantity'),
          neededDate: form.get('neededDate'),
          dimensions: form.get('dimensions'),
          theme: form.get('theme'),
          description: requestDescription,
          referenceUrl: form.get('referenceUrl'),
          referenceImageUrl: customReferenceImageUrl || null,
        }),
      })

      const data = (await response.json()) as {
        error?: string
        requestCode?: string
        whatsappMessage?: string
      }

      if (response.status === 401) {
        window.location.assign('/cuenta?next=/')
        return
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
      setCustomReferenceImageUrl('')
      setCustomReferenceImageName('')
      formElement.reset()
    } catch (error) {
      setCustomRequestMessage(
        error instanceof Error ? error.message : 'No pudimos guardar tu solicitud.',
      )
    } finally {
      setCustomRequestBusy(false)
    }
  }

  const visibleCatalogProducts = useMemo(
    () => searchCatalogProducts(catalog, catalogQuery, activeCategory),
    [catalog, catalogQuery, activeCategory],
  )

  const totalCatalogProducts = useMemo(
    () => catalogProductCount(catalog),
    [catalog],
  )

  function submitCatalogSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!catalogQuery.trim()) return
    setActiveCategory('all')
  }

  function clearCatalogSearch() {
    setCatalogQuery('')
  }

  const selectedCustomRequestExample = customRequestExamples.find(
    (example) => example.key === selectedCustomRequestExampleKey,
  ) ?? null

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
          <a href="#catalogo">Catálogo</a>
          <a href="#pedido-personalizado">Pedido personalizado</a>
          <a href="/cuenta">Mis pedidos</a>
          <a href="#servicios">Qué hacemos</a>
        </nav>

        
        <details className="mobile-menu">
          <summary>Menú</summary>
          <div
            className="mobile-menu-panel"
            onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('a')) {
                event.currentTarget.closest('details')?.removeAttribute('open')
              }
            }}
          >
            <a href="#catalogo">Catálogo</a>
            <a href="#pedido-personalizado">Pedido personalizado</a>
            <a href="#servicios">Qué hacemos</a>
            <a href="#como-trabajamos">Cómo trabajamos</a>
            <a href="/cuenta">Mi cuenta</a>
            <a href={site.instagramUrl} target="_blank" rel="noreferrer">
              Instagram ↗
            </a>
          </div>
        </details>

        <div className="header-actions">
          <a className="repository-cta" href="/cuenta">
            {customerSession ? `Hola, ${customerSession.name.split(' ')[0]}` : 'Mi cuenta'}
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

      <main id="inicio">
        {/* ALIMAR 1HOME.12 - CATALOG FIRST / SINGLE PRODUCT EXPERIENCE */}
        <section
          className="section catalog-section catalog-section-full catalog-first-section"
          id="catalogo"
        >
          <div className="section-heading catalog-first-heading">
            <div>
              <p className="eyebrow">Catálogo Alimar</p>
              <h2>Todos los productos, desde el primer momento.</h2>
            </div>
            <p>
              Buscá, filtrá por categoría y abrí cualquier producto para ver fotos,
              opciones, personalización y precio.
            </p>
          </div>

          {catalogState === 'ready' && totalCatalogProducts > 0 && (
            <form
              className="catalog-search-box"
              role="search"
              onSubmit={submitCatalogSearch}
            >
              <label htmlFor="catalog-search-main">Buscar productos</label>
              <div className="catalog-search-control">
                <span className="catalog-search-icon" aria-hidden="true">⌕</span>
                <input
                  id="catalog-search-main"
                  type="search"
                  value={catalogQuery}
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder="Ej. tatuajes, carátulas, 3D, cumpleaños..."
                  autoComplete="off"
                />
                <button
                  className="catalog-search-submit"
                  type="submit"
                  disabled={!catalogQuery.trim()}
                >
                  Buscar
                </button>
              </div>
              <div className="catalog-search-meta" aria-live="polite">
                <span>
                  {catalogQuery.trim()
                    ? catalogSearchLabel(visibleCatalogProducts.length)
                    : String(totalCatalogProducts) + ' productos activos'}
                </span>
                {catalogQuery.trim() && (
                  <button
                    className="catalog-search-clear"
                    type="button"
                    onClick={clearCatalogSearch}
                  >
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            </form>
          )}

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
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div className="product-card product-card-skeleton" key={item} />
              ))}
            </div>
          )}

          {catalogState === 'error' && (
            <div className="catalog-message">
              <span>Ahora mismo estamos acomodando el catálogo.</span>
              <strong>Podés consultarnos directamente por WhatsApp.</strong>
            </div>
          )}

          {catalogState === 'ready' && (
            <>
              <div className="catalog-results-summary" aria-live="polite">
                <span>
                  {activeCategory === 'all'
                    ? 'Todas las categorías'
                    : catalog.find((category) => category.slug === activeCategory)?.name ??
                      'Categoría'}
                </span>
                <strong>{catalogSearchLabel(visibleCatalogProducts.length)}</strong>
              </div>

              {visibleCatalogProducts.length > 0 ? (
                <div className="product-grid">
                  {visibleCatalogProducts.map((product) => (
                    <CatalogProductCard
                      key={product.id}
                      product={product}
                      onOpen={openProduct}
                    />
                  ))}
                </div>
              ) : (
                <div className="catalog-empty">
                  <div>
                    <span className="catalog-empty-label">Sin resultados</span>
                    <h3>
                      {catalogQuery.trim()
                        ? 'No encontramos productos que coincidan con tu búsqueda.'
                        : 'No hay productos activos en esta categoría.'}
                    </h3>
                  </div>
                </div>
              )}
            </>
          )}

          {catalogState === 'ready' && !catalogQuery.trim() && bundles.length > 0 && (
            <div className="home-combos catalog-first-combos">
              <div className="home-combos-heading">
                <div>
                  <strong>Combos</strong>
                  <span>Opciones armadas para resolver más fácil.</span>
                </div>
              </div>

              <div className="combo-grid">
                {bundles.map((bundle) => (
                  <article className="combo-card" key={bundle.id}>
                    <div className="combo-card-media">
                      {bundle.imageUrl ? (
                        <img src={bundle.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span>Alimar</span>
                      )}
                    </div>

                    <div className="combo-card-content">
                      <h3>{bundle.name}</h3>
                      <p>
                        {bundle.shortDescription ??
                          'Una selección de productos pensada para pedir todo junto.'}
                      </p>
                      <ul className="combo-items">
                        {bundle.items.map((item) => (
                          <li key={item.productId}>
                            <span>{item.name}</span>
                            <strong>x{item.quantity}</strong>
                          </li>
                        ))}
                      </ul>
                      <div className="combo-card-footer">
                        <div className="combo-card-price">
                          <span>Combo</span>
                          <strong>{formatAmount(Number(bundle.bundlePrice))}</strong>
                        </div>
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => addBundleToCart(bundle)}
                        >
                          Agregar
                          <span aria-hidden="true">＋</span>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="catalog-first-custom-cta">
            <div>
              <strong>¿No encontrás exactamente lo que querés?</strong>
              <span>También hacemos trabajos totalmente personalizados.</span>
            </div>
            <button
              className="button button-secondary"
              type="button"
              onClick={openCustomRequest}
            >
              Pedido personalizado
              <span aria-hidden="true">✦</span>
            </button>
          </div>
        </section>

        <section className="hero-section home-hero-compact home-hero-after-catalog">
          <div className="hero-copy">
            <p className="eyebrow">Diseño · Papel · Detalles · 3D</p>
            <h1>
              Ideas que se vuelven
              <span> Recuerdos</span>
            </h1>
            <p className="hero-description">
              Si no encontraste algo listo para pedir, contanos tu idea. Hacemos detalles
              personalizados para cumpleaños, regalos, escuela y momentos especiales.
            </p>

            <div className="hero-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={openCustomRequest}
              >
                Pedido personalizado
                <span aria-hidden="true">✦</span>
              </button>
              <a className="button button-secondary" href="#servicios">
                Qué hacemos
                <span aria-hidden="true">↓</span>
              </a>
            </div>

            <div className="hero-note">
              <span className="hero-note-dot" aria-hidden="true" />
              {catalogState === 'ready' && totalCatalogProducts > 0
                ? String(totalCatalogProducts) + ' productos disponibles · Atención directa por WhatsApp'
                : 'Productos personalizados · Atención directa por WhatsApp'}
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

          <aside className="catalog-custom-order" id="pedido-personalizado">
            <div className="catalog-custom-order-copy">
              <p className="eyebrow">Pedido Personalizado</p>
              <h3>¿No encontrás exactamente lo que querés?</h3>
              <p>
                No necesitás elegir un producto del catálogo ni tomar esos precios como
                referencia. Contanos tu idea, podés adjuntar una foto y después te preparamos
                un presupuesto para ese trabajo.
              </p>
            </div>

            <div className="catalog-custom-order-action">
              <span>Sin precio prefijado · se cotiza según tu idea</span>
              <button
                className="button button-primary"
                type="button"
                onClick={openCustomRequest}
              >
                Armar Pedido Personalizado
                <span aria-hidden="true">✦</span>
              </button>
            </div>
          </aside>

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

        <section className="section process-section" id="como-trabajamos">
          <div className="process-intro">
            <p className="eyebrow">Simple de pedir</p>
            <h2>De tu idea a nuestro taller, sin vueltas.</h2>
          </div>

          <ol className="process-list">
            <li>
              <span>01</span>
              <div>
                <strong>Elegís o contás</strong>
                <p>Comprás un producto publicado o arrancás un Pedido Personalizado desde tu propia idea.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Definimos</strong>
                <p>Nos pasás cantidad, fecha, estilo y referencias. Si es a medida, primero lo cotizamos.</p>
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
          <div
            className="custom-request-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setCustomRequestOpen(false)
            }}
          >
            <section
              className="custom-request-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="custom-request-title"
            >
              <header className="custom-request-header">
                <div>
                  <p className="eyebrow">Pedido Personalizado</p>
                  <h2 id="custom-request-title">Contanos qué querés hacer.</h2>
                  <p>
                    Podés empezar directamente desde tu idea o mirar ejemplos para inspirarte.
                    No hace falta elegir un producto ni saber palabras técnicas. El precio se define
                    después de revisar tu pedido y preparar el presupuesto.
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
                  <span>Pedido Personalizado recibido</span>
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
                selectedCustomRequestExample ? (
                  <form className="custom-request-form" onSubmit={submitCustomRequest}>
                    <div className="custom-request-selected-example">
                      {selectedCustomRequestExample.imageUrl ? (
                        <img
                          className="custom-request-example-image"
                          src={selectedCustomRequestExample.imageUrl}
                          alt={
                            selectedCustomRequestExample.imageAlt ||
                            selectedCustomRequestExample.title
                          }
                        />
                      ) : (
                        <div
                          className={`custom-request-example-art is-${selectedCustomRequestExample.art}`}
                          aria-hidden="true"
                        >
                          <span />
                          <span />
                          <i />
                        </div>
                      )}

                      <div>
                        <span>
                          {selectedCustomRequestExampleKey ===
                          DIRECT_CUSTOM_REQUEST_KEY
                            ? 'Pedido Personalizado'
                            : 'Elegiste algo parecido a'}
                        </span>
                        <strong>{selectedCustomRequestExample.title}</strong>
                        <small>{selectedCustomRequestExample.hint}</small>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedCustomRequestExampleKey(null)}
                      >
                        {selectedCustomRequestExampleKey === DIRECT_CUSTOM_REQUEST_KEY
                          ? 'Ver ejemplos'
                          : 'Cambiar ejemplo'}
                      </button>
                    </div>

                    <input
                      type="hidden"
                      name="requestType"
                      value={selectedCustomRequestExample.requestType}
                    />

                    <div className="custom-request-fields">
                      <label>
                        ¿Cuántos necesitás más o menos?
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

                      <label className="custom-request-span-2">
                        Tamaño aproximado <span className="custom-request-optional">si lo sabés</span>
                        <input
                          name="dimensions"
                          maxLength={120}
                          placeholder={selectedCustomRequestExample.sizePlaceholder}
                        />
                      </label>

                      <label className="custom-request-span-2">
                        ¿Cómo te gustaría que se vea?
                        <input
                          name="theme"
                          maxLength={240}
                          placeholder={selectedCustomRequestExample.themePlaceholder}
                        />
                      </label>

                      <label className="custom-request-span-2">
                        Contanos con tus palabras
                        <textarea
                          name="description"
                          rows={4}
                          minLength={10}
                          maxLength={2600}
                          placeholder={selectedCustomRequestExample.descriptionPlaceholder}
                          required
                        />
                      </label>

                      <div className="custom-request-span-2 custom-request-reference-upload">
                        <div>
                          <strong>¿Tenés una foto de referencia?</strong>
                          <span>Podés subir una sola imagen. La reducimos antes de enviarla.</span>
                        </div>

                        <label className="button button-secondary">
                          {customReferenceImageBusy
                            ? 'Preparando imagen…'
                            : customReferenceImageUrl
                              ? 'Cambiar imagen'
                              : 'Subir imagen'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(event) =>
                              void chooseCustomReferenceImage(event)
                            }
                            disabled={customReferenceImageBusy}
                          />
                        </label>

                        {customReferenceImageUrl && (
                          <div className="custom-request-reference-preview">
                            <img
                              src={customReferenceImageUrl}
                              alt="Referencia que vas a enviar"
                            />
                            <div>
                              <span>{customReferenceImageName || 'Imagen preparada'}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomReferenceImageUrl('')
                                  setCustomReferenceImageName('')
                                }}
                              >
                                Quitar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <label className="custom-request-span-2">
                        ¿Viste algo parecido online? Pegá el link <span className="custom-request-optional">opcional</span>
                        <input
                          name="referenceUrl"
                          type="url"
                          maxLength={500}
                          placeholder="Instagram, Pinterest, una publicación, etc."
                        />
                      </label>

                      <label>
                        Tu nombre
                        <input
                          name="customerName"
                          autoComplete="name"
                          maxLength={120}
                          value={customerSession?.name ?? ''}
                          readOnly
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
                          value={customerSession?.phone ?? ''}
                          readOnly
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
                        {customRequestBusy ? 'Enviando…' : 'Enviar Pedido Personalizado'}
                      </button>
                    </footer>
                  </form>
                ) : (
                  <div className="custom-request-picker">
                    <button
                      className="custom-request-direct-start"
                      type="button"
                      onClick={() =>
                        setSelectedCustomRequestExampleKey(
                          DIRECT_CUSTOM_REQUEST_KEY,
                        )
                      }
                    >
                      <span className="custom-request-direct-start-icon" aria-hidden="true">
                        ✦
                      </span>
                      <div>
                        <strong>Empezar desde mi idea</strong>
                        <span>
                          No hace falta elegir ningún producto ni ejemplo. Contanos qué
                          necesitás y lo cotizamos especialmente para vos.
                        </span>
                      </div>
                      <i aria-hidden="true">→</i>
                    </button>

                    <div className="custom-request-picker-copy">
                      <strong>O mirá ejemplos para inspirarte</strong>
                      <p>
                        Si algo se parece a lo que imaginaste, elegilo para orientarnos. Es sólo
                        una referencia: no significa que tenga ese precio ni que tenga que ser igual.
                      </p>
                    </div>

                    <div className="custom-request-example-grid">
                      {customRequestExamples
                        .filter((example) => example.key !== 'other')
                        .map((example) => (
                        <button
                          className="custom-request-example"
                          type="button"
                          key={example.key}
                          onClick={() => setSelectedCustomRequestExampleKey(example.key)}
                        >
                          {example.imageUrl ? (
                            <img
                              className="custom-request-example-image"
                              src={example.imageUrl}
                              alt={example.imageAlt || example.title}
                            />
                          ) : (
                            <div
                              className={`custom-request-example-art is-${example.art}`}
                              aria-hidden="true"
                            >
                              <span />
                              <span />
                              <i />
                            </div>
                          )}
                          <div>
                            <strong>{example.title}</strong>
                            <span>{example.hint}</span>
                          </div>
                          <i aria-hidden="true">→</i>
                        </button>
                      ))}
                    </div>

                    <footer className="custom-request-picker-footer">
                      <span>¿Preferís explicarlo hablando?</span>
                      <a href={site.whatsappUrl} target="_blank" rel="noreferrer">
                        Escribinos directo por WhatsApp ↗
                      </a>
                    </footer>
                  </div>
                )
              )}
            </section>
          </div>
        )}

        {selectedProduct && (
          <div
            className="product-dialog-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeProduct()
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
                onClick={closeProduct}
              >
                ×
              </button>

              <div className="product-dialog-gallery">
                {/* ALIMAR 1CAT.23 - NUMBERED PRODUCT GALLERY */}
                <div className="product-dialog-image product-dialog-image-numbered">
                  {selectedProductImageUrl ? (
                    <img src={selectedProductImageUrl} alt={selectedProduct.name} />
                  ) : (
                    <span>Alimar</span>
                  )}

                  {productImages.length > 1 && (
                    <span
                      className="product-dialog-image-counter"
                      aria-label={`Imagen ${Math.max(
                        productImages.findIndex(
                          (image) => image.url === selectedProductImageUrl,
                        ) + 1,
                        1,
                      )} de ${productImages.length}`}
                    >
                      {Math.max(
                        productImages.findIndex(
                          (image) => image.url === selectedProductImageUrl,
                        ) + 1,
                        1,
                      )}{' / '}
                      {productImages.length}
                    </span>
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
                        <span
                          className="product-dialog-thumbnail-number"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="product-dialog-content">
                <ProductBadges product={selectedProduct} dialog />
                <h3 id="product-dialog-title">{selectedProduct.name}</h3>
                {selectedProduct.shortDescription && (
                  <p>{selectedProduct.shortDescription}</p>
                )}

                {selectedProduct.description && (
                  <p className="product-dialog-description">
                    {selectedProduct.description}
                  </p>
                )}

                <div className="product-dialog-facts">
                  <div className="product-dialog-fact">
                    <span>Tiempo estimado</span>
                    <strong>
                      {productLeadTimeLabel(selectedProduct.estimatedDays)}
                    </strong>
                  </div>
                  <div className="product-dialog-fact">
                    <span>Galería</span>
                    <strong>{productGalleryLabel(productImages.length)}</strong>
                  </div>
                  <div className="product-dialog-fact">
                    <span>Modalidad</span>
                    <strong>
                      {selectedProduct.customizationAllowed
                        ? 'Personalizable'
                        : selectedProduct.kind === 'service'
                          ? 'Servicio'
                          : 'Listo para pedir'}
                    </strong>
                  </div>
                </div>

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
                        <strong>Personalizá este producto</strong>
                        <span>
                          Completá los datos. Los campos marcados con * son obligatorios.
                        </span>
                      </div>

                      <p className="product-customization-reference-note">
                        Si tu pedido necesita una foto o imagen de referencia, vas a
                        poder enviárnosla por WhatsApp después de armar el pedido.
                      </p>
                
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
                <div className="product-dialog-purchase">
                  <div className="product-dialog-purchase-price">
                    <span>Precio</span>
                    <strong className="product-dialog-price" aria-live="polite">
                      {formatSelectionPrice(selectedProduct, selectedVariant)}
                    </strong>
                  </div>

                  <div className="product-dialog-actions">
                    <button
                      type="button"
                      className="button button-primary product-dialog-cta"
                      onClick={() => addToCart(selectedProduct, selectedVariantId)}
                      disabled={selectedProduct.variants.length > 0 && !selectedVariant}
                    >
                      {selectedProduct.customizationAllowed
                        ? 'Personalizar y agregar'
                        : 'Agregar al pedido'}
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

                    <button
                      type="button"
                      className="button button-secondary product-dialog-cta product-dialog-share"
                      onClick={() => void shareProduct(selectedProduct)}
                    >
                      Compartir producto
                      <span aria-hidden="true">↗</span>
                    </button>
                  </div>

                  {productShareMessage && (
                    <p className="product-share-message" role="status">
                      {productShareMessage}
                    </p>
                  )}

                  <p className="product-dialog-purchase-note">
                    El pedido queda registrado y después continuamos la coordinación
                    por WhatsApp.
                  </p>
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
            {recoveredOrder.trackingToken && (
              <a
                href={`/?pedido=${encodeURIComponent(recoveredOrder.trackingToken)}`}
              >
                Ver seguimiento →
              </a>
            )}

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
                            {item.bundleId && item.bundleItems.length > 0 && (
                              <small className="cart-bundle-summary">
                                <strong>Incluye:</strong>
                                {item.bundleItems.join(' · ')}
                              </small>
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
                    session={customerSession}
                    sessionReady={customerSessionReady}
                    onSessionChanged={(account) => {
                      setCustomerSession(account)
                      setCustomerSessionReady(true)
                    }}
                    items={cart.map((item) => ({
                      id: item.id,
                      bundleId: item.bundleId,
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

function App() {
  const searchParams = new URLSearchParams(window.location.search)
  const publicTrackingToken = searchParams.get('pedido')?.trim() ?? ''
  const trackingLookup = searchParams.get('seguimiento') === '1'
  const publicQuoteToken = searchParams.get('presupuesto')?.trim() ?? ''

  if (publicTrackingToken || trackingLookup) {
    return <PublicOrderTracking token={publicTrackingToken} />
  }

  return publicQuoteToken
    ? <PublicQuoteView token={publicQuoteToken} />
    : <StorefrontApp />
}

export default App

