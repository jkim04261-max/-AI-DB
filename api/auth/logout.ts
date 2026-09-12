import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildClearedSessionCookie } from '../_lib/auth'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  res.setHeader('Set-Cookie', buildClearedSessionCookie())
  res.status(200).json({ ok: true })
}
