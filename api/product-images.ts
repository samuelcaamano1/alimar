import { neon } from '@neondatabase/serverless'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json({ error: 'Gallery unavailable' }, { status: 503 })
  }

  const productId = new URL(request.url).searchParams.get('productId') ?? ''

  if (!UUID_RE.test(productId)) {
    return Response.json({ error: 'Invalid product' }, { status: 400 })
  }

  try {
    const sql = neon(databaseUrl)

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
  } catch {
    return Response.json({ error: 'Gallery unavailable' }, { status: 500 })
  }
}
