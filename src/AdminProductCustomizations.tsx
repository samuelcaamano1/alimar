import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

type ProductForCustomizations = {
  id: string
  name: string
  customization_allowed: boolean
}

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select'

type CustomizationField = {
  id: string
  product_id: string
  label: string
  field_type: FieldType
  placeholder: string | null
  options: string[]
  required: boolean
  max_length: number
  sort_order: number
}

type Props = {
  product: ProductForCustomizations
}

type Draft = {
  label: string
  fieldType: FieldType
  placeholder: string
  options: string
  required: boolean
  maxLength: string
}

const emptyDraft: Draft = {
  label: '',
  fieldType: 'text',
  placeholder: '',
  options: '',
  required: false,
  maxLength: '120',
}

const typeLabels: Record<FieldType, string> = {
  text: 'Texto corto',
  textarea: 'Texto largo',
  number: 'Número',
  date: 'Fecha',
  select: 'Opciones',
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

function draftFromField(field: CustomizationField): Draft {
  return {
    label: field.label,
    fieldType: field.field_type,
    placeholder: field.placeholder ?? '',
    options: field.options.join(', '),
    required: field.required,
    maxLength: String(field.max_length),
  }
}

function payloadFromDraft(productId: string, draft: Draft) {
  return {
    productId,
    label: draft.label,
    fieldType: draft.fieldType,
    placeholder: draft.placeholder,
    options:
      draft.fieldType === 'select'
        ? draft.options
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : [],
    required: draft.required,
    maxLength: Number(draft.maxLength),
  }
}

export default function AdminProductCustomizations({ product }: Props) {
  const [fields, setFields] = useState<CustomizationField[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)

  const loadFields = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/products?action=customizations&productId=${encodeURIComponent(product.id)}`,
        { cache: 'no-store' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { fields: CustomizationField[] }
      setFields(data.fields)
      setState('ready')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar los campos de personalización.',
      )
      setState('error')
    }
  }, [product.id])

  useEffect(() => {
    void loadFields()
  }, [loadFields])

  const orderedFields = useMemo(
    () => [...fields].sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  )

  async function createField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (fields.length >= 8) return

    setBusyId('create')
    setMessage('')

    try {
      const response = await fetch('/api/admin/products?action=customizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromDraft(product.id, createDraft)),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setCreateDraft(emptyDraft)
      await loadFields()
      setMessage('Campo de personalización creado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el campo.')
    } finally {
      setBusyId(null)
    }
  }

  async function saveField(event: FormEvent<HTMLFormElement>, field: CustomizationField) {
    event.preventDefault()
    setBusyId(field.id)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/products?action=customizations&id=${encodeURIComponent(field.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edit',
            ...payloadFromDraft(product.id, editDraft),
          }),
        },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      setEditingId(null)
      await loadFields()
      setMessage('Campo actualizado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el campo.')
    } finally {
      setBusyId(null)
    }
  }

  async function moveField(fieldId: string, direction: -1 | 1) {
    const currentIndex = orderedFields.findIndex((field) => field.id === fieldId)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedFields.length) return

    const next = [...orderedFields]
    const [moved] = next.splice(currentIndex, 1)
    next.splice(nextIndex, 0, moved)

    setBusyId(fieldId)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/products?action=customizations&id=${encodeURIComponent(fieldId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reorder',
            productId: product.id,
            orderedIds: next.map((field) => field.id),
          }),
        },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      await loadFields()
      setMessage('Orden de campos actualizado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reordenar el campo.')
    } finally {
      setBusyId(null)
    }
  }

  async function removeField(field: CustomizationField) {
    const confirmed = window.confirm(`¿Quitar el campo "${field.label}"?`)
    if (!confirmed) return

    setBusyId(field.id)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/products?action=customizations&id=${encodeURIComponent(field.id)}`,
        { method: 'DELETE' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      if (editingId === field.id) setEditingId(null)
      await loadFields()
      setMessage('Campo quitado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo quitar el campo.')
    } finally {
      setBusyId(null)
    }
  }

  function updateCreate<K extends keyof Draft>(key: K, value: Draft[K]) {
    setCreateDraft((current) => ({ ...current, [key]: value }))
  }

  function updateEdit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setEditDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="admin-customizations">
      <div className="admin-customizations-heading">
        <div>
          <span>Personalización</span>
          <strong>Campos que completa el cliente</strong>
        </div>
        <small>
          {fields.length}/8 campos · Nombre, edad, fecha, color, texto u opciones.
        </small>
      </div>

      {!product.customization_allowed && (
        <p className="admin-customizations-hint">
          Este producto todavía tiene desactivado “Permite personalización”. Podés preparar
          los campos ahora y activarlo al guardar el producto.
        </p>
      )}

      {message && <p className="admin-customizations-message">{message}</p>}

      {state === 'loading' && (
        <div className="admin-customizations-empty">Cargando campos…</div>
      )}

      {state !== 'loading' && orderedFields.length === 0 && (
        <div className="admin-customizations-empty">
          Todavía no hay campos configurados para este producto.
        </div>
      )}

      {orderedFields.length > 0 && (
        <div className="admin-customizations-list">
          {orderedFields.map((field, index) => {
            const editing = editingId === field.id
            const busy = busyId === field.id

            return (
              <article className="admin-customization-row" key={field.id}>
                <div className="admin-customization-copy">
                  <strong>{field.label}</strong>
                  <span>
                    {typeLabels[field.field_type]}
                    {field.required ? ' · Obligatorio' : ' · Opcional'}
                  </span>
                  {field.field_type === 'select' && field.options.length > 0 && (
                    <small>{field.options.join(' · ')}</small>
                  )}
                </div>

                <div className="admin-customization-actions">
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void moveField(field.id, -1)}
                    disabled={busyId !== null || index === 0}
                    aria-label={`Subir ${field.label}`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void moveField(field.id, 1)}
                    disabled={busyId !== null || index === orderedFields.length - 1}
                    aria-label={`Bajar ${field.label}`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="admin-edit"
                    onClick={() => {
                      if (editing) {
                        setEditingId(null)
                        return
                      }
                      setEditingId(field.id)
                      setEditDraft(draftFromField(field))
                      setMessage('')
                    }}
                    disabled={busyId !== null}
                  >
                    {editing ? 'Cerrar' : 'Editar'}
                  </button>
                  <button
                    type="button"
                    className="admin-danger"
                    onClick={() => void removeField(field)}
                    disabled={busyId !== null}
                  >
                    Quitar
                  </button>
                </div>

                {editing && (
                  <FieldForm
                    draft={editDraft}
                    setDraft={updateEdit}
                    submitLabel={busy ? 'Guardando…' : 'Guardar campo'}
                    busy={busy}
                    onSubmit={(event) => void saveField(event, field)}
                  />
                )}
              </article>
            )
          })}
        </div>
      )}

      <form className="admin-customization-create" onSubmit={createField}>
        <div className="admin-customization-create-heading">
          <strong>Agregar campo</strong>
          <span>Se mostrará al cliente cuando personalice este producto.</span>
        </div>

        <FieldForm
          draft={createDraft}
          setDraft={updateCreate}
          submitLabel={
            busyId === 'create'
              ? 'Creando…'
              : fields.length >= 8
                ? 'Límite de 8 campos'
                : 'Agregar campo'
          }
          busy={busyId !== null || fields.length >= 8}
          onSubmit={createField}
          nested
        />
      </form>
    </section>
  )
}

