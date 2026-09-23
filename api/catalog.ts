const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

import { neon } from '@neondatabase/serverless'
import { getPublicQuote } from './_lib/public-quotes.js'

type CatalogRow = {
  category_id: string
  category_name: string
  category_slug: string
  category_description: string | null
  product_id: string | null
  product_name: string | null
  product_slug: string | null
  short_description: string | null
  kind: 'service' | 'product' | null
  pricing_mode: 'fixed' | 'from' | 'quote' | null
  base_price: string | null
  image_url: string | null
  customization_allowed: boolean
}

type VariantRow = {
  id: string
  product_id: string
  name: string
  price_override: string | null
}

type CustomizationFieldRow = {
  id: string
  product_id: string
  label: string
  field_type: 'text' | 'textarea' | 'number' | 'date' | 'select'
  placeholder: string | null
  options: unknown
  required: boolean
  max_length: number
}

export async function GET(request: Request) {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    return Response.json({ error: 'Catalog unavailable' }, { status: 503 })
  }

  try {
    const sql = neon(databaseUrl)
    const requestUrl = new URL(request.url)

    if (requestUrl.searchParams.get('view') === 'quote') {
      return getPublicQuote(
        databaseUrl,
        requestUrl.searchParams.get('token') ?? '',
      )
    }

    if (requestUrl.searchParams.get('view') === 'images') {
      const productId = requestUrl.searchParams.get('productId') ?? ''

      if (!UUID_RE.test(productId)) {
        return Response.json({ error: 'Invalid product' }, { status: 400 })
      }

      const images = await sql`
        SELECT
          pi.id::text,
          pi.image_url AS url,
          pi.alt_text,
          pi.is_primary
        FROM product_images pi
        INNER JOIN products p ON p.id = pi.product_id
        WHERE pi.product_id = ${productId}::uuid
          AND p.active = true
        ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
        LIMIT 6
      `

      return Response.json(
        { images },
        {
          headers: {
            'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
          },
        },
      )
    }

    const rows = (await sql`
      SELECT
        c.id::text AS category_id,
        c.name AS category_name,
        c.slug AS category_slug,
        c.description AS category_description,
        p.id::text AS product_id,
        p.name AS product_name,
        p.slug AS product_slug,
        p.short_description,
        p.kind,
        p.pricing_mode,
        p.base_price::text,
        p.customization_allowed,
        image.image_url
      FROM categories c
      LEFT JOIN products p
        ON p.category_id = c.id
       AND p.active = true
      LEFT JOIN LATERAL (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
        LIMIT 1
      ) image ON true
      WHERE c.active = true
      ORDER BY c.sort_order ASC, c.name ASC, p.sort_order ASC, p.featured DESC, p.name ASC
    `) as CatalogRow[]

    const variantRows = (await sql`
      SELECT
        pv.id::text,
        pv.product_id::text,
        pv.name,
        pv.price_override::text
      FROM product_variants pv
      INNER JOIN products p ON p.id = pv.product_id
      WHERE pv.active = true
        AND p.active = true
      ORDER BY pv.product_id, pv.sort_order ASC, pv.name ASC
    `) as VariantRow[]

    const customizationRows = (await sql`
      SELECT
        pcf.id::text,
        pcf.product_id::text,
        pcf.label,
        pcf.field_type,
        pcf.placeholder,
        pcf.options,
        pcf.required,
        pcf.max_length
      FROM product_customization_fields pcf
      INNER JOIN products p ON p.id = pcf.product_id
      WHERE pcf.active = true
        AND p.active = true
        AND p.customization_allowed = true
      ORDER BY pcf.product_id, pcf.sort_order ASC, pcf.created_at ASC
    `) as CustomizationFieldRow[]

    const variantsByProduct = new Map<
      string,
      Array<{
        id: string
        name: string
        priceOverride: string | null
      }>
    >()

    for (const variant of variantRows) {
      const current = variantsByProduct.get(variant.product_id) ?? []
      current.push({
        id: variant.id,
        name: variant.name,
        priceOverride: variant.price_override,
      })
      variantsByProduct.set(variant.product_id, current)
    }

    const customizationsByProduct = new Map<
      string,
      Array<{
        id: string
        label: string
        fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select'
        placeholder: string | null
        options: string[]
        required: boolean
        maxLength: number
      }>
    >()

    for (const field of customizationRows) {
      const current = customizationsByProduct.get(field.product_id) ?? []
      const options = Array.isArray(field.options)
        ? field.options.filter((value): value is string => typeof value === 'string')
        : []

      current.push({
        id: field.id,
        label: field.label,
        fieldType: field.field_type,
        placeholder: field.placeholder,
        options,
        required: field.required,
        maxLength: field.max_length,
      })

      customizationsByProduct.set(field.product_id, current)
    }

    const categories = new Map<
      string,
      {
        id: string
        name: string
        slug: string
        description: string | null
        products: Array<{
          id: string
          name: string
          slug: string
          shortDescription: string | null
          kind: 'service' | 'product'
          pricingMode: 'fixed' | 'from' | 'quote'
          basePrice: string | null
          imageUrl: string | null
          customizationAllowed: boolean
          customizationFields: Array<{
            id: string
            label: string
            fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select'
            placeholder: string | null
            options: string[]
            required: boolean
            maxLength: number
          }>
          variants: Array<{
            id: string
            name: string
            priceOverride: string | null
          }>
        }>
      }
    >()

    for (const row of rows) {
      if (!categories.has(row.category_id)) {
        categories.set(row.category_id, {
          id: row.category_id,
          name: row.category_name,
          slug: row.category_slug,
          description: row.category_description,
          products: [],
        })
      }

      if (
        row.product_id &&
        row.product_name &&
        row.product_slug &&
        row.kind &&
        row.pricing_mode
      ) {
        categories.get(row.category_id)?.products.push({
          id: row.product_id,
          name: row.product_name,
          slug: row.product_slug,
          shortDescription: row.short_description,
          kind: row.kind,
          pricingMode: row.pricing_mode,
          basePrice: row.base_price,
          imageUrl: row.image_url,
          customizationAllowed: row.customization_allowed,
          customizationFields: customizationsByProduct.get(row.product_id) ?? [],
          variants: variantsByProduct.get(row.product_id) ?? [],
        })
      }
    }

    return Response.json(
      { categories: Array.from(categories.values()) },
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=30',
        },
      },
    )
  } catch {
    return Response.json({ error: 'Catalog unavailable' }, { status: 500 })
  }
}
