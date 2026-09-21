const whatsappNumber = '5491135682635'
const defaultWhatsappMessage = 'Hola, quiero consultar por un producto o servicio de Alimar.'

function buildWhatsappUrl(message: string) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
}

export const site = {
  instagramUrl: 'https://www.instagram.com/alimar.imp',
  whatsappNumber,
  whatsappUrl: buildWhatsappUrl(defaultWhatsappMessage),
  whatsappUrlFor(message: string) {
    return buildWhatsappUrl(message)
  },
} as const
