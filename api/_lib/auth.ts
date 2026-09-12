import jwt from 'jsonwebtoken'
import { parseCookie, stringifySetCookie } from 'cookie'
import type { IncomingMessage } from 'node:http'

export const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface SessionPayload {
  sub: number
  email: string
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET_MISSING')
  }
  return secret
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getAuthSecret(), { expiresIn: SESSION_MAX_AGE_SECONDS })
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getAuthSecret())
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      typeof (decoded as Record<string, unknown>).sub === 'number' &&
      typeof (decoded as Record<string, unknown>).email === 'string'
    ) {
      return decoded as unknown as SessionPayload
    }
    return null
  } catch {
    return null
  }
}

export function readSessionCookie(req: IncomingMessage): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  return parseCookie(header)[SESSION_COOKIE]
}

export function buildSessionCookie(token: string): string {
  return stringifySetCookie({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function buildClearedSessionCookie(): string {
  return stringifySetCookie({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
