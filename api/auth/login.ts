import type { VercelRequest, VercelResponse } from '@vercel/node'
import bcrypt from 'bcryptjs'
import { ensureUsersTable, sql, type UserRow } from '../_lib/db'
import { signSession, buildSessionCookie } from '../_lib/auth'

const INVALID_CREDENTIALS = '이메일 또는 비밀번호가 올바르지 않아요.'
// A pre-hashed dummy value so a lookup miss still pays the bcrypt cost,
// keeping response timing close to the found-user path.
const DUMMY_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO0nsmXJcYPUiUEjSg8Fj5cSA6qJJa1cq'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' })
    return
  }

  const normalizedEmail = email.trim().toLowerCase()

  try {
    await ensureUsersTable()

    const result = await sql<UserRow>`
      SELECT id, email, password_hash FROM users WHERE email = ${normalizedEmail}
    `
    const user = result.rows[0]

    const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !valid) {
      res.status(401).json({ error: INVALID_CREDENTIALS })
      return
    }

    const token = signSession({ sub: user.id, email: user.email })
    res.setHeader('Set-Cookie', buildSessionCookie(token))
    res.status(200).json({ user: { id: user.id, email: user.email } })
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_SECRET_MISSING') {
      res.status(500).json({ error: '서버에 AUTH_SECRET이 설정되지 않았어요.' })
      return
    }
    res.status(500).json({ error: '로그인 중 오류가 발생했어요.' })
  }
}
