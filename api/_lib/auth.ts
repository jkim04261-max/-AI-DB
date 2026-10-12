import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { ensureUsersTable, sql } from './db'

export const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface SessionPayload {
  sub: number
  email: string
  tokenVersion: number
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET_MISSING')
  }
  return secret
}

function sign(data: string): string {
  return createHmac('sha256', getAuthSecret()).update(data).digest('base64url')
}

// A small self-contained session token (HMAC-signed JSON), so this never
// depends on how the serverless bundler treats a third-party JWT library's
// module format.
export function signSession(payload: SessionPayload): string {
  const body = { ...payload, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 }
  const data = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function verifySession(token: string): SessionPayload | null {
  const [data, signature] = token.split('.')
  if (!data || !signature) return null

  let expectedSignature: string
  try {
    expectedSignature = sign(data)
  } catch {
    return null
  }

  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSignature)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    if (
      typeof payload.sub !== 'number' ||
      typeof payload.email !== 'string' ||
      typeof payload.tokenVersion !== 'number' ||
      typeof payload.exp !== 'number' ||
      Date.now() > payload.exp
    ) {
      return null
    }
    return { sub: payload.sub, email: payload.email, tokenVersion: payload.tokenVersion }
  } catch {
    return null
  }
}

// Hand-rolled instead of using the `cookie` package: `cookie` v2 ships ESM-only
// (no CJS export), and api/package.json forces this directory to bundle as
// CommonJS (see that file for why) — requiring an ESM-only package there
// crashes with ERR_REQUIRE_ESM.
function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const key = pair.slice(0, eq).trim()
    if (!key || key in result) continue
    const value = pair.slice(eq + 1).trim()
    try {
      result[key] = decodeURIComponent(value)
    } catch {
      result[key] = value
    }
  }
  return result
}

function buildSetCookie(value: string, maxAge: number): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')
}

export function readSessionCookie(req: IncomingMessage): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  return parseCookieHeader(header)[SESSION_COOKIE]
}

// Beyond the signature/expiry check in verifySession, this also confirms
// the cookie's tokenVersion still matches the user's *current* token_version
// in the DB. api/auth/reset-password.ts bumps that column on every
// successful reset, so every cookie signed before the reset — on any
// device — fails this check from that moment on, even though its signature
// and expiry are still otherwise valid. This is the only invalidation path:
// sessions are stateless (never stored server-side), so there is no session
// row to delete.
export async function getSessionUser(req: IncomingMessage): Promise<SessionPayload | null> {
  const token = readSessionCookie(req)
  if (!token) return null

  const payload = verifySession(token)
  if (!payload) return null

  await ensureUsersTable()
  const result = await sql<{ token_version: number }>`
    SELECT token_version FROM users WHERE id = ${payload.sub}
  `
  const currentVersion = result.rows[0]?.token_version
  if (currentVersion === undefined || currentVersion !== payload.tokenVersion) {
    return null
  }

  return payload
}

export function buildSessionCookie(token: string): string {
  return buildSetCookie(token, SESSION_MAX_AGE_SECONDS)
}

export function buildClearedSessionCookie(): string {
  return buildSetCookie('', 0)
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
