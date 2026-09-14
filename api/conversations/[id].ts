import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureConversationsTables, sql, type ConversationRow, type MessageRow } from '../_lib/db'
import { getSessionUser } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSessionUser(req)
  if (!session) {
    res.status(401).json({ error: '로그인이 필요해요.' })
    return
  }

  const id = Number(req.query.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: '잘못된 대화 ID예요.' })
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    await ensureConversationsTables()

    const convResult = await sql<
      Pick<ConversationRow, 'id' | 'title' | 'created_at' | 'updated_at'>
    >`
      SELECT id, title, created_at, updated_at FROM conversations
      WHERE id = ${id} AND user_id = ${session.sub}
    `
    const conversation = convResult.rows[0]
    if (!conversation) {
      res.status(404).json({ error: '대화를 찾을 수 없어요.' })
      return
    }

    const messagesResult = await sql<
      Pick<MessageRow, 'role' | 'content' | 'ai_provider' | 'is_error'>
    >`
      SELECT role, content, ai_provider, is_error FROM messages
      WHERE conversation_id = ${id}
      ORDER BY created_at ASC, id ASC
    `

    res.status(200).json({
      conversation: {
        ...conversation,
        messages: messagesResult.rows.map((m) => ({
          role: m.role,
          text: m.content,
          ai: m.ai_provider ?? undefined,
          error: m.is_error,
        })),
      },
    })
  } catch (err) {
    console.error('[api/conversations/[id]] unexpected error', err)
    res.status(500).json({ error: '대화를 불러오는 중 오류가 발생했어요.' })
  }
}
