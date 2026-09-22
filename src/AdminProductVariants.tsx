import { useCallback, useEffect, useState, type FormEvent } from 'react'

type ProductForVariants = {
  id: string
  name: string
  pricing_mode: 'fixed' | 'from' | 'quote'
  base_price: string | null
}

type Variant = {
  id: string
  product_id: string
  name: string
  price_override: string | null
  sort_order: number
  active: boolean
}

type Props = {
  product: ProductForVariants
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
  if (!value) return 'Precio base'

  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Precio base'

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function AdminProductVariants({ product }: Props) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [drafts, setDrafts] = useState<Record<string, { name: string; price: string }>>({})
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const applyVariants = useCallback((next: Variant[]) => {
    setVariants(next)
    setDrafts(
      Object.fromEntries(
        next.map((variant) => [
          variant.id,
          {
            name: variant.name,
            price: variant.price_override ?? '',
          },
        ]),
      ),
    )
    setState('ready')
  }, [])

  const loadVariants = useCallback(async () => {
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/variants?productId=${encodeURIComponent(product.id)}`,
        { cache: 'no-store' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { variants: Variant[] }
      applyVariants(data.variants)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar las variantes.')
      setState('error')
    }
  }, [applyVariants, product.id])

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/admin/variants?productId=${encodeURIComponent(product.id)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response))
        return (await response.json()) as { variants: Variant[] }
      })
      .then((data) => {
        if (!controller.signal.aborted) applyVariants(data.variants)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setMessage(error instanceof Error ? error.message : 'No se pudieron cargar las variantes.')
        setState('error')
      })

    return () => controller.abort()
  }, [applyVariants, product.id])

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)

    setBusyId('create')
    setMessage('')

    try {
      const response = await fetch('/api/admin/variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          name: data.get('variantName'),
          priceOverride: product.pricing_mode === 'quote' ? null : data.get('variantPrice'),
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      form.reset()
      await loadVariants()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la variante.')
    } finally {
      setBusyId(null)
    }
  }

  async function saveVariant(variant: Variant) {
    const draft = drafts[variant.id]
    if (!draft) return

    setBusyId(variant.id)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/variants?id=${encodeURIComponent(variant.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name,
            priceOverride: product.pricing_mode === 'quote' ? null : draft.price,
          }),
        },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      await loadVariants()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la variante.')
    } finally {
      setBusyId(null)
    }
  }

  async function removeVariant(variant: Variant) {
    const confirmed = window.confirm(`¿Quitar la variante "${variant.name}"?`)
    if (!confirmed) return

    setBusyId(variant.id)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/variants?id=${encodeURIComponent(variant.id)}`,
        { method: 'DELETE' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      await loadVariants()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo quitar la variante.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="admin-variants">
      <div className="admin-variants-heading">
        <div>
          <span>Variantes</span>
          <strong>Tamaños, formatos u opciones</strong>
        </div>
        <small>
          {variants.length > 0 && (
            <strong>{variants.length} variantes · </strong>
          )}
          {product.pricing_mode === 'quote'
            ? 'Este producto cotiza todas sus variantes.'
            : `Sin precio propio, usa ${money(product.base_price)}.`}
        </small>
      </div>

      {message && <p className="admin-variants-message">{message}</p>}

      {state === 'loading' && (
        <div className="admin-variants-empty">Cargando variantes…</div>
      )}

      {state !== 'loading' && variants.length === 0 && (
        <div className="admin-variants-empty">Todavía no hay variantes cargadas.</div>
      )}

      {variants.length > 0 && (
        <div className="admin-variants-list">
          {variants.map((variant) => {
            const draft = drafts[variant.id] ?? {
              name: variant.name,
              price: variant.price_override ?? '',
            }
            const busy = busyId === variant.id

            return (
              <div className="admin-variant-row" key={variant.id}>
                <label>
                  Nombre
                  <input
                    type="text"
                    maxLength={80}
                    value={draft.name}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [variant.id]: {
                          ...draft,
                          name: event.target.value,
                        },
                      }))
                    }
                    disabled={busy}
                  />
                </label>

                <label>
                  Precio propio
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={product.pricing_mode === 'quote' ? 'A consultar' : 'Usar precio base'}
                    value={product.pricing_mode === 'quote' ? '' : draft.price}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [variant.id]: {
                          ...draft,
                          price: event.target.value,
                        },
                      }))
                    }
                    disabled={busy || product.pricing_mode === 'quote'}
                  />
                </label>

                <div className="admin-variant-actions">
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void saveVariant(variant)}
                    disabled={busy || !draft.name.trim()}
                  >
                    Guardar
                  </button>

                  <button
                    type="button"
                    className="admin-danger"
                    onClick={() => void removeVariant(variant)}
                    disabled={busy}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <form className="admin-variant-create" onSubmit={createVariant}>
        <label>
          Nueva variante
          <input
            name="variantName"
            type="text"
            maxLength={80}
            placeholder="Ej. A4, A5, 20 cm, Pack x10"
            required
          />
        </label>

        <label>
          Precio propio
          <input
            name="variantPrice"
            type="text"
            inputMode="decimal"
            placeholder={product.pricing_mode === 'quote' ? 'A consultar' : 'Opcional'}
            disabled={product.pricing_mode === 'quote'}
          />
        </label>

        <button
          type="submit"
          className="admin-primary"
          disabled={busyId !== null}
        >
          {busyId === 'create' ? 'Agregando…' : 'Agregar variante'}
        </button>
      </form>
    </section>
  )
}
