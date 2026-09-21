import {
  createAdminSessionCookie,
  isAdminConfigured,
  requireSameOrigin,
  verifyAdminPassword,
} from '../_lib/admin-auth.js'

export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  if (!isAdminConfigured()) {
    return Response.json(
      { error: 'Admin is not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

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
