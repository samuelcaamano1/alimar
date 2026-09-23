import { neon } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'
import { getAdminBusinessDashboard } from '../_lib/admin-dashboard.js'
import {
  createAdminQuote,
  listAdminQuotes,
  updateAdminQuote,
} from '../_lib/admin-quotes.js'
import {
  createCostResource,
  deleteCostResource,
  listCostResources,
  updateCostResource,
} from '../_lib/cost-resources.js'

type CategoryRow = {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number
}

type ProductRow = {
  id: string
  category_id: string | null
  sort_order: number
  name: string
  slug: string
  short_description: string | null
  kind: 'service' | 'product'
  pricing_mode: 'fixed' | 'from' | 'quote'
  base_price: string | null
  customization_allowed: boolean
  featured: boolean
  image_url: string | null
}

export async function GET(request: Request) {
  const authError = requireAdmin(request)
  if (authError) return authError

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json({ error: 'Database not configured' }, { status: 503 })
  }

  const requestUrl = new URL(request.url)
  const action = requestUrl.searchParams.get('action')

  if (action === 'cost-resources') {
    return listCostResources(databaseUrl)
  }

  if (action === 'quotes') {
    return listAdminQuotes(databaseUrl)
  }

  if (action === 'dashboard') {
    return getAdminBusinessDashboard(databaseUrl)
  }

  try {
    const sql = neon(databaseUrl)

    const categories = (await sql`
      SELECT
        id::text,
        name,
        slug,
        description,
        sort_order
      FROM categories
      WHERE active = true
      ORDER BY sort_order ASC, name ASC
    `) as CategoryRow[]

    const products = (await sql`
      SELECT
        p.id::text,
        p.category_id::text,
        p.sort_order,
        p.name,
        p.slug,
        p.short_description,
        p.kind,
        p.pricing_mode,
        p.base_price::text,
        p.customization_allowed,
        p.featured,
        image.image_url
      FROM products p
      LEFT JOIN LATERAL (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
        LIMIT 1
      ) image ON true
      WHERE p.active = true
      ORDER BY p.category_id, p.sort_order ASC, p.featured DESC, p.name ASC
    `) as ProductRow[]

    return Response.json(
      { categories, products },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'Admin catalog unavailable' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

async function adminMutationContext(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return { error: originError }

  const authError = requireAdmin(request)
  if (authError) return { error: authError }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return {
      error: Response.json(
        { error: 'Database not configured' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ),
    }
  }

  const requestUrl = new URL(request.url)
  const action = requestUrl.searchParams.get('action')

  if (action !== 'cost-resources' && action !== 'quotes') {
    return {
      error: Response.json(
        { error: 'Invalid action' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      ),
    }
  }

  return { databaseUrl, requestUrl, action }
}

export async function POST(request: Request) {
  const context = await adminMutationContext(request)
  if ('error' in context) return context.error

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  if (context.action === 'quotes') {
    return createAdminQuote(context.databaseUrl, body)
  }

  return createCostResource(context.databaseUrl, body)
}

export async function PATCH(request: Request) {
  const context = await adminMutationContext(request)
  if ('error' in context) return context.error

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  if (context.action === 'quotes') {
    return updateAdminQuote(
      context.databaseUrl,
      context.requestUrl.searchParams.get('id') ?? '',
      body,
    )
  }

  return updateCostResource(
    context.databaseUrl,
    context.requestUrl.searchParams.get('id') ?? '',
    body,
  )
}

export async function DELETE(request: Request) {
  const context = await adminMutationContext(request)
  if ('error' in context) return context.error

  if (context.action !== 'cost-resources') {
    return Response.json(
      { error: 'Invalid action' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return deleteCostResource(
    context.databaseUrl,
    context.requestUrl.searchParams.get('id') ?? '',
  )
}
