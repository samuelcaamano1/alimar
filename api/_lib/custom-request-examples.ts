import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const REQUEST_TYPES = new Set(['paper', '3d', 'event', 'design', 'other'])
const ART_TYPES = new Set([
  'sheet',
  'party',
  'card',
  'stickers',
  'box',
  'poster',
  'cube',
  'idea',
])

const MAX_IMAGE_LENGTH = 1_000_000
const MAX_EXAMPLES = 40

type ExampleRow = {
  id: string
  slug: string
  title: string
  hint: string
  request_type: 'paper' | '3d' | 'event' | 'design' | 'other'
  art: string
  image_url: string | null
  image_alt: string | null
  size_placeholder: string
  theme_placeholder: string
  description_placeholder: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function optionalImage(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined

  const imageUrl = value.trim()

  if (!imageUrl || imageUrl.length > MAX_IMAGE_LENGTH) return undefined
  if (/^https:\/\/[^\s]+$/i.test(imageUrl)) return imageUrl

  if (
    /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(imageUrl)
  ) {
    return imageUrl
  }

  return undefined
}

function integer(value: unknown, min: number, max: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN

  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : undefined
}

function slugify(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55)

  return `${normalized || 'idea'}-${randomUUID().slice(0, 8)}`
}

function formatExample(row: ExampleRow) {
  return {
    id: row.id,
    key: row.slug,
    title: row.title,
    hint: row.hint,
    requestType: row.request_type,
    art: row.art,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    sizePlaceholder: row.size_placeholder,
    themePlaceholder: row.theme_placeholder,
    descriptionPlaceholder: row.description_placeholder,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function rows(databaseUrl: string, includeInactive: boolean) {
  const sql = neon(databaseUrl)

  const result = includeInactive
    ? await sql`
        SELECT
          id::text,
          slug,
          title,
          hint,
          request_type,
          art,
          image_url,
          image_alt,
          size_placeholder,
          theme_placeholder,
          description_placeholder,
          sort_order,
          active,
          created_at::text,
          updated_at::text
        FROM custom_request_examples
        ORDER BY sort_order ASC, created_at ASC
        LIMIT ${MAX_EXAMPLES}
      `
    : await sql`
        SELECT
          id::text,
          slug,
          title,
          hint,
          request_type,
          art,
          image_url,
          image_alt,
          size_placeholder,
          theme_placeholder,
          description_placeholder,
          sort_order,
          active,
          created_at::text,
          updated_at::text
        FROM custom_request_examples
        WHERE active = true
        ORDER BY sort_order ASC, created_at ASC
        LIMIT ${MAX_EXAMPLES}
      `

  return (result as ExampleRow[]).map(formatExample)
}

export async function listPublicCustomRequestExamples(databaseUrl: string) {
  try {
    return Response.json(
      { examples: await rows(databaseUrl, false) },
      {
        headers: {
          'Cache-Control':
            'public, max-age=0, s-maxage=20, stale-while-revalidate=60',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar los ejemplos personalizados.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function listAdminCustomRequestExamples(databaseUrl: string) {
  try {
    return Response.json(
      { examples: await rows(databaseUrl, true) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudieron cargar los ejemplos personalizados.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

function validatedFields(body: Record<string, unknown>) {
  const title = text(body.title, 100)
  const hint = text(body.hint, 240)
  const requestType = text(body.requestType, 24)
  const art = text(body.art, 24) || 'idea'
  const imageUrl = optionalImage(body.imageUrl)
  const imageAlt = text(body.imageAlt, 180) || null
  const sizePlaceholder = text(body.sizePlaceholder, 180)
  const themePlaceholder = text(body.themePlaceholder, 240)
  const descriptionPlaceholder = text(body.descriptionPlaceholder, 360)
  const sortOrder = integer(body.sortOrder, 0, 9999)
  const active = typeof body.active === 'boolean' ? body.active : undefined

  if (title.length < 3) return { error: 'Ingresá un título de al menos 3 caracteres.' }
  if (hint.length < 8) return { error: 'Agregá una explicación breve del ejemplo.' }
  if (!REQUEST_TYPES.has(requestType)) return { error: 'Tipo interno inválido.' }
  if (!ART_TYPES.has(art)) return { error: 'Ilustración de respaldo inválida.' }
  if (imageUrl === undefined) {
    return {
      error:
        'La imagen debe ser HTTPS o una imagen PNG/JPG/WebP comprimida menor a 1 MB.',
    }
  }
  if (sizePlaceholder.length < 3) return { error: 'Completá la ayuda de tamaño.' }
  if (themePlaceholder.length < 3) return { error: 'Completá la ayuda de estilo.' }
  if (descriptionPlaceholder.length < 8) {
    return { error: 'Completá la ayuda para describir la idea.' }
  }
  if (sortOrder === undefined) return { error: 'Orden inválido.' }
  if (active === undefined) return { error: 'Estado activo inválido.' }

  return {
    value: {
      title,
      hint,
      requestType,
      art,
      imageUrl,
      imageAlt,
      sizePlaceholder,
      themePlaceholder,
      descriptionPlaceholder,
      sortOrder,
      active,
    },
  }
}

export async function createAdminCustomRequestExample(
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const fields = validatedFields(body)
  if ('error' in fields) {
    return Response.json({ error: fields.error }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

    const countRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM custom_request_examples
    `

    if (Number(countRows[0]?.count ?? 0) >= MAX_EXAMPLES) {
      return Response.json(
        { error: `Podés administrar hasta ${MAX_EXAMPLES} ejemplos.` },
        { status: 409 },
      )
    }

    const value = fields.value
    const slug = slugify(value.title)

    const [row] = (await sql`
      INSERT INTO custom_request_examples (
        slug,
        title,
        hint,
        request_type,
        art,
        image_url,
        image_alt,
        size_placeholder,
        theme_placeholder,
        description_placeholder,
        sort_order,
        active
      )
      VALUES (
        ${slug},
        ${value.title},
        ${value.hint},
        ${value.requestType},
        ${value.art},
        ${value.imageUrl},
        ${value.imageAlt},
        ${value.sizePlaceholder},
        ${value.themePlaceholder},
        ${value.descriptionPlaceholder},
        ${value.sortOrder},
        ${value.active}
      )
      RETURNING
        id::text,
        slug,
        title,
        hint,
        request_type,
        art,
        image_url,
        image_alt,
        size_placeholder,
        theme_placeholder,
        description_placeholder,
        sort_order,
        active,
        created_at::text,
        updated_at::text
    `) as ExampleRow[]

    return Response.json(
      { example: formatExample(row) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo crear el ejemplo personalizado.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function updateAdminCustomRequestExample(
  databaseUrl: string,
  id: string,
  body: Record<string, unknown>,
) {
  if (!UUID_RE.test(id)) {
    return Response.json({ error: 'Ejemplo inválido.' }, { status: 400 })
  }

  if (body.action === 'reorder') {
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : []

    if (
      orderedIds.length === 0 ||
      orderedIds.length > MAX_EXAMPLES ||
      orderedIds.some((value) => !UUID_RE.test(value)) ||
      new Set(orderedIds).size !== orderedIds.length
    ) {
      return Response.json(
        { error: 'Orden de ejemplos inválido.' },
        { status: 400 },
      )
    }

    try {
      const sql = neon(databaseUrl)
      const current = await sql`
        SELECT id::text
        FROM custom_request_examples
        ORDER BY sort_order ASC, created_at ASC
      `
      const currentIds = current.map((row) => String(row.id))

      if (
        currentIds.length !== orderedIds.length ||
        currentIds.some((value) => !orderedIds.includes(value))
      ) {
        return Response.json(
          { error: 'La galería cambió. Actualizala e intentá de nuevo.' },
          { status: 409 },
        )
      }

      await sql.transaction(
        orderedIds.map((exampleId, index) => sql`
          UPDATE custom_request_examples
          SET sort_order = ${index}, updated_at = now()
          WHERE id = ${exampleId}::uuid
        `),
      )

      return Response.json(
        { ok: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    } catch {
      return Response.json(
        { error: 'No se pudo reordenar la galería.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      )
    }
  }

  const fields = validatedFields(body)
  if ('error' in fields) {
    return Response.json({ error: fields.error }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)
    const value = fields.value

    const result = (await sql`
      UPDATE custom_request_examples
      SET
        title = ${value.title},
        hint = ${value.hint},
        request_type = ${value.requestType},
        art = ${value.art},
        image_url = ${value.imageUrl},
        image_alt = ${value.imageAlt},
        size_placeholder = ${value.sizePlaceholder},
        theme_placeholder = ${value.themePlaceholder},
        description_placeholder = ${value.descriptionPlaceholder},
        sort_order = ${value.sortOrder},
        active = ${value.active},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id::text,
        slug,
        title,
        hint,
        request_type,
        art,
        image_url,
        image_alt,
        size_placeholder,
        theme_placeholder,
        description_placeholder,
        sort_order,
        active,
        created_at::text,
        updated_at::text
    `) as ExampleRow[]

    if (result.length === 0) {
      return Response.json({ error: 'Ejemplo no encontrado.' }, { status: 404 })
    }

    return Response.json(
      { example: formatExample(result[0]) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No se pudo actualizar el ejemplo personalizado.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
