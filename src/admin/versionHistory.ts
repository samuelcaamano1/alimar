export type VersionHistoryEntry = {
  code: string
  date: string
  title: string
  summary: string
  commit: string
  files: string[]
  changes: string[]
}

export const versionHistory: VersionHistoryEntry[] = [
  // VERSION_HISTORY_ENTRIES
  {
    "code": "1CAT.20",
    "date": "2026-10-09",
    "title": "Calidad del catalogo",
    "summary": "Agrega controles visuales para detectar productos incompletos y ordenar el catalogo antes de vender.",
    "commit": "dc14c2205d0b00d2e898481b9bb63eb14e7bca22",
    "files": [
      "src/AdminCatalogQuality.tsx",
      "src/admin/catalogQuality.ts",
      "src/AdminApp.tsx",
      "src/admin/app/types.ts",
      "api/admin/catalog.ts",
      "db/migrations/034_catalog_quality_cleanup.sql"
    ],
    "changes": [
      "Agrega un panel de salud del catalogo con porcentaje de fichas completas.",
      "Detecta falta de foto, descripcion breve, precio, categoria y campos de personalizacion.",
      "Muestra alertas directamente en cada producto del administrador.",
      "Indica cuantos productos estan destacados y advierte cuando no hay ninguno.",
      "Corrige Vuelva al Cole a Vuelta al Cole mediante una migracion versionada."
    ]
  },
  {
    "code": "1HOME.11",
    "date": "2026-10-09",
    "title": "Portada comercial",
    "summary": "Recupera la identidad visual de Alimar sin alejar el catalogo del inicio.",
    "commit": "429d886419801d594f325cdf838e7b37d8d4e305",
    "files": [
      "src/App.tsx",
      "src/styles/public/storefront.css",
      "src/storefront/homeCatalog.ts",
      "src/storefront/types.ts",
      "api/catalog.ts"
    ],
    "changes": [
      "Reemplaza el bloque oscuro inicial por un mini hero claro y comercial.",
      "Muestra categorias visuales y una seleccion inicial de hasta seis productos.",
      "Prioriza productos destacados y usa un fallback automatico cuando no hay destacados.",
      "Deja el catalogo completo disponible con filtros sin saturar la portada.",
      "Conecta el campo featured existente de productos con el storefront."
    ]
  },
  {
    "code": "1ADMIN.19.1",
    "date": "2026-10-09",
    "title": "Correccion de codificacion",
    "summary": "Corrige caracteres mal codificados en el Control de versiones.",
    "commit": "573f068f88907b8d9b13258bb0ebe6b8670faef9",
    "files": [
      "src/AdminVersionControl.tsx",
      "src/admin/versionHistory.ts",
      "scripts/register-version.mjs"
    ],
    "changes": [
      "Repara acentos y simbolos visibles del panel de versiones.",
      "Corrige los textos historicos precargados.",
      "Deja el registrador de versiones con mensajes UTF-8 correctos."
    ]
  },
  {
    "code": "1ADMIN.19",
    "date": "2026-10-09",
    "title": "Control de versiones",
    "summary": "Agrega un historial consultable de los modulos instalados dentro del administrador.",
    "commit": "22aca97f93189ac030164f4fb9ed8b9ae6b7e55b",
    "files": [
      "src/AdminVersionControl.tsx",
      "src/admin/versionHistory.ts",
      "scripts/register-version.mjs",
      "src/AdminApp.tsx",
      "src/styles/admin/admin.css"
    ],
    "changes": [
      "Agrega la seccion Control de versiones al administrador.",
      "Permite buscar por codigo, titulo, cambio, archivo o commit.",
      "Precarga versiones recientes verificadas desde Git.",
      "Incluye una herramienta reutilizable para registrar automaticamente los proximos modulos."
    ]
  },
  {
    code: '1HOME.10',
    date: '2026-10-09',
    title: 'Catálogo primero',
    summary: 'El catálogo pasó a ocupar la primera posición de la tienda para acelerar el acceso a compra.',
    commit: '3ca32120480a3d08bdfebe45adf50d3ec7b87e3f',
    files: ['src/App.tsx', 'src/styles/public/storefront.css'],
    changes: [
      'Movió el catálogo al inicio de la home.',
      'Reordenó la navegación principal hacia compra y pedido personalizado.',
      'Compactó el encabezado inicial del catálogo.',
    ],
  },
  {
    code: '1UI.17',
    date: '2026-10-07',
    title: 'Popup de producto',
    summary: 'Mejoró la visualización de imágenes y títulos dentro del detalle del producto.',
    commit: 'bd37879b4645cf31579905d549afb0d6d9f860b2',
    files: ['src/styles/public/storefront.css'],
    changes: [
      'Las imágenes del popup se muestran completas con object-fit contain.',
      'Los títulos dejan de cortar palabras con guiones automáticos.',
      'Ajustó tipografía y espaciado responsive.',
    ],
  },
  {
    code: '1PDF.14',
    date: '2026-10-06',
    title: 'PDF cliente sin logo defectuoso',
    summary: 'Quitó el raster del logo que mostraba un fondo negro en presupuestos para clientes.',
    commit: '20bdc6e8c5d8ed886d39d14dd22575b27259ecb1',
    files: ['src/quoteCustomerPrint.ts'],
    changes: [
      'Eliminó la imagen raster problemática del encabezado.',
      'Mantuvo una cabecera limpia de marca para el PDF del cliente.',
    ],
  },
  {
    code: '1PDF.13',
    date: '2026-10-06',
    title: 'Transparencia de logo en PDF',
    summary: 'Intentó normalizar la transparencia del logo usado en el presupuesto para clientes.',
    commit: '99500d0907126445b85f7c5ef682d19a7ef89316',
    files: ['src/quoteCustomerPrint.ts'],
    changes: [
      'Ajustó el tratamiento visual del logo embebido.',
      'Preparó el PDF para evitar fondos no deseados.',
    ],
  },
  {
    code: '1PDF.11',
    date: '2026-10-06',
    title: 'PDF seguro para clientes',
    summary: 'Separó el presupuesto interno del PDF compartible con el cliente.',
    commit: 'd7b0172c01131c99eaac199a4bd0d55b471149ef',
    files: [
      'src/quoteCustomerPrint.ts',
      'src/adminQuotePrint.ts',
      'src/AdminCostCalculator.tsx',
      'src/CombinedProjectCalculator.tsx',
    ],
    changes: [
      'Creó un PDF cliente sin costos internos.',
      'Separó detalle para cliente de notas internas.',
      'Mantuvo el PDF interno para administración.',
    ],
  },
  {
    code: '1COMB.10',
    date: '2026-09-30',
    title: 'Presupuestos combinados',
    summary: 'Incorporó proyectos con papel, impresión 3D, materiales y mano de obra dentro de un mismo presupuesto.',
    commit: 'c9dcae7f925920a6e0384d459db42de8dd69cfa6',
    files: ['src/CombinedProjectCalculator.tsx', 'db/migrations/033_combined_quote_projects.sql'],
    changes: [
      'Sumó componentes de papel, 3D y materiales.',
      'Aplicó mano de obra, luz y desgaste una sola vez.',
      'Agregó plantillas persistentes para proyectos combinados.',
    ],
  },
  {
    code: '1UX.12',
    date: '2026-09-30',
    title: 'Calculadora guiada responsive',
    summary: 'Transformó el presupuesto rápido en un flujo más guiado y cómodo en pantallas chicas.',
    commit: '0f6b81a07bbdc540bdb9cf61775b153d2a410f93',
    files: ['src/AdminCostCalculator.tsx', 'src/styles/admin/admin.css'],
    changes: [
      'Mejoró el orden de carga de materiales y trabajo.',
      'Hizo el flujo más claro en desktop y mobile.',
    ],
  },
  {
    code: '1UI.13',
    date: '2026-09-29',
    title: 'Popup sin scroll por imágenes verticales',
    summary: 'Evitó que imágenes de retrato hicieran crecer de más el detalle del producto.',
    commit: 'a38f5df4cb1907d62169542227ab209add8ea360',
    files: ['src/styles/public/storefront.css'],
    changes: [
      'Limitó correctamente el alto de la galería.',
      'Mantuvo el popup dentro de la pantalla.',
    ],
  },
  {
    code: '1CAT.10',
    date: '2026-09-28',
    title: 'Múltiples imágenes al crear productos',
    summary: 'Permitió cargar varias imágenes desde el alta inicial de un producto.',
    commit: 'd4954d4ac83fbfa05087cccd69b61f2a98fd95e0',
    files: ['src/AdminApp.tsx', 'src/AdminProductGallery.tsx'],
    changes: [
      'Extendió la creación de productos a múltiples imágenes.',
      'Integró la galería del producto desde el administrador.',
    ],
  },
  {
    code: '1AUTH.14',
    date: '2026-09-28',
    title: 'Acceso unificado',
    summary: 'Unificó el flujo de autenticación de clientes y administración.',
    commit: '99e2e94c96546ecea2982e3c7bfab9ca6bfaf066',
    files: ['src/CustomerAccount.tsx', 'src/AdminApp.tsx'],
    changes: [
      'Consolidó el acceso desde /cuenta.',
      'Mantuvo la separación de permisos entre cliente y administrador.',
    ],
  },
  {
    code: '1C.10',
    date: '2026-09-28',
    title: 'Arquitectura y calidad',
    summary: 'Estabilizó la arquitectura, la separación por módulos y el gate de calidad del proyecto.',
    commit: 'c6ada6821a82d433185594e6cabb6cdd7605eb13',
    files: ['src/admin/', 'src/storefront/', 'src/styles/', 'scripts/test-structural.mjs'],
    changes: [
      'Separó responsabilidades grandes del administrador y storefront.',
      'Consolidó lint, build y tests estructurales.',
      'Mejoró carga diferida y organización del código.',
    ],
  },
]

export function findVersion(code: string) {
  return versionHistory.find((entry) => entry.code === code) ?? null
}
