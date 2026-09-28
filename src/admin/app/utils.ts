import type { AdminCatalog } from './types'

export const emptyCatalog: AdminCatalog = {
  categories: [],
  products: [],
}

export function money(value: string | null) {
  if (!value) return 'Consultar'

  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Consultar'

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  return `${Math.round(value / 1024)} KB`
}

export function scrollAdminSection(selector: string) {
  document
    .querySelector(selector)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
