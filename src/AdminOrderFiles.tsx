import { useState } from 'react'
import {
  customerWhatsappUrl,
  orderDesignApprovalWhatsappMessage,
  orderDesignChangesReceivedWhatsappMessage,
} from './adminWhatsapp'

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
  approval_status: 'not_required' | 'pending' | 'approved' | 'changes_requested'
  approval_comment: string | null
  approval_requested_at: string | null
  approval_responded_at: string | null
  design_series_id: string | null
  revision_number: number | null
  supersedes_file_id: string | null
  created_at: string
}

type ProductionStage =
  | 'not_started'
  | 'design'
  | 'awaiting_approval'
  | 'materials'
  | 'production'
  | 'finishing'
  | 'ready_for_delivery'

type FileDraft = {
  kind: AdminOrderFileKind
  label: string
  url: string
  note: string
}

type RevisionDraft = {
  label: string
  url: string
  note: string
}

const approvalLabels: Record<AdminOrderFile['approval_status'], string> = {
  not_required: 'Sin aprobación solicitada',
  pending: 'Esperando respuesta del cliente',
  approved: 'Aprobado por el cliente',
  changes_requested: 'Cliente pidió cambios',
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

const emptyRevisionDraft: RevisionDraft = {
  label: '',
  url: '',
  note: '',
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

type UploadTicket = {
  uploadUrl: string
  blobUrl: string
  maximumSizeInBytes: number
  expiresAt: number
}

function fileSize(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function safeUploadFilename(filename: string) {
  const normalized = filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-120)

  return normalized || 'archivo.bin'
}

function uploadPath(orderId: string, filename: string) {
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  return `orders/${orderId}/${unique}-${safeUploadFilename(filename)}`
}

async function uploadOrderFileFromDevice(
  orderId: string,
  file: File,
  onProgress: (percentage: number) => void,
) {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('El archivo debe pesar entre 1 byte y 100 MB.')
  }

  const pathname = uploadPath(orderId, file.name)
  const ticketResponse = await fetch('/api/admin/orders?action=file-upload-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, pathname, size: file.size }),
  })

  if (!ticketResponse.ok) throw new Error(await responseMessage(ticketResponse))

  const ticket = (await ticketResponse.json()) as UploadTicket
  if (!ticket.uploadUrl || !ticket.blobUrl) {
    throw new Error('Vercel Blob no devolvió una autorización de subida válida.')
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', ticket.uploadUrl, true)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))))
    }

    xhr.onerror = () => reject(new Error('Se cortó la conexión durante la subida.'))
    xhr.onabort = () => reject(new Error('La subida fue cancelada.'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
        return
      }

      reject(new Error(`Vercel Blob rechazó la subida (HTTP ${xhr.status}).`))
    }

    xhr.send(file)
  })

  return ticket.blobUrl
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
  orderCode: string
  trackingToken: string
  customerName: string
  customerPhone: string
  productionStage: ProductionStage
  files: AdminOrderFile[]
  disabled?: boolean
  onChanged: () => void | Promise<void>
}

