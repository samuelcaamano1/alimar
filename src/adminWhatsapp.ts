export type RequestWhatsappContext = {
  customerName: string
  requestCode: string
  typeLabel: string
}

export type OrderWhatsappContext = {
  customerName: string
  orderCode: string
  trackingUrl: string
  productionStageLabel?: string | null
  promisedForLabel?: string | null
  balanceLabel?: string | null
}

function customerWhatsappDigits(phone: string) {
  let digits = phone.replace(/\D/g, '')

  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('549')) return digits

  if (digits.startsWith('54')) {
    const local = digits.slice(2).replace(/^0/, '')
    return `549${local}`
  }

  if (digits.length === 10) {
    return `549${digits}`
  }

  return digits
}

export function customerWhatsappUrl(phone: string, message: string) {
  const digits = customerWhatsappDigits(phone)

  if (digits.length < 8) return null

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export function requestGeneralWhatsappMessage(
  context: RequestWhatsappContext,
) {
  return [
    `Hola ${context.customerName}, te escribo de Alimar por tu Pedido Personalizado ${context.requestCode}.`,
    '',
    `Tipo de trabajo: ${context.typeLabel}.`,
    '',
    'Si querés agregar un dato o una referencia, podés responderme por acá.',
  ].join('\n')
}

export function requestReceivedWhatsappMessage(
  context: RequestWhatsappContext,
) {
  return [
    `Hola ${context.customerName}, recibimos tu Pedido Personalizado ${context.requestCode}.`,
    '',
    'Ya quedó registrado en Alimar.',
    'Vamos a revisar lo que nos enviaste y te escribimos por acá si necesitamos confirmar algún detalle.',
  ].join('\n')
}

export function requestReviewingWhatsappMessage(
  context: RequestWhatsappContext,
) {
  return [
    `Hola ${context.customerName}, ya estamos revisando tu Pedido Personalizado ${context.requestCode}.`,
    '',
    'Estamos viendo materiales, cantidad y tiempos para prepararte el presupuesto.',
    'Cuando esté listo te lo enviamos por este mismo WhatsApp.',
  ].join('\n')
}

export function orderGeneralWhatsappMessage(context: OrderWhatsappContext) {
  return [
    `Hola ${context.customerName}, te escribo de Alimar por tu pedido ${context.orderCode}.`,
    '',
    `Podés seguir el avance acá: ${context.trackingUrl}`,
  ].join('\n')
}

export function orderConfirmedWhatsappMessage(context: OrderWhatsappContext) {
  const lines = [
    `Hola ${context.customerName}, tu pedido ${context.orderCode} quedó confirmado.`,
    '',
    'Ya lo tenemos en nuestra agenda de trabajo.',
  ]

  if (context.promisedForLabel) {
    lines.push(`Fecha prevista: ${context.promisedForLabel}.`)
  }

  lines.push('', `Podés seguir el avance acá: ${context.trackingUrl}`)

  return lines.join('\n')
}

export function orderProductionWhatsappMessage(context: OrderWhatsappContext) {
  const stage =
    context.productionStageLabel?.trim() || 'en proceso de producción'

  const lines = [
    `Hola ${context.customerName}, te actualizo tu pedido ${context.orderCode}.`,
    '',
    `Ahora está en: ${stage}.`,
  ]

  if (context.promisedForLabel) {
    lines.push(`Fecha prevista: ${context.promisedForLabel}.`)
  }

  lines.push('', `Podés seguir el avance acá: ${context.trackingUrl}`)

  return lines.join('\n')
}

export function orderReadyWhatsappMessage(context: OrderWhatsappContext) {
  return [
    `Hola ${context.customerName}, tu pedido ${context.orderCode} ya está listo.`,
    '',
    'Cuando quieras coordinamos retiro o entrega por acá.',
    '',
    `Seguimiento: ${context.trackingUrl}`,
  ].join('\n')
}

export function orderBalanceWhatsappMessage(context: OrderWhatsappContext) {
  return [
    `Hola ${context.customerName}, te escribo por el saldo de tu pedido ${context.orderCode}.`,
    '',
    `Saldo pendiente: ${context.balanceLabel || 'a confirmar'}.`,
    '',
    'Cuando quieras coordinamos el pago por este WhatsApp.',
    `Seguimiento: ${context.trackingUrl}`,
  ].join('\n')
}
