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
          <span className="admin-kicker">Calidad del catálogo</span>
          <h2>¿Qué falta completar?</h2>
          <p>
            Revisá rápidamente qué productos están listos para vender y cuáles
            necesitan atención antes de mostrarlos como destacados.
          </p>
        </div>

        <div
          className={`admin-catalog-health ${
            summary.incomplete === 0 ? 'is-good' : 'needs-work'
          }`}
        >
          <strong>
            {summary.total === 0
              ? '—'
              : `${Math.round((summary.complete / summary.total) * 100)}%`}
          </strong>
          <span>catálogo completo</span>
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
          <span>Personalización pendiente</span>
        </article>
      </div>

      {summary.total > 0 && summary.featured === 0 && (
        <div className="admin-catalog-quality-note">
          <strong>No hay productos destacados todavía.</strong>
          <span>
            La portada usa un fallback automático, pero podés elegir tus productos
            principales desde “Editar → Destacar producto”.
          </span>
        </div>
      )}

      {productsToReview.length === 0 ? (
        <div className="admin-catalog-quality-empty">
          <strong>Todo en orden.</strong>
          <span>Las fichas activas cumplen los controles básicos del catálogo.</span>
        </div>
      ) : (
        <div className="admin-catalog-quality-list">
          <div className="admin-catalog-quality-list-heading">
            <strong>Productos que necesitan atención</strong>
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
            Prioridad sugerida: completá primero fotos y descripciones breves;
            son lo primero que ve el cliente en la tienda.
          </span>
        </div>
      )}
    </section>
  )
}
