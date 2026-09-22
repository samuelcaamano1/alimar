import { neon } from '@neondatabase/serverless'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FIELD_TYPES = new Set(['text', 'textarea', 'number', 'date', 'select'])
const MAX_FIELDS_PER_PRODUCT = 8
const MAX_SELECT_OPTIONS = 12

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select'

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function parseOptions(value: unknown) {
  if (!Array.isArray(value)) return []

  const options = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 60))
    .filter(Boolean)

  return Array.from(new Set(options)).slice(0, MAX_SELECT_OPTIONS)
}

function parseFieldBody(body: Record<string, unknown>) {
  const label = text(body.label, 80)
  const fieldType = text(body.fieldType, 20) as FieldType
  const placeholder = text(body.placeholder, 120) || null
  const required = body.required === true
  const rawMaxLength = Number(body.maxLength)
  const options = parseOptions(body.options)

  if (label.length < 2) {
    return Response.json(
      { error: 'El nombre del campo debe tener al menos 2 caracteres.' },
      { status: 400 },
    )
  }

  if (!FIELD_TYPES.has(fieldType)) {
    return Response.json({ error: 'Tipo de campo inválido.' }, { status: 400 })
  }

  const defaultLength = fieldType === 'textarea' ? 240 : 120
  const maxLength = Number.isInteger(rawMaxLength)
    ? Math.min(Math.max(rawMaxLength, 1), 500)
    : defaultLength

  if (fieldType === 'select' && options.length < 2) {
    return Response.json(
      { error: 'Los campos de opciones necesitan al menos 2 valores.' },
      { status: 400 },
    )
  }

  return {
    label,
    fieldType,
    placeholder,
    required,
    maxLength,
    options: fieldType === 'select' ? options : [],
  }
}

async function activeProductExists(databaseUrl: string, productId: string) {
  const sql = neon(databaseUrl)
  const rows = await sql`
    SELECT 1
    FROM products
    WHERE id = ${productId}::uuid
      AND active = true
    LIMIT 1
  `
  return rows.length > 0
}

export async function listProductCustomizationFields(
  databaseUrl: string,
  productId: string,
) {
  if (!UUID_RE.test(productId)) {
    return Response.json({ error: 'Producto inválido.' }, { status: 400 })
  }

  try {
    if (!(await activeProductExists(databaseUrl, productId))) {
      return Response.json({ error: 'Producto no encontrado.' }, { status: 404 })
    }

    const sql = neon(databaseUrl)
    const fields = await sql`
      SELECT
        id::text,
        product_id::text,
        label,
        field_type,
        placeholder,
        options,
        required,
        max_length,
        sort_order
      FROM product_customization_fields
      WHERE product_id = ${productId}::uuid
        AND active = true
      ORDER BY sort_order ASC, created_at ASC
    `

    return Response.json(
      { fields },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar los campos de personalización.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function createProductCustomizationField(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const productId = text(body.productId, 40)

  if (!UUID_RE.test(productId)) {
    return Response.json({ error: 'Producto inválido.' }, { status: 400 })
  }

  const parsed = parseFieldBody(body)
  if (parsed instanceof Response) return parsed

  try {
    if (!(await activeProductExists(databaseUrl, productId))) {
      return Response.json({ error: 'Producto no encontrado.' }, { status: 404 })
    }

    const sql = neon(databaseUrl)
    const stats = await sql`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(MAX(sort_order), -1) + 1 AS next_sort
      FROM product_customization_fields
      WHERE product_id = ${productId}::uuid
        AND active = true
    `

    const count = Number(stats[0]?.count ?? 0)
    const nextSort = Number(stats[0]?.next_sort ?? 0)

    if (count >= MAX_FIELDS_PER_PRODUCT) {
      return Response.json(
        { error: `Cada producto admite hasta ${MAX_FIELDS_PER_PRODUCT} campos configurables.` },
        { status: 409 },
      )
    }

    const [field] = await sql`
      INSERT INTO product_customization_fields (
        product_id,
        label,
        field_type,
        placeholder,
        options,
        required,
        max_length,
        sort_order
      )
      VALUES (
        ${productId}::uuid,
        ${parsed.label},
        ${parsed.fieldType},
        ${parsed.placeholder},
        ${JSON.stringify(parsed.options)}::jsonb,
        ${parsed.required},
        ${parsed.maxLength},
        ${nextSort}
      )
      RETURNING
        id::text,
        product_id::text,
        label,
        field_type,
        placeholder,
        options,
        required,
        max_length,
        sort_order
    `

    return Response.json(
      { field },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo crear el campo de personalización.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function updateProductCustomizationField(
  databaseUrl: string,
  fieldId: string,
  body: Record<string, unknown>,
) {
  if (!UUID_RE.test(fieldId)) {
    return Response.json({ error: 'Campo inválido.' }, { status: 400 })
  }

  const action = text(body.action, 20)

  try {
    const sql = neon(databaseUrl)

    if (action === 'reorder') {
      const productId = text(body.productId, 40)
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds.filter((value): value is string => typeof value === 'string')
        : []

      if (
        !UUID_RE.test(productId) ||
        orderedIds.length === 0 ||
        orderedIds.length > MAX_FIELDS_PER_PRODUCT ||
        orderedIds.some((id) => !UUID_RE.test(id)) ||
        new Set(orderedIds).size !== orderedIds.length
      ) {
        return Response.json({ error: 'Orden de campos inválido.' }, { status: 400 })
      }

      const rows = await sql`
        SELECT id::text
        FROM product_customization_fields
        WHERE product_id = ${productId}::uuid
          AND active = true
      `

      const currentIds = new Set(rows.map((row) => String(row.id)))

      if (
        currentIds.size !== orderedIds.length ||
        orderedIds.some((id) => !currentIds.has(id))
      ) {
        return Response.json(
          { error: 'La lista de campos cambió. Actualizala e intentá de nuevo.' },
          { status: 409 },
        )
      }

      await sql.transaction(
        orderedIds.map((id, index) => sql`
          UPDATE product_customization_fields
          SET sort_order = ${index}, updated_at = now()
          WHERE id = ${id}::uuid
            AND product_id = ${productId}::uuid
            AND active = true
        `),
      )

      return Response.json(
        { ok: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const parsed = parseFieldBody(body)
    if (parsed instanceof Response) return parsed

    const rows = await sql`
      UPDATE product_customization_fields
      SET
        label = ${parsed.label},
        field_type = ${parsed.fieldType},
        placeholder = ${parsed.placeholder},
        options = ${JSON.stringify(parsed.options)}::jsonb,
        required = ${parsed.required},
        max_length = ${parsed.maxLength},
        updated_at = now()
      WHERE id = ${fieldId}::uuid
        AND active = true
      RETURNING id::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Campo no encontrado.' }, { status: 404 })
    }

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar el campo de personalización.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function deleteProductCustomizationField(
  databaseUrl: string,
  fieldId: string,
) {
  if (!UUID_RE.test(fieldId)) {
    return Response.json({ error: 'Campo inválido.' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      UPDATE product_customization_fields
      SET active = false, updated_at = now()
      WHERE id = ${fieldId}::uuid
        AND active = true
      RETURNING id::text
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Campo no encontrado.' }, { status: 404 })
    }

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo quitar el campo de personalización.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
