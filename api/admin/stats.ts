import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureConversationsTables, sql } from '../_lib/db'
import { getSessionUser } from '../_lib/auth'

// Comma-separated admin emails from a Vercel project env var — the only
// place admin status is defined right now (no admin column/role exists in
// the DB). Parsed fresh on every request rather than cached at module
// scope, so a changed env var takes effect without a redeploy being the
// only way to pick it up.
function isAdminEmail(email: string): boolean {
  const raw = process.env.ADMIN_EMAILS || ''
  const normalized = email.trim().toLowerCase()
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized)
}

// Admin-only basic stats. The caller's identity and admin status both come
// from the session cookie (never from the request) — isAdminEmail() checks
// session.email against ADMIN_EMAILS, so a non-admin gets 403 with no stats
// in the body, regardless of what they claim to be.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = getSessionUser(req)
  if (!session) {
    res.status(401).json({ error: '로그인이 필요해요.' })
    return
  }

  if (!isAdminEmail(session.email)) {
    res.status(403).json({ error: '관리자만 접근할 수 있어요.' })
    return
  }

  try {
    await ensureConversationsTables()

    const [users, conversations, messages, attachments] = await Promise.all([
      sql<{ count: number }>`SELECT COUNT(*)::int AS count FROM users`,
      sql<{ count: number }>`SELECT COUNT(*)::int AS count FROM conversations`,
      sql<{ count: number }>`SELECT COUNT(*)::int AS count FROM messages`,
      sql<{ count: number }>`SELECT COUNT(*)::int AS count FROM message_attachments`,
    ])

    res.status(200).json({
      users: users.rows[0].count,
      conversations: conversations.rows[0].count,
      messages: messages.rows[0].count,
      attachments: attachments.rows[0].count,
    })
  } catch (err) {
    console.error('[api/admin/stats] unexpected error', err)
    res.status(500).json({ error: '통계를 불러오는 중 오류가 발생했어요.' })
  }
}
