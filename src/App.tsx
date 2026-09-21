import { useEffect, useMemo, useState } from 'react'
import { alimarLogoDataUrl } from './brand'
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

const serviceLines = [
  {
    number: '01',
    title: 'DiseÃ±o grÃ¡fico',
    text: 'Piezas visuales pensadas para comunicar, celebrar y destacar.',
  },
  {
    number: '02',
    title: 'PapelerÃ­a',
    text: 'Invitaciones, detalles y piezas personalizadas para cada ocasiÃ³n.',
  },
  {
    number: '03',
    title: 'Eventos',
    text: 'DiseÃ±o y producciÃ³n creativa para cumpleaÃ±os y momentos especiales.',
  },
  {
    number: '04',
    title: 'ImpresiÃ³n 3D',
    text: 'Objetos y detalles fÃ­sicos que llevan una idea a otra dimensiÃ³n.',
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

function App() {
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')

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

  const featuredProducts = useMemo(
    () => catalog.flatMap((category) => category.products).slice(0, 6),
    [catalog],
  )

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Alimar, inicio">
          <img className="brand-logo" src={alimarLogoDataUrl} alt="" />
          <span>Alimar</span>
        </a>

        <nav className="main-nav" aria-label="NavegaciÃ³n principal">
          <a href="#servicios">QuÃ© hacemos</a>
          <a href="#catalogo">CatÃ¡logo</a>
          <a href="#como-trabajamos">CÃ³mo trabajamos</a>
        </nav>

        <a
          className="header-cta"
          href="https://www.instagram.com/alimar.imp"
          target="_blank"
          rel="noreferrer"
        >
          Instagram
          <span aria-hidden="true">â†—</span>
        </a>
      </header>

      <main>
        <section className="hero-section" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow">DiseÃ±o Â· Papel Â· Detalles Â· 3D</p>
            <h1>
              Ideas que se vuelven
              <span> algo para guardar.</span>
            </h1>
            <p className="hero-description">
              DiseÃ±o grÃ¡fico, papelerÃ­a y objetos personalizados hechos con una mirada creativa
              para cumpleaÃ±os, eventos y momentos que merecen sentirse Ãºnicos.
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href="#catalogo">
                Ver catÃ¡logo
                <span aria-hidden="true">â†“</span>
              </a>
              <a
                className="button button-secondary"
                href="https://www.instagram.com/alimar.imp"
                target="_blank"
                rel="noreferrer"
              >
                Ver trabajos
              </a>
            </div>

            <div className="hero-note">
              <span className="hero-note-dot" aria-hidden="true" />
              Pedidos personalizados Â· AtenciÃ³n directa por WhatsApp
            </div>
          </div>

          <div className="hero-art" aria-label="ComposiciÃ³n grÃ¡fica de Alimar">`r`n            <img className="hero-brand-logo" src={alimarLogoDataUrl} alt="Logo de Alimar" />
            <div className="paper paper-back">
              <span>hecho</span>
              <strong>para vos</strong>
            </div>
            <div className="paper paper-main">
              <span className="paper-kicker">ALIMAR</span>
              <strong>DiseÃ±ar tambiÃ©n es celebrar.</strong>
              <span className="paper-signature">ideas + manos + detalle</span>
            </div>
            <div className="paper-sticker">âœ¦</div>
            <div className="paper-tape" aria-hidden="true" />
          </div>
        </section>

        <section className="manifesto-strip" aria-label="CaracterÃ­sticas de Alimar">
          <span>Personalizado</span>
          <i aria-hidden="true">âœ¦</i>
          <span>Hecho con detalle</span>
          <i aria-hidden="true">âœ¦</i>
          <span>DiseÃ±o con intenciÃ³n</span>
          <i aria-hidden="true">âœ¦</i>
          <span>ProducciÃ³n artesanal</span>
        </section>

        <section className="section services-section" id="servicios">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Lo que hacemos</p>
              <h2>Una idea, distintas formas de hacerla realidad.</h2>
            </div>
            <p>
              Cada trabajo puede adaptarse al estilo, la ocasiÃ³n y lo que quieras contar.
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
                <span className="service-arrow" aria-hidden="true">â†—</span>
              </article>
            ))}
          </div>
        </section>

        <section className="section catalog-section" id="catalogo">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CatÃ¡logo</p>
              <h2>ElegÃ­ tu prÃ³ximo detalle.</h2>
            </div>
            <p>
              El catÃ¡logo se conecta directamente con nuestra base de productos.
            </p>
          </div>

          {catalogState === 'loading' && (
            <div className="product-grid" aria-label="Cargando catÃ¡logo">
              {[1, 2, 3].map((item) => (
                <div className="product-card product-card-skeleton" key={item} />
              ))}
            </div>
          )}

          {catalogState === 'error' && (
            <div className="catalog-message">
              <span>Ahora mismo estamos acomodando el catÃ¡logo.</span>
              <strong>PodÃ©s ver nuestros trabajos y consultarnos por Instagram.</strong>
            </div>
          )}

          {catalogState === 'ready' && featuredProducts.length === 0 && (
            <div className="catalog-empty">
              <div>
                <span className="catalog-empty-label">Muy pronto</span>
                <h3>Estamos preparando la primera selecciÃ³n de Alimar.</h3>
              </div>
              <p>
                La tienda ya estÃ¡ conectada a nuestro catÃ¡logo. En el prÃ³ximo paso vamos a cargar
                los primeros productos reales y sus imÃ¡genes.
              </p>
              <a
                className="button button-secondary"
                href="https://www.instagram.com/alimar.imp"
                target="_blank"
                rel="noreferrer"
              >
                Mientras tanto, ver Instagram â†—
              </a>
            </div>
          )}

          {catalogState === 'ready' && featuredProducts.length > 0 && (
            <div className="product-grid">
              {featuredProducts.map((product) => (
                <article className="product-card" key={product.id}>
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
                      <span aria-hidden="true">â†—</span>
                    </div>
                  </div>
                </article>
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
                <strong>ElegÃ­s</strong>
                <p>ExplorÃ¡s el catÃ¡logo y seleccionÃ¡s lo que querÃ©s.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>PersonalizÃ¡s</strong>
                <p>Nos contÃ¡s los detalles necesarios para preparar tu pedido.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Coordinamos</strong>
                <p>Registramos el pedido y continuamos la conversaciÃ³n por WhatsApp.</p>
              </div>
            </li>
          </ol>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <a className="brand brand-footer" href="#inicio">
            <img className="brand-logo" src={alimarLogoDataUrl} alt="" />
            <span>Alimar</span>
          </a>
          <p>DiseÃ±o y detalles personalizados para momentos con identidad.</p>
        </div>

        <div className="footer-links">
          <a href="#servicios">Servicios</a>
          <a href="#catalogo">CatÃ¡logo</a>
          <a
            href="https://www.instagram.com/alimar.imp"
            target="_blank"
            rel="noreferrer"
          >
            @alimar.imp â†—
          </a>
        </div>

        <span className="footer-copy">Â© {new Date().getFullYear()} Alimar</span>
      </footer>
    </div>
  )
}

export default App

