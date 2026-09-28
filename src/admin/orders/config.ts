import type {
  GuidedProductionStep,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductionPriority,
  ProductionStage,
} from './types'

export const statusLabels: Record<OrderStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  confirmed: 'Confirmado',
  in_progress: 'En proceso',
  ready: 'Listo',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

export const statusOptions = Object.entries(statusLabels) as Array<
  [OrderStatus, string]
>

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
  card: 'Tarjeta',
  other: 'Otro',
}

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  total_pending: 'Falta total acordado',
  unpaid: 'Sin cobrar',
  partial: 'Cobro parcial',
  paid: 'Pagado',
}

export const productionPriorityLabels: Record<ProductionPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

export const productionPriorityWeight: Record<ProductionPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
}

export const productionStageLabels: Record<ProductionStage, string> = {
  not_started: 'Sin iniciar',
  design: 'Diseño / armado',
  awaiting_approval: 'Esperando aprobación',
  materials: 'Preparando materiales',
  production: 'En producción',
  finishing: 'Terminaciones',
  ready_for_delivery: 'Listo para entregar',
}

export const guidedProductionSteps: Partial<
  Record<ProductionStage, GuidedProductionStep>
> = {
  not_started: {
    stage: 'design',
    label: 'Iniciar diseño / armado',
    note: 'Flujo guiado: inicio de diseño / armado.',
  },
  design: {
    stage: 'materials',
    label: 'Continuar a preparar materiales',
    note: 'Flujo guiado: diseño resuelto; preparar materiales.',
  },
  materials: {
    stage: 'production',
    label: 'Comenzar producción',
    note: 'Flujo guiado: materiales listos; producción iniciada.',
  },
  production: {
    stage: 'finishing',
    label: 'Pasar a terminaciones',
    note: 'Flujo guiado: producción principal terminada; iniciar terminaciones.',
  },
  finishing: {
    stage: 'ready_for_delivery',
    label: 'Marcar listo para entregar',
    note: 'Flujo guiado: terminaciones completadas; listo para entregar.',
  },
}
