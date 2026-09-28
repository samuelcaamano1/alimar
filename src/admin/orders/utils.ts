import {
  customerWhatsappUrl,
  orderBalanceWhatsappMessage,
  orderConfirmedWhatsappMessage,
  orderGeneralWhatsappMessage,
  orderProductionWhatsappMessage,
  orderReadyWhatsappMessage,
} from '../../adminWhatsapp'
import { productionStageLabels, statusLabels } from './config'
import type { AdminOrder, DateFilter } from './types'

export function money(value: string | null) {
  if (!value) return 'A consultar'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'A consultar'

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function numericAmount(value: string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function dateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function todayInputValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export function dateOnly(value: string) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
  }).format(date)
}

export function promisedDaysFromToday(value: string | null) {
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

export function promisedTimingLabel(value: string | null) {
  const days = promisedDaysFromToday(value)

  if (days === null) return 'Sin fecha'
  if (days < 0) return `Atrasado ${Math.abs(days)} día(s)`
  if (days === 0) return 'Entrega hoy'
  if (days === 1) return 'Entrega mañana'
  if (days <= 7) return `Entrega en ${days} días`
  return dateOnly(value || '')
}

export function productionBucket(order: AdminOrder) {
  if (!['confirmed', 'in_progress', 'ready'].includes(order.status)) return 9

  const days = promisedDaysFromToday(order.promised_for)
  if (days === null) return 4
  if (days < 0) return 0
  if (days === 0) return 1
  if (days <= 7) return 2
  return 3
}

export function dateFilterStart(filter: DateFilter) {
  if (filter === 'all') return null

  const now = new Date()

  if (filter === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }

  const days = filter === '7d' ? 7 : 30
  return now.getTime() - days * 24 * 60 * 60 * 1000
}

export function trackingUrl(order: AdminOrder) {
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

export function whatsappContactUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderGeneralWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

export function confirmedWhatsappUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderConfirmedWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

export function productionWhatsappUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderProductionWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

export function readyWhatsappUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderReadyWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

export function balanceWhatsappUrl(order: AdminOrder) {
  return (
    customerWhatsappUrl(
      order.customer_phone,
      orderBalanceWhatsappMessage(orderWhatsappContext(order)),
    ) ?? '#'
  )
}

export function orderSummary(order: AdminOrder) {
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
