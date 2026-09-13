import type { VercelRequest, VercelResponse } from '@vercel/node'
import bcrypt from 'bcryptjs'
import { ensureUsersTable, sql } from '../_lib/db'
import { signSession, buildSessionCookie, isValidEmail } from '../_lib/auth'

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

  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: '올바른 이메일 형식이 아니에요.' })
    return
  }

  if (password.length < 8) {
    res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요.' })
    return
  }

  try {
    await ensureUsersTable()

    const existing = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`
    if (existing.rows.length > 0) {
      res.status(409).json({ error: '이미 가입된 이메일이에요.' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const inserted = await sql<{ id: number; email: string }>`
      INSERT INTO users (email, password_hash)
      VALUES (${normalizedEmail}, ${passwordHash})
      RETURNING id, email
    `
    const user = inserted.rows[0]

    const token = signSession({ sub: user.id, email: user.email })
    res.setHeader('Set-Cookie', buildSessionCookie(token))
    res.status(201).json({ user })
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_SECRET_MISSING') {
      console.error('[api/auth/signup] AUTH_SECRET is not configured')
      res.status(500).json({ error: '서버에 AUTH_SECRET이 설정되지 않았어요.' })
      return
    }
    console.error('[api/auth/signup] unexpected error', err)
    res.status(500).json({ error: '회원가입 중 오류가 발생했어요.' })
  }
}
