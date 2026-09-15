import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureConversationsTables, sql, type ConversationRow, type MessageRow } from '../_lib/db'
import { getSessionUser } from '../_lib/auth'
import { GeminiConfigError, getGeminiReply } from '../_lib/gemini'

// GET fetches a conversation with its messages; POST appends a user message
// and the AI reply. Both live in one file (instead of GET in [id]/index.ts
// and POST in [id]/messages.ts) because Vercel's zero-config function router
// resolved POST /api/conversations/:id/messages to the GET-only handler when
// [id] existed as both a file and a sibling directory — merging removes any
// chance of that ambiguity.
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

  if (req.method === 'GET') {
    await handleGet(req, res, id, session.sub)
    return
  }

  if (req.method === 'POST') {
    await handlePost(req, res, id, session.sub)
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(_req: VercelRequest, res: VercelResponse, id: number, userId: number) {
  try {
    await ensureConversationsTables()

    const convResult = await sql<
      Pick<ConversationRow, 'id' | 'title' | 'created_at' | 'updated_at'>
    >`
      SELECT id, title, created_at, updated_at FROM conversations
      WHERE id = ${id} AND user_id = ${userId}
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

async function handlePost(req: VercelRequest, res: VercelResponse, id: number, userId: number) {
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
      WHERE id = ${id} AND user_id = ${userId}
    `
    if (convResult.rows.length === 0) {
      res.status(404).json({ error: '대화를 찾을 수 없어요.' })
      return
    }

    const historyResult = await sql<Pick<MessageRow, 'role' | 'content'>>`
      SELECT role, content FROM messages
      WHERE conversation_id = ${id}
      ORDER BY created_at ASC, id ASC
    `
    const history = historyResult.rows.map((m) => ({ role: m.role, text: m.content }))

    await sql`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (${id}, 'user', ${messageText})
    `

    let replyText: string
    let isError = false
    try {
      replyText = await getGeminiReply(messageText, history)
    } catch (err) {
      isError = true
      if (err instanceof GeminiConfigError) {
        console.error('[api/conversations/[id]] GEMINI_API_KEY is not configured')
        replyText = '서버에 GEMINI_API_KEY가 설정되지 않았어요.'
      } else {
        console.error('[api/conversations/[id]] gemini error', err)
        replyText = err instanceof Error ? err.message : 'Gemini 응답을 받지 못했어요.'
      }
    }

    await sql`
      INSERT INTO messages (conversation_id, role, ai_provider, content, is_error)
      VALUES (${id}, 'ai', 'Gemini', ${replyText}, ${isError})
    `
    await sql`UPDATE conversations SET updated_at = now() WHERE id = ${id}`

    res.status(201).json({
      userMessage: { role: 'user', text: messageText },
      aiMessage: { role: 'ai', ai: 'Gemini', text: replyText, error: isError },
    })
  } catch (err) {
    console.error('[api/conversations/[id]] unexpected error', err)
    res.status(500).json({ error: '메시지를 처리하는 중 오류가 발생했어요.' })
  }
}
