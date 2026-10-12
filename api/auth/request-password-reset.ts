import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes, createHash } from 'node:crypto'
import { ensurePasswordResetTable, sql } from '../_lib/db'
import { isValidEmail } from '../_lib/auth'
import { sendPasswordResetEmail, EmailConfigError, EmailSendError } from '../_lib/email'

const TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes
const MIN_RESEND_INTERVAL_MS = 60 * 1000 // at most one new token per account per minute

// Always the same wording whether or not the email is registered — the
// caller must not be able to tell "no such account" apart from "reset
// email sent" from this response alone.
const GENERIC_MESSAGE = '입력하신 이메일이 가입되어 있다면 잠시 후 재설정 메일을 받으실 수 있어요.'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      console.error('[api/auth/request-password-reset] RESEND_API_KEY is not configured')
      res.status(500).json({ error: '서버에 이메일 발송이 설정되지 않았어요.' })
      return
    }
    if (err instanceof EmailSendError) {
      // Deliberately distinct from the generic success message above:
      // reporting success when the email didn't actually go out would
      // hide a real failure from a legitimate user. This only reveals
      // "something failed", never which account it was for, so it doesn't
      // reopen the enumeration gap the generic message is there to close.
      console.error('[api/auth/request-password-reset] email send failed:', err.message)
      res.status(502).json({ error: '이메일 발송에 실패했어요. 잠시 후 다시 시도해주세요.' })
      return
    }
    console.error('[api/auth/request-password-reset] unexpected error', err)
    res.status(500).json({ error: '요청을 처리하는 중 오류가 발생했어요.' })
  }
}
