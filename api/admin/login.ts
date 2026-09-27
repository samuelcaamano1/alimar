import {
  createAdminSessionCookie,
  isAdminSessionConfigured,
  isLegacyAdminBootstrapConfigured,
  requireSameOrigin,
  verifyLegacyAdminPassword,
} from '../_lib/admin-auth.js'
import {
  authenticateAdminAccount,
  bootstrapAdminAccount,
  countActiveAdminAccounts,
} from '../_lib/admin-account-store.js'
import {
  enforceRateLimit,
  requireJsonBodyWithinLimit,
  resetRateLimit,
} from '../_lib/request-security.js'

const LOGIN_SCOPE = 'admin-login'

export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  if (!isAdminSessionConfigured()) {
    return Response.json(
      { error: 'La sesión administrativa no está configurada.' },
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

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json(
      { error: 'Solicitud inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const mode = body.mode === 'bootstrap' ? 'bootstrap' : 'login'

  try {
    if (mode === 'bootstrap') {
      const activeAdmins = await countActiveAdminAccounts(databaseUrl)
      if (activeAdmins > 0) {
        return Response.json(
          { error: 'La cuenta administrativa ya fue creada.' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      if (!isLegacyAdminBootstrapConfigured()) {
        return Response.json(
          { error: 'El acceso administrativo anterior no está disponible para validar la creación inicial.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      const legacyPassword =
        typeof body.legacyPassword === 'string' ? body.legacyPassword : ''
      if (!verifyLegacyAdminPassword(legacyPassword)) {
        return Response.json(
          { error: 'La contraseña administrativa actual no es correcta.' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      const result = await bootstrapAdminAccount(databaseUrl, body)
      if (!result.account) {
        return Response.json(
          { error: result.error || 'No pudimos crear la cuenta administrativa.' },
          {
            status: result.status || 500,
            headers: { 'Cache-Control': 'no-store' },
          },
        )
      }

      await resetRateLimit(request, databaseUrl, LOGIN_SCOPE)
      return Response.json(
        { ok: true, account: result.account },
        {
          status: 201,
          headers: {
            'Cache-Control': 'no-store',
            'Set-Cookie': createAdminSessionCookie(request, result.account.id),
          },
        },
      )
    }

    const result = await authenticateAdminAccount(databaseUrl, body)
    if (!result.account) {
      return Response.json(
        { error: result.error || 'Email o contraseña incorrectos.' },
        {
          status: result.status || 401,
          headers: { 'Cache-Control': 'no-store' },
        },
      )
    }

    await resetRateLimit(request, databaseUrl, LOGIN_SCOPE)
    return Response.json(
      { ok: true, account: result.account },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': createAdminSessionCookie(request, result.account.id),
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos completar el acceso administrativo.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
