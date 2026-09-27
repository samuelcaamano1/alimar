import { issueSignedToken, presignUrl } from '@vercel/blob'
import { neon } from '@neondatabase/serverless'
import { requireAdmin, requireSameOrigin } from './admin-auth.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_FILE_BYTES = 100 * 1024 * 1024
const TOKEN_MS = 15 * 60 * 1000
const SAFE_PATH_RE = /^orders\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,180}$/i

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function privateBlobUrl(pathname: string) {
  const rawStoreId = (process.env.BLOB_STORE_ID?.trim() ?? '').toLowerCase()
  const storeId = rawStoreId.startsWith('store_')
    ? rawStoreId.slice('store_'.length)
    : rawStoreId

  if (!storeId) return ''
  return `https://${storeId}.private.blob.vercel-storage.com/${pathname}`
}

export async function createAdminOrderFileUploadTicket(
  request: Request,
  databaseUrl: string,
  body: Record<string, unknown>,
) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const authError = requireAdmin(request)
  if (authError) return authError

  const orderId = text(body.orderId, 40)
  const pathname = text(body.pathname, 260)
  const size = Number(body.size)

  if (!UUID_RE.test(orderId)) {
    return Response.json({ error: 'Pedido inválido para la subida.' }, { status: 400 })
  }

  if (
    !SAFE_PATH_RE.test(pathname) ||
    !pathname.startsWith(`orders/${orderId}/`)
  ) {
    return Response.json({ error: 'Nombre de archivo inválido.' }, { status: 400 })
  }

  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
    return Response.json(
      { error: 'El archivo debe pesar entre 1 byte y 100 MB.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const sql = neon(databaseUrl)
    const rows = await sql`
      SELECT 1
      FROM orders
      WHERE id = ${orderId}::uuid
      LIMIT 1
    `

    if (rows.length === 0) {
      return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 })
    }

    const validUntil = Date.now() + TOKEN_MS
    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      maximumSizeInBytes: MAX_FILE_BYTES,
      validUntil,
    })
    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: 'put',
      access: 'private',
      validUntil,
      maximumSizeInBytes: MAX_FILE_BYTES,
      allowOverwrite: false,
      addRandomSuffix: false,
      cacheControlMaxAge: 30 * 24 * 60 * 60,
    })
    const blobUrl = privateBlobUrl(pathname)
    if (!blobUrl) throw new Error('Blob store unavailable')

    return Response.json(
      {
        uploadUrl: presignedUrl,
        blobUrl,
        maximumSizeInBytes: MAX_FILE_BYTES,
        expiresAt: validUntil,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      {
        error:
          'Vercel Blob todavía no está conectado al proyecto. Podés seguir usando un enlace HTTPS mientras tanto.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
