import { productionPriorityWeight } from './config'
import type {
  AdminOrder,
  DateFilter,
  OrderStatus,
  PaymentFilter,
} from './types'
import {
  dateFilterStart,
  productionBucket,
  promisedDaysFromToday,
} from './utils'

export function getOrderCounts(orders: AdminOrder[]) {
  return {
    all: orders.length,
    new: orders.filter((order) => order.status === 'new').length,
    open: orders.filter((order) =>
      ['contacted', 'confirmed', 'in_progress'].includes(order.status),
    ).length,
    ready: orders.filter((order) => order.status === 'ready').length,
    paymentPending: orders.filter(
      (order) =>
        order.payment_status === 'unpaid' ||
        order.payment_status === 'partial',
    ).length,
    paid: orders.filter((order) => order.payment_status === 'paid').length,
    totalPending: orders.filter(
      (order) => order.payment_status === 'total_pending',
    ).length,
  }
}

export function getProductionCounts(orders: AdminOrder[]) {
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
}

export function getProductionQueue(orders: AdminOrder[]) {
  return orders
    .filter((order) =>
      ['confirmed', 'in_progress', 'ready'].includes(order.status),
    )
    .slice()
    .sort((left, right) => {
      const bucketDifference =
        productionBucket(left) - productionBucket(right)
      if (bucketDifference !== 0) return bucketDifference

      const priorityDifference =
        productionPriorityWeight[right.production_priority] -
        productionPriorityWeight[left.production_priority]
      if (priorityDifference !== 0) return priorityDifference

      if (left.promised_for && right.promised_for) {
        const dateDifference = left.promised_for.localeCompare(
          right.promised_for,
        )
        if (dateDifference !== 0) return dateDifference
      }

      return left.created_at.localeCompare(right.created_at)
    })
    .slice(0, 8)
}

export function getVisibleOrders(
  orders: AdminOrder[],
  filters: {
    statusFilter: 'all' | 'open' | OrderStatus
    searchQuery: string
    dateFilter: DateFilter
    paymentFilter: PaymentFilter
  },
) {
  const query = filters.searchQuery.trim().toLocaleLowerCase('es-AR')
  const dateStart = dateFilterStart(filters.dateFilter)

  return orders.filter((order) => {
    const matchesStatus =
      filters.statusFilter === 'all' ||
      (filters.statusFilter === 'open'
        ? ['contacted', 'confirmed', 'in_progress'].includes(order.status)
        : order.status === filters.statusFilter)

    const matchesPayment =
      filters.paymentFilter === 'all' ||
      (filters.paymentFilter === 'pending'
        ? order.payment_status === 'unpaid' ||
          order.payment_status === 'partial'
        : order.payment_status === filters.paymentFilter)

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
}
