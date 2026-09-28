import type { CustomRequestExample } from './types'

export const fallbackCustomRequestExamples: CustomRequestExample[] = [
  {
    key: 'tattoo-paper',
    title: 'Papel para tatuajes',
    hint:
      'Hojas, diseños o referencias impresas parecidas a lo que viste.',
    requestType: 'paper',
    art: 'sheet',
    sizePlaceholder:
      'Ej. chico, mediano o del tamaño de una hoja común',
    themePlaceholder:
      'Ej. líneas negras, flores, nombres, dibujos...',
    descriptionPlaceholder:
      'Contanos qué querés que aparezca en la hoja y cómo te imaginás el resultado.',
  },
  {
    key: 'birthday',
    title: 'Cumpleaños y mesa dulce',
    hint:
      'Cartelitos, toppers, etiquetas y detalles con una misma temática.',
    requestType: 'event',
    art: 'party',
    sizePlaceholder: 'Ej. para una mesa chica, mediana o grande',
    themePlaceholder:
      'Ej. dinosaurios, fútbol, princesas, tonos pastel...',
    descriptionPlaceholder:
      'Contanos de quién es el cumple, la edad y qué cosas te gustaría tener.',
  },
  {
    key: 'invitations',
    title: 'Tarjetitas e invitaciones',
    hint:
      'Para cumpleaños, bautismos, eventos o una ocasión especial.',
    requestType: 'paper',
    art: 'card',
    sizePlaceholder: 'Ej. como una tarjeta, postal o foto',
    themePlaceholder:
      'Ej. elegante, infantil, flores, colores claros...',
    descriptionPlaceholder:
      'Decinos para qué evento es y qué texto o datos tendría que llevar.',
  },
  {
    key: 'stickers',
    title: 'Stickers y etiquetas',
    hint:
      'Para emprendimientos, regalos, frascos, bolsas o recuerdos.',
    requestType: 'paper',
    art: 'stickers',
    sizePlaceholder:
      'Ej. chiquitos para bolsitas o medianos para frascos',
    themePlaceholder:
      'Ej. logo, nombre, colores de tu marca...',
    descriptionPlaceholder:
      'Contanos dónde los vas a usar y qué tendría que decir o mostrar cada sticker.',
  },
  {
    key: 'boxes',
    title: 'Cajitas y souvenirs',
    hint:
      'Packaging, recuerdos y pequeños detalles armados para regalar.',
    requestType: 'event',
    art: 'box',
    sizePlaceholder:
      'Ej. para golosinas, souvenir chico o regalo mediano',
    themePlaceholder:
      'Ej. nombre, personaje, colores del evento...',
    descriptionPlaceholder:
      'Contanos qué querés guardar o entregar adentro y cómo te gustaría que se vea.',
  },
  {
    key: 'signs',
    title: 'Carteles y folletos',
    hint:
      'Para promocionar, informar, decorar o mostrar algo importante.',
    requestType: 'design',
    art: 'poster',
    sizePlaceholder:
      'Ej. para mano, mostrador, pared o vidriera',
    themePlaceholder:
      'Ej. llamativo, simple, elegante, con fotos...',
    descriptionPlaceholder:
      'Contanos qué necesitás comunicar y qué información sí o sí tiene que aparecer.',
  },
  {
    key: '3d',
    title: 'Figuras y piezas 3D',
    hint:
      'Nombres, adornos, figuras, soportes o una pieza que imaginaste.',
    requestType: '3d',
    art: 'cube',
    sizePlaceholder:
      'Ej. cabe en la mano, 10 cm, tamaño adorno...',
    themePlaceholder:
      'Ej. rojo y negro, personaje, nombre, estilo simple...',
    descriptionPlaceholder:
      'Contanos qué pieza querés, para qué la usarías y cómo debería verse.',
  },
  {
    key: 'other',
    title: 'Tengo otra idea',
    hint:
      'Si no encaja en ninguna opción, contanos con tus palabras.',
    requestType: 'other',
    art: 'idea',
    sizePlaceholder:
      'Si sabés el tamaño, contanos más o menos cuál',
    themePlaceholder:
      'Colores, estilo o referencias que te gusten',
    descriptionPlaceholder:
      'Contanos la idea como se la contarías a alguien por WhatsApp. No hace falta usar palabras técnicas.',
  },
]

export const DIRECT_CUSTOM_REQUEST_KEY = '__direct__'

export const directCustomRequestExample: CustomRequestExample = {
  key: DIRECT_CUSTOM_REQUEST_KEY,
  title: 'Tu propia idea',
  hint:
    'No hace falta elegir un producto ni un ejemplo. Contanos qué necesitás y lo cotizamos.',
  requestType: 'other',
  art: 'idea',
  sizePlaceholder:
    'Si sabés el tamaño, contanos más o menos cuál',
  themePlaceholder:
    'Colores, estilo o referencias que te gusten',
  descriptionPlaceholder:
    'Contanos qué querés hacer como se lo explicarías a alguien por WhatsApp.',
}
