import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureConversationsTables, sql, type ConversationRow, type MessageRow } from '../../_lib/db'
import { getSessionUser } from '../../_lib/auth'
import { GeminiConfigError, getGeminiReply } from '../../_lib/gemini'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = getSessionUser(req)
  if (!session) {
    res.status(401).json({ error: '로그인이 필요해요.' })
    return
  }

  const conversationId = Number(req.query.id)
  if (!Number.isInteger(conversationId)) {
    res.status(400).json({ error: '잘못된 대화 ID예요.' })
    return
  }

  const { text } = (req.body ?? {}) as { text?: unknown }
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: '메시지를 입력해주세요.' })
    return
  }
  const messageText = text.trim()

  try {
    await ensureConversationsTables()

    const convResult = await sql<Pick<ConversationRow, 'id'>>`
      SELECT id FROM conversations
      WHERE id = ${conversationId} AND user_id = ${session.sub}
    `
    if (convResult.rows.length === 0) {
      res.status(404).json({ error: '대화를 찾을 수 없어요.' })
      return
    }

    const historyResult = await sql<Pick<MessageRow, 'role' | 'content'>>`
      SELECT role, content FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC, id ASC
    `
    const history = historyResult.rows.map((m) => ({ role: m.role, text: m.content }))

    await sql`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (${conversationId}, 'user', ${messageText})
    `

    let replyText: string
    let isError = false
    try {
      replyText = await getGeminiReply(messageText, history)
    } catch (err) {
      isError = true
      if (err instanceof GeminiConfigError) {
        console.error('[api/conversations/[id]/messages] GEMINI_API_KEY is not configured')
        replyText = '서버에 GEMINI_API_KEY가 설정되지 않았어요.'
      } else {
        console.error('[api/conversations/[id]/messages] gemini error', err)
        replyText = err instanceof Error ? err.message : 'Gemini 응답을 받지 못했어요.'
      }
    }

    await sql`
      INSERT INTO messages (conversation_id, role, ai_provider, content, is_error)
      VALUES (${conversationId}, 'ai', 'Gemini', ${replyText}, ${isError})
    `
    await sql`UPDATE conversations SET updated_at = now() WHERE id = ${conversationId}`

    res.status(201).json({
      userMessage: { role: 'user', text: messageText },
      aiMessage: { role: 'ai', ai: 'Gemini', text: replyText, error: isError },
    })
  } catch (err) {
    console.error('[api/conversations/[id]/messages] unexpected error', err)
    res.status(500).json({ error: '메시지를 처리하는 중 오류가 발생했어요.' })
  }
}
