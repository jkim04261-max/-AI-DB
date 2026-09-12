import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSessionCookie, verifySession } from '../_lib/auth'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const token = readSessionCookie(req)
  const session = token ? verifySession(token) : null

  if (!session) {
    res.status(200).json({ user: null })
    return
  }

  res.status(200).json({ user: { id: session.sub, email: session.email } })
}
