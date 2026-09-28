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
  const costUtils = await server.ssrLoadModule('/src/admin/costs/utils.ts')
  const calculation = await server.ssrLoadModule(
    '/src/admin/costs/calculation.ts',
  )
  const orderSelectors = await server.ssrLoadModule(
    '/src/admin/orders/selectors.ts',
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

  console.log(`\n${passed} tests estructurales OK.`)
} finally {
  await server.close()
}
