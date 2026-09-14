import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionUser } from '../_lib/auth'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSessionUser(req)

  if (!session) {
    res.status(200).json({ user: null })
    return
  }

  res.status(200).json({ user: { id: session.sub, email: session.email } })
}
