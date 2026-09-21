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

        <nav className="main-nav" aria-label="Navegación principal">
          <a href="#servicios">Qué hacemos</a>
          <a href="#catalogo">Catálogo</a>
          <a href="#como-trabajamos">Cómo trabajamos</a>
        </nav>

        <a
          className="header-cta"
          href="https://www.instagram.com/alimar.imp"
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
                href="https://www.instagram.com/alimar.imp"
                target="_blank"
                rel="noreferrer"
              >
                Ver trabajos
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
                href="https://www.instagram.com/alimar.imp"
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
                      <span aria-hidden="true">↗</span>
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
      </main>

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
          <a
            href="https://www.instagram.com/alimar.imp"
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

