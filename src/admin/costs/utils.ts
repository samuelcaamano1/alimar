import type { CustomRequest } from '../../AdminCustomRequests'
import type {
  CostCategory,
  CostResource,
  CostUnit,
  Draft,
  QuoteCommercialMetrics,
} from './types'

export function defaultUnitForCategory(category: CostCategory): CostUnit {
  switch (category) {
    case 'paper':
      return 'sheet'
    case 'ink':
      return 'print'
    case 'filament':
      return 'g'
    case 'paint':
      return 'ml'
    case 'labor':
      return 'hour'
    case 'energy':
      return 'kwh'
    case 'machine':
      return 'hour'
    default:
      return 'unit'
  }
}

export function money(value: number) {
  if (!Number.isFinite(value)) return '$0'

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value)
}

export function dateLabel(value: string | null) {
  if (!value) return 'Sin vencimiento'

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function quoteResponseReasonLabel(value: string | null) {
  switch (value) {
    case 'price':
      return 'Precio'
    case 'timing':
      return 'Tiempos'
    case 'cancelled':
      return 'Ya no lo necesita'
    case 'other':
      return 'Otro'
    default:
      return 'Sin motivo'
  }
}

export function quoteJobTypeLabel(value: string) {
  switch (value) {
    case 'paper-print':
      return 'Papelería / impresión'
    case '3d-print':
      return 'Impresión 3D'
    case 'manual':
      return 'Manualidades'
    case 'combined':
      return 'Proyecto combinado'
    default:
      return 'Otro trabajo'
  }
}

export function costVariancePercent(
  estimatedValue: string,
  actualValue: string,
) {
  const estimated = Number(estimatedValue)
  const actual = Number(actualValue)

  if (!Number.isFinite(estimated) || estimated <= 0 || !Number.isFinite(actual)) {
    return null
  }

  return ((actual - estimated) / estimated) * 100
}

export function grossMargin(revenueValue: string, costValue: string) {
  const revenue = Number(revenueValue)
  const cost = Number(costValue)

  if (!Number.isFinite(revenue) || revenue <= 0 || !Number.isFinite(cost)) {
    return null
  }

  return ((revenue - cost) / revenue) * 100
}

export function acceptanceRate(metrics: QuoteCommercialMetrics) {
  const decided = metrics.accepted_count + metrics.rejected_count
  if (decided <= 0) return null

  return (metrics.accepted_count / decided) * 100
}

export function daysUntil(value: string | null) {
  if (!value) return null

  const target = new Date(`${value}T12:00:00`)
  if (Number.isNaN(target.getTime())) return null

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

export function dateTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function number(value: string) {
  const raw = value.trim().replace(/\s+/g, '')
  if (!raw) return 0

  let normalized = raw

  if (raw.includes(',') && raw.includes('.')) {
    normalized =
      raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '')
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.')
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '')
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function roundUp(value: number, step: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (!Number.isFinite(step) || step <= 1) return Math.ceil(value)
  return Math.ceil(value / step) * step
}

export function convertUsage(amount: number, from: CostUnit, to: CostUnit) {
  if (from === to) return amount
  if (from === 'g' && to === 'kg') return amount / 1000
  if (from === 'kg' && to === 'g') return amount * 1000
  if (from === 'ml' && to === 'l') return amount / 1000
  if (from === 'l' && to === 'ml') return amount * 1000
  if (from === 'minute' && to === 'hour') return amount / 60
  if (from === 'hour' && to === 'minute') return amount * 60
  return amount
}

export function customRequestNotes(request: CustomRequest) {
  const lines = [
    `Solicitud ${request.public_code}`,
    `Tipo solicitado: ${request.request_type}`,
    `Idea: ${request.description}`,
  ]

  if (request.quantity !== null) {
    lines.push(`Cantidad aproximada: ${request.quantity}`)
  }
  if (request.needed_date) {
    lines.push(`Fecha solicitada: ${request.needed_date}`)
  }
  if (request.dimensions) {
    lines.push(`Medidas: ${request.dimensions}`)
  }
  if (request.theme) {
    lines.push(`Tema / colores: ${request.theme}`)
  }
  if (request.reference_url) {
    lines.push(`Referencia: ${request.reference_url}`)
  }

  return lines.join('\n')
}

export function draftFromResource(resource: CostResource): Draft {
  const needsInkYield = resource.category === 'ink' && resource.unit !== 'print'

  if (resource.category === 'labor') {
    return {
      name: resource.name,
      category: 'labor',
      detail: resource.detail ?? '',
      unit: 'hour',
      purchasePrice: resource.effective_unit_cost || resource.purchase_price,
      packageQuantity: '1',
      wastePercent: '0',
      notes: resource.notes ?? '',
    }
  }

  return {
    name: resource.name,
    category: resource.category,
    detail: resource.detail ?? '',
    unit: resource.category === 'ink' ? 'print' : resource.unit,
    purchasePrice: resource.purchase_price,
    packageQuantity: needsInkYield ? '' : resource.package_quantity,
    wastePercent: resource.waste_percent,
    notes: resource.notes ?? '',
  }
}

export function payloadFromDraft(draft: Draft) {
  return {
    name: draft.name,
    category: draft.category,
    detail: draft.detail,
    unit: draft.category === 'labor' ? 'hour' : draft.unit,
    purchasePrice: draft.purchasePrice,
    packageQuantity: draft.category === 'labor' ? '1' : draft.packageQuantity,
    wastePercent: draft.category === 'labor' ? '0' : draft.wastePercent,
    notes: draft.notes,
  }
}
