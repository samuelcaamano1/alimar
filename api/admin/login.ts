import {
  clearAdminSessionCookie,
  requireSameOrigin,
} from '../_lib/admin-auth.js'

export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  return Response.json(
    {
      error: 'El acceso administrativo se realiza desde Mi cuenta.',
      loginUrl: '/cuenta?next=/admin',
    },
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': clearAdminSessionCookie(request),
      },
    },
  )
}
