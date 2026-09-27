import {
  getAdminSessionAccountId,
  isAdminSessionConfigured,
  isLegacyAdminBootstrapConfigured,
} from '../_lib/admin-auth.js'
import {
  countActiveAdminAccounts,
  getActiveAdminAccount,
} from '../_lib/admin-account-store.js'

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
        bootstrapRequired: activeAdmins === 0,
        bootstrapAvailable:
          activeAdmins === 0 && isLegacyAdminBootstrapConfigured(),
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
