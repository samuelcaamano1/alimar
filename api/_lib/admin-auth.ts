import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'alimar_admin'
const SESSION_SECONDS = 60 * 60 * 8
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function env(name: 'ADMIN_SESSION_SECRET') {
  return process.env[name]?.trim() ?? ''
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function sign(accountId: string, expiresAt: string) {
  const secret = env('ADMIN_SESSION_SECRET')
  if (secret.length < 32) return ''
  return createHmac('sha256', secret)
    .update(`${accountId}.${expiresAt}`)
    .digest('hex')
}

function parseCookies(request: Request) {
  const header = request.headers.get('cookie') ?? ''
  const result = new Map<string, string>()

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    result.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }

  return result
}

export function isAdminSessionConfigured() {
  return env('ADMIN_SESSION_SECRET').length >= 32
}

export function getAdminSessionAccountId(request: Request) {
  if (!isAdminSessionConfigured()) return null

  const token = parseCookies(request).get(COOKIE_NAME)
  if (!token) return null

  const [version, accountId, expiresAt, signature] = token.split('.')
  if (version !== 'v4' || !UUID_RE.test(accountId ?? '') || !expiresAt || !signature) {
    return null
  }

  const expiresAtNumber = Number(expiresAt)
  if (!Number.isFinite(expiresAtNumber) || expiresAtNumber <= Date.now()) {
    return null
  }

  const expectedSignature = sign(accountId, expiresAt)
  if (!expectedSignature || !safeEqual(signature, expectedSignature)) return null

  return accountId
}

export function isAdminAuthenticated(request: Request) {
  return Boolean(getAdminSessionAccountId(request))
}

export function requireAdmin(request: Request) {
  if (isAdminAuthenticated(request)) return null

  return Response.json(
    { error: 'Unauthorized' },
    {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const requestUrl = new URL(request.url)

  if (origin && origin === requestUrl.origin) return null

  return Response.json(
    { error: 'Invalid origin' },
    {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

export function createAdminSessionCookie(request: Request, accountId: string) {
  const expiresAt = String(Date.now() + SESSION_SECONDS * 1000)
  const token = `v4.${accountId}.${expiresAt}.${sign(accountId, expiresAt)}`
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''

  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}; Priority=High${secure}`
}

export function clearAdminSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''

  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Priority=High${secure}`
}
