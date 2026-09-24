import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

type RateLimitOptions = {
  scope: string
  limit: number
  windowSeconds: number
}

function clientIdentity(request: Request) {
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()
  const userAgent = request.headers.get('user-agent')?.trim().slice(0, 180)

  return forwarded || realIp || `unknown:${userAgent || 'client'}`
}

function keyHash(request: Request, scope: string) {
  return createHash('sha256')
    .update(`${scope}:${clientIdentity(request)}`)
    .digest('hex')
}

function noStoreJson(
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}

export function requireRequestOrigin(
  request: Request,
  message = 'Origen de solicitud inválido.',
) {
  const origin = request.headers.get('origin')
  if (!origin) {
    return noStoreJson({ error: message }, 403)
  }

  const requestUrl = new URL(request.url)

  if (origin !== requestUrl.origin) {
    return noStoreJson({ error: message }, 403)
  }

  return null
}

export async function requireJsonBodyWithinLimit(
  request: Request,
  maxBytes: number,
) {
  const contentType = request.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase()

  if (contentType !== 'application/json') {
    return noStoreJson(
      { error: 'La solicitud debe enviarse como JSON.' },
      415,
    )
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '')

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > 0 &&
    declaredLength > maxBytes
  ) {
    return noStoreJson(
      { error: 'La solicitud es demasiado grande.' },
      413,
    )
  }

  try {
    const payload = await request.clone().arrayBuffer()

    if (payload.byteLength > maxBytes) {
      return noStoreJson(
        { error: 'La solicitud es demasiado grande.' },
        413,
      )
    }
  } catch {
    return noStoreJson({ error: 'Solicitud inválida.' }, 400)
  }

  return null
}

export async function enforceRateLimit(
  request: Request,
  databaseUrl: string,
  options: RateLimitOptions,
) {
  if (
    !options.scope ||
    options.scope.length > 64 ||
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    !Number.isInteger(options.windowSeconds) ||
    options.windowSeconds < 1
  ) {
    return noStoreJson(
      { error: 'Rate limit configuration error.' },
      500,
    )
  }

  try {
    const sql = neon(databaseUrl)
    const hash = keyHash(request, options.scope)

    const rows = await sql`
      INSERT INTO api_rate_limits (
        scope,
        key_hash,
        window_started_at,
        request_count,
        updated_at
      )
      VALUES (
        ${options.scope},
        ${hash},
        CURRENT_TIMESTAMP,
        1,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (scope, key_hash)
      DO UPDATE SET
        window_started_at = CASE
          WHEN api_rate_limits.window_started_at
            <= CURRENT_TIMESTAMP - (${options.windowSeconds} * INTERVAL '1 second')
            THEN CURRENT_TIMESTAMP
          ELSE api_rate_limits.window_started_at
        END,
        request_count = CASE
          WHEN api_rate_limits.window_started_at
            <= CURRENT_TIMESTAMP - (${options.windowSeconds} * INTERVAL '1 second')
            THEN 1
          ELSE api_rate_limits.request_count + 1
        END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        request_count,
        GREATEST(
          1,
          CEIL(
            EXTRACT(
              EPOCH FROM (
                window_started_at
                + (${options.windowSeconds} * INTERVAL '1 second')
                - CURRENT_TIMESTAMP
              )
            )
          )
        )::int AS retry_after
    `

    const count = Number(rows[0]?.request_count ?? 1)

    if (count <= options.limit) return null

    const retryAfter = Math.max(
      1,
      Number(rows[0]?.retry_after ?? options.windowSeconds),
    )

    return noStoreJson(
      {
        error:
          'Demasiados intentos en poco tiempo. Esperá unos minutos y volvé a intentar.',
      },
      429,
      { 'Retry-After': String(retryAfter) },
    )
  } catch {
    return noStoreJson(
      { error: 'Servicio temporalmente no disponible.' },
      503,
    )
  }
}

export async function resetRateLimit(
  request: Request,
  databaseUrl: string,
  scope: string,
) {
  try {
    const sql = neon(databaseUrl)
    const hash = keyHash(request, scope)

    await sql`
      DELETE FROM api_rate_limits
      WHERE scope = ${scope}
        AND key_hash = ${hash}
    `
  } catch {
    // A successful authenticated login must not fail because cleanup failed.
  }
}
