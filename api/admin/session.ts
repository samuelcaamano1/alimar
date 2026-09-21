import { isAdminAuthenticated, isAdminConfigured } from '../_lib/admin-auth.js'

export async function GET(request: Request) {
  return Response.json(
    {
      configured: isAdminConfigured(),
      authenticated: isAdminAuthenticated(request),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
