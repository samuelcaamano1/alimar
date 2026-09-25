import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { CustomRequest } from './AdminCustomRequests'
import type { AdminQuote } from './adminQuotePrint'

type OrderStatus =
  | 'new'
  | 'contacted'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'

type ProductionStage =
  | 'not_started'
  | 'design'
  | 'awaiting_approval'
  | 'materials'
  | 'production'
  | 'finishing'
  | 'ready_for_delivery'

type ProductionPriority = 'low' | 'normal' | 'high' | 'urgent'

type PaymentStatus = 'total_pending' | 'unpaid' | 'partial' | 'paid'

type WorkApprovalFile = {
  id: string
  kind: 'reference' | 'design' | 'production' | 'print' | '3d' | 'other'
  label: string
  customer_visible: boolean
  approval_status: 'not_required' | 'pending' | 'approved' | 'changes_requested'
  approval_comment: string | null
  approval_requested_at: string | null
}

type WorkOrder = {
  id: string
  public_code: string
  status: OrderStatus
  customer_name: string
  promised_for: string | null
  production_priority: ProductionPriority
  production_stage: ProductionStage
  balance_due: string | null
  payment_status: PaymentStatus
  files: WorkApprovalFile[]
  created_at: string
}

type WorkCenterResponse = {
  orders: WorkOrder[]
  requests: CustomRequest[]
  quotes: AdminQuote[]
}

type WorkTask = {
  key: string
  score: number
  kind: 'SOL' | 'PRE' | 'PED' | 'COBRO' | 'APROB'
  title: string
  detail: string
  meta: string
  tone: 'danger' | 'today' | 'info' | 'money' | 'approval'
  target: '.admin-custom-requests' | '.admin-cost-calculator' | '.admin-orders-panel'
  orderId?: string
}

const activeOrderStatuses = new Set<OrderStatus>([
  'confirmed',
  'in_progress',
  'ready',
])

const productionStageLabels: Record<ProductionStage, string> = {
  not_started: 'Sin iniciar',
  design: 'Diseño / armado',
  awaiting_approval: 'Esperando aprobación',
  materials: 'Preparando materiales',
  production: 'En producción',
  finishing: 'Terminaciones',
  ready_for_delivery: 'Listo para entregar',
}

function currentSharedDesign(order: WorkOrder) {
  return (
    (order.files ?? []).find(
      (file) => file.kind === 'design' && file.customer_visible,
    ) ?? null
  )
}

function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dayDifference(value: string | null, today: string) {
  if (!value) return null

  const target = new Date(`${value}T12:00:00`)
  const base = new Date(`${today}T12:00:00`)

  if (Number.isNaN(target.getTime()) || Number.isNaN(base.getTime())) {
    return null
  }

  return Math.round((target.getTime() - base.getTime()) / 86_400_000)
}

function dateLabel(value: string | null) {
  if (!value) return 'Sin fecha'

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date)
}

function fullDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`)

  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

function money(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function numeric(value: string | null) {
  if (value === null) return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function daysUntilQuote(value: string | null, today: string) {
  return dayDifference(value, today)
}

function scrollToTarget(task: WorkTask) {
  if (task.orderId) {
    const order = document.getElementById(`order-${task.orderId}`)
    if (order) {
      order.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }

  document
    .querySelector(task.target)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

export default function AdminWorkCenter() {
  const [data, setData] = useState<WorkCenterResponse>({
    orders: [],
    requests: [],
    quotes: [],
  })
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const loadWorkCenter = useCallback(async () => {
    setState((current) => (current === 'ready' ? current : 'loading'))

    try {
      const [ordersResponse, requestsResponse, quotesResponse] =
        await Promise.all([
          fetch('/api/admin/orders', { cache: 'no-store' }),
          fetch('/api/admin/orders?action=custom-requests', {
            cache: 'no-store',
          }),
          fetch('/api/admin/catalog?action=quotes', { cache: 'no-store' }),
        ])

      const firstError = [
        ordersResponse,
        requestsResponse,
        quotesResponse,
      ].find((response) => !response.ok)

      if (firstError) {
        throw new Error(await responseMessage(firstError))
      }

      const [ordersData, requestsData, quotesData] = await Promise.all([
        ordersResponse.json() as Promise<{ orders: WorkOrder[] }>,
        requestsResponse.json() as Promise<{ requests: CustomRequest[] }>,
        quotesResponse.json() as Promise<{ quotes: AdminQuote[] }>,
      ])

      setData({
        orders: ordersData.orders,
        requests: requestsData.requests,
        quotes: quotesData.quotes,
      })
      setMessage('')
      setState('ready')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el centro de trabajo.',
      )
      setState('error')
    }
  }, [])

  useEffect(() => {
    void loadWorkCenter()
  }, [loadWorkCenter])

  useEffect(() => {
    function refresh() {
      void loadWorkCenter()
    }

    const events = [
      'alimar:orders-changed',
      'alimar:schedule-changed',
      'alimar:production-stage-changed',
      'alimar:quote-metrics-changed',
      'alimar:requests-changed',
      'alimar:order-files-changed',
    ]

    for (const eventName of events) {
      window.addEventListener(eventName, refresh)
    }

    window.addEventListener('focus', refresh)

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, refresh)
      }

      window.removeEventListener('focus', refresh)
    }
  }, [loadWorkCenter])

  const today = todayKey()

  const summary = useMemo(() => {
    const requestsAttention = data.requests.filter(
      (request) => request.status === 'new' || request.status === 'reviewing',
    )

    const draftQuotes = data.quotes.filter((quote) => quote.status === 'draft')
    const activeOrders = data.orders.filter((order) =>
      activeOrderStatuses.has(order.status),
    )

    const overdueOrders = activeOrders.filter((order) => {
      const days = dayDifference(order.promised_for, today)
      return days !== null && days < 0
    })

    const todayOrders = activeOrders.filter(
      (order) => dayDifference(order.promised_for, today) === 0,
    )

    const pendingBalance = data.orders.reduce((total, order) => {
      if (order.status === 'cancelled') return total
      const balance = numeric(order.balance_due)
      return balance !== null && balance > 0 ? total + balance : total
    }, 0)

    const approvalItems = data.orders.flatMap((order) => {
      if (order.status === 'cancelled') return []
      const file = currentSharedDesign(order)
      if (!file) return []

      const readyToContinue =
        file.approval_status === 'approved' &&
        (order.production_stage === 'design' ||
          order.production_stage === 'awaiting_approval')

      return file.approval_status === 'pending' ||
        file.approval_status === 'changes_requested' ||
        readyToContinue
        ? [{ order, file, readyToContinue }]
        : []
    })
    const approvalChanges = approvalItems.filter(
      ({ file }) => file.approval_status === 'changes_requested',
    ).length
    const approvalReady = approvalItems.filter(
      ({ readyToContinue }) => readyToContinue,
    ).length

    return {
      requestsAttention: requestsAttention.length,
      draftQuotes: draftQuotes.length,
      activeOrders: activeOrders.length,
      todayOrders: todayOrders.length,
      overdueOrders: overdueOrders.length,
      approvalAttention: approvalItems.length,
      approvalChanges,
      approvalReady,
      pendingBalance,
    }
  }, [data, today])

  const tasks = useMemo(() => {
    const next: WorkTask[] = []

    for (const order of data.orders) {
      if (!activeOrderStatuses.has(order.status)) continue

      const days = dayDifference(order.promised_for, today)

      if (days !== null && days < 0) {
        next.push({
          key: `ped-overdue-${order.id}`,
          score: 0,
          kind: 'PED',
          title: `${order.public_code} está atrasado`,
          detail: order.customer_name,
          meta: `${Math.abs(days)} día(s) de atraso · ${productionStageLabels[order.production_stage]}`,
          tone: 'danger',
          target: '.admin-orders-panel',
          orderId: order.id,
        })
      } else if (days === 0) {
        next.push({
          key: `ped-today-${order.id}`,
          score: 1,
          kind: 'PED',
          title: `${order.public_code} se entrega hoy`,
          detail: order.customer_name,
          meta: productionStageLabels[order.production_stage],
          tone: 'today',
          target: '.admin-orders-panel',
          orderId: order.id,
        })
      }
    }

    for (const order of data.orders) {
      if (order.status === 'cancelled') continue

      const file = currentSharedDesign(order)
      if (!file) continue

      if (file.approval_status === 'changes_requested') {
        next.push({
          key: `approval-changes-${order.id}-${file.id}`,
          score: 0.5,
          kind: 'APROB',
          title: `${order.public_code}: cliente pidió cambios`,
          detail: `${order.customer_name} · ${file.label}`,
          meta: file.approval_comment
            ? file.approval_comment.slice(0, 90)
            : 'Abrir el PED y revisar la devolución',
          tone: 'danger',
          target: '.admin-orders-panel',
          orderId: order.id,
        })
      } else if (
        file.approval_status === 'approved' &&
        (order.production_stage === 'design' ||
          order.production_stage === 'awaiting_approval')
      ) {
        next.push({
          key: `approval-approved-${order.id}-${file.id}`,
          score: 2.5,
          kind: 'APROB',
          title: `${order.public_code}: diseño aprobado`,
          detail: `${order.customer_name} · ${file.label}`,
          meta: 'Listo para continuar a Preparando materiales',
          tone: 'approval',
          target: '.admin-orders-panel',
          orderId: order.id,
        })
      } else if (file.approval_status === 'pending') {
        next.push({
          key: `approval-pending-${order.id}-${file.id}`,
          score: 4.5,
          kind: 'APROB',
          title: `${order.public_code}: diseño esperando aprobación`,
          detail: `${order.customer_name} · ${file.label}`,
          meta: 'Podés enviar o reenviar el link por WhatsApp desde el PED',
          tone: 'approval',
          target: '.admin-orders-panel',
          orderId: order.id,
        })
      }
    }

    for (const request of data.requests) {
      if (request.status !== 'new' && request.status !== 'reviewing') continue

      const days = dayDifference(request.needed_date, today)
      const urgent = days !== null && days <= 0

      next.push({
        key: `sol-${request.id}`,
        score: urgent ? 2 : request.status === 'new' ? 4 : 5,
        kind: 'SOL',
        title:
          request.status === 'new'
            ? `${request.public_code} necesita primera revisión`
            : `${request.public_code} sigue en revisión`,
        detail: request.customer_name,
        meta: request.needed_date
          ? `${dateLabel(request.needed_date)} · ${request.description.slice(0, 60)}`
          : request.description.slice(0, 75),
        tone: urgent ? 'danger' : 'info',
        target: '.admin-custom-requests',
      })
    }

    for (const quote of data.quotes) {
      if (quote.status === 'accepted' && !quote.order_code) {
        next.push({
          key: `pre-accepted-${quote.id}`,
          score: 3,
          kind: 'PRE',
          title: `${quote.public_code} fue aceptado`,
          detail: quote.customer_name || 'Cliente sin nombre',
          meta: 'Crear PED para continuar el trabajo',
          tone: 'today',
          target: '.admin-cost-calculator',
        })
        continue
      }

      if (quote.status === 'draft') {
        next.push({
          key: `pre-draft-${quote.id}`,
          score: 6,
          kind: 'PRE',
          title: `${quote.public_code} todavía es borrador`,
          detail: quote.customer_name || quote.title,
          meta: 'Revisar y enviar al cliente',
          tone: 'info',
          target: '.admin-cost-calculator',
        })
        continue
      }

      if (quote.status === 'sent') {
        const days = daysUntilQuote(quote.valid_until, today)

        if (days !== null && days >= 0 && days <= 3) {
          next.push({
            key: `pre-expiring-${quote.id}`,
            score: 7,
            kind: 'PRE',
            title: `${quote.public_code} vence ${days === 0 ? 'hoy' : `en ${days} día(s)`}`,
            detail: quote.customer_name || quote.title,
            meta: 'Puede necesitar recordatorio',
            tone: days === 0 ? 'danger' : 'info',
            target: '.admin-cost-calculator',
          })
        }
      }
    }

    for (const order of data.orders) {
      if (order.status === 'cancelled') continue

      const balance = numeric(order.balance_due)
      if (balance === null || balance <= 0) continue

      if (
        order.status === 'ready' ||
        order.status === 'completed' ||
        order.production_stage === 'ready_for_delivery'
      ) {
        next.push({
          key: `balance-${order.id}`,
          score: 8,
          kind: 'COBRO',
          title: `${order.public_code} tiene saldo pendiente`,
          detail: order.customer_name,
          meta: money(balance),
          tone: 'money',
          target: '.admin-orders-panel',
          orderId: order.id,
        })
      }
    }

    return next
      .sort((left, right) => left.score - right.score)
      .slice(0, 12)
  }, [data, today])

  const nextSevenDays = useMemo(() => {
    return data.orders
      .filter((order) => {
        if (!activeOrderStatuses.has(order.status)) return false
        const days = dayDifference(order.promised_for, today)
        return days !== null && days >= 0 && days <= 7
      })
      .sort((left, right) => {
        const leftDays = dayDifference(left.promised_for, today) ?? 99
        const rightDays = dayDifference(right.promised_for, today) ?? 99

        if (leftDays !== rightDays) return leftDays - rightDays

        const weight: Record<ProductionPriority, number> = {
          urgent: 0,
          high: 1,
          normal: 2,
          low: 3,
        }

        return (
          weight[left.production_priority] -
          weight[right.production_priority]
        )
      })
  }, [data.orders, today])

  const unscheduled = useMemo(
    () =>
      data.orders.filter(
        (order) =>
          activeOrderStatuses.has(order.status) && !order.promised_for,
      ),
    [data.orders],
  )

  return (
    <section className="admin-panel admin-work-center">
      <div className="admin-work-center-heading">
        <div>
          <span className="admin-cost-eyebrow">Centro de trabajo</span>
          <h2>Hoy en Alimar</h2>
          <p>{fullDateLabel(today)} · qué necesita atención primero.</p>
        </div>

        <button
          className="admin-secondary"
          type="button"
          onClick={() => void loadWorkCenter()}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {message && <div className="admin-toast">{message}</div>}

      <div className="admin-work-center-summary">
        <button
          type="button"
          onClick={() =>
            document
              .querySelector('.admin-custom-requests')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <span>Solicitudes</span>
          <strong>{summary.requestsAttention}</strong>
          <small>por atender</small>
        </button>

        <button
          type="button"
          onClick={() =>
            document
              .querySelector('.admin-cost-calculator')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <span>Presupuestos</span>
          <strong>{summary.draftQuotes}</strong>
          <small>sin enviar</small>
        </button>

        <button
          type="button"
          onClick={() =>
            document
              .querySelector('.admin-orders-panel')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <span>Producción</span>
          <strong>{summary.activeOrders}</strong>
          <small>PED activos</small>
        </button>

        <button
          type="button"
          className={summary.approvalAttention > 0 ? 'is-approval' : ''}
          onClick={() =>
            document
              .querySelector('.admin-orders-panel')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <span>Aprobaciones</span>
          <strong>{summary.approvalAttention}</strong>
          <small>
            {summary.approvalChanges > 0
              ? `${summary.approvalChanges} con cambios`
              : summary.approvalReady > 0
                ? `${summary.approvalReady} listas para continuar`
                : 'esperando cliente'}
          </small>
        </button>

        <button
          type="button"
          className={summary.todayOrders > 0 ? 'is-today' : ''}
          onClick={() =>
            document
              .querySelector('.admin-orders-panel')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <span>Entregas hoy</span>
          <strong>{summary.todayOrders}</strong>
          <small>con fecha</small>
        </button>

        <button
          type="button"
          className={summary.overdueOrders > 0 ? 'is-danger' : ''}
          onClick={() =>
            document
              .querySelector('.admin-orders-panel')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <span>Atrasados</span>
          <strong>{summary.overdueOrders}</strong>
          <small>revisar primero</small>
        </button>

        <button
          type="button"
          className={summary.pendingBalance > 0 ? 'is-money' : ''}
          onClick={() =>
            document
              .querySelector('.admin-orders-panel')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <span>Por cobrar</span>
          <strong>{money(summary.pendingBalance)}</strong>
          <small>saldo pendiente</small>
        </button>
      </div>

      <div className="admin-work-center-layout">
        <section className="admin-work-priorities">
          <div className="admin-work-section-heading">
            <div>
              <span>Prioridades</span>
              <strong>Qué hacer ahora</strong>
            </div>
            <small>{tasks.length} tarea(s) visibles</small>
          </div>

          {state === 'loading' && tasks.length === 0 ? (
            <div className="admin-work-empty">Armando tu agenda…</div>
          ) : tasks.length === 0 ? (
            <div className="admin-work-empty">
              <strong>No hay urgencias pendientes.</strong>
              <span>La operación está al día con los datos actuales.</span>
            </div>
          ) : (
            <div className="admin-work-task-list">
              {tasks.map((task, index) => (
                <button
                  key={task.key}
                  type="button"
                  className={`admin-work-task is-${task.tone}`}
                  onClick={() => scrollToTarget(task)}
                >
                  <span className="admin-work-task-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <span className="admin-work-task-kind">{task.kind}</span>

                  <span className="admin-work-task-copy">
                    <strong>{task.title}</strong>
                    <span>{task.detail}</span>
                    <small>{task.meta}</small>
                  </span>

                  <span className="admin-work-task-open">Abrir →</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="admin-work-agenda">
          <div className="admin-work-section-heading">
            <div>
              <span>Agenda</span>
              <strong>Próximos 7 días</strong>
            </div>
            <small>{nextSevenDays.length} PED</small>
          </div>

          {nextSevenDays.length === 0 ? (
            <div className="admin-work-empty">
              No hay entregas fechadas para los próximos 7 días.
            </div>
          ) : (
            <div className="admin-work-agenda-list">
              {nextSevenDays.map((order) => (
                <button
                  type="button"
                  key={order.id}
                  onClick={() =>
                    scrollToTarget({
                      key: order.id,
                      score: 0,
                      kind: 'PED',
                      title: order.public_code,
                      detail: order.customer_name,
                      meta: '',
                      tone: 'info',
                      target: '.admin-orders-panel',
                      orderId: order.id,
                    })
                  }
                >
                  <span>{dateLabel(order.promised_for)}</span>
                  <div>
                    <strong>{order.public_code}</strong>
                    <small>{order.customer_name}</small>
                  </div>
                  <small>
                    {productionStageLabels[order.production_stage]}
                  </small>
                </button>
              ))}
            </div>
          )}

          <div className="admin-work-unscheduled">
            <span>Producción sin fecha</span>
            <strong>{unscheduled.length}</strong>
            <small>
              PED activos que todavía no tienen fecha prometida.
            </small>
          </div>
        </aside>
      </div>
    </section>
  )
}
