import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminOrderFiles, { type AdminOrderFile } from './AdminOrderFiles'
import {
  customerWhatsappUrl,
  orderBalanceWhatsappMessage,
  orderConfirmedWhatsappMessage,
  orderGeneralWhatsappMessage,
  orderProductionWhatsappMessage,
  orderReadyWhatsappMessage,
} from './adminWhatsapp'

type OrderStatus =
  | 'new'
  | 'contacted'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'

type AdminOrderCustomization = {
  fieldId: string
  label: string
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select'
  value: string
}

type AdminOrderItem = {
  id: string
  product_name: string
  variant_name: string | null
  kind: 'service' | 'product'
  pricing_mode: 'fixed' | 'from' | 'quote'
  unit_price: string | null
  quantity: number
  line_total: string | null
  customization_note: string | null
  customization_values: AdminOrderCustomization[]
}

type AdminOrderEvent = {
  id: string
  event_type: string
  from_status: OrderStatus | null
  to_status: OrderStatus | null
  note: string | null
  created_at: string
}

type AdminOrder = {
  id: string
  public_code: string
  tracking_token: string
  status: OrderStatus
  customer_name: string
  customer_phone: string
  customer_email: string | null
  customer_notes: string | null
  known_total: string
  agreed_total: string | null
  paid_total: string
  balance_due: string | null
  payment_status: PaymentStatus
  payments: AdminOrderPayment[]
  files: AdminOrderFile[]
  promised_for: string | null
  production_priority: ProductionPriority
  delivery_note: string | null
  schedule_updated_at: string | null
  production_stage: ProductionStage
  production_stage_note: string | null
  production_stage_updated_at: string | null
  has_quote: boolean
  quote_code: string | null
  estimated_cost: string | null
  actual_cost: string | null
  actual_cost_note: string | null
  actual_cost_updated_at: string | null
  created_at: string
  items: AdminOrderItem[]
  events: AdminOrderEvent[]
}

type OrdersResponse = { orders: AdminOrder[] }

type DateFilter = 'all' | 'today' | '7d' | '30d'
type PaymentMethod = 'cash' | 'transfer' | 'mercadopago' | 'card' | 'other'
type PaymentStatus = 'total_pending' | 'unpaid' | 'partial' | 'paid'
type PaymentFilter = 'all' | 'pending' | 'paid' | 'total_pending'
type ProductionPriority = 'low' | 'normal' | 'high' | 'urgent'
type ProductionStage =
  | 'not_started'
  | 'design'
  | 'awaiting_approval'
  | 'materials'
  | 'production'
  | 'finishing'
  | 'ready_for_delivery'

type AdminOrderPayment = {
  id: string
  order_id: string
  amount: string
  payment_method: PaymentMethod
  paid_on: string
  reference: string | null
  note: string | null
  voided_at: string | null
  void_reason: string | null
  created_at: string
}

type PaymentDraft = {
  amount: string
  method: PaymentMethod
  paidOn: string
  reference: string
  note: string
}

const statusLabels: Record<OrderStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  confirmed: 'Confirmado',
  in_progress: 'En proceso',
  ready: 'Listo',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const statusOptions = Object.entries(statusLabels) as Array<[OrderStatus, string]>

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
  card: 'Tarjeta',
  other: 'Otro',
}

const paymentStatusLabels: Record<PaymentStatus, string> = {
  total_pending: 'Falta total acordado',
  unpaid: 'Sin cobrar',
  partial: 'Cobro parcial',
  paid: 'Pagado',
}

const productionPriorityLabels: Record<ProductionPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

const productionPriorityWeight: Record<ProductionPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
}

const productionStageLabels: Record<ProductionStage, string> = {
  not_started: 'Sin iniciar',
  design: 'Diseño / armado',
  awaiting_approval: 'Esperando aprobación',
  materials: 'Preparando materiales',
  production: 'En producción',
  finishing: 'Terminaciones',
  ready_for_delivery: 'Listo para entregar',
}

function money(value: string | null) {
  if (!value) return 'A consultar'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'A consultar'

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

function numericAmount(value: string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function dateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function todayInputValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function dateOnly(value: string) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
  }).format(date)
}

function promisedDaysFromToday(value: string | null) {
  if (!value) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const dueDay = Math.floor(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) /
      86_400_000,
  )
  const now = new Date()
  const today = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  )

  return dueDay - today
}

function promisedTimingLabel(value: string | null) {
  const days = promisedDaysFromToday(value)

  if (days === null) return 'Sin fecha'
  if (days < 0) return `Atrasado ${Math.abs(days)} día(s)`
  if (days === 0) return 'Entrega hoy'
  if (days === 1) return 'Entrega mañana'
  if (days <= 7) return `Entrega en ${days} días`
  return dateOnly(value || '')
}

function productionBucket(order: AdminOrder) {
  if (!['confirmed', 'in_progress', 'ready'].includes(order.status)) return 9

  const days = promisedDaysFromToday(order.promised_for)
  if (days === null) return 4
  if (days < 0) return 0
  if (days === 0) return 1
  if (days <= 7) return 2
  return 3
}

function dateFilterStart(filter: DateFilter) {
  if (filter === 'all') return null

  const now = new Date()

  if (filter === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }

  const days = filter === '7d' ? 7 : 30
  return now.getTime() - days * 24 * 60 * 60 * 1000
}

function trackingUrl(order: AdminOrder) {
  return `${window.location.origin}/?pedido=${encodeURIComponent(
    order.tracking_token,
  )}`
}

function orderWhatsappContext(order: AdminOrder) {
  return {
    customerName: order.customer_name,
    orderCode: order.public_code,
    trackingUrl: trackingUrl(order),
    productionStageLabel: productionStageLabels[order.production_stage],
    promisedForLabel: order.promised_for
      ? promisedTimingLabel(order.promised_for)
      : null,
    balanceLabel:
      order.balance_due !== null ? money(order.balance_due) : null,
  }
}

function whatsappContactUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderGeneralWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

function confirmedWhatsappUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderConfirmedWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

function productionWhatsappUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderProductionWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

function readyWhatsappUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderReadyWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

function balanceWhatsappUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderBalanceWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

function orderSummary(order: AdminOrder) {
  const lines = [
    `Pedido ${order.public_code}`,
    `Cliente: ${order.customer_name}`,
    `Teléfono: ${order.customer_phone}`,
    `Estado: ${statusLabels[order.status]}`,
    '',
    'Productos:',
  ]

  for (const item of order.items) {
    const variant = item.variant_name ? ` · ${item.variant_name}` : ''
    const total = item.line_total ? money(item.line_total) : 'A consultar'
    lines.push(`- ${item.quantity}× ${item.product_name}${variant} — ${total}`)

    for (const customization of item.customization_values) {
      lines.push(`  ${customization.label}: ${customization.value}`)
    }

    if (item.customization_note) {
      lines.push(`  Nota: ${item.customization_note}`)
    }
  }

  lines.push('', `Subtotal conocido: ${money(order.known_total)}`)

  if (order.has_quote) {
    lines.push('Incluye ítems que requieren cotización.')
  }

  if (order.customer_notes) {
    lines.push(`Nota general: ${order.customer_notes}`)
  }

  return lines.join('\n')
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

export default function AdminOrdersPanel() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | OrderStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)
  const [draftStatus, setDraftStatus] = useState<Record<string, OrderStatus>>({})
  const [draftNote, setDraftNote] = useState<Record<string, string>>({})
  const [draftActualCost, setDraftActualCost] = useState<Record<string, string>>({})
  const [draftActualCostNote, setDraftActualCostNote] = useState<Record<string, string>>({})
  const [savingActualCostId, setSavingActualCostId] = useState<string | null>(null)
  const [draftAgreedTotal, setDraftAgreedTotal] = useState<Record<string, string>>({})
  const [savingAgreedTotalId, setSavingAgreedTotalId] = useState<string | null>(null)
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>({})
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null)
  const [voidingPaymentId, setVoidingPaymentId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidSavingId, setVoidSavingId] = useState<string | null>(null)
  const [draftPromisedFor, setDraftPromisedFor] = useState<Record<string, string>>({})
  const [draftProductionPriority, setDraftProductionPriority] =
    useState<Record<string, ProductionPriority>>({})
  const [draftDeliveryNote, setDraftDeliveryNote] =
    useState<Record<string, string>>({})
  const [savingScheduleId, setSavingScheduleId] = useState<string | null>(null)
  const [draftProductionStage, setDraftProductionStage] =
    useState<Record<string, ProductionStage>>({})
  const [draftProductionStageNote, setDraftProductionStageNote] =
    useState<Record<string, string>>({})
  const [savingProductionStageId, setSavingProductionStageId] =
    useState<string | null>(null)

  const applyOrders = useCallback((nextOrders: AdminOrder[]) => {
    setOrders(nextOrders)
    setDraftStatus(
      Object.fromEntries(nextOrders.map((order) => [order.id, order.status])) as Record<
        string,
        OrderStatus
      >,
    )
    setDraftActualCost(
      Object.fromEntries(
        nextOrders.map((order) => [order.id, order.actual_cost ?? '']),
      ) as Record<string, string>,
    )
    setDraftActualCostNote(
      Object.fromEntries(
        nextOrders.map((order) => [order.id, order.actual_cost_note ?? '']),
      ) as Record<string, string>,
    )
    setDraftAgreedTotal(
      Object.fromEntries(
        nextOrders.map((order) => [order.id, order.agreed_total ?? '']),
      ) as Record<string, string>,
    )
    setDraftPromisedFor(
      Object.fromEntries(
        nextOrders.map((order) => [order.id, order.promised_for ?? '']),
      ) as Record<string, string>,
    )
    setDraftProductionPriority(
      Object.fromEntries(
        nextOrders.map((order) => [order.id, order.production_priority]),
      ) as Record<string, ProductionPriority>,
    )
    setDraftDeliveryNote(
      Object.fromEntries(
        nextOrders.map((order) => [order.id, order.delivery_note ?? '']),
      ) as Record<string, string>,
    )
    setDraftProductionStage(
      Object.fromEntries(
        nextOrders.map((order) => [order.id, order.production_stage]),
      ) as Record<string, ProductionStage>,
    )
    setDraftProductionStageNote(
      Object.fromEntries(
        nextOrders.map((order) => [order.id, order.production_stage_note ?? '']),
      ) as Record<string, string>,
    )
    setPaymentDrafts(
      Object.fromEntries(
        nextOrders.map((order) => [
          order.id,
          {
            amount: '',
            method: 'transfer',
            paidOn: todayInputValue(),
            reference: '',
            note: '',
          } satisfies PaymentDraft,
        ]),
      ) as Record<string, PaymentDraft>,
    )
    setState('ready')
  }, [])

  const loadOrders = useCallback(async () => {
    setState('loading')
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders', { cache: 'no-store' })
      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as OrdersResponse
      applyOrders(data.orders)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.')
      setState('error')
    }
  }, [applyOrders])

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/admin/orders', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response))
        return (await response.json()) as OrdersResponse
      })
      .then((data) => {
        if (!controller.signal.aborted) applyOrders(data.orders)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.')
        setState('error')
      })

    return () => controller.abort()
  }, [applyOrders])

  useEffect(() => {
    function onOrdersChanged() {
      void loadOrders()
    }

    window.addEventListener('alimar:orders-changed', onOrdersChanged)

    return () => {
      window.removeEventListener('alimar:orders-changed', onOrdersChanged)
    }
  }, [loadOrders])

  const orderCounts = useMemo(
    () => ({
      all: orders.length,
      new: orders.filter((order) => order.status === 'new').length,
      open: orders.filter((order) =>
        ['contacted', 'confirmed', 'in_progress'].includes(order.status),
      ).length,
      ready: orders.filter((order) => order.status === 'ready').length,
      paymentPending: orders.filter(
        (order) => order.payment_status === 'unpaid' || order.payment_status === 'partial',
      ).length,
      paid: orders.filter((order) => order.payment_status === 'paid').length,
      totalPending: orders.filter(
        (order) => order.payment_status === 'total_pending',
      ).length,
    }),
    [orders],
  )

  const productionCounts = useMemo(() => {
    const active = orders.filter((order) =>
      ['confirmed', 'in_progress', 'ready'].includes(order.status),
    )

    return {
      active: active.length,
      overdue: active.filter(
        (order) => (promisedDaysFromToday(order.promised_for) ?? 1) < 0,
      ).length,
      today: active.filter(
        (order) => promisedDaysFromToday(order.promised_for) === 0,
      ).length,
      week: active.filter((order) => {
        const days = promisedDaysFromToday(order.promised_for)
        return days !== null && days > 0 && days <= 7
      }).length,
      unscheduled: active.filter((order) => !order.promised_for).length,
    }
  }, [orders])

  const productionQueue = useMemo(
    () =>
      orders
        .filter((order) =>
          ['confirmed', 'in_progress', 'ready'].includes(order.status),
        )
        .slice()
        .sort((left, right) => {
          const bucketDifference = productionBucket(left) - productionBucket(right)
          if (bucketDifference !== 0) return bucketDifference

          const priorityDifference =
            productionPriorityWeight[right.production_priority] -
            productionPriorityWeight[left.production_priority]
          if (priorityDifference !== 0) return priorityDifference

          if (left.promised_for && right.promised_for) {
            const dateDifference = left.promised_for.localeCompare(right.promised_for)
            if (dateDifference !== 0) return dateDifference
          }

          return left.created_at.localeCompare(right.created_at)
        })
        .slice(0, 8),
    [orders],
  )

  const visibleOrders = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('es-AR')
    const dateStart = dateFilterStart(dateFilter)

    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'open'
          ? ['contacted', 'confirmed', 'in_progress'].includes(order.status)
          : order.status === statusFilter)

      const matchesPayment =
        paymentFilter === 'all' ||
        (paymentFilter === 'pending'
          ? order.payment_status === 'unpaid' || order.payment_status === 'partial'
          : order.payment_status === paymentFilter)

      if (!matchesStatus || !matchesPayment) return false

      if (dateStart !== null) {
        const createdAt = new Date(order.created_at).getTime()
        if (!Number.isFinite(createdAt) || createdAt < dateStart) return false
      }

      if (!query) return true

      const haystack = [
        order.public_code,
        order.customer_name,
        order.customer_phone,
        order.customer_email ?? '',
        order.customer_notes ?? '',
        ...order.items.flatMap((item) => [
          item.product_name,
          item.variant_name ?? '',
          item.customization_note ?? '',
          ...item.customization_values.flatMap((customization) => [
            customization.label,
            customization.value,
          ]),
        ]),
      ]
        .join(' ')
        .toLocaleLowerCase('es-AR')

      return haystack.includes(query)
    })
  }, [dateFilter, orders, paymentFilter, searchQuery, statusFilter])

  async function copyText(value: string, successMessage: string) {
    setMessage('')

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable')
      }

      await navigator.clipboard.writeText(value)
      setMessage(successMessage)
    } catch {
      setMessage('No se pudo copiar automáticamente. Seleccioná el dato y copialo manualmente.')
    }
  }

  async function saveStatus(order: AdminOrder) {
    const nextStatus = draftStatus[order.id] ?? order.status
    const note = (draftNote[order.id] ?? '').trim()

    if (nextStatus === order.status && !note) return

    setSavingOrderId(order.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          status: nextStatus,
          note,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setDraftNote((current) => ({ ...current, [order.id]: '' }))
      await loadOrders()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el pedido.')
    } finally {
      setSavingOrderId(null)
    }
  }

  async function saveSchedule(order: AdminOrder) {
    const promisedFor = (draftPromisedFor[order.id] ?? '').trim()
    const priority =
      draftProductionPriority[order.id] ?? order.production_priority
    const note = (draftDeliveryNote[order.id] ?? '').trim()

    setSavingScheduleId(order.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          promisedFor: promisedFor || null,
          priority,
          note,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await loadOrders()
      window.dispatchEvent(new Event('alimar:schedule-changed'))
      setMessage(`Planificación de ${order.public_code} actualizada.`)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la planificación.',
      )
    } finally {
      setSavingScheduleId(null)
    }
  }

  async function saveProductionStage(order: AdminOrder) {
    const stage =
      draftProductionStage[order.id] ?? order.production_stage
    const note = (draftProductionStageNote[order.id] ?? '').trim()

    setSavingProductionStageId(order.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=production-stage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          stage,
          note,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await loadOrders()
      window.dispatchEvent(new Event('alimar:production-stage-changed'))
      setMessage(`Etapa de ${order.public_code} actualizada.`)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la etapa de producción.',
      )
    } finally {
      setSavingProductionStageId(null)
    }
  }

  async function saveAgreedTotal(order: AdminOrder) {
    const raw = (draftAgreedTotal[order.id] ?? '').trim()
    const agreedTotal = Number(raw.replace(',', '.'))

    if (!raw || !Number.isFinite(agreedTotal) || agreedTotal <= 0) {
      setMessage('Ingresá un total acordado mayor a cero.')
      return
    }

    setSavingAgreedTotalId(order.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=agreed-total', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          agreedTotal,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await loadOrders()
      window.dispatchEvent(new Event('alimar:payments-changed'))
      setMessage(`Total acordado de ${order.public_code} actualizado.`)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el total acordado.',
      )
    } finally {
      setSavingAgreedTotalId(null)
    }
  }

  async function recordPayment(order: AdminOrder) {
    const draft = paymentDrafts[order.id]
    if (!draft) return

    const amount = Number(draft.amount.trim().replace(',', '.'))

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Ingresá un importe de cobro mayor a cero.')
      return
    }

    setSavingPaymentId(order.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          amount,
          method: draft.method,
          paidOn: draft.paidOn,
          reference: draft.reference,
          note: draft.note,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await loadOrders()
      window.dispatchEvent(new Event('alimar:payments-changed'))
      setMessage(`Cobro de ${money(String(amount))} registrado en ${order.public_code}.`)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo registrar el cobro.',
      )
    } finally {
      setSavingPaymentId(null)
    }
  }

  async function voidPayment(order: AdminOrder, payment: AdminOrderPayment) {
    const reason = voidReason.trim()

    if (reason.length < 3) {
      setMessage('Indicá por qué se anula el cobro.')
      return
    }

    setVoidSavingId(payment.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=payment-void', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          paymentId: payment.id,
          reason,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      setVoidingPaymentId(null)
      setVoidReason('')
      await loadOrders()
      window.dispatchEvent(new Event('alimar:payments-changed'))
      setMessage(`Cobro de ${order.public_code} anulado.`)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo anular el cobro.',
      )
    } finally {
      setVoidSavingId(null)
    }
  }

  async function saveActualCost(order: AdminOrder) {
    const rawCost = (draftActualCost[order.id] ?? '').trim()
    const normalized = rawCost.replace(',', '.')
    const actualCost = Number(normalized)
    const note = (draftActualCostNote[order.id] ?? '').trim()

    if (!rawCost || !Number.isFinite(actualCost) || actualCost < 0) {
      setMessage('Ingresá un costo real válido para el pedido.')
      return
    }

    setSavingActualCostId(order.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/orders?action=actual-cost', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          actualCost,
          note,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await loadOrders()
      window.dispatchEvent(new Event('alimar:quote-metrics-changed'))
      setMessage(`Costo real de ${order.public_code} guardado.`)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el costo real del pedido.',
      )
    } finally {
      setSavingActualCostId(null)
    }
  }

  return (
    <section className="admin-panel admin-orders-panel">
      <div className="admin-panel-heading admin-orders-heading">
        <span>Pedidos</span>
        <div>
          <h2>Pedidos recibidos</h2>
          <p>Gestioná el estado y consultá el historial de cada pedido.</p>
        </div>

        <button
          className="admin-secondary admin-orders-refresh"
          type="button"
          onClick={() => void loadOrders()}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      <div className="admin-order-stats" aria-label="Resumen de pedidos">
        <button
          type="button"
          className={statusFilter === 'all' ? 'is-active' : ''}
          onClick={() => setStatusFilter('all')}
        >
          <span>Todos</span>
          <strong>{orderCounts.all}</strong>
        </button>

        <button
          type="button"
          className={statusFilter === 'new' ? 'is-active' : ''}
          onClick={() => setStatusFilter('new')}
        >
          <span>Nuevos</span>
          <strong>{orderCounts.new}</strong>
        </button>

        <button
          type="button"
          className={statusFilter === 'open' ? 'is-active' : ''}
          onClick={() => setStatusFilter('open')}
        >
          <span>En curso</span>
          <strong>{orderCounts.open}</strong>
        </button>

        <button
          type="button"
          className={statusFilter === 'ready' ? 'is-active' : ''}
          onClick={() => setStatusFilter('ready')}
        >
          <span>Listos</span>
          <strong>{orderCounts.ready}</strong>
        </button>
      </div>

      <div className="admin-orders-toolbar">
        <label className="admin-order-search">
          Buscar
          <input
            type="search"
            value={searchQuery}
            placeholder="Código, cliente, teléfono o producto"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <label>
          Estado
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | 'open' | OrderStatus)
            }
          >
            <option value="all">Todos</option>
            <option value="open">En curso</option>
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Fecha
          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as DateFilter)}
          >
            <option value="all">Todas</option>
            <option value="today">Hoy</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
          </select>
        </label>

        <span>{visibleOrders.length} pedidos visibles</span>
      </div>

      {message && <div className="admin-toast">{message}</div>}

      <div className="admin-order-payment-filters">
        <button
          type="button"
          className={paymentFilter === 'all' ? 'is-active' : ''}
          onClick={() => setPaymentFilter('all')}
        >
          Todos <strong>{orderCounts.all}</strong>
        </button>
        <button
          type="button"
          className={paymentFilter === 'pending' ? 'is-active' : ''}
          onClick={() => setPaymentFilter('pending')}
        >
          Saldo pendiente <strong>{orderCounts.paymentPending}</strong>
        </button>
        <button
          type="button"
          className={paymentFilter === 'paid' ? 'is-active' : ''}
          onClick={() => setPaymentFilter('paid')}
        >
          Pagados <strong>{orderCounts.paid}</strong>
        </button>
        <button
          type="button"
          className={paymentFilter === 'total_pending' ? 'is-active' : ''}
          onClick={() => setPaymentFilter('total_pending')}
        >
          Sin total <strong>{orderCounts.totalPending}</strong>
        </button>
      </div>

      <section className="admin-production-queue">
        <div className="admin-production-queue-heading">
          <div>
            <span>Cola de producción</span>
            <strong>{productionCounts.active} pedido(s) activos</strong>
          </div>
          <small>
            Confirmados, en proceso y listos, ordenados por urgencia de entrega.
          </small>
        </div>

        <div className="admin-production-queue-stats">
          <span className={productionCounts.overdue > 0 ? 'is-alert' : ''}>
            Atrasados <strong>{productionCounts.overdue}</strong>
          </span>
          <span className={productionCounts.today > 0 ? 'is-today' : ''}>
            Hoy <strong>{productionCounts.today}</strong>
          </span>
          <span>
            Próximos 7 días <strong>{productionCounts.week}</strong>
          </span>
          <span className={productionCounts.unscheduled > 0 ? 'is-warning' : ''}>
            Sin fecha <strong>{productionCounts.unscheduled}</strong>
          </span>
        </div>

        {productionQueue.length > 0 ? (
          <div className="admin-production-queue-list">
            {productionQueue.map((order) => (
              <div
                className={`admin-production-queue-row is-${order.production_priority}`}
                key={order.id}
              >
                <span>{order.public_code}</span>
                <div>
                  <strong>{order.customer_name}</strong>
                  <small>
                    {statusLabels[order.status]} ·{' '}
                    {productionPriorityLabels[order.production_priority]}
                  </small>
                </div>
                <strong>{promisedTimingLabel(order.promised_for)}</strong>
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`order-${order.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                >
                  Ver PED
                </button>
              </div>
            ))}
          </div>
        ) : (
          <small className="admin-production-queue-empty">
            No hay pedidos confirmados o en producción.
          </small>
        )}
      </section>

      {state === 'loading' && orders.length === 0 && <div className="admin-empty">Cargando pedidos…</div>}
      {state === 'error' && orders.length === 0 && <div className="admin-empty">No se pudieron cargar los pedidos.</div>}
      {state === 'ready' && visibleOrders.length === 0 && (
        <div className="admin-empty">No hay pedidos para este estado.</div>
      )}

      {visibleOrders.length > 0 && (
        <div className="admin-orders-list">
          {visibleOrders.map((order) => {
            const selectedStatus = draftStatus[order.id] ?? order.status
            const note = draftNote[order.id] ?? ''
            const saving = savingOrderId === order.id
            const savingActualCost = savingActualCostId === order.id
            const savingAgreedTotal = savingAgreedTotalId === order.id
            const savingPayment = savingPaymentId === order.id
          const savingSchedule = savingScheduleId === order.id
          const savingProductionStage =
            savingProductionStageId === order.id
          const productionStage =
            draftProductionStage[order.id] ?? order.production_stage
          const productionStageNote =
            draftProductionStageNote[order.id] ?? ''
          const promisedFor = draftPromisedFor[order.id] ?? ''
          const productionPriority =
            draftProductionPriority[order.id] ?? order.production_priority
          const deliveryNote = draftDeliveryNote[order.id] ?? ''
            const agreedTotal = numericAmount(order.agreed_total)
            const balanceDue = numericAmount(order.balance_due)
            const paymentDraft = paymentDrafts[order.id] ?? {
              amount: '',
              method: 'transfer' as PaymentMethod,
              paidOn: todayInputValue(),
              reference: '',
              note: '',
            }
            const estimatedCost = numericAmount(order.estimated_cost)
            const actualCost = numericAmount(order.actual_cost)
            const revenue = numericAmount(order.known_total)
            const estimatedProfit =
              revenue !== null && estimatedCost !== null
                ? revenue - estimatedCost
                : null
            const actualProfit =
              revenue !== null && actualCost !== null
                ? revenue - actualCost
                : null
            const actualMargin =
              revenue !== null && revenue > 0 && actualProfit !== null
                ? (actualProfit / revenue) * 100
                : null
            const costDifference =
              actualCost !== null && estimatedCost !== null
                ? actualCost - estimatedCost
                : null

            return (
              <article
              className="admin-order-card"
              id={`order-${order.id}`}
              key={order.id}
            >
                <div className="admin-order-top">
                  <div>
                    <span className="admin-order-code">{order.public_code}</span>
                    <h3>{order.customer_name}</h3>
                    <p>{dateTime(order.created_at)}</p>
                  </div>

                  <span className={`admin-order-status is-${order.status}`}>
                    {statusLabels[order.status]}
                  </span>
                </div>

                <div className="admin-order-contact">
                  <a
                    href={whatsappContactUrl(order)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp: {order.customer_phone} ↗
                  </a>
                  {order.customer_email && <span>{order.customer_email}</span>}
                </div>

                <div className="admin-order-quick-actions">
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void copyText(order.public_code, 'Código de pedido copiado.')}
                  >
                    Copiar código
                  </button>
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() =>
                      void copyText(
                        trackingUrl(order),
                        'Link de seguimiento copiado.',
                      )
                    }
                  >
                    Copiar seguimiento
                  </button>
                  <a
                    className="admin-secondary admin-order-tracking-link"
                    href={trackingUrl(order)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir seguimiento ↗
                  </a>
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void copyText(order.customer_phone, 'Teléfono copiado.')}
                  >
                    Copiar teléfono
                  </button>
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void copyText(orderSummary(order), 'Resumen del pedido copiado.')}
                  >
                    Copiar resumen
                  </button>
                </div>

                <section className="admin-order-whatsapp-box">
                  <div>
                    <span>WhatsApp operativo</span>
                    <strong>Mensajes listos según el momento del pedido</strong>
                  </div>

                  <div className="admin-order-whatsapp-actions">
                    <a
                      href={whatsappContactUrl(order)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Consulta general
                    </a>

                    {order.status === 'confirmed' && (
                      <a
                        href={confirmedWhatsappUrl(order)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Pedido confirmado
                      </a>
                    )}

                    {order.status !== 'cancelled' &&
                      order.status !== 'completed' &&
                      !['not_started', 'ready_for_delivery'].includes(
                        order.production_stage,
                      ) && (
                        <a
                          href={productionWhatsappUrl(order)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Actualizar producción
                        </a>
                      )}

                    {(order.status === 'ready' ||
                      order.production_stage === 'ready_for_delivery') && (
                      <a
                        className="is-ready"
                        href={readyWhatsappUrl(order)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Avisar que está listo
                      </a>
                    )}

                    {balanceDue !== null && balanceDue > 0 && (
                      <a
                        className="is-balance"
                        href={balanceWhatsappUrl(order)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Recordar saldo · {money(order.balance_due)}
                      </a>
                    )}
                  </div>
                </section>

                <AdminOrderFiles
                  orderId={order.id}
                  orderCode={order.public_code}
                  trackingToken={order.tracking_token}
                  customerName={order.customer_name}
                  customerPhone={order.customer_phone}
                  productionStage={order.production_stage}
                  files={order.files}
                  disabled={order.status === 'cancelled'}
                  onChanged={() => loadOrders()}
                />

                {order.customer_notes && (
                  <p className="admin-order-note">
                    <strong>Nota general:</strong> {order.customer_notes}
                  </p>
                )}

                <div className="admin-order-items">
                  {order.items.map((item) => (
                    <div className="admin-order-item" key={item.id}>
                      <div>
                        <strong>
                          {item.quantity}× {item.product_name}
                        </strong>
                        {item.variant_name && <small>Variante: {item.variant_name}</small>}
                        {item.customization_values.length > 0 && (
                          <div className="admin-order-customizations">
                            {item.customization_values.map((customization) => (
                              <small key={customization.fieldId}>
                                <strong>{customization.label}:</strong> {customization.value}
                              </small>
                            ))}
                          </div>
                        )}
                        {item.customization_note && (
                          <small>
                            <strong>Nota:</strong> {item.customization_note}
                          </small>
                        )}
                      </div>

                      <span>{item.line_total ? money(item.line_total) : 'A consultar'}</span>
                    </div>
                  ))}
                </div>

                <div className="admin-order-total">
                  <span>Subtotal conocido</span>
                  <strong>{money(order.known_total)}</strong>
                </div>

                              <section className={`admin-order-schedule is-${order.production_priority}`}>
                                <div className="admin-order-schedule-heading">
                                  <div>
                                    <span>Producción y entrega</span>
                                    <strong>{promisedTimingLabel(order.promised_for)}</strong>
                                  </div>
                                  <span className={`admin-order-priority is-${order.production_priority}`}>
                                    Prioridad {productionPriorityLabels[order.production_priority]}
                                  </span>
                                </div>

                                <div className="admin-order-schedule-form">
                                  <label>
                                    Fecha prometida
                                    <input
                                      type="date"
                                      value={promisedFor}
                                      onChange={(event) =>
                                        setDraftPromisedFor((current) => ({
                                          ...current,
                                          [order.id]: event.target.value,
                                        }))
                                      }
                                      disabled={savingSchedule || order.status === 'cancelled'}
                                    />
                                  </label>

                                  <label>
                                    Prioridad
                                    <select
                                      value={productionPriority}
                                      onChange={(event) =>
                                        setDraftProductionPriority((current) => ({
                                          ...current,
                                          [order.id]: event.target.value as ProductionPriority,
                                        }))
                                      }
                                      disabled={savingSchedule || order.status === 'cancelled'}
                                    >
                                      {(
                                        Object.entries(productionPriorityLabels) as Array<
                                          [ProductionPriority, string]
                                        >
                                      ).map(([value, label]) => (
                                        <option key={value} value={value}>
                                          {label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <label className="admin-order-schedule-note">
                                    Nota de entrega
                                    <input
                                      type="text"
                                      maxLength={500}
                                      value={deliveryNote}
                                      placeholder="Ej. Retira por la tarde / llevar al salón"
                                      onChange={(event) =>
                                        setDraftDeliveryNote((current) => ({
                                          ...current,
                                          [order.id]: event.target.value,
                                        }))
                                      }
                                      disabled={savingSchedule || order.status === 'cancelled'}
                                    />
                                  </label>

                                  <button
                                    className="admin-primary"
                                    type="button"
                                    onClick={() => void saveSchedule(order)}
                                    disabled={savingSchedule || order.status === 'cancelled'}
                                  >
                                    {savingSchedule ? 'Guardando…' : 'Guardar planificación'}
                                  </button>
                                </div>

                                <div className="admin-order-production-stage">
                                  <div className="admin-order-production-stage-heading">
                                    <div>
                                      <span>Etapa actual</span>
                                      <strong>
                                        {productionStageLabels[order.production_stage]}
                                      </strong>
                                    </div>

                                    {order.production_stage_updated_at && (
                                      <small>
                                        Actualizada{' '}
                                        {dateTime(order.production_stage_updated_at)}
                                      </small>
                                    )}
                                  </div>

                                  <div className="admin-order-production-stage-form">
                                    <label>
                                      Etapa
                                      <select
                                        value={productionStage}
                                        onChange={(event) =>
                                          setDraftProductionStage((current) => ({
                                            ...current,
                                            [order.id]:
                                              event.target.value as ProductionStage,
                                          }))
                                        }
                                        disabled={
                                          savingProductionStage ||
                                          !['confirmed', 'in_progress', 'ready'].includes(
                                            order.status,
                                          )
                                        }
                                      >
                                        {(
                                          Object.entries(productionStageLabels) as Array<
                                            [ProductionStage, string]
                                          >
                                        ).map(([value, label]) => (
                                          <option key={value} value={value}>
                                            {label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="admin-order-production-stage-note">
                                      Nota interna
                                      <input
                                        type="text"
                                        maxLength={500}
                                        value={productionStageNote}
                                        placeholder="Ej. esperando logo / falta pintar / listo para retirar"
                                        onChange={(event) =>
                                          setDraftProductionStageNote((current) => ({
                                            ...current,
                                            [order.id]: event.target.value,
                                          }))
                                        }
                                        disabled={
                                          savingProductionStage ||
                                          !['confirmed', 'in_progress', 'ready'].includes(
                                            order.status,
                                          )
                                        }
                                      />
                                    </label>

                                    <button
                                      className="admin-secondary"
                                      type="button"
                                      onClick={() => void saveProductionStage(order)}
                                      disabled={
                                        savingProductionStage ||
                                        !['confirmed', 'in_progress', 'ready'].includes(
                                          order.status,
                                        )
                                      }
                                    >
                                      {savingProductionStage
                                        ? 'Guardando…'
                                        : 'Guardar etapa'}
                                    </button>
                                  </div>

                                  {!['confirmed', 'in_progress', 'ready'].includes(
                                    order.status,
                                  ) && (
                                    <small>
                                      El seguimiento fino se habilita al confirmar el pedido.
                                    </small>
                                  )}
                                </div>

                                {order.schedule_updated_at && (
                                  <small className="admin-order-schedule-updated">
                                    Planificación actualizada {dateTime(order.schedule_updated_at)}
                                  </small>
                                )}
                              </section>

                              <section className={`admin-order-payments is-${order.payment_status}`}>
                <div className="admin-order-payments-heading">
                  <div>
                    <span>Cobros y saldo</span>
                    <strong>{paymentStatusLabels[order.payment_status]}</strong>
                  </div>
                  <span className="admin-order-payment-status">
                    {paymentStatusLabels[order.payment_status]}
                  </span>
                </div>

                <div className="admin-order-payment-summary">
                  <div>
                    <span>Total acordado</span>
                    <strong>
                      {order.agreed_total ? money(order.agreed_total) : 'Pendiente'}
                    </strong>
                  </div>
                  <div>
                    <span>Cobrado</span>
                    <strong>{money(order.paid_total)}</strong>
                  </div>
                  <div>
                    <span>Saldo</span>
                    <strong>
                      {order.balance_due === null ? '—' : money(order.balance_due)}
                    </strong>
                  </div>
                </div>

                <div className="admin-order-agreed-total-form">
                  <label>
                    Total acordado del pedido
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={draftAgreedTotal[order.id] ?? ''}
                      onChange={(event) =>
                        setDraftAgreedTotal((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                      disabled={savingAgreedTotal || order.status === 'cancelled'}
                      placeholder="Ej. 65000"
                    />
                  </label>
                  <button
                    className="admin-secondary"
                    type="button"
                    onClick={() => void saveAgreedTotal(order)}
                    disabled={
                      savingAgreedTotal ||
                      order.status === 'cancelled' ||
                      !(draftAgreedTotal[order.id] ?? '').trim() ||
                      (agreedTotal !== null &&
                        Math.abs(
                          Number((draftAgreedTotal[order.id] ?? '0').replace(',', '.')) -
                            agreedTotal,
                        ) < 0.009)
                    }
                  >
                    {savingAgreedTotal
                      ? 'Guardando…'
                      : order.agreed_total
                        ? 'Actualizar total'
                        : 'Definir total'}
                  </button>
                </div>

                {order.agreed_total &&
                  order.payment_status !== 'paid' &&
                  order.status !== 'cancelled' && (
                    <div className="admin-order-payment-form">
                      <label>
                        Importe
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          inputMode="decimal"
                          value={paymentDraft.amount}
                          placeholder={
                            balanceDue !== null
                              ? `Saldo ${money(String(balanceDue))}`
                              : 'Importe'
                          }
                          onChange={(event) =>
                            setPaymentDrafts((current) => ({
                              ...current,
                              [order.id]: {
                                ...paymentDraft,
                                amount: event.target.value,
                              },
                            }))
                          }
                          disabled={savingPayment}
                        />
                      </label>

                      <label>
                        Medio
                        <select
                          value={paymentDraft.method}
                          onChange={(event) =>
                            setPaymentDrafts((current) => ({
                              ...current,
                              [order.id]: {
                                ...paymentDraft,
                                method: event.target.value as PaymentMethod,
                              },
                            }))
                          }
                          disabled={savingPayment}
                        >
                          {(
                            Object.entries(paymentMethodLabels) as Array<
                              [PaymentMethod, string]
                            >
                          ).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Fecha
                        <input
                          type="date"
                          value={paymentDraft.paidOn}
                          onChange={(event) =>
                            setPaymentDrafts((current) => ({
                              ...current,
                              [order.id]: {
                                ...paymentDraft,
                                paidOn: event.target.value,
                              },
                            }))
                          }
                          disabled={savingPayment}
                        />
                      </label>

                      <label>
                        Referencia
                        <input
                          type="text"
                          maxLength={120}
                          value={paymentDraft.reference}
                          placeholder="Opcional"
                          onChange={(event) =>
                            setPaymentDrafts((current) => ({
                              ...current,
                              [order.id]: {
                                ...paymentDraft,
                                reference: event.target.value,
                              },
                            }))
                          }
                          disabled={savingPayment}
                        />
                      </label>

                      <label className="admin-order-payment-note">
                        Nota
                        <input
                          type="text"
                          maxLength={500}
                          value={paymentDraft.note}
                          placeholder="Ej. Seña del 50%"
                          onChange={(event) =>
                            setPaymentDrafts((current) => ({
                              ...current,
                              [order.id]: {
                                ...paymentDraft,
                                note: event.target.value,
                              },
                            }))
                          }
                          disabled={savingPayment}
                        />
                      </label>

                      <button
                        className="admin-primary"
                        type="button"
                        onClick={() => void recordPayment(order)}
                        disabled={
                          savingPayment ||
                          !paymentDraft.amount.trim() ||
                          !paymentDraft.paidOn
                        }
                      >
                        {savingPayment ? 'Registrando…' : 'Registrar cobro'}
                      </button>
                    </div>
                  )}

                {order.payments.length > 0 && (
                  <div className="admin-order-payment-history">
                    <div className="admin-order-payment-history-title">
                      <strong>Historial de cobros</strong>
                      <span>
                        {order.payments.filter((payment) => !payment.voided_at).length}
                        {' '}activo(s)
                      </span>
                    </div>

                    {order.payments.map((payment) => (
                      <div
                        className={`admin-order-payment-row${payment.voided_at ? ' is-voided' : ''}`}
                        key={payment.id}
                      >
                        <div>
                          <strong>{money(payment.amount)}</strong>
                          <span>
                            {paymentMethodLabels[payment.payment_method]} ·{' '}
                            {dateOnly(payment.paid_on)}
                          </span>
                          {payment.reference && (
                            <small>Ref. {payment.reference}</small>
                          )}
                          {payment.note && <small>{payment.note}</small>}
                          {payment.voided_at && (
                            <small>
                              Anulado
                              {payment.void_reason ? ` · ${payment.void_reason}` : ''}
                            </small>
                          )}
                        </div>

                        {!payment.voided_at && (
                          <div className="admin-order-payment-void">
                            {voidingPaymentId === payment.id ? (
                              <>
                                <input
                                  type="text"
                                  maxLength={500}
                                  value={voidReason}
                                  placeholder="Motivo de anulación"
                                  onChange={(event) => setVoidReason(event.target.value)}
                                  disabled={voidSavingId === payment.id}
                                />
                                <button
                                  type="button"
                                  className="admin-secondary"
                                  onClick={() => {
                                    setVoidingPaymentId(null)
                                    setVoidReason('')
                                  }}
                                  disabled={voidSavingId === payment.id}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  className="admin-danger"
                                  onClick={() => void voidPayment(order, payment)}
                                  disabled={
                                    voidSavingId === payment.id ||
                                    voidReason.trim().length < 3
                                  }
                                >
                                  {voidSavingId === payment.id
                                    ? 'Anulando…'
                                    : 'Confirmar'}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="admin-secondary"
                                onClick={() => {
                                  setVoidingPaymentId(payment.id)
                                  setVoidReason('')
                                }}
                              >
                                Anular
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

{order.quote_code && order.estimated_cost && (
                  <section className="admin-order-actual-cost">
                    <div className="admin-order-actual-cost-heading">
                      <div>
                        <span>Control de rentabilidad</span>
                        <strong>{order.quote_code}</strong>
                      </div>

                      {order.actual_cost_updated_at && (
                        <small>
                          Actualizado {dateTime(order.actual_cost_updated_at)}
                        </small>
                      )}
                    </div>

                    <div className="admin-order-cost-summary">
                      <div>
                        <span>Costo estimado PRE</span>
                        <strong>{money(order.estimated_cost)}</strong>
                        {estimatedProfit !== null && (
                          <small>
                            Ganancia estimada {money(String(estimatedProfit))}
                          </small>
                        )}
                      </div>

                      <div>
                        <span>Costo real final</span>
                        <strong>
                          {order.actual_cost ? money(order.actual_cost) : 'Pendiente'}
                        </strong>
                        {actualProfit !== null && (
                          <small>
                            Ganancia final {money(String(actualProfit))}
                            {actualMargin !== null
                              ? ` · margen ${Math.round(actualMargin)}%`
                              : ''}
                          </small>
                        )}
                      </div>
                    </div>

                    {costDifference !== null && (
                      <p className="admin-order-cost-difference">
                        {costDifference === 0
                          ? 'El costo real coincidió con la estimación.'
                          : costDifference > 0
                            ? `El costo real quedó ${money(String(costDifference))} por encima de lo estimado.`
                            : `El costo real quedó ${money(String(Math.abs(costDifference)))} por debajo de lo estimado.`}
                      </p>
                    )}

                    <div className="admin-order-actual-cost-form">
                      <label>
                        Costo real final del pedido
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={draftActualCost[order.id] ?? ''}
                          placeholder="Ej. 45500"
                          onChange={(event) =>
                            setDraftActualCost((current) => ({
                              ...current,
                              [order.id]: event.target.value,
                            }))
                          }
                          disabled={savingActualCost}
                        />
                        <small>
                          Total del proyecto, no por unidad. Incluí materiales, trabajo,
                          luz y desgaste reales.
                        </small>
                      </label>

                      <label>
                        Nota del costo
                        <input
                          type="text"
                          maxLength={500}
                          value={draftActualCostNote[order.id] ?? ''}
                          placeholder="Opcional: desperdicio extra, reimpresión, etc."
                          onChange={(event) =>
                            setDraftActualCostNote((current) => ({
                              ...current,
                              [order.id]: event.target.value,
                            }))
                          }
                          disabled={savingActualCost}
                        />
                      </label>

                      <button
                        className="admin-primary"
                        type="button"
                        onClick={() => void saveActualCost(order)}
                        disabled={
                          savingActualCost ||
                          !(draftActualCost[order.id] ?? '').trim()
                        }
                      >
                        {savingActualCost ? 'Guardando…' : 'Guardar costo real'}
                      </button>
                    </div>
                  </section>
                )}

                {order.has_quote && (
                  <p className="admin-order-quote">Incluye ítems que requieren cotización.</p>
                )}

                <div className="admin-order-workflow">
                  <label>
                    Estado del pedido
                    <select
                      value={selectedStatus}
                      onChange={(event) =>
                        setDraftStatus((current) => ({
                          ...current,
                          [order.id]: event.target.value as OrderStatus,
                        }))
                      }
                      disabled={saving}
                    >
                      {statusOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="admin-order-workflow-note">
                    Nota del cambio
                    <input
                      type="text"
                      maxLength={300}
                      value={note}
                      placeholder="Opcional: pago recibido, fecha coordinada, etc."
                      onChange={(event) =>
                        setDraftNote((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                      disabled={saving}
                    />
                  </label>

                  <button
                    className="admin-primary"
                    type="button"
                    onClick={() => void saveStatus(order)}
                    disabled={saving || (selectedStatus === order.status && !note.trim())}
                  >
                    {saving ? 'Guardando…' : 'Guardar cambio'}
                  </button>
                </div>

                <details className="admin-order-history">
                  <summary>Historial · {order.events.length} eventos</summary>

                  <div className="admin-order-history-list">
                    {order.events.map((event) => (
                      <div className="admin-order-event" key={event.id}>
                        <span>{dateTime(event.created_at)}</span>
                        <strong>
                          {event.from_status && event.to_status
                            ? `${statusLabels[event.from_status]} → ${statusLabels[event.to_status]}`
                            : event.to_status
                              ? statusLabels[event.to_status]
                              : event.event_type}
                        </strong>
                        {event.note && <p>{event.note}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
