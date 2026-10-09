import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'silent',
  server: {
    middlewareMode: true,
  },
})

let passed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

try {
  const cart = await server.ssrLoadModule('/src/storefront/cart.ts')
  const catalog = await server.ssrLoadModule('/src/storefront/catalog.ts')
  const homeCatalog = await server.ssrLoadModule('/src/storefront/homeCatalog.ts')
  const costUtils = await server.ssrLoadModule('/src/admin/costs/utils.ts')
  const calculation = await server.ssrLoadModule(
    '/src/admin/costs/calculation.ts',
  )
  const combined = await server.ssrLoadModule(
    '/src/admin/costs/combined.ts',
  )
  const quoteCustomerPrint = await server.ssrLoadModule(
    '/src/quoteCustomerPrint.ts',
  )
  const orderSelectors = await server.ssrLoadModule(
    '/src/admin/orders/selectors.ts',
  )
  const versions = await server.ssrLoadModule(
    '/src/admin/versionHistory.ts',
  )

  test('cartItemKey no depende del orden de personalizaciones', () => {
    const left = cart.cartItemKey({
      id: 'p1',
      variantId: 'v1',
      customizations: [
        { fieldId: 'b', label: 'B', value: 'dos' },
        { fieldId: 'a', label: 'A', value: 'uno' },
      ],
    })

    const right = cart.cartItemKey({
      id: 'p1',
      variantId: 'v1',
      customizations: [
        { fieldId: 'a', label: 'A', value: 'uno' },
        { fieldId: 'b', label: 'B', value: 'dos' },
      ],
    })

    assert.equal(left, right)
  })

  test('el total de carrito multiplica precio por cantidad', () => {
    const value = cart.formatCartLinePrice({
      unitPrice: '1250',
      quantity: 2,
      pricingMode: 'fixed',
    })

    assert.match(value, /2[.\s\u00a0]?500/)
  })

  test('priceForSelection respeta override de variante', () => {
    const product = {
      pricingMode: 'fixed',
      basePrice: '1000',
    }
    const variant = {
      priceOverride: '1450',
    }

    assert.equal(
      catalog.priceForSelection(product, variant),
      '1450',
    )
  })

  test('parser monetario acepta formato argentino', () => {
    assert.equal(costUtils.number('1.234,50'), 1234.5)
    assert.equal(costUtils.number('850,25'), 850.25)
  })

  test('roundUp redondea al escalon comercial configurado', () => {
    assert.equal(costUtils.roundUp(1251, 100), 1300)
    assert.equal(costUtils.roundUp(1200, 100), 1200)
  })

  test('calculo guiado conserva costo, recargos y margen', () => {
    const result = calculation.calculateGuidedCost({
      resources: [
        {
          id: 'paper',
          name: 'Hoja',
          unit: 'sheet',
          effective_unit_cost: '10',
        },
      ],
      jobType: 'paper-print',
      quantity: '2',
      profitPercent: '50',
      roundingStep: '10',
      paperResourceId: 'paper',
      inkResourceId: '',
      printSides: 'single',
      filamentResourceId: '',
      gramsPerPiece: '0',
      paintEnabled: false,
      paintResourceId: '',
      paintMlPerPiece: '0',
      manualResourceId: '',
      manualUsagePerUnit: '0',
      manualExtraEnabled: false,
      manualExtraResourceId: '',
      manualExtraUsagePerUnit: '0',
      workerResourceId: '',
      projectHours: '0',
    })

    assert.equal(result.directCost, 20)
    assert.equal(result.realCost, 26)
    assert.equal(result.suggestedPerUnit, 20)
    assert.equal(result.suggestedTotal, 40)
  })

  test('proyecto combinado suma papel, 3D, insumo y trabajo una sola vez', () => {
    const result = combined.calculateCombinedCost({
      resources: [
        { id: 'paper', name: 'Papel', unit: 'sheet', effective_unit_cost: '10' },
        { id: 'ink', name: 'Tinta', unit: 'print', effective_unit_cost: '2' },
        { id: 'pla', name: 'PLA', unit: 'g', effective_unit_cost: '3' },
        { id: 'paint', name: 'Acrilico', unit: 'ml', effective_unit_cost: '4' },
        { id: 'worker', name: 'Samu', unit: 'hour', effective_unit_cost: '100' },
      ],
      quantity: '2',
      profitPercent: '0',
      roundingStep: '1',
      components: [
        {
          id: 'a',
          kind: 'paper',
          paperResourceId: 'paper',
          inkResourceId: 'ink',
          sheetsPerUnit: '1',
          printSides: 'single',
        },
        {
          id: 'b',
          kind: '3d',
          filamentResourceId: 'pla',
          piecesPerUnit: '1',
          gramsPerPiece: '5',
        },
        {
          id: 'c',
          kind: 'material',
          resourceId: 'paint',
          usagePerUnit: '2',
        },
      ],
      workerResourceId: 'worker',
      projectHours: '1',
    })

    assert.equal(result.directCost, 170)
    assert.equal(result.lightCost, 17)
    assert.equal(result.wearCost, 34)
    assert.equal(result.realCost, 221)
  })

  test('PDF cliente nunca expone costos internos', () => {
    const html = quoteCustomerPrint.buildQuoteCustomerPrintHtml({
      public_code: 'PRE-999999',
      title: 'Photocard BTS',
      customer_name: 'Cliente',
      valid_until: '2026-10-20',
      created_at: '2026-10-06T12:00:00.000Z',
      total_price: '42900',
      quantity: 10,
      snapshot: {
        jobLabel: 'Proyecto combinado',
        customerDetail: '10 photocards con marco personalizado.',
        printSides: null,
        workerName: 'SECRETO_RESPONSABLE_INTERNO',
        costs: [
          {
            key: 'secret',
            label: 'SECRETO_TINTA_Y_PAPEL',
            detail: 'SECRETO_COSTO_MATERIAL',
            total: 12345,
          },
        ],
      },
    })

    assert.match(html, /10 photocards con marco personalizado/)
    assert.match(html, /42[.\s\u00a0]?900/)
    assert.doesNotMatch(html, /SECRETO_TINTA_Y_PAPEL/)
    assert.doesNotMatch(html, /SECRETO_COSTO_MATERIAL/)
    assert.doesNotMatch(html, /SECRETO_RESPONSABLE_INTERNO/)
    assert.doesNotMatch(html, /Costo real/)
    assert.doesNotMatch(html, /Desglose interno/)
    assert.doesNotMatch(html, /Recargo \/ ganancia/)
  })

  test('resumen de pedidos separa abiertos, listos y pagos', () => {
    const orders = [
      { status: 'new', payment_status: 'unpaid' },
      { status: 'contacted', payment_status: 'partial' },
      { status: 'in_progress', payment_status: 'paid' },
      { status: 'ready', payment_status: 'total_pending' },
    ]

    const counts = orderSelectors.getOrderCounts(orders)

    assert.equal(counts.all, 4)
    assert.equal(counts.new, 1)
    assert.equal(counts.open, 2)
    assert.equal(counts.ready, 1)
    assert.equal(counts.paymentPending, 2)
    assert.equal(counts.paid, 1)
    assert.equal(counts.totalPending, 1)
  })

  test('filtro de pedidos encuentra cliente y producto', () => {
    const orders = [
      {
        status: 'confirmed',
        payment_status: 'partial',
        created_at: new Date().toISOString(),
        public_code: 'PED-001',
        customer_name: 'Cliente Prueba',
        customer_phone: '111',
        customer_email: null,
        customer_notes: null,
        items: [
          {
            product_name: 'Toppers',
            variant_name: null,
            customization_note: null,
            customization_values: [],
          },
        ],
      },
    ]

    const visible = orderSelectors.getVisibleOrders(orders, {
      statusFilter: 'all',
      searchQuery: 'toppers',
      dateFilter: 'all',
      paymentFilter: 'all',
    })

    assert.equal(visible.length, 1)
  })

  test('home comercial prioriza destacados y completa hasta seis productos', () => {
    const makeProduct = (id, featured) => ({
      id,
      name: id,
      slug: id,
      shortDescription: null,
      kind: 'product',
      pricingMode: 'fixed',
      basePrice: '1000',
      imageUrl: null,
      customizationAllowed: false,
      featured,
      customizationFields: [],
      variants: [],
    })

    const categories = [
      {
        id: 'cat-a',
        name: 'A',
        slug: 'a',
        description: null,
        products: [
          makeProduct('normal-1', false),
          makeProduct('featured-1', true),
          makeProduct('normal-2', false),
        ],
      },
      {
        id: 'cat-b',
        name: 'B',
        slug: 'b',
        description: null,
        products: [
          makeProduct('featured-2', true),
          makeProduct('normal-3', false),
          makeProduct('normal-4', false),
          makeProduct('normal-5', false),
        ],
      },
    ]

    const selected = homeCatalog.selectHomeHighlights(categories, 6)

    assert.equal(selected.length, 6)
    assert.deepEqual(
      selected.slice(0, 2).map((product) => product.id),
      ['featured-1', 'featured-2'],
    )
    assert.equal(homeCatalog.catalogProductCount(categories), 7)
  })

  test('control de versiones mantiene módulos identificables y únicos', () => {
    assert.ok(Array.isArray(versions.versionHistory))
    assert.ok(versions.versionHistory.length >= 10)
    assert.ok(versions.versionHistory.some((entry) => entry.code === '1HOME.10'))
    assert.ok(versions.versionHistory.some((entry) => entry.code === '1PDF.11'))

    const codes = versions.versionHistory.map((entry) => entry.code)
    assert.equal(new Set(codes).size, codes.length)
  })

  console.log(`\n${passed} tests estructurales OK.`)
} finally {
  await server.close()
}
