import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureConversationsTables, sql, type ConversationRow } from '../_lib/db'
import { getSessionUser } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSessionUser(req)
  if (!session) {
    res.status(401).json({ error: '로그인이 필요해요.' })
    return
  }

  try {
    await ensureConversationsTables()

    if (req.method === 'GET') {
      const result = await sql<Pick<ConversationRow, 'id' | 'title' | 'updated_at'>>`
        SELECT id, title, updated_at
        FROM conversations
        WHERE user_id = ${session.sub}
        ORDER BY updated_at DESC
      `
      res.status(200).json({ conversations: result.rows })
      return
    }

    if (req.method === 'POST') {
      const { title } = (req.body ?? {}) as { title?: unknown }
      const safeTitle =
        typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : '새 대화'

      const inserted = await sql<
        Pick<ConversationRow, 'id' | 'title' | 'created_at' | 'updated_at'>
      >`
        INSERT INTO conversations (user_id, title)
        VALUES (${session.sub}, ${safeTitle})
        RETURNING id, title, created_at, updated_at
      `
      res.status(201).json({ conversation: { ...inserted.rows[0], messages: [] } })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/conversations] unexpected error', err)
    res.status(500).json({ error: '대화 목록을 처리하는 중 오류가 발생했어요.' })
  }
}
