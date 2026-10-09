import { useMemo } from 'react'
import type { AdminCatalog, AdminProduct } from './admin/app/types'
import {
  getProductQualityIssues,
  summarizeCatalogQuality,
} from './admin/catalogQuality'

type Props = {
  catalog: AdminCatalog
  onEdit: (product: AdminProduct) => void
}

export default function AdminCatalogQuality({ catalog, onEdit }: Props) {
  const summary = useMemo(
    () => summarizeCatalogQuality(catalog.products),
    [catalog.products],
  )

  const productsToReview = useMemo(
    () =>
      catalog.products
        .map((product) => ({
          product,
          issues: getProductQualityIssues(product),
        }))
        .filter(({ issues }) => issues.length > 0)
        .sort(
          (left, right) =>
            right.issues.length - left.issues.length ||
            left.product.name.localeCompare(right.product.name, 'es'),
        ),
    [catalog.products],
  )

  return (
    <section className="admin-panel admin-catalog-quality">
      <div className="admin-catalog-quality-heading">
        <div>
          <span className="admin-kicker">Calidad del catÃ¡logo</span>
          <h2>Â¿QuÃ© falta completar?</h2>
          <p>
            RevisÃ¡ rÃ¡pidamente quÃ© productos estÃ¡n listos para vender y cuÃ¡les
            necesitan atenciÃ³n antes de mostrarlos como destacados.
          </p>
        </div>

        <div
          className={`admin-catalog-health ${
            summary.incomplete === 0 ? 'is-good' : 'needs-work'
          }`}
        >
          <strong>
            {summary.total === 0
              ? 'â€”'
              : `${Math.round((summary.complete / summary.total) * 100)}%`}
          </strong>
          <span>catÃ¡logo completo</span>
        </div>
      </div>

      <div className="admin-catalog-quality-stats">
        <article>
          <strong>{summary.total}</strong>
          <span>Productos activos</span>
        </article>
        <article className="is-good">
          <strong>{summary.complete}</strong>
          <span>Fichas completas</span>
        </article>
        <article className={summary.incomplete > 0 ? 'is-warning' : 'is-good'}>
          <strong>{summary.incomplete}</strong>
          <span>Por revisar</span>
        </article>
        <article className={summary.featured === 0 ? 'is-warning' : 'is-good'}>
          <strong>{summary.featured}</strong>
          <span>Destacados</span>
        </article>
        <article
          className={
            summary.customizationPending > 0 ? 'is-warning' : 'is-good'
          }
        >
          <strong>{summary.customizationPending}</strong>
          <span>PersonalizaciÃ³n pendiente</span>
        </article>
      </div>

      {summary.total > 0 && summary.featured === 0 && (
        <div className="admin-catalog-quality-note">
          <strong>No hay productos destacados todavÃ­a.</strong>
          <span>
            La portada usa un fallback automÃ¡tico, pero podÃ©s elegir tus productos
            principales desde â€œEditar â†’ Destacar productoâ€.
          </span>
        </div>
      )}

      {productsToReview.length === 0 ? (
        <div className="admin-catalog-quality-empty">
          <strong>Todo en orden.</strong>
          <span>Las fichas activas cumplen los controles bÃ¡sicos del catÃ¡logo.</span>
        </div>
      ) : (
        <div className="admin-catalog-quality-list">
          <div className="admin-catalog-quality-list-heading">
            <strong>Productos que necesitan atenciÃ³n</strong>
            <span>{productsToReview.length} pendientes</span>
          </div>

          {productsToReview.map(({ product, issues }) => (
            <article className="admin-catalog-quality-row" key={product.id}>
              <div className="admin-catalog-quality-product">
                <div className="admin-catalog-quality-thumb">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" />
                  ) : (
                    <span>A</span>
                  )}
                </div>

                <div>
                  <strong>{product.name}</strong>
                  <span>
                    {issues.length === 1
                      ? '1 punto por revisar'
                      : `${issues.length} puntos por revisar`}
                  </span>
                </div>
              </div>

              <div className="admin-catalog-quality-issues">
                {issues.map((issue) => (
                  <span key={issue.key} className={`is-${issue.key}`}>
                    {issue.label}
                  </span>
                ))}
              </div>

              <button
                className="admin-edit"
                type="button"
                onClick={() => onEdit(product)}
              >
                Editar
              </button>
            </article>
          ))}
        </div>
      )}

      {(summary.withoutDescription > 0 || summary.withoutImage > 0) && (
        <div className="admin-catalog-quality-footnote">
          <span>
            Prioridad sugerida: completÃ¡ primero fotos y descripciones breves;
            son lo primero que ve el cliente en la tienda.
          </span>
        </div>
      )}
    </section>
  )
}
