import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'alimar_admin'
const SESSION_SECONDS = 60 * 60 * 8

function env(name: 'ADMIN_PASSWORD' | 'ADMIN_SESSION_SECRET') {
  return process.env[name]?.trim() ?? ''
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function sign(expiresAt: string) {
  const secret = env('ADMIN_SESSION_SECRET')
  if (secret.length < 32) return ''
  return createHmac('sha256', secret).update(expiresAt).digest('hex')
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

export function isAdminConfigured() {
  return (
    env('ADMIN_PASSWORD').length >= 8 &&
    env('ADMIN_SESSION_SECRET').length >= 32
  )
}

export function verifyAdminPassword(password: string) {
  const expected = env('ADMIN_PASSWORD')
  return expected.length >= 8 && safeEqual(password, expected)
}

export function isAdminAuthenticated(request: Request) {
  if (!isAdminConfigured()) return false

  const token = parseCookies(request).get(COOKIE_NAME)
  if (!token) return false

  const [expiresAt, signature] = token.split('.')
  if (!expiresAt || !signature) return false

  const expiresAtNumber = Number(expiresAt)

  if (!Number.isFinite(expiresAtNumber) || expiresAtNumber <= Date.now()) {
    return false
  }

  const expectedSignature = sign(expiresAt)

  return Boolean(expectedSignature) && safeEqual(signature, expectedSignature)
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

export function createAdminSessionCookie(request: Request) {
  const expiresAt = String(Date.now() + SESSION_SECONDS * 1000)
  const token = `${expiresAt}.${sign(expiresAt)}`
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''

  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}; Priority=High${secure}`
}

export function clearAdminSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''

  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Priority=High${secure}`
}
