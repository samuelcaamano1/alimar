export type CostCategory =
  | 'paper'
  | 'ink'
  | 'filament'
  | 'paint'
  | 'energy'
  | 'machine'
  | 'labor'
  | 'consumable'
  | 'other'

export type CostUnit =
  | 'unit'
  | 'sheet'
  | 'print'
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'm'
  | 'kwh'
  | 'minute'
  | 'hour'

export type CostResource = {
  id: string
  name: string
  category: CostCategory
  detail: string | null
  unit: CostUnit
  purchase_price: string
  package_quantity: string
  waste_percent: string
  notes: string | null
  effective_unit_cost: string
  updated_at: string
}

export type Draft = {
  name: string
  category: CostCategory
  detail: string
  unit: CostUnit
  purchasePrice: string
  packageQuantity: string
  wastePercent: string
  notes: string
}

export type GuidedJobType = 'paper-print' | '3d-print' | 'manual'
export type WizardStep = 1 | 2 | 3
export type PrintSides = 'single' | 'double'
export type QuoteFocusFilter = 'all' | 'waiting' | 'expiring' | 'accepted' | 'expired'
export type QuoteMetricPeriod = 'month' | 'all'

export type QuoteCommercialMetrics = {
  total_count: number
  sent_count: number
  accepted_count: number
  rejected_count: number
  converted_count: number
  converted_actual_cost_count: number
  quoted_value: string
  accepted_value: string
  accepted_real_cost: string
  accepted_profit: string
  converted_value: string
  converted_real_cost: string
  converted_profit: string
  actual_revenue: string
  actual_estimated_cost: string
  actual_cost_total: string
  actual_profit: string
  actual_overrun_count: number
  actual_saving_count: number
  actual_on_target_count: number
  average_accepted_ticket: string
  reject_price_count: number
  reject_timing_count: number
  reject_cancelled_count: number
  reject_other_count: number
}

export type QuoteCommercialMetricSet = {
  month: QuoteCommercialMetrics
  all: QuoteCommercialMetrics
}

export type QuoteJobProfitability = {
  job_type: string
  closed_count: number
  revenue: string
  estimated_cost: string
  actual_cost: string
  profit: string
  overrun_count: number
  saving_count: number
}

export type QuoteJobProfitabilitySet = {
  month: QuoteJobProfitability[]
  all: QuoteJobProfitability[]
}

export type GuidedCost = {
  key: string
  label: string
  detail: string
  total: number
}
