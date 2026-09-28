import { useCallback, useEffect, useMemo, useState } from 'react'

type NotificationKind =
  | 'order_created'
  | 'request_created'
  | 'design_approved'
  | 'design_changes_requested'
  | 'historical_order_linked'

type NotificationEntity = 'order' | 'request'

type AdminNotification = {
  id: string
  kind: NotificationKind
  title: string
  message: string
  entity_type: NotificationEntity
  entity_id: string
  entity_code: string
  read_at: string | null
  created_at: string
}

type NotificationsResponse = {
  notifications: AdminNotification[]
  unreadCount: number
}

type AdminNotificationsProps = {
  onOpenOrder: (orderId: string) => void
  onOpenRequest: (requestId: string) => void
}

const kindLabels: Record<NotificationKind, string> = {
  order_created: 'Nuevo PED',
  request_created: 'Nueva SOL',
  design_approved: 'Diseño aprobado',
  design_changes_requested: 'Cambios solicitados',
  historical_order_linked: 'PED vinculado',
}

function dateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function relativeTime(value: string) {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()

  if (!Number.isFinite(diff) || diff < 0) return dateTime(value)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`
  return dateTime(value)
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

export default function AdminNotifications({
  onOpenOrder,
  onOpenRequest,
}: AdminNotificationsProps) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [message, setMessage] = useState('')

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)

    try {
      const response = await fetch('/api/admin/catalog?action=notifications', {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as NotificationsResponse
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
      setMessage('')
    } catch (error) {
      if (!silent) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar las notificaciones.',
        )
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNotifications()

    const interval = window.setInterval(() => {
      void loadNotifications(true)
    }, 60_000)

    function refreshOnFocus() {
      void loadNotifications(true)
    }

    window.addEventListener('focus', refreshOnFocus)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [loadNotifications])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyId && !markingAll) setOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [busyId, markingAll, open])

  const unreadIds = useMemo(
    () => new Set(notifications.filter((item) => !item.read_at).map((item) => item.id)),
    [notifications],
  )

  async function markRead(notification: AdminNotification) {
    if (notification.read_at || busyId) return true

    setBusyId(notification.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/catalog?action=notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notification.id }),
      })
      if (!response.ok) throw new Error(await responseMessage(response))

      const readAt = new Date().toISOString()
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: item.read_at ?? readAt } : item,
        ),
      )
      setUnreadCount((current) => Math.max(0, current - 1))
      return true
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo marcar como leída.',
      )
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function markAllRead() {
    if (markingAll || unreadCount === 0) return

    setMarkingAll(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/catalog?action=notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (!response.ok) throw new Error(await responseMessage(response))

      const readAt = new Date().toISOString()
      setNotifications((current) =>
        current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
      )
      setUnreadCount(0)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudieron marcar todas como leídas.',
      )
    } finally {
      setMarkingAll(false)
    }
  }

  async function openNotification(notification: AdminNotification) {
    if (busyId || markingAll) return

    const canOpen = await markRead(notification)
    if (!canOpen && !notification.read_at) return

    setOpen(false)
    if (notification.entity_type === 'order') {
      onOpenOrder(notification.entity_id)
      return
    }
    onOpenRequest(notification.entity_id)
  }

  return (
    <div className="admin-notifications-root">
      <button
        className={`admin-notifications-trigger${unreadCount > 0 ? ' has-unread' : ''}`}
        type="button"
        onClick={() => {
          setOpen(true)
          void loadNotifications(true)
        }}
        aria-label={
          unreadCount > 0
            ? `Notificaciones: ${unreadCount} sin leer`
            : 'Notificaciones'
        }
      >
        <span aria-hidden="true">🔔</span>
        <span>Notificaciones</span>
        {unreadCount > 0 && (
          <strong>{unreadCount > 99 ? '99+' : unreadCount}</strong>
        )}
      </button>

      {open && (
        <div
          className="admin-notifications-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !busyId &&
              !markingAll
            ) {
              setOpen(false)
            }
          }}
        >
          <section
            className="admin-notifications-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-notifications-title"
          >
            <header>
              <div>
                <span className="admin-kicker">Centro de avisos</span>
                <h2 id="admin-notifications-title">Notificaciones</h2>
                <p>
                  Acciones de clientes que requieren tu atención. Se actualiza automáticamente cada minuto.
                </p>
              </div>
              <button
                className="admin-notifications-close"
                type="button"
                onClick={() => setOpen(false)}
                disabled={Boolean(busyId) || markingAll}
                aria-label="Cerrar notificaciones"
              >
                ×
              </button>
            </header>

            <div className="admin-notifications-toolbar">
              <span>
                <strong>{unreadCount}</strong> sin leer · {notifications.length} recientes
              </span>
              <div>
                <button
                  className="admin-secondary"
                  type="button"
                  onClick={() => void loadNotifications()}
                  disabled={loading || Boolean(busyId) || markingAll}
                >
                  {loading ? 'Actualizando…' : 'Actualizar'}
                </button>
                <button
                  className="admin-secondary"
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={unreadCount === 0 || markingAll || Boolean(busyId)}
                >
                  {markingAll ? 'Marcando…' : 'Marcar todas leídas'}
                </button>
              </div>
            </div>

            {message && <div className="admin-notifications-message">{message}</div>}

            <div className="admin-notifications-list">
              {loading && notifications.length === 0 && (
                <div className="admin-empty">Cargando notificaciones…</div>
              )}

              {!loading && notifications.length === 0 && (
                <div className="admin-empty">
                  Todavía no hay notificaciones. Los nuevos PED, SOL y respuestas de diseño van a aparecer acá.
                </div>
              )}

              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`admin-notification-item${
                    unreadIds.has(notification.id) ? ' is-unread' : ''
                  } is-${notification.kind}`}
                  onClick={() => void openNotification(notification)}
                  disabled={busyId === notification.id || markingAll}
                >
                  <div className="admin-notification-item-head">
                    <span>{kindLabels[notification.kind]}</span>
                    <small>{relativeTime(notification.created_at)}</small>
                  </div>
                  <strong>{notification.title}</strong>
                  <p>{notification.message}</p>
                  <div className="admin-notification-item-foot">
                    <span>{notification.entity_code}</span>
                    <small>
                      {unreadIds.has(notification.id) ? 'Sin leer · ' : ''}
                      Abrir {notification.entity_type === 'order' ? 'PED' : 'SOL'} →
                    </small>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
