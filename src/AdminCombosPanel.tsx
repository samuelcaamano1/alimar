import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AdminProduct } from './admin/app/types'
import { adminRequest, responseMessage } from './admin/shared/http'

type BundleItem = {
  productId: string
  productName: string
  quantity: number
}

type Bundle = {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  bundlePrice: string
  featured: boolean
  sortOrder: number
  items: BundleItem[]
}

type Props = {
  products: AdminProduct[]
}

function formatPrice(value: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function AdminCombosPanel({ products }: Props) {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const editingBundle = useMemo(
    () => bundles.find((bundle) => bundle.id === editingId) ?? null,
    [bundles, editingId],
  )

  const loadBundles = useCallback(async () => {
    try {
      const response = await adminRequest('/api/admin/combos', { cache: 'no-store' })
      if (!response.ok) throw new Error(await responseMessage(response))
      const data = (await response.json()) as { bundles?: Bundle[] }
      setBundles(Array.isArray(data.bundles) ? data.bundles : [])
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    void loadBundles()
  }, [loadBundles])

  function resetForm() {
    setEditingId(null)
    setSelected({})
    setMessage('')
  }

  function startEdit(bundle: Bundle) {
    setEditingId(bundle.id)
    setSelected(
      Object.fromEntries(
        bundle.items.map((item) => [item.productId, item.quantity]),
      ),
    )
    setMessage('')
    window.setTimeout(() => {
      document
        .querySelector('.admin-combos-form')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }

  function toggleProduct(productId: string, checked: boolean) {
    setSelected((current) => {
      if (!checked) {
        const next = { ...current }
        delete next[productId]
        return next
      }

      return {
        ...current,
        [productId]: current[productId] ?? 1,
      }
    })
  }

  function updateQuantity(productId: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return
    setSelected((current) => ({ ...current, [productId]: quantity }))
  }

  async function saveBundle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const items = Object.entries(selected).map(([productId, quantity]) => ({
      productId,
      quantity,
    }))

    if (items.length < 2) {
      setMessage('Elegí al menos 2 productos para armar el combo.')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const response = await adminRequest('/api/admin/combos', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          name: form.get('name'),
          shortDescription: form.get('shortDescription'),
          bundlePrice: form.get('bundlePrice'),
          featured: form.get('featured') === 'on',
          items,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { bundles?: Bundle[] }
      setBundles(Array.isArray(data.bundles) ? data.bundles : [])
      setSelected({})
      setEditingId(null)
      formElement.reset()
      setMessage(editingId ? 'Combo actualizado.' : 'Combo creado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el combo.')
    } finally {
      setBusy(false)
    }
  }

  async function removeBundle(bundle: Bundle) {
    if (busy || !window.confirm(`¿Quitar el combo "${bundle.name}"?`)) return

    setBusy(true)
    setMessage('')

    try {
      const response = await adminRequest(
        `/api/admin/combos?id=${encodeURIComponent(bundle.id)}`,
        { method: 'DELETE' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { bundles?: Bundle[] }
      setBundles(Array.isArray(data.bundles) ? data.bundles : [])
      if (editingId === bundle.id) resetForm()
      setMessage('Combo quitado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo quitar el combo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-panel admin-combos">
      <div className="admin-panel-heading">
        <span>03</span>
        <div>
          <h2>Combos</h2>
          <p>Armá paquetes de productos con un precio propio.</p>
        </div>
      </div>

      <form className="admin-combos-form" onSubmit={saveBundle}>
        <div className="admin-combos-form-grid">
          <label>
            Nombre del combo
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={editingBundle?.name ?? ''}
              key={`name-${editingBundle?.id ?? 'new'}`}
              placeholder="Ej. Combo cumple completo"
            />
          </label>

          <label>
            Precio del combo
            <input
              name="bundlePrice"
              required
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={editingBundle?.bundlePrice ?? ''}
              key={`price-${editingBundle?.id ?? 'new'}`}
              placeholder="Ej. 15000"
            />
          </label>

          <label className="admin-span-2">
            Descripción breve
            <textarea
              name="shortDescription"
              maxLength={320}
              rows={2}
              defaultValue={editingBundle?.shortDescription ?? ''}
              key={`description-${editingBundle?.id ?? 'new'}`}
              placeholder="Qué incluye o para qué ocasión sirve"
            />
          </label>
        </div>

        <div className="admin-combo-products">
          <div>
            <strong>Productos incluidos</strong>
            <span>Elegí entre 2 y 8. Podés cambiar la cantidad de cada uno.</span>
          </div>

          <div className="admin-combo-product-grid">
            {products.map((product) => {
              const checked = Object.hasOwn(selected, product.id)
              return (
                <article
                  className={`admin-combo-product${checked ? ' is-selected' : ''}`}
                  key={product.id}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        toggleProduct(product.id, event.target.checked)
                      }
                    />
                    <span>
                      <strong>{product.name}</strong>
                      <small>
                        {product.pricing_mode === 'quote'
                          ? 'Consultar'
                          : product.base_price
                            ? formatPrice(product.base_price)
                            : 'Sin precio'}
                      </small>
                    </span>
                  </label>

                  {checked && (
                    <label className="admin-combo-quantity">
                      Cant.
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={selected[product.id] ?? 1}
                        onChange={(event) =>
                          updateQuantity(product.id, Number(event.target.value))
                        }
                      />
                    </label>
                  )}
                </article>
              )
            })}
          </div>
        </div>

        <label className="admin-checkbox admin-combo-featured">
          <input
            name="featured"
            type="checkbox"
            defaultChecked={editingBundle?.featured ?? false}
            key={`featured-${editingBundle?.id ?? 'new'}`}
          />
          <span>Destacar combo en la tienda</span>
        </label>

        <div className="admin-combo-actions">
          <button className="admin-primary" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : editingId ? 'Guardar combo' : 'Crear combo'}
          </button>
          {editingId && (
            <button className="admin-secondary" type="button" onClick={resetForm}>
              Cancelar edición
            </button>
          )}
        </div>

        {message && <p className="admin-form-message">{message}</p>}
      </form>

      <div className="admin-combo-list">
        <div className="admin-combo-list-heading">
          <strong>Combos activos</strong>
          <span>
            {state === 'loading'
              ? 'Cargando…'
              : `${bundles.length} ${bundles.length === 1 ? 'combo' : 'combos'}`}
          </span>
        </div>

        {state === 'error' && (
          <div className="admin-empty">No pudimos cargar los combos.</div>
        )}

        {state === 'ready' && bundles.length === 0 && (
          <div className="admin-empty">
            Todavía no hay combos. Creá el primero cuando tengas una propuesta cerrada.
          </div>
        )}

        {bundles.map((bundle) => (
          <article className="admin-combo-row" key={bundle.id}>
            <div>
              <span>{bundle.featured ? '★ Destacado' : 'Combo'}</span>
              <strong>{bundle.name}</strong>
              <small>
                {bundle.items
                  .map((item) => `${item.quantity}x ${item.productName}`)
                  .join(' · ')}
              </small>
            </div>

            <strong>{formatPrice(bundle.bundlePrice)}</strong>

            <div className="admin-row-actions">
              <button
                className="admin-edit"
                type="button"
                onClick={() => startEdit(bundle)}
              >
                Editar
              </button>
              <button
                className="admin-danger"
                type="button"
                onClick={() => void removeBundle(bundle)}
                disabled={busy}
              >
                Quitar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