type FieldFormProps = {
  draft: Draft
  setDraft: <K extends keyof Draft>(key: K, value: Draft[K]) => void
  submitLabel: string
  busy: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  nested?: boolean
}

function FieldForm({
  draft,
  setDraft,
  submitLabel,
  busy,
  onSubmit,
  nested = false,
}: FieldFormProps) {
  const content = (
    <>
      <label>
        Nombre del campo
        <input
          value={draft.label}
          onChange={(event) => setDraft('label', event.target.value)}
          maxLength={80}
          placeholder="Ej. Nombre del cumpleañero"
          required
          disabled={busy}
        />
      </label>

      <label>
        Tipo
        <select
          value={draft.fieldType}
          onChange={(event) => setDraft('fieldType', event.target.value as FieldType)}
          disabled={busy}
        >
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-customization-span-2">
        Ayuda / placeholder
        <input
          value={draft.placeholder}
          onChange={(event) => setDraft('placeholder', event.target.value)}
          maxLength={120}
          placeholder="Ej. Martina"
          disabled={busy}
        />
      </label>

      {draft.fieldType === 'select' && (
        <label className="admin-customization-span-2">
          Opciones separadas por coma
          <input
            value={draft.options}
            onChange={(event) => setDraft('options', event.target.value)}
            maxLength={720}
            placeholder="Ej. Rosa, Celeste, Dorado"
            required
            disabled={busy}
          />
        </label>
      )}

      {(draft.fieldType === 'text' || draft.fieldType === 'textarea') && (
        <label>
          Máximo de caracteres
          <input
            type="number"
            min={1}
            max={500}
            value={draft.maxLength}
            onChange={(event) => setDraft('maxLength', event.target.value)}
            required
            disabled={busy}
          />
        </label>
      )}

      <label className="admin-check">
        <input
          type="checkbox"
          checked={draft.required}
          onChange={(event) => setDraft('required', event.target.checked)}
          disabled={busy}
        />
        <span>Obligatorio</span>
      </label>

      <button className="admin-primary" type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </>
  )

  if (nested) {
    return <div className="admin-customization-form-grid">{content}</div>
  }

  return (
    <form className="admin-customization-form-grid" onSubmit={onSubmit}>
      {content}
    </form>
  )
}
