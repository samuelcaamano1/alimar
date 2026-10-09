import { neon } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from '../_lib/admin-auth.js'
import { getAdminBusinessDashboard } from '../_lib/admin-dashboard.js'
import {
  listAdminNotifications,
  markAdminNotificationsRead,
} from '../_lib/admin-notifications.js'
import {
  createAdminCustomerPasswordReset,
  getAdminCustomers,
  listAdminCustomerAccounts,
  updateAdminCustomerAccountStatus,
} from '../_lib/admin-customers.js'
import {
  createAdminCustomRequestExample,
  listAdminCustomRequestExamples,
  updateAdminCustomRequestExample,
} from '../_lib/custom-request-examples.js'
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
import {
  createQuoteTemplate,
  deleteQuoteTemplate,
  listQuoteTemplates,
  updateQuoteTemplate,
} from '../_lib/quote-templates.js'

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
  image_count: number
  customization_field_count: number
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

  if (action === 'quote-templates') {
    return listQuoteTemplates(databaseUrl)
  }

  if (action === 'dashboard') {
    return getAdminBusinessDashboard(databaseUrl)
  }

  if (action === 'customers') {
    return getAdminCustomers(databaseUrl, requestUrl)
  }

  if (action === 'customer-accounts') {
    return listAdminCustomerAccounts(databaseUrl)
  }

  if (action === 'notifications') {
    return listAdminNotifications(databaseUrl)
  }

  if (action === 'custom-examples') {
    return listAdminCustomRequestExamples(databaseUrl)
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
        image.image_url,
        (
          SELECT COUNT(*)::int
          FROM product_images image_count
          WHERE image_count.product_id = p.id
        ) AS image_count,
        (
          SELECT COUNT(*)::int
          FROM product_customization_fields field_count
          WHERE field_count.product_id = p.id
            AND field_count.active = true
        ) AS customization_field_count
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

  if (
    action !== 'cost-resources' &&
    action !== 'quotes' &&
    action !== 'quote-templates' &&
    action !== 'custom-examples' &&
    action !== 'customer-account-status' &&
    action !== 'customer-password-reset' &&
    action !== 'notifications'
  ) {
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

  if (context.action === 'customer-account-status') {
    return Response.json(
      { error: 'Invalid method' },
      { status: 405, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (context.action === 'customer-password-reset') {
    return createAdminCustomerPasswordReset(
      context.databaseUrl,
      context.requestUrl.searchParams.get('id') ?? '',
    )
  }

  if (context.action === 'notifications') {
    return Response.json(
      { error: 'Invalid method' },
      { status: 405, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (context.action === 'quotes') {
    return createAdminQuote(context.databaseUrl, body)
  }

  if (context.action === 'quote-templates') {
    return createQuoteTemplate(context.databaseUrl, body)
  }

  if (context.action === 'custom-examples') {
    return createAdminCustomRequestExample(context.databaseUrl, body)
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

  if (context.action === 'customer-account-status') {
    return updateAdminCustomerAccountStatus(
      context.databaseUrl,
      context.requestUrl.searchParams.get('id') ?? '',
      body,
    )
  }

  if (context.action === 'customer-password-reset') {
    return Response.json(
      { error: 'Invalid method' },
      { status: 405, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (context.action === 'notifications') {
    return markAdminNotificationsRead(context.databaseUrl, body)
  }

  if (context.action === 'quotes') {
    return updateAdminQuote(
      context.databaseUrl,
      context.requestUrl.searchParams.get('id') ?? '',
      body,
    )
  }

  if (context.action === 'quote-templates') {
    return updateQuoteTemplate(
      context.databaseUrl,
      context.requestUrl.searchParams.get('id') ?? '',
      body,
    )
  }

  if (context.action === 'custom-examples') {
    return updateAdminCustomRequestExample(
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

  if (
    context.action === 'customer-account-status' ||
    context.action === 'customer-password-reset' ||
    context.action === 'notifications'
  ) {
    return Response.json(
      { error: 'Invalid method' },
      { status: 405, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (context.action === 'quote-templates') {
    return deleteQuoteTemplate(
      context.databaseUrl,
      context.requestUrl.searchParams.get('id') ?? '',
    )
  }

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
