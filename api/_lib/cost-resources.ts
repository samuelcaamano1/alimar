import { neon } from '@neondatabase/serverless'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CATEGORIES = new Set([
  'paper',
  'ink',
  'filament',
  'paint',
  'energy',
  'machine',
  'labor',
  'consumable',
  'other',
])

const UNITS = new Set([
  'unit',
  'sheet',
  'g',
  'kg',
  'ml',
  'l',
  'm',
  'kwh',
  'minute',
  'hour',
])

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function positiveDecimal(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null
  }

  if (typeof value !== 'string') return null

  const raw = value.trim().replace(/\s+/g, '')
  if (!raw) return null

  let normalized = raw

  if (raw.includes(',') && raw.includes('.')) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      normalized = raw.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = raw.replace(/,/g, '')
    }
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.')
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '')
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function percent(value: unknown) {
  if (value === '' || value === null || value === undefined) return 0

  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim().replace(',', '.'))
        : Number.NaN

  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null
}

function parseResource(body: Record<string, unknown>) {
  const name = text(body.name, 120)
  const category = text(body.category, 24)
  const detail = text(body.detail, 160) || null
  const unit = text(body.unit, 20)
  const purchasePrice = positiveDecimal(body.purchasePrice)
  const packageQuantity = positiveDecimal(body.packageQuantity)
  const wastePercent = percent(body.wastePercent)
  const notes = text(body.notes, 280) || null

  if (name.length < 2) {
    return Response.json({ error: 'El nombre del costo es obligatorio.' }, { status: 400 })
  }

  if (!CATEGORIES.has(category)) {
    return Response.json({ error: 'Categoría de costo inválida.' }, { status: 400 })
  }

  if (!UNITS.has(unit)) {
    return Response.json({ error: 'Unidad de costo inválida.' }, { status: 400 })
  }

  if (purchasePrice === null) {
    return Response.json({ error: 'Ingresá un precio de compra válido.' }, { status: 400 })
  }

  if (packageQuantity === null) {
    return Response.json(
      { error: 'Ingresá cuántas unidades contiene ese precio.' },
      { status: 400 },
    )
  }

  if (wastePercent === null) {
    return Response.json(
      { error: 'El desperdicio debe estar entre 0% y 100%.' },
      { status: 400 },
    )
  }

  return {
    name,
    category,
    detail,
    unit,
    purchasePrice,
    packageQuantity,
    wastePercent,
    notes,
  }
}

export async function listCostResources(databaseUrl: string) {
  try {
    const sql = neon(databaseUrl)
    const resources = await sql`
      SELECT
        id::text,
        name,
        category,
        detail,
        unit,
        purchase_price::text,
        package_quantity::text,
        waste_percent::text,
        notes,
        (
          purchase_price / package_quantity * (1 + waste_percent / 100.0)
        )::text AS effective_unit_cost,
        updated_at::text
      FROM cost_resources
      WHERE active = true
      ORDER BY category ASC, name ASC, detail ASC NULLS LAST
      LIMIT 500
    `

    return Response.json(
      { resources },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar los datos de costos.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function createCostResource(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const parsed = parseResource(body)
  if (parsed instanceof Response) return parsed

  try {
    const sql = neon(databaseUrl)

    const [resource] = await sql`
      INSERT INTO cost_resources (
        name,
        category,
        detail,
        unit,
        purchase_price,
        package_quantity,
        waste_percent,
        notes
      )
      VALUES (
        ${parsed.name},
        ${parsed.category},
        ${parsed.detail},
        ${parsed.unit},
        ${parsed.purchasePrice},
        ${parsed.packageQuantity},
        ${parsed.wastePercent},
        ${parsed.notes}
      )
      RETURNING id::text
    `

    return Response.json(
      { id: String(resource?.id ?? '') },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo guardar el dato de costo.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function updateCostResource(
  databaseUrl: string,
  id: string,
  body: Record<string, unknown>,
) {
  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Dato de costo inválido.' }, { status: 400 })
  }

  const parsed = parseResource(body)
  if (parsed instanceof Response) return parsed

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      UPDATE cost_resources
      SET
        name = ${parsed.name},
        category = ${parsed.category},
        detail = ${parsed.detail},
        unit = ${parsed.unit},
        purchase_price = ${parsed.purchasePrice},
        package_quantity = ${parsed.packageQuantity},
        waste_percent = ${parsed.wastePercent},
        notes = ${parsed.notes},
        updated_at = now()
      WHERE id = ${id}::uuid
        AND active = true
      RETURNING id::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Dato de costo no encontrado.' }, { status: 404 })
    }

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar el dato de costo.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function deleteCostResource(databaseUrl: string, id: string) {
  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Dato de costo inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const rows = await sql`
      UPDATE cost_resources
      SET active = false, updated_at = now()
      WHERE id = ${id}::uuid
        AND active = true
      RETURNING id::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Dato de costo no encontrado.' }, { status: 404 })
    }

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo quitar el dato de costo.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
