import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isAdminSessionConfigured,
  requireSameOrigin,
} from '../_lib/admin-auth.js'
import {
  countActiveAdminAccounts,
  getActiveAdminAccountByEmail,
} from '../_lib/admin-account-store.js'
import { getCustomerAccount } from '../_lib/customer-auth.js'

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
    const customer = await getCustomerAccount(databaseUrl, request)

    const account =
      customer?.isAdmin && sessionConfigured
        ? await getActiveAdminAccountByEmail(databaseUrl, customer.email)
        : null

    const headers = new Headers({ 'Cache-Control': 'no-store' })

    if (account && customer) {
      headers.append(
        'Set-Cookie',
        createAdminSessionCookie(request, account.id),
      )
    } else {
      headers.append('Set-Cookie', clearAdminSessionCookie(request))
    }

    return Response.json(
      {
        configured: activeAdmins > 0 && sessionConfigured,
        authenticated: Boolean(account && customer),
        account:
          account && customer
            ? {
                ...account,
                name: customer.name,
              }
            : null,
      },
      { headers },
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

  return Response.json(
    {
      error: 'Gestioná tus datos y contraseña desde Mi cuenta.',
      accountUrl: '/cuenta',
    },
    {
      status: 410,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
