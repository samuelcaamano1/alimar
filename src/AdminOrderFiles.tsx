import { useState } from 'react'

export type AdminOrderFileKind =
  | 'reference'
  | 'design'
  | 'production'
  | 'print'
  | '3d'
  | 'other'

export type AdminOrderFile = {
  id: string
  order_id: string
  kind: AdminOrderFileKind
  label: string
  url: string
  note: string | null
  customer_visible: boolean
  created_at: string
}

type FileDraft = {
  kind: AdminOrderFileKind
  label: string
  url: string
  note: string
}

const kindLabels: Record<AdminOrderFileKind, string> = {
  reference: 'Referencia del cliente',
  design: 'Diseño',
  production: 'Producción',
  print: 'Archivo para imprimir',
  '3d': 'Archivo 3D',
  other: 'Otro',
}

const emptyDraft: FileDraft = {
  kind: 'reference',
  label: '',
  url: '',
  note: '',
}

function dateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

type AdminOrderFilesProps = {
  orderId: string
  files: AdminOrderFile[]
  disabled?: boolean
  onChanged: () => void | Promise<void>
}

export default function AdminOrderFiles({
  orderId,
  files,
  disabled = false,
  onChanged,
}: AdminOrderFilesProps) {
  const [draft, setDraft] = useState<FileDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function addFile() {
    if (saving || disabled) return

    const label = draft.label.trim()
    const url = draft.url.trim()

    if (!label) {
      setMessage('Poné un nombre para identificar el archivo.')
      return
    }

    if (!/^https:\/\//i.test(url)) {
      setMessage('Pegá un enlace HTTPS válido.')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          kind: draft.kind,
          label,
          url,
          note: draft.note.trim(),
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setDraft(emptyDraft)
      setMessage('Archivo agregado al pedido.')
      await onChanged()
      window.dispatchEvent(new Event('alimar:order-files-changed'))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo agregar el archivo.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function setVisibility(file: AdminOrderFile, visible: boolean) {
    if (sharingId || disabled) return

    setSharingId(file.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=file-visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          fileId: file.id,
          visible,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setMessage(visible ? 'Archivo visible para el cliente.' : 'Archivo oculto para el cliente.')
      await onChanged()
      window.dispatchEvent(new Event('alimar:order-files-changed'))
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo cambiar la visibilidad del archivo.',
      )
    } finally {
      setSharingId(null)
    }
  }

  async function archiveFile(file: AdminOrderFile) {
    if (archivingId || disabled) return

    setArchivingId(file.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=file-archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          fileId: file.id,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setMessage('Archivo archivado.')
      await onChanged()
      window.dispatchEvent(new Event('alimar:order-files-changed'))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo archivar el archivo.',
      )
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <section className="admin-order-files">
      <div className="admin-order-files-heading">
        <div>
          <span>Archivos del trabajo</span>
          <strong>
            {files.length === 0
              ? 'Todavía no hay archivos vinculados'
              : `${files.length} archivo(s) activo(s)`}
          </strong>
        </div>
        <small>Referencias, diseños, impresión y archivos 3D.</small>
      </div>

      {files.length > 0 && (
        <div className="admin-order-files-list">
          {files.map((file) => (
            <article key={file.id} className={`is-${file.kind}`}>
              <div className="admin-order-file-main">
                <span>{kindLabels[file.kind]}</span>
                <strong>{file.label}</strong>
                {file.note && <p>{file.note}</p>}
                <small
                  className={`admin-order-file-visibility ${
                    file.customer_visible ? 'is-shared' : 'is-private'
                  }`}
                >
                  {file.customer_visible ? 'Visible para cliente' : 'Sólo interno'}
                </small>
                <small>Agregado {dateTime(file.created_at)}</small>
              </div>

              <div className="admin-order-file-actions">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir ↗
                </a>
                <button
                  type="button"
                  className={file.customer_visible ? 'is-shared' : ''}
                  onClick={() => void setVisibility(file, !file.customer_visible)}
                  disabled={disabled || sharingId === file.id}
                >
                  {sharingId === file.id
                    ? 'Guardando…'
                    : file.customer_visible
                      ? 'Ocultar del cliente'
                      : 'Compartir con cliente'}
                </button>
                <button
                  type="button"
                  onClick={() => void archiveFile(file)}
                  disabled={disabled || archivingId === file.id}
                >
                  {archivingId === file.id ? 'Archivando…' : 'Archivar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="admin-order-file-form">
        <label>
          Tipo
          <select
            value={draft.kind}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                kind: event.target.value as AdminOrderFileKind,
              }))
            }
            disabled={disabled || saving}
          >
            {(
              Object.entries(kindLabels) as Array<
                [AdminOrderFileKind, string]
              >
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Nombre
          <input
            value={draft.label}
            maxLength={120}
            placeholder="Ej. Logo final / Diseño aprobado / STL soporte"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                label: event.target.value,
              }))
            }
            disabled={disabled || saving}
          />
        </label>

        <label className="admin-order-file-url">
          Enlace HTTPS
          <input
            value={draft.url}
            maxLength={4000}
            inputMode="url"
            placeholder="https://drive.google.com/..."
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                url: event.target.value,
              }))
            }
            disabled={disabled || saving}
          />
        </label>

        <label className="admin-order-file-note">
          Nota opcional
          <input
            value={draft.note}
            maxLength={500}
            placeholder="Ej. versión final para imprimir"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                note: event.target.value,
              }))
            }
            disabled={disabled || saving}
          />
        </label>

        <button
          className="admin-secondary"
          type="button"
          onClick={() => void addFile()}
          disabled={disabled || saving || !draft.label.trim() || !draft.url.trim()}
        >
          {saving ? 'Agregando…' : 'Agregar archivo'}
        </button>
      </div>

      <small className="admin-order-files-storage-note">
        Alimar guarda el enlace, no el archivo pesado. Usá Drive, Dropbox u otro enlace HTTPS.
      </small>

      {message && <small className="admin-order-files-message">{message}</small>}
    </section>
  )
}
