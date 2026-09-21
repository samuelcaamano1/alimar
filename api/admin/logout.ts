import { clearAdminSessionCookie, requireSameOrigin } from '../_lib/admin-auth.js'

export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  return Response.json(
    { ok: true },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': clearAdminSessionCookie(request),
      },
    },
  )
}
