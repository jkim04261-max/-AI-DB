import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { ensurePasswordResetTable, sql } from '../_lib/db'

// Deliberately the same message for "no such token", "already used", and
// "expired" — which one applies isn't useful information to hand back,
// and the user's next step (request a new link) is the same either way.
const GENERIC_INVALID_MESSAGE = '링크가 올바르지 않거나 만료됐어요. 비밀번호 재설정을 다시 요청해주세요.'

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    console.error('[api/auth/reset-password] unexpected error', err)
    res.status(500).json({ error: '비밀번호를 변경하는 중 오류가 발생했어요.' })
  }
}
