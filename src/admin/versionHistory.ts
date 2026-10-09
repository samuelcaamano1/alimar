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
    code: '1HOME.10',
    date: '2026-10-09',
    title: 'CatÃ¡logo primero',
    summary: 'El catÃ¡logo pasÃ³ a ocupar la primera posiciÃ³n de la tienda para acelerar el acceso a compra.',
    commit: '3ca32120480a3d08bdfebe45adf50d3ec7b87e3f',
    files: ['src/App.tsx', 'src/styles/public/storefront.css'],
    changes: [
      'MoviÃ³ el catÃ¡logo al inicio de la home.',
      'ReordenÃ³ la navegaciÃ³n principal hacia compra y pedido personalizado.',
      'CompactÃ³ el encabezado inicial del catÃ¡logo.',
    ],
  },
  {
    code: '1UI.17',
    date: '2026-10-07',
    title: 'Popup de producto',
    summary: 'MejorÃ³ la visualizaciÃ³n de imÃ¡genes y tÃ­tulos dentro del detalle del producto.',
    commit: 'bd37879b4645cf31579905d549afb0d6d9f860b2',
    files: ['src/styles/public/storefront.css'],
    changes: [
      'Las imÃ¡genes del popup se muestran completas con object-fit contain.',
      'Los tÃ­tulos dejan de cortar palabras con guiones automÃ¡ticos.',
      'AjustÃ³ tipografÃ­a y espaciado responsive.',
    ],
  },
  {
    code: '1PDF.14',
    date: '2026-10-06',
    title: 'PDF cliente sin logo defectuoso',
    summary: 'QuitÃ³ el raster del logo que mostraba un fondo negro en presupuestos para clientes.',
    commit: '20bdc6e8c5d8ed886d39d14dd22575b27259ecb1',
    files: ['src/quoteCustomerPrint.ts'],
    changes: [
      'EliminÃ³ la imagen raster problemÃ¡tica del encabezado.',
      'Mantuvo una cabecera limpia de marca para el PDF del cliente.',
    ],
  },
  {
    code: '1PDF.13',
    date: '2026-10-06',
    title: 'Transparencia de logo en PDF',
    summary: 'IntentÃ³ normalizar la transparencia del logo usado en el presupuesto para clientes.',
    commit: '99500d0907126445b85f7c5ef682d19a7ef89316',
    files: ['src/quoteCustomerPrint.ts'],
    changes: [
      'AjustÃ³ el tratamiento visual del logo embebido.',
      'PreparÃ³ el PDF para evitar fondos no deseados.',
    ],
  },
  {
    code: '1PDF.11',
    date: '2026-10-06',
    title: 'PDF seguro para clientes',
    summary: 'SeparÃ³ el presupuesto interno del PDF compartible con el cliente.',
    commit: 'd7b0172c01131c99eaac199a4bd0d55b471149ef',
    files: [
      'src/quoteCustomerPrint.ts',
      'src/adminQuotePrint.ts',
      'src/AdminCostCalculator.tsx',
      'src/CombinedProjectCalculator.tsx',
    ],
    changes: [
      'CreÃ³ un PDF cliente sin costos internos.',
      'SeparÃ³ detalle para cliente de notas internas.',
      'Mantuvo el PDF interno para administraciÃ³n.',
    ],
  },
  {
    code: '1COMB.10',
    date: '2026-09-30',
    title: 'Presupuestos combinados',
    summary: 'IncorporÃ³ proyectos con papel, impresiÃ³n 3D, materiales y mano de obra dentro de un mismo presupuesto.',
    commit: 'c9dcae7f925920a6e0384d459db42de8dd69cfa6',
    files: ['src/CombinedProjectCalculator.tsx', 'db/migrations/033_combined_quote_projects.sql'],
    changes: [
      'SumÃ³ componentes de papel, 3D y materiales.',
      'AplicÃ³ mano de obra, luz y desgaste una sola vez.',
      'AgregÃ³ plantillas persistentes para proyectos combinados.',
    ],
  },
  {
    code: '1UX.12',
    date: '2026-09-30',
    title: 'Calculadora guiada responsive',
    summary: 'TransformÃ³ el presupuesto rÃ¡pido en un flujo mÃ¡s guiado y cÃ³modo en pantallas chicas.',
    commit: '0f6b81a07bbdc540bdb9cf61775b153d2a410f93',
    files: ['src/AdminCostCalculator.tsx', 'src/styles/admin/admin.css'],
    changes: [
      'MejorÃ³ el orden de carga de materiales y trabajo.',
      'Hizo el flujo mÃ¡s claro en desktop y mobile.',
    ],
  },
  {
    code: '1UI.13',
    date: '2026-09-29',
    title: 'Popup sin scroll por imÃ¡genes verticales',
    summary: 'EvitÃ³ que imÃ¡genes de retrato hicieran crecer de mÃ¡s el detalle del producto.',
    commit: 'a38f5df4cb1907d62169542227ab209add8ea360',
    files: ['src/styles/public/storefront.css'],
    changes: [
      'LimitÃ³ correctamente el alto de la galerÃ­a.',
      'Mantuvo el popup dentro de la pantalla.',
    ],
  },
  {
    code: '1CAT.10',
    date: '2026-09-28',
    title: 'MÃºltiples imÃ¡genes al crear productos',
    summary: 'PermitiÃ³ cargar varias imÃ¡genes desde el alta inicial de un producto.',
    commit: 'd4954d4ac83fbfa05087cccd69b61f2a98fd95e0',
    files: ['src/AdminApp.tsx', 'src/AdminProductGallery.tsx'],
    changes: [
      'ExtendiÃ³ la creaciÃ³n de productos a mÃºltiples imÃ¡genes.',
      'IntegrÃ³ la galerÃ­a del producto desde el administrador.',
    ],
  },
  {
    code: '1AUTH.14',
    date: '2026-09-28',
    title: 'Acceso unificado',
    summary: 'UnificÃ³ el flujo de autenticaciÃ³n de clientes y administraciÃ³n.',
    commit: '99e2e94c96546ecea2982e3c7bfab9ca6bfaf066',
    files: ['src/CustomerAccount.tsx', 'src/AdminApp.tsx'],
    changes: [
      'ConsolidÃ³ el acceso desde /cuenta.',
      'Mantuvo la separaciÃ³n de permisos entre cliente y administrador.',
    ],
  },
  {
    code: '1C.10',
    date: '2026-09-28',
    title: 'Arquitectura y calidad',
    summary: 'EstabilizÃ³ la arquitectura, la separaciÃ³n por mÃ³dulos y el gate de calidad del proyecto.',
    commit: 'c6ada6821a82d433185594e6cabb6cdd7605eb13',
    files: ['src/admin/', 'src/storefront/', 'src/styles/', 'scripts/test-structural.mjs'],
    changes: [
      'SeparÃ³ responsabilidades grandes del administrador y storefront.',
      'ConsolidÃ³ lint, build y tests estructurales.',
      'MejorÃ³ carga diferida y organizaciÃ³n del cÃ³digo.',
    ],
  },
]

export function findVersion(code: string) {
  return versionHistory.find((entry) => entry.code === code) ?? null
}
