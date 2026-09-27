import {
  createAdminSessionCookie,
  getAdminSessionAccountId,
  isAdminSessionConfigured,
  requireSameOrigin,
} from '../_lib/admin-auth.js'
import {
  changeAdminAccountPassword,
  countActiveAdminAccounts,
  getActiveAdminAccount,
  updateAdminAccountProfile,
} from '../_lib/admin-account-store.js'
import {
  enforceRateLimit,
  requireJsonBodyWithinLimit,
} from '../_lib/request-security.js'

export async function GET(request: Request) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json(
      { error: 'Database not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const activeAdmins = await countActiveAdminAccounts(databaseUrl)
    const sessionConfigured = isAdminSessionConfigured()
    const accountId = getAdminSessionAccountId(request)
    const account =
      accountId && sessionConfigured
        ? await getActiveAdminAccount(databaseUrl, accountId)
        : null

    return Response.json(
      {
        configured: activeAdmins > 0 && sessionConfigured,
        authenticated: Boolean(account),
        account,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos comprobar la cuenta administrativa.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json(
      { error: 'Database not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const accountId = getAdminSessionAccountId(request)
  if (!accountId) {
    return Response.json(
      { error: 'Tu sesión administrativa venció. Volvé a iniciar sesión.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const bodyError = await requireJsonBodyWithinLimit(request, 16_384)
  if (bodyError) return bodyError

  const action = new URL(request.url).searchParams.get('action')
  if (action !== 'profile' && action !== 'password') {
    return Response.json(
      { error: 'Acción administrativa inválida.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const rateLimitError = await enforceRateLimit(request, databaseUrl, {
    scope: action === 'password' ? 'admin-password-change' : 'admin-profile-update',
    limit: action === 'password' ? 10 : 30,
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

  if (action === 'profile') {
    const result = await updateAdminAccountProfile(databaseUrl, accountId, body)
    if (!result.account) {
      return Response.json(
        { error: result.error || 'No pudimos actualizar la cuenta administrativa.' },
        {
          status: result.status || 500,
          headers: { 'Cache-Control': 'no-store' },
        },
      )
    }

    return Response.json(
      { ok: true, account: result.account },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const result = await changeAdminAccountPassword(databaseUrl, accountId, body)
  if (!result.ok) {
    return Response.json(
      { error: result.error || 'No pudimos cambiar la contraseña administrativa.' },
      {
        status: result.status || 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': createAdminSessionCookie(request, accountId),
      },
    },
  )
}
