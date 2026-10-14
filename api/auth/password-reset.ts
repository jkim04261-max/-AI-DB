import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes, createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { ensurePasswordResetTable, sql } from '../_lib/db'
import { isValidEmail } from '../_lib/auth'
import { sendPasswordResetEmail, EmailConfigError, EmailSendError } from '../_lib/email'

// Single function behind two public URLs — see the `routes` entries in
// vercel.json that rewrite /api/auth/request-password-reset and
// /api/auth/reset-password to this file with ?action=request / ?action=reset.
// Merged purely to stay under the Hobby plan's 12-Serverless-Function cap
// (see vercel.json's comment); the two handler bodies below are otherwise
// unchanged from their original separate files — same methods, request/
// response shapes, status codes and error handling as before.

const TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes
const MIN_RESEND_INTERVAL_MS = 60 * 1000 // at most one new token per account per minute

// Always the same wording whether or not the email is registered — the
// caller must not be able to tell "no such account" apart from "reset
// email sent" from this response alone.
const GENERIC_MESSAGE = '입력하신 이메일이 가입되어 있다면 잠시 후 재설정 메일을 받으실 수 있어요.'

// Deliberately the same message for "no such token", "already used", and
// "expired" — which one applies isn't useful information to hand back,
// and the user's next step (request a new link) is the same either way.
const GENERIC_INVALID_MESSAGE = '링크가 올바르지 않거나 만료됐어요. 비밀번호 재설정을 다시 요청해주세요.'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function handleRequestReset(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { email } = (req.body ?? {}) as { email?: unknown }
  if (typeof email !== 'string') {
    res.status(400).json({ error: '이메일을 입력해주세요.' })
    return
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: '올바른 이메일 형식이 아니에요.' })
    return
  }

  try {
    await ensurePasswordResetTable()

    const userResult = await sql<{ id: number; email: string }>`
      SELECT id, email FROM users WHERE email = ${normalizedEmail}
    `
    const user = userResult.rows[0]

    if (!user) {
      // No account with this email — wait about as long as the "found"
      // path below takes (a couple of DB round trips + the outbound email
      // call) so the two cases aren't distinguishable by response time.
      await sleep(300)
      res.status(200).json({ message: GENERIC_MESSAGE })
      return
    }

    const recentResult = await sql<{ created_at: string }>`
      SELECT created_at FROM password_reset_tokens
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 1
    `
    const lastCreatedAt = recentResult.rows[0]?.created_at
    if (lastCreatedAt && Date.now() - new Date(lastCreatedAt).getTime() < MIN_RESEND_INTERVAL_MS) {
      // Same response as success — a frequent requester shouldn't be able
      // to tell "rate limited" apart from "email sent" either.
      res.status(200).json({ message: GENERIC_MESSAGE })
      return
    }

    // Only one valid (unused) token per account at a time.
    await sql`
      UPDATE password_reset_tokens SET used_at = now()
      WHERE user_id = ${user.id} AND used_at IS NULL
    `

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${tokenHash}, ${expiresAt.toISOString()})
    `

    const proto = (req.headers['x-forwarded-proto'] as string | undefined) || 'https'
    const host = req.headers.host
    const resetUrl = `${proto}://${host}/reset-password?token=${rawToken}`

    await sendPasswordResetEmail(user.email, resetUrl)

    res.status(200).json({ message: GENERIC_MESSAGE })
  } catch (err) {
    if (err instanceof EmailConfigError) {
      console.error('[api/auth/password-reset:request] RESEND_API_KEY is not configured')
      res.status(500).json({ error: '서버에 이메일 발송이 설정되지 않았어요.' })
      return
    }
    if (err instanceof EmailSendError) {
      // Deliberately distinct from the generic success message above:
      // reporting success when the email didn't actually go out would
      // hide a real failure from a legitimate user. This only reveals
      // "something failed", never which account it was for, so it doesn't
      // reopen the enumeration gap the generic message is there to close.
      console.error('[api/auth/password-reset:request] email send failed:', err.message)
      res.status(502).json({ error: '이메일 발송에 실패했어요. 잠시 후 다시 시도해주세요.' })
      return
    }
    console.error('[api/auth/password-reset:request] unexpected error', err)
    res.status(500).json({ error: '요청을 처리하는 중 오류가 발생했어요.' })
  }
}

async function handleResetPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { token, password } = (req.body ?? {}) as { token?: unknown; password?: unknown }
  if (typeof token !== 'string' || !token || typeof password !== 'string') {
    res.status(400).json({ error: '잘못된 요청이에요.' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요.' })
    return
  }

  try {
    await ensurePasswordResetTable()

    const tokenHash = createHash('sha256').update(token).digest('hex')
    const result = await sql<{ id: number; user_id: number; expires_at: string; used_at: string | null }>`
      SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
      WHERE token_hash = ${tokenHash}
    `
    const row = result.rows[0]

    if (!row || row.used_at !== null || new Date(row.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: GENERIC_INVALID_MESSAGE })
      return
    }

    // Marked used *before* the password is actually changed: if anything
    // fails between these two statements, the token is already burned (the
    // user just requests a new one) rather than left valid for a retry
    // within the remaining expiry window.
    await sql`UPDATE password_reset_tokens SET used_at = now() WHERE id = ${row.id}`

    const passwordHash = await bcrypt.hash(password, 10)
    // Bumping token_version here invalidates every session cookie signed
    // before this moment, on every device — see getSessionUser in
    // api/_lib/auth.ts.
    await sql`
      UPDATE users SET password_hash = ${passwordHash}, token_version = token_version + 1
      WHERE id = ${row.user_id}
    `

    res.status(200).json({ message: '비밀번호가 변경됐어요. 새 비밀번호로 다시 로그인해주세요.' })
  } catch (err) {
    console.error('[api/auth/password-reset:reset] unexpected error', err)
    res.status(500).json({ error: '비밀번호를 변경하는 중 오류가 발생했어요.' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action

  if (action === 'request') {
    await handleRequestReset(req, res)
    return
  }
  if (action === 'reset') {
    await handleResetPassword(req, res)
    return
  }

  // Unreachable via the public URLs (vercel.json always sets ?action=...),
  // but guards against this function ever being hit directly without it.
  res.status(404).json({ error: 'Not found' })
}