export default function AdminOrderFiles({
  orderId,
  orderCode,
  trackingToken,
  customerName,
  customerPhone,
  productionStage,
  files,
  disabled = false,
  onChanged,
}: AdminOrderFilesProps) {
  const [draft, setDraft] = useState<FileDraft>(emptyDraft)
  const [deviceFile, setDeviceFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [approvalId, setApprovalId] = useState<string | null>(null)
  const [continuingId, setContinuingId] = useState<string | null>(null)
  const [revisionSourceId, setRevisionSourceId] = useState<string | null>(null)
  const [revisionDraft, setRevisionDraft] =
    useState<RevisionDraft>(emptyRevisionDraft)
  const [revisionDeviceFile, setRevisionDeviceFile] = useState<File | null>(null)
  const [revisionUploadProgress, setRevisionUploadProgress] = useState(0)
  const [revisionSaving, setRevisionSaving] = useState(false)
  const [message, setMessage] = useState('')

  const customerTrackingUrl = `${window.location.origin}/?pedido=${encodeURIComponent(trackingToken)}`
  const latestSharedDesignId =
    files.find((file) => file.kind === 'design' && file.customer_visible)?.id ?? null

  function hasNewerRevision(file: AdminOrderFile) {
    if (file.kind !== 'design' || !file.design_series_id || !file.revision_number) {
      return false
    }

    return files.some(
      (candidate) =>
        candidate.kind === 'design' &&
        candidate.design_series_id === file.design_series_id &&
        Boolean(candidate.revision_number) &&
        Number(candidate.revision_number) > Number(file.revision_number),
    )
  }

  function designRevisionTrail(file: AdminOrderFile) {
    if (file.kind !== 'design' || !file.design_series_id) return []

    return files
      .filter(
        (candidate) =>
          candidate.kind === 'design' &&
          candidate.design_series_id === file.design_series_id &&
          Boolean(candidate.revision_number),
      )
      .slice()
      .sort(
        (left, right) =>
          Number(left.revision_number ?? 0) - Number(right.revision_number ?? 0),
      )
  }

  function startRevision(file: AdminOrderFile) {
    const nextRevision = (file.revision_number ?? 1) + 1
    setRevisionSourceId(file.id)
    setRevisionDraft({
      label: `${file.label} · revisión ${nextRevision}`,
      url: '',
      note: '',
    })
    setRevisionDeviceFile(null)
    setRevisionUploadProgress(0)
    setMessage('')
  }

  function designApprovalWhatsappUrl(file: AdminOrderFile) {
    return customerWhatsappUrl(
      customerPhone,
      orderDesignApprovalWhatsappMessage(
        { customerName, orderCode, trackingUrl: customerTrackingUrl },
        file.label,
      ),
    )
  }

  function designChangesWhatsappUrl(file: AdminOrderFile) {
    return customerWhatsappUrl(
      customerPhone,
      orderDesignChangesReceivedWhatsappMessage(
        { customerName, orderCode, trackingUrl: customerTrackingUrl },
        file.label,
      ),
    )
  }

  async function addFile() {
    if (saving || disabled) return

    const label = draft.label.trim()
    let url = draft.url.trim()

    if (!label) {
      setMessage('Poné un nombre para identificar el archivo.')
      return
    }

    if (!deviceFile && !/^https:\/\//i.test(url)) {
      setMessage('Elegí un archivo del dispositivo o pegá un enlace HTTPS válido.')
      return
    }

    setSaving(true)
    setUploadProgress(0)
    setMessage(deviceFile ? 'Subiendo archivo…' : '')

    try {
      if (deviceFile) {
        url = await uploadOrderFileFromDevice(orderId, deviceFile, setUploadProgress)
        setDeviceFile(null)
        setDraft((current) => ({ ...current, url }))
        setMessage('Subida completa. Vinculando al PED…')
      }

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
      setDeviceFile(null)
      setUploadProgress(0)
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

  async function requestApproval(file: AdminOrderFile) {
    if (approvalId || disabled) return

    setApprovalId(file.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=file-approval-request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, fileId: file.id }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setMessage('Aprobación solicitada al cliente.')
      await onChanged()
      window.dispatchEvent(new Event('alimar:order-files-changed'))
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo solicitar la aprobación.',
      )
    } finally {
      setApprovalId(null)
    }
  }

  async function createRevision(file: AdminOrderFile) {
    if (revisionSaving || disabled) return

    const label = revisionDraft.label.trim()
    let url = revisionDraft.url.trim()

    if (!label) {
      setMessage('Poné un nombre para la nueva revisión.')
      return
    }

    if (!revisionDeviceFile && !/^https:\/\//i.test(url)) {
      setMessage('Elegí el archivo de la revisión o pegá un enlace HTTPS válido.')
      return
    }

    setRevisionSaving(true)
    setRevisionUploadProgress(0)
    setMessage(revisionDeviceFile ? 'Subiendo nueva revisión…' : '')

    try {
      if (revisionDeviceFile) {
        url = await uploadOrderFileFromDevice(
          orderId,
          revisionDeviceFile,
          setRevisionUploadProgress,
        )
        setRevisionDeviceFile(null)
        setRevisionDraft((current) => ({ ...current, url }))
        setMessage('Subida completa. Creando revisión…')
      }

      const response = await fetch('/api/admin/orders?action=file-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          sourceFileId: file.id,
          label,
          url,
          note: revisionDraft.note.trim(),
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { revisionNumber?: number }
      setRevisionSourceId(null)
      setRevisionDraft(emptyRevisionDraft)
      setRevisionDeviceFile(null)
      setRevisionUploadProgress(0)
      setMessage(
        data.revisionNumber
          ? `Revisión ${data.revisionNumber} creada. Compartila cuando esté lista para el cliente.`
          : 'Nueva revisión creada. Compartila cuando esté lista para el cliente.',
      )
      await onChanged()
      window.dispatchEvent(new Event('alimar:order-files-changed'))
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo crear la nueva revisión.',
      )
    } finally {
      setRevisionSaving(false)
    }
  }

  async function continueAfterApproval(file: AdminOrderFile) {
    if (continuingId || disabled) return

    setContinuingId(file.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=production-stage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          stage: 'materials',
          note: `Diseño aprobado por el cliente: ${file.label}`,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setMessage('Diseño aprobado: el PED pasó a Preparando materiales.')
      await onChanged()
      window.dispatchEvent(new Event('alimar:production-stage-changed'))
      window.dispatchEvent(new Event('alimar:orders-changed'))
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo continuar la producción.',
      )
    } finally {
      setContinuingId(null)
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
          {files.map((file) => {
            const historicalRevision =
              file.kind === 'design' && hasNewerRevision(file)
            const revisionTrail =
              file.kind === 'design' && !historicalRevision
                ? designRevisionTrail(file)
                : []

            return (
            <article
              key={file.id}
              className={[
                `is-${file.kind}`,
                file.kind === 'design'
                  ? historicalRevision
                    ? 'is-historical-revision'
                    : 'is-current-revision'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="admin-order-file-main">
                <span>{kindLabels[file.kind]}</span>
                <strong>{file.label}</strong>
                {file.kind === 'design' && file.revision_number && (
                  <small className="admin-order-file-revision-badge">
                    Revisión {file.revision_number}
                    {historicalRevision ? ' · historial' : ' · vigente'}
                  </small>
                )}
                {revisionTrail.length > 1 && (
                  <div className="admin-order-file-revision-history">
                    <div className="admin-order-file-revision-history-heading">
                      <span>Historial de revisiones</span>
                      <strong>{revisionTrail.length} versiones</strong>
                    </div>
                    <div className="admin-order-file-revision-history-list">
                      {revisionTrail.map((revision) => (
                        <a
                          key={revision.id}
                          className={[
                            `is-${revision.approval_status}`,
                            revision.id === file.id ? 'is-current' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          href={revision.url}
                          target="_blank"
                          rel="noreferrer"
                          title={revision.label}
                        >
                          <strong>R{revision.revision_number}</strong>
                          <small>{approvalLabels[revision.approval_status]}</small>
                        </a>
                      ))}
                    </div>
                    <small>
                      R{file.revision_number} es la versión vigente. Las anteriores
                      quedan como historial interno y conservan la respuesta del cliente.
                    </small>
                  </div>
                )}
                {file.note && <p>{file.note}</p>}
                <small
                  className={`admin-order-file-visibility ${
                    file.customer_visible ? 'is-shared' : 'is-private'
                  }`}
                >
                  {file.customer_visible ? 'Visible para cliente' : 'Sólo interno'}
                </small>
                {file.kind === 'design' && (
                  <div
                    className={`admin-order-file-approval is-${file.approval_status}`}
                  >
                    <strong>{approvalLabels[file.approval_status]}</strong>
                    {file.approval_comment && (
                      <p>Cliente: {file.approval_comment}</p>
                    )}
                    {file.approval_requested_at && (
                      <small>Solicitada {dateTime(file.approval_requested_at)}</small>
                    )}
                    {file.approval_responded_at && (
                      <small>Respondida {dateTime(file.approval_responded_at)}</small>
                    )}
                  </div>
                )}
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
                {file.kind === 'design' && file.customer_visible && (
                  <button
                    type="button"
                    className="admin-order-file-approval-action"
                    onClick={() => void requestApproval(file)}
                    disabled={
                      disabled ||
                      approvalId === file.id ||
                      file.approval_status === 'pending'
                    }
                  >
                    {approvalId === file.id
                      ? 'Solicitando…'
                      : file.approval_status === 'pending'
                        ? 'Aprobación pendiente'
                        : file.approval_status === 'not_required'
                          ? 'Pedir aprobación'
                          : 'Pedir nueva aprobación'}
                  </button>
                )}
                {file.kind === 'design' &&
                  file.customer_visible &&
                  file.approval_status === 'pending' &&
                  designApprovalWhatsappUrl(file) && (
                    <a
                      className="admin-order-file-whatsapp is-approval"
                      href={designApprovalWhatsappUrl(file) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Enviar aprobación por WhatsApp
                    </a>
                  )}
                {file.kind === 'design' &&
                  file.approval_status === 'changes_requested' &&
                  !hasNewerRevision(file) && (
                    <button
                      type="button"
                      className="admin-order-file-revision-action"
                      onClick={() => {
                        if (revisionSourceId === file.id) {
                          setRevisionSourceId(null)
                          setRevisionDeviceFile(null)
                          setRevisionUploadProgress(0)
                        } else {
                          startRevision(file)
                        }
                      }}
                      disabled={disabled || revisionSaving}
                    >
                      {revisionSourceId === file.id
                        ? 'Cancelar nueva revisión'
                        : `Crear revisión ${(file.revision_number ?? 1) + 1}`}
                    </button>
                  )}
                {file.kind === 'design' &&
                  file.customer_visible &&
                  file.approval_status === 'changes_requested' &&
                  designChangesWhatsappUrl(file) && (
                    <a
                      className="admin-order-file-whatsapp is-changes"
                      href={designChangesWhatsappUrl(file) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Confirmar cambios por WhatsApp
                    </a>
                  )}
                {file.id === latestSharedDesignId &&
                  file.approval_status === 'approved' &&
                  (productionStage === 'design' ||
                    productionStage === 'awaiting_approval') && (
                    <button
                      type="button"
                      className="admin-order-file-continue"
                      onClick={() => void continueAfterApproval(file)}
                      disabled={disabled || continuingId === file.id}
                    >
                      {continuingId === file.id
                        ? 'Continuando…'
                        : 'Continuar: preparar materiales'}
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => void archiveFile(file)}
                  disabled={disabled || archivingId === file.id}
                >
                  {archivingId === file.id ? 'Archivando…' : 'Archivar'}
                </button>
              </div>

              {revisionSourceId === file.id && (
                <div className="admin-order-file-revision-form">
                  <div>
                    <strong>Nueva revisión del diseño</strong>
                    <small>
                      La revisión anterior conserva su respuesta y se oculta del
                      cliente. La nueva empieza interna hasta que la compartas.
                    </small>
                  </div>

                  <label className="admin-order-file-device-picker">
                    Archivo del dispositivo
                    <input
                      type="file"
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0] ?? null
                        setRevisionDeviceFile(nextFile)
                        setRevisionUploadProgress(0)
                        if (nextFile && !revisionDraft.label.trim()) {
                          setRevisionDraft((current) => ({
                            ...current,
                            label: nextFile.name.slice(0, 120),
                          }))
                        }
                      }}
                      disabled={revisionSaving}
                    />
                    {revisionDeviceFile && (
                      <small>{revisionDeviceFile.name} · {fileSize(revisionDeviceFile.size)}</small>
                    )}
                    {revisionSaving && revisionDeviceFile && (
                      <progress value={revisionUploadProgress} max={100} />
                    )}
                  </label>

                  <label>
                    Nombre
                    <input
                      value={revisionDraft.label}
                      maxLength={120}
                      onChange={(event) =>
                        setRevisionDraft((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                      disabled={revisionSaving}
                    />
                  </label>

                  <label className="admin-order-file-revision-url">
                    Enlace HTTPS (alternativa)
                    <input
                      value={revisionDraft.url}
                      maxLength={4000}
                      inputMode="url"
                      placeholder="https://drive.google.com/..."
                      onChange={(event) =>
                        setRevisionDraft((current) => ({
                          ...current,
                          url: event.target.value,
                        }))
                      }
                      disabled={revisionSaving}
                    />
                  </label>

                  <label>
                    Nota opcional
                    <input
                      value={revisionDraft.note}
                      maxLength={500}
                      placeholder="Ej. ajustes pedidos por el cliente"
                      onChange={(event) =>
                        setRevisionDraft((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      disabled={revisionSaving}
                    />
                  </label>

                  <button
                    type="button"
                    className="admin-primary"
                    onClick={() => void createRevision(file)}
                    disabled={
                      revisionSaving ||
                      !revisionDraft.label.trim() ||
                      (!revisionDeviceFile && !revisionDraft.url.trim())
                    }
                  >
                    {revisionSaving
                      ? revisionDeviceFile
                        ? `Subiendo ${revisionUploadProgress}%…`
                        : 'Creando…'
                      : revisionDeviceFile
                        ? 'Subir y crear revisión'
                        : 'Crear revisión desde enlace'}
                  </button>
                </div>
              )}
            </article>
            )
          })}
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

        <label className="admin-order-file-device-picker">
          Archivo del dispositivo
          <input
            type="file"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null
              setDeviceFile(nextFile)
              setUploadProgress(0)
              if (nextFile && !draft.label.trim()) {
                setDraft((current) => ({
                  ...current,
                  label: nextFile.name.slice(0, 120),
                }))
              }
            }}
            disabled={disabled || saving}
          />
          {deviceFile && (
            <small>{deviceFile.name} · {fileSize(deviceFile.size)}</small>
          )}
          {saving && deviceFile && (
            <progress value={uploadProgress} max={100} />
          )}
        </label>

        <label className="admin-order-file-url">
          Enlace HTTPS (alternativa)
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
          disabled={
            disabled ||
            saving ||
            !draft.label.trim() ||
            (!deviceFile && !draft.url.trim())
          }
        >
          {saving
            ? deviceFile
              ? `Subiendo ${uploadProgress}%…`
              : 'Agregando…'
            : deviceFile
              ? 'Subir y agregar'
              : 'Agregar enlace'}
        </button>
      </div>

      <small className="admin-order-files-storage-note">
        Podés subir archivos de hasta 100 MB directamente desde el dispositivo. Si Vercel Blob todavía no está conectado, el enlace HTTPS manual sigue funcionando.
      </small>

      {message && <small className="admin-order-files-message">{message}</small>}
    </section>
  )
}
