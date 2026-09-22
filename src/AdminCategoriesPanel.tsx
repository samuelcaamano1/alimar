import { useState, type FormEvent } from 'react'

type ManagedCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number
}

type ManagedProduct = {
  category_id: string | null
}

type Props = {
  categories: ManagedCategory[]
  products: ManagedProduct[]
  onChanged: () => Promise<void>
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

export default function AdminCategoriesPanel({ categories, products, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  function productCount(categoryId: string) {
    return products.filter((product) => product.category_id === categoryId).length
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>, category: ManagedCategory) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)

    setBusyId(category.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          id: category.id,
          name: data.get('name'),
          description: data.get('description'),
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await onChanged()
      setEditingId(null)
      setMessage('Categoría actualizada.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la categoría.')
    } finally {
      setBusyId(null)
    }
  }

  async function moveCategory(categoryId: string, direction: -1 | 1) {
    const currentIndex = categories.findIndex((category) => category.id === categoryId)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= categories.length) return

    const next = [...categories]
    const [moved] = next.splice(currentIndex, 1)
    next.splice(nextIndex, 0, moved)

    setBusyId(categoryId)
    setMessage('')

    try {
      const response = await fetch('/api/admin/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          orderedIds: next.map((category) => category.id),
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await onChanged()
      setMessage('Orden de categorías actualizado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reordenar la categoría.')
    } finally {
      setBusyId(null)
    }
  }

  async function removeCategory(category: ManagedCategory) {
    const count = productCount(category.id)

    if (count > 0) {
      setMessage(
        count === 1
          ? 'Mové o quitá el producto activo antes de eliminar esta categoría.'
          : `Mové o quitá los ${count} productos activos antes de eliminar esta categoría.`,
      )
      return
    }

    const confirmed = window.confirm(`¿Eliminar la categoría "${category.name}"?`)
    if (!confirmed) return

    setBusyId(category.id)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/categories?id=${encodeURIComponent(category.id)}`,
        { method: 'DELETE' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      await onChanged()
      setEditingId((current) => (current === category.id ? null : current))
      setMessage('Categoría eliminada.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo eliminar la categoría.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="admin-panel admin-category-manager">
      <div className="admin-panel-heading">
        <span>03</span>
        <div>
          <h2>Administrar categorías</h2>
          <p>Editá nombres y descripciones, cambiá el orden o quitá categorías vacías.</p>
        </div>
      </div>

      {message && <div className="admin-category-message">{message}</div>}

      {categories.length === 0 ? (
        <div className="admin-empty">Todavía no hay categorías cargadas.</div>
      ) : (
        <div className="admin-category-manager-list">
          {categories.map((category, index) => {
            const count = productCount(category.id)
            const busy = busyId === category.id
            const editing = editingId === category.id

            return (
              <article className="admin-category-manager-row" key={category.id}>
                <div className="admin-category-manager-copy">
                  <strong>{category.name}</strong>
                  <span>
                    {count === 1 ? '1 producto activo' : `${count} productos activos`}
                  </span>
                  {category.description && <small>{category.description}</small>}
                </div>

                <div className="admin-category-manager-actions">
                  <button
                    className="admin-secondary"
                    type="button"
                    aria-label={`Subir ${category.name}`}
                    onClick={() => void moveCategory(category.id, -1)}
                    disabled={busyId !== null || index === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="admin-secondary"
                    type="button"
                    aria-label={`Bajar ${category.name}`}
                    onClick={() => void moveCategory(category.id, 1)}
                    disabled={busyId !== null || index === categories.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    className="admin-edit"
                    type="button"
                    onClick={() => {
                      setEditingId(editing ? null : category.id)
                      setMessage('')
                    }}
                    disabled={busyId !== null}
                  >
                    {editing ? 'Cerrar' : 'Editar'}
                  </button>
                  <button
                    className="admin-danger"
                    type="button"
                    onClick={() => void removeCategory(category)}
                    disabled={busyId !== null || count > 0}
                    title={count > 0 ? 'Primero mové o quitá los productos de esta categoría.' : ''}
                  >
                    Quitar
                  </button>
                </div>

                {editing && (
                  <form
                    className="admin-category-edit-form"
                    onSubmit={(event) => void saveCategory(event, category)}
                  >
                    <label>
                      Nombre
                      <input
                        name="name"
                        defaultValue={category.name}
                        maxLength={80}
                        required
                        disabled={busy}
                      />
                    </label>

                    <label>
                      Descripción
                      <textarea
                        name="description"
                        defaultValue={category.description ?? ''}
                        maxLength={240}
                        rows={3}
                        disabled={busy}
                      />
                    </label>

                    <button className="admin-primary" type="submit" disabled={busy}>
                      {busy ? 'Guardando…' : 'Guardar categoría'}
                    </button>
                  </form>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
