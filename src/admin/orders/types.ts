import type { AdminOrderFile } from '../../AdminOrderFiles'

export type OrderStatus =
  | 'new'
  | 'contacted'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'

export type DateFilter = 'all' | 'today' | '7d' | '30d'
export type PaymentMethod = 'cash' | 'transfer' | 'mercadopago' | 'card' | 'other'
export type PaymentStatus = 'total_pending' | 'unpaid' | 'partial' | 'paid'
export type PaymentFilter = 'all' | 'pending' | 'paid' | 'total_pending'
export type ProductionPriority = 'low' | 'normal' | 'high' | 'urgent'

export type ProductionStage =
  | 'not_started'
  | 'design'
  | 'awaiting_approval'
  | 'materials'
  | 'production'
  | 'finishing'
  | 'ready_for_delivery'

export type AdminOrderCustomization = {
  fieldId: string
  label: string
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select'
  value: string
}

export type AdminOrderItem = {
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

export type AdminOrderEvent = {
  id: string
  event_type: string
  from_status: OrderStatus | null
  to_status: OrderStatus | null
  note: string | null
  created_at: string
}

export type AdminOrderPayment = {
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

export type PaymentDraft = {
  amount: string
  method: PaymentMethod
  paidOn: string
  reference: string
  note: string
}

export type AdminOrder = {
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
  delivery_checked_at: string | null
  delivery_check_note: string | null
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

export type OrdersResponse = { orders: AdminOrder[] }

export type GuidedProductionStep = {
  stage: ProductionStage
  label: string
  note: string
}
