import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { compressImageFile } from './imageDataUrl'

type RequestType = 'paper' | '3d' | 'event' | 'design' | 'other'
type ArtType =
  | 'sheet'
  | 'party'
  | 'card'
  | 'stickers'
  | 'box'
  | 'poster'
  | 'cube'
  | 'idea'

type CustomExample = {
  id: string
  key: string
  title: string
  hint: string
  requestType: RequestType
  art: ArtType
  imageUrl: string | null
  imageAlt: string | null
  sizePlaceholder: string
  themePlaceholder: string
  descriptionPlaceholder: string
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

type ExampleDraft = {
  id: string | null
  title: string
  hint: string
  requestType: RequestType
  art: ArtType
  imageUrl: string
  imageAlt: string
  sizePlaceholder: string
  themePlaceholder: string
  descriptionPlaceholder: string
  active: boolean
}

const requestTypeLabels: Record<RequestType, string> = {
  paper: 'Papel / impresión',
  '3d': '3D',
  event: 'Evento',
  design: 'Diseño',
  other: 'Otro',
}

const artLabels: Record<ArtType, string> = {
  sheet: 'Hoja',
  party: 'Fiesta',
  card: 'Tarjeta',
  stickers: 'Stickers',
  box: 'Caja',
  poster: 'Cartel',
  cube: '3D',
  idea: 'Idea',
}

function emptyDraft(): ExampleDraft {
  return {
    id: null,
    title: '',
    hint: '',
    requestType: 'paper',
    art: 'idea',
    imageUrl: '',
    imageAlt: '',
    sizePlaceholder: 'Ej. chico, mediano o grande',
    themePlaceholder: 'Ej. colores, personaje, estilo...',
    descriptionPlaceholder:
      'Contanos la idea como se la contarías a alguien por WhatsApp.',
    active: true,
  }
}

function draftFromExample(example: CustomExample): ExampleDraft {
  return {
    id: example.id,
    title: example.title,
    hint: example.hint,
    requestType: example.requestType,
    art: example.art,
    imageUrl: example.imageUrl ?? '',
    imageAlt: example.imageAlt ?? '',
    sizePlaceholder: example.sizePlaceholder,
    themePlaceholder: example.themePlaceholder,
    descriptionPlaceholder: example.descriptionPlaceholder,
    active: example.active,
  }
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

export default function AdminCustomExamples() {
  const [examples, setExamples] = useState<CustomExample[]>([])
  const [draft, setDraft] = useState<ExampleDraft>(() => emptyDraft())
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)

  const loadExamples = useCallback(async () => {
    setState('loading')
    setMessage('')

    try {
      const response = await fetch('/api/admin/catalog?action=custom-examples', {
        cache: 'no-store',
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { examples: CustomExample[] }
      setExamples(data.examples)
      setState('ready')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar los ejemplos.',
      )
      setState('error')
    }
  }, [])

  useEffect(() => {
    void loadExamples()
  }, [loadExamples])

  const activeCount = useMemo(
    () => examples.filter((example) => example.active).length,
    [examples],
  )

  async function saveExample() {
    if (draft.title.trim().length < 3 || draft.hint.trim().length < 8) {
      setMessage('Completá título y explicación del ejemplo.')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      const isNew = draft.id === null
      const sortOrder = isNew
        ? Math.max(-1, ...examples.map((example) => example.sortOrder)) + 1
        : examples.find((example) => example.id === draft.id)?.sortOrder ?? 0

      const response = await fetch(
        `/api/admin/catalog?action=custom-examples${
          isNew ? '' : `&id=${encodeURIComponent(draft.id ?? '')}`
        }`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: draft.title,
            hint: draft.hint,
            requestType: draft.requestType,
            art: draft.art,
            imageUrl: draft.imageUrl || null,
            imageAlt: draft.imageAlt,
            sizePlaceholder: draft.sizePlaceholder,
            themePlaceholder: draft.themePlaceholder,
            descriptionPlaceholder: draft.descriptionPlaceholder,
            sortOrder,
            active: draft.active,
          }),
        },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { example: CustomExample }

      if (isNew) {
        setExamples((current) =>
          [...current, data.example].sort(
            (left, right) => left.sortOrder - right.sortOrder,
          ),
        )
      } else {
        setExamples((current) =>
          current.map((example) =>
            example.id === data.example.id ? data.example : example,
          ),
        )
      }

      setDraft(draftFromExample(data.example))
      setMessage(isNew ? 'Ejemplo creado.' : 'Ejemplo actualizado.')
      window.dispatchEvent(new Event('alimar:custom-examples-changed'))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo guardar el ejemplo.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(example: CustomExample) {
    setSaving(true)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/catalog?action=custom-examples&id=${encodeURIComponent(
          example.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: example.title,
            hint: example.hint,
            requestType: example.requestType,
            art: example.art,
            imageUrl: example.imageUrl,
            imageAlt: example.imageAlt,
            sizePlaceholder: example.sizePlaceholder,
            themePlaceholder: example.themePlaceholder,
            descriptionPlaceholder: example.descriptionPlaceholder,
            sortOrder: example.sortOrder,
            active: !example.active,
          }),
        },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { example: CustomExample }

      setExamples((current) =>
        current.map((item) =>
          item.id === data.example.id ? data.example : item,
        ),
      )

      if (draft.id === data.example.id) {
        setDraft(draftFromExample(data.example))
      }

      setMessage(data.example.active ? 'Ejemplo visible.' : 'Ejemplo oculto.')
      window.dispatchEvent(new Event('alimar:custom-examples-changed'))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo cambiar el estado.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function moveExample(example: CustomExample, direction: -1 | 1) {
    const index = examples.findIndex((item) => item.id === example.id)
    const target = index + direction

    if (index < 0 || target < 0 || target >= examples.length) return

    const next = [...examples]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)

    setMovingId(example.id)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/catalog?action=custom-examples&id=${encodeURIComponent(
          example.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reorder',
            orderedIds: next.map((item) => item.id),
          }),
        },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      setExamples(
        next.map((item, sortOrder) => ({
          ...item,
          sortOrder,
        })),
      )
      setMessage('Orden actualizado.')
      window.dispatchEvent(new Event('alimar:custom-examples-changed'))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo cambiar el orden.',
      )
    } finally {
      setMovingId(null)
    }
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    setImageBusy(true)
    setMessage('')

    try {
      const imageUrl = await compressImageFile(file, {
        maxDimension: 1200,
        maxDataUrlLength: 900_000,
      })

      setDraft((current) => ({
        ...current,
        imageUrl,
        imageAlt: current.imageAlt || current.title,
      }))
      setMessage('Imagen preparada. Guardá el ejemplo para publicarla.')
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo preparar la imagen.',
      )
    } finally {
      setImageBusy(false)
    }
  }

  return (
    <section className="admin-panel admin-custom-examples">
      <div className="admin-custom-examples-heading">
        <div>
          <span className="admin-cost-eyebrow">Personalizados</span>
          <h2>Ejemplos de inspiración</h2>
          <p>
            Lo que ve el cliente antes de contar su idea. Podés cambiar textos,
            subir imágenes, ocultar opciones y ordenar la galería.
          </p>
        </div>

        <div>
          <strong>{activeCount}</strong>
          <span>visibles</span>
        </div>
      </div>

      {message && <div className="admin-toast">{message}</div>}

      <div className="admin-custom-examples-layout">
        <div className="admin-custom-examples-list">
          <button
            type="button"
            className={`admin-custom-example-card is-new${
              draft.id === null ? ' is-selected' : ''
            }`}
            onClick={() => setDraft(emptyDraft())}
          >
            <span>＋</span>
            <strong>Crear ejemplo</strong>
            <small>Nueva idea para mostrar en la tienda</small>
          </button>

          {state === 'loading' && examples.length === 0 && (
            <div className="admin-empty">Cargando ejemplos…</div>
          )}

          {examples.map((example, index) => (
            <article
              className={`admin-custom-example-card${
                draft.id === example.id ? ' is-selected' : ''
              }${example.active ? '' : ' is-hidden'}`}
              key={example.id}
            >
              <button
                className="admin-custom-example-select"
                type="button"
                onClick={() => setDraft(draftFromExample(example))}
              >
                {example.imageUrl ? (
                  <img
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
                  <small>{example.hint}</small>
                  <span>
                    {requestTypeLabels[example.requestType]} ·{' '}
                    {example.active ? 'Visible' : 'Oculto'}
                  </span>
                </div>
              </button>

              <div className="admin-custom-example-actions">
                <button
                  type="button"
                  onClick={() => void moveExample(example, -1)}
                  disabled={index === 0 || movingId !== null}
                  aria-label="Subir"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => void moveExample(example, 1)}
                  disabled={index === examples.length - 1 || movingId !== null}
                  aria-label="Bajar"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => void toggleActive(example)}
                  disabled={saving}
                >
                  {example.active ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="admin-custom-example-editor">
          <div className="admin-custom-example-editor-head">
            <div>
              <span>{draft.id ? 'Editar ejemplo' : 'Nuevo ejemplo'}</span>
              <strong>{draft.title || 'Sin título todavía'}</strong>
            </div>

            <label className="admin-custom-example-active">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
              />
              Visible
            </label>
          </div>

          <div className="admin-custom-example-preview">
            {draft.imageUrl ? (
              <img
                src={draft.imageUrl}
                alt={draft.imageAlt || draft.title || 'Vista previa'}
              />
            ) : (
              <div
                className={`custom-request-example-art is-${draft.art}`}
                aria-hidden="true"
              >
                <span />
                <span />
                <i />
              </div>
            )}

            <div>
              <label className="admin-secondary">
                {imageBusy ? 'Comprimiendo…' : 'Subir imagen'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void chooseImage(event)}
                  disabled={imageBusy}
                />
              </label>

              {draft.imageUrl && (
                <button
                  type="button"
                  className="admin-secondary"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      imageUrl: '',
                    }))
                  }
                >
                  Quitar imagen
                </button>
              )}
            </div>
          </div>

          <div className="admin-custom-example-fields">
            <label>
              Título para el cliente
              <input
                value={draft.title}
                maxLength={100}
                placeholder="Ej. Papel para tatuajes"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Tipo interno
              <select
                value={draft.requestType}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    requestType: event.target.value as RequestType,
                  }))
                }
              >
                {(
                  Object.entries(requestTypeLabels) as Array<
                    [RequestType, string]
                  >
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-custom-example-span-2">
              Explicación corta
              <input
                value={draft.hint}
                maxLength={240}
                placeholder="Explicalo como lo diría un cliente"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    hint: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Ilustración de respaldo
              <select
                value={draft.art}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    art: event.target.value as ArtType,
                  }))
                }
              >
                {(Object.entries(artLabels) as Array<[ArtType, string]>).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Texto alternativo de imagen
              <input
                value={draft.imageAlt}
                maxLength={180}
                placeholder="Descripción breve de la foto"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    imageAlt: event.target.value,
                  }))
                }
              />
            </label>

            <label className="admin-custom-example-span-2">
              Ayuda para tamaño aproximado
              <input
                value={draft.sizePlaceholder}
                maxLength={180}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sizePlaceholder: event.target.value,
                  }))
                }
              />
            </label>

            <label className="admin-custom-example-span-2">
              Ayuda para estilo / colores
              <input
                value={draft.themePlaceholder}
                maxLength={240}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    themePlaceholder: event.target.value,
                  }))
                }
              />
            </label>

            <label className="admin-custom-example-span-2">
              Ayuda para contar la idea
              <textarea
                rows={3}
                value={draft.descriptionPlaceholder}
                maxLength={360}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    descriptionPlaceholder: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <button
            className="admin-primary admin-custom-example-save"
            type="button"
            onClick={() => void saveExample()}
            disabled={saving || imageBusy}
          >
            {saving
              ? 'Guardando…'
              : draft.id
                ? 'Guardar cambios'
                : 'Crear ejemplo'}
          </button>
        </div>
      </div>
    </section>
  )
}
