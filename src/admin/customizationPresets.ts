export type CustomizationPresetField = {
  label: string
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select'
  placeholder: string
  options: string[]
  required: boolean
  maxLength: number
}

const presets: Record<string, CustomizationPresetField[]> = {
  'topper-torta': [
    { label: 'Nombre del cumpleañero', fieldType: 'text', placeholder: 'Ej. Martina', options: [], required: true, maxLength: 80 },
    { label: 'Edad', fieldType: 'number', placeholder: 'Ej. 8', options: [], required: false, maxLength: 3 },
    { label: 'Temática o personaje', fieldType: 'text', placeholder: 'Ej. Bluey, fútbol, flores', options: [], required: true, maxLength: 120 },
    { label: 'Colores preferidos', fieldType: 'text', placeholder: 'Ej. Rosa, lila y dorado', options: [], required: false, maxLength: 120 },
    { label: 'Texto adicional', fieldType: 'textarea', placeholder: 'Ej. Feliz cumple, apodo o detalle especial', options: [], required: false, maxLength: 240 },
  ],
  'foto-recuerdo': [
    { label: 'Nombre o texto principal', fieldType: 'text', placeholder: 'Ej. Cumple de Martina', options: [], required: true, maxLength: 100 },
    { label: 'Edad', fieldType: 'number', placeholder: 'Ej. 8', options: [], required: false, maxLength: 3 },
    { label: 'Temática o estilo', fieldType: 'text', placeholder: 'Ej. Flores, fútbol, elegante', options: [], required: false, maxLength: 120 },
    { label: 'Dedicatoria o frase', fieldType: 'textarea', placeholder: 'Ej. Gracias por compartir este día', options: [], required: false, maxLength: 240 },
  ],
  tatuajes: [
    { label: 'Temática o personaje', fieldType: 'text', placeholder: 'Ej. Stitch, fútbol, dinosaurios', options: [], required: true, maxLength: 120 },
    { label: 'Nombre personalizado', fieldType: 'text', placeholder: 'Ej. Martina', options: [], required: false, maxLength: 80 },
    { label: 'Edad', fieldType: 'number', placeholder: 'Ej. 8', options: [], required: false, maxLength: 3 },
    { label: 'Indicaciones del diseño', fieldType: 'textarea', placeholder: 'Contanos si querés algún dibujo, frase o estilo especial', options: [], required: false, maxLength: 300 },
  ],
  'cajas-de-regalo': [
    { label: 'Nombre del cumpleañero', fieldType: 'text', placeholder: 'Ej. Martina', options: [], required: true, maxLength: 80 },
    { label: 'Edad', fieldType: 'number', placeholder: 'Ej. 8', options: [], required: false, maxLength: 3 },
    { label: 'Temática o personaje', fieldType: 'text', placeholder: 'Ej. Princesas, fútbol, animales', options: [], required: true, maxLength: 120 },
    { label: 'Colores preferidos', fieldType: 'text', placeholder: 'Ej. Rosa y dorado', options: [], required: false, maxLength: 120 },
    { label: 'Texto o dedicatoria', fieldType: 'textarea', placeholder: 'Texto que quieras sumar al diseño', options: [], required: false, maxLength: 240 },
  ],
  'porta-photocards': [
    { label: 'Artista, integrante o personaje', fieldType: 'text', placeholder: 'Ej. Jungkook, personaje o temática', options: [], required: true, maxLength: 120 },
    { label: 'Color del porta photocard', fieldType: 'text', placeholder: 'Ej. Rosa, negro, celeste', options: [], required: false, maxLength: 80 },
    { label: 'Tipo de photocard', fieldType: 'select', placeholder: 'Elegí una opción', options: ['Elegir del catálogo', 'Enviar foto personalizada por WhatsApp'], required: true, maxLength: 120 },
    { label: 'Indicaciones adicionales', fieldType: 'textarea', placeholder: 'Contanos algún detalle especial', options: [], required: false, maxLength: 240 },
  ],
  'personajes-para-pintar-3d': [
    { label: 'Personaje deseado', fieldType: 'text', placeholder: 'Ej. Dinosaurio, Stitch, superhéroe', options: [], required: true, maxLength: 120 },
    { label: 'Color base', fieldType: 'text', placeholder: 'Ej. Blanco, rosa, celeste', options: [], required: false, maxLength: 80 },
    { label: 'Indicaciones adicionales', fieldType: 'textarea', placeholder: 'Contanos cualquier detalle que debamos tener en cuenta', options: [], required: false, maxLength: 240 },
  ],
  caratulas: [
    { label: 'Nombre y apellido', fieldType: 'text', placeholder: 'Ej. Martina Pérez', options: [], required: true, maxLength: 100 },
    { label: 'Materia', fieldType: 'text', placeholder: 'Ej. Matemática', options: [], required: true, maxLength: 80 },
    { label: 'Curso o grado', fieldType: 'text', placeholder: 'Ej. 4° B', options: [], required: true, maxLength: 40 },
    { label: 'Temática o personaje', fieldType: 'text', placeholder: 'Ej. Fútbol, flores, personaje favorito', options: [], required: true, maxLength: 120 },
    { label: 'Ciclo lectivo', fieldType: 'number', placeholder: 'Ej. 2027', options: [], required: false, maxLength: 4 },
    { label: 'Texto adicional', fieldType: 'textarea', placeholder: 'Curso, colegio u otro dato que quieras sumar', options: [], required: false, maxLength: 240 },
  ],
}

export function getCustomizationPreset(slug: string) {
  const normalized = slug.trim().toLowerCase()
  if (normalized.startsWith('topper-torta')) return presets['topper-torta']
  return presets[normalized] ?? []
}
