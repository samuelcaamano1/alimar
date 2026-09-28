import type { QuoteStatus } from '../../adminQuotePrint'
import type { CostCategory, CostUnit, Draft } from './types'

export const LIGHT_PERCENT = 10
export const WEAR_PERCENT = 20

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Vencido',
}

export const quoteStatusOptions = Object.entries(quoteStatusLabels) as Array<
  [QuoteStatus, string]
>

export const categoryLabels: Record<CostCategory, string> = {
  paper: 'Papel',
  ink: 'Tinta',
  filament: 'Filamento 3D',
  paint: 'Pintura / acrílico',
  energy: 'Energía',
  machine: 'Máquina',
  labor: 'Mano de obra',
  consumable: 'Consumible',
  other: 'Otro',
}

export const unitLabels: Record<CostUnit, string> = {
  unit: 'unidad',
  sheet: 'hoja',
  print: 'impresión',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'litro',
  m: 'metro',
  kwh: 'kWh',
  minute: 'minuto',
  hour: 'hora',
}

export const emptyDraft: Draft = {
  name: '',
  category: 'paper',
  detail: '',
  unit: 'sheet',
  purchasePrice: '',
  packageQuantity: '',
  wastePercent: '0',
  notes: '',
}
