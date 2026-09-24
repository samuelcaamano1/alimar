import {
  createAdminSessionCookie,
  isAdminConfigured,
  requireSameOrigin,
  verifyAdminPassword,
} from '../_lib/admin-auth.js'
import {
  enforceRateLimit,
  requireJsonBodyWithinLimit,
  resetRateLimit,
} from '../_lib/request-security.js'

const LOGIN_SCOPE = 'admin-login'

export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  if (!isAdminConfigured()) {
    return Response.json(
      { error: 'Admin is not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const bodyError = await requireJsonBodyWithinLimit(request, 16_384)
  if (bodyError) return bodyError

  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    return Response.json(
      { error: 'Database not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const rateLimitError = await enforceRateLimit(request, databaseUrl, {
    scope: LOGIN_SCOPE,
    limit: 8,
    windowSeconds: 15 * 60,
  })

  if (rateLimitError) return rateLimitError

  let password = ''

  try {
    const body = (await request.json()) as { password?: unknown }
    password = typeof body.password === 'string' ? body.password : ''
  } catch {
    return Response.json(
      { error: 'Invalid request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (!verifyAdminPassword(password)) {
    return Response.json(
      { error: 'Invalid credentials' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  await resetRateLimit(request, databaseUrl, LOGIN_SCOPE)

  return Response.json(
    { ok: true },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': createAdminSessionCookie(request),
      },
    },
  )
}
