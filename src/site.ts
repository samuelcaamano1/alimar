const whatsappNumber = '5491135682635'
const whatsappMessage = 'Hola, quiero consultar por un producto o servicio de Alimar.'

export const site = {
  instagramUrl: 'https://www.instagram.com/alimar.imp',
  whatsappNumber,
  whatsappUrl: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`,
} as const
