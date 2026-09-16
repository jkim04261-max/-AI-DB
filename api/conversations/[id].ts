import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureConversationsTables, sql, type ConversationRow, type MessageRow } from '../_lib/db'
import { getSessionUser } from '../_lib/auth'
import {
  GeminiApiError,
  GeminiConfigError,
  getGeminiReply,
  type GeminiImageAttachment,
} from '../_lib/gemini'

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

interface IncomingAttachment {
  url: string
  mimeType: string
  name: string
}

// Only ever fetch attachment bytes from our own Vercel Blob store, never an
// arbitrary client-supplied URL — otherwise an authenticated user could turn
// this endpoint into an SSRF proxy against internal/private addresses.
function isTrustedBlobUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && hostname.endsWith('.public.blob.vercel-storage.com')
  } catch {
    return false
  }
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 // matches api/blob/upload.ts's upload-time limit

// Gemini's inlineData part needs the actual base64-encoded bytes, not a URL
// (fileData/fileUri only works with files uploaded through Gemini's own
// Files API), so we fetch the blob server-side before calling Gemini.
async function fetchImageAttachment(attachment: IncomingAttachment): Promise<GeminiImageAttachment> {
  const res = await fetch(attachment.url)
  if (!res.ok) {
    throw new Error('첨부 이미지를 불러오지 못했어요.')
  }
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error('첨부 이미지가 너무 커요.')
  }
  return { mimeType: attachment.mimeType, data: Buffer.from(buffer).toString('base64') }
}

// GeminiConfigError/GeminiApiError already carry a Korean, user-facing
// message (see api/_lib/gemini.ts); anything else (e.g. our own attachment
// fetch failing) is unexpected, so fall back to a generic message instead
// of risking a raw/English error reaching the chat UI.
function resolveGeminiFailureMessage(err: unknown): string {
  if (err instanceof GeminiConfigError) {
    console.error('[api/conversations/[id]] GEMINI_API_KEY is not configured')
    return '서버에 GEMINI_API_KEY가 설정되지 않았어요.'
  }
  if (err instanceof GeminiApiError) {
    console.error('[api/conversations/[id]] gemini error', err)
    return err.message
  }
  console.error('[api/conversations/[id]] gemini error', err)
  return err instanceof Error ? err.message : 'Gemini 응답을 받지 못했어요.'
}

// Explicit ceiling instead of relying on the platform default: comfortably
// above the Gemini call's worst case (two attempts x 20s timeout for a
// message with an image attachment, plus one short backoff — see
// api/_lib/gemini.ts) plus the handful of DB round trips and the
// attachment fetch this route makes, so a genuinely slow request gets a
// clean error response instead of the platform killing the function
// mid-request.
export const config = { maxDuration: 60 }

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
    const body = (req.body ?? {}) as { retry?: unknown }
    if (body.retry === true) {
      await handleRetry(res, id, session.sub)
    } else {
      await handlePost(req, res, id, session.sub)
    }
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
      Pick<
        MessageRow,
        | 'role'
        | 'content'
        | 'ai_provider'
        | 'is_error'
        | 'attachment_url'
        | 'attachment_mime_type'
        | 'attachment_name'
      >
    >`
      SELECT role, content, ai_provider, is_error,
        attachment_url, attachment_mime_type, attachment_name
      FROM messages
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
          attachment: m.attachment_url
            ? { url: m.attachment_url, mimeType: m.attachment_mime_type, name: m.attachment_name }
            : undefined,
        })),
      },
    })
  } catch (err) {
    console.error('[api/conversations/[id]] unexpected error', err)
    res.status(500).json({ error: '대화를 불러오는 중 오류가 발생했어요.' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse, id: number, userId: number) {
  const { text, attachment } = (req.body ?? {}) as {
    text?: unknown
    attachment?: unknown
  }
  if (typeof text !== 'string') {
    res.status(400).json({ error: '메시지를 입력해주세요.' })
    return
  }
  const messageText = text.trim()

  let incomingAttachment: IncomingAttachment | undefined
  if (attachment != null) {
    const a = attachment as Partial<IncomingAttachment>
    if (
      typeof a.url !== 'string' ||
      typeof a.mimeType !== 'string' ||
      typeof a.name !== 'string' ||
      !ALLOWED_ATTACHMENT_MIME_TYPES.has(a.mimeType) ||
      !isTrustedBlobUrl(a.url)
    ) {
      res.status(400).json({ error: '첨부 파일이 올바르지 않아요.' })
      return
    }
    incomingAttachment = { url: a.url, mimeType: a.mimeType, name: a.name }
  }

  // Text is required unless an image is attached — a caption-less image
  // should still be sendable.
  if (!messageText && !incomingAttachment) {
    res.status(400).json({ error: '메시지를 입력해주세요.' })
    return
  }

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

    // Cap what we send Gemini as context to the most recent messages: an
    // unbounded history means both the DB round trip and the prompt (and
    // so Gemini's response time) grow with every message a conversation
    // ever had, instead of staying roughly constant per turn.
    const historyResult = await sql<Pick<MessageRow, 'role' | 'content'>>`
      SELECT role, content FROM (
        SELECT role, content, created_at, id FROM messages
        WHERE conversation_id = ${id}
        ORDER BY created_at DESC, id DESC
        LIMIT 20
      ) recent
      ORDER BY created_at ASC, id ASC
    `
    const history = historyResult.rows.map((m) => ({ role: m.role, text: m.content }))

    await sql`
      INSERT INTO messages (conversation_id, role, content, attachment_url, attachment_mime_type, attachment_name)
      VALUES (
        ${id}, 'user', ${messageText},
        ${incomingAttachment?.url ?? null},
        ${incomingAttachment?.mimeType ?? null},
        ${incomingAttachment?.name ?? null}
      )
    `

    let replyText: string
    let isError = false
    try {
      const imageAttachment = incomingAttachment
        ? await fetchImageAttachment(incomingAttachment)
        : undefined
      replyText = await getGeminiReply(messageText, history, imageAttachment)
    } catch (err) {
      isError = true
      replyText = resolveGeminiFailureMessage(err)
    }

    await sql`
      INSERT INTO messages (conversation_id, role, ai_provider, content, is_error)
      VALUES (${id}, 'ai', 'Gemini', ${replyText}, ${isError})
    `
    await sql`UPDATE conversations SET updated_at = now() WHERE id = ${id}`

    res.status(201).json({
      userMessage: { role: 'user', text: messageText, attachment: incomingAttachment },
      aiMessage: { role: 'ai', ai: 'Gemini', text: replyText, error: isError },
    })
  } catch (err) {
    console.error('[api/conversations/[id]] unexpected error', err)
    res.status(500).json({ error: '메시지를 처리하는 중 오류가 발생했어요.' })
  }
}

// Re-attempts the Gemini call for a conversation's last message without
// creating a new user message row — a retry is "try that same turn again",
// not a new turn, so the existing failed AI message row is updated in
// place instead of appending a duplicate user/AI pair.
async function handleRetry(res: VercelResponse, id: number, userId: number) {
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

    const lastRows = await sql<MessageRow>`
      SELECT * FROM messages
      WHERE conversation_id = ${id}
      ORDER BY created_at DESC, id DESC
      LIMIT 2
    `
    const [lastMessage, userMessage] = lastRows.rows
    if (!lastMessage || lastMessage.role !== 'ai' || !lastMessage.is_error) {
      res.status(400).json({ error: '다시 시도할 메시지가 없어요.' })
      return
    }
    if (!userMessage || userMessage.role !== 'user') {
      res.status(400).json({ error: '다시 시도할 메시지가 없어요.' })
      return
    }

    const historyResult = await sql<Pick<MessageRow, 'role' | 'content'>>`
      SELECT role, content FROM (
        SELECT role, content, created_at, id FROM messages
        WHERE conversation_id = ${id} AND id NOT IN (${lastMessage.id}, ${userMessage.id})
        ORDER BY created_at DESC, id DESC
        LIMIT 20
      ) recent
      ORDER BY created_at ASC, id ASC
    `
    const history = historyResult.rows.map((m) => ({ role: m.role, text: m.content }))

    const incomingAttachment: IncomingAttachment | undefined = userMessage.attachment_url
      ? {
          url: userMessage.attachment_url,
          mimeType: userMessage.attachment_mime_type ?? '',
          name: userMessage.attachment_name ?? '',
        }
      : undefined

    let replyText: string
    let isError = false
    try {
      const imageAttachment = incomingAttachment
        ? await fetchImageAttachment(incomingAttachment)
        : undefined
      replyText = await getGeminiReply(userMessage.content, history, imageAttachment)
    } catch (err) {
      isError = true
      replyText = resolveGeminiFailureMessage(err)
    }

    await sql`
      UPDATE messages SET content = ${replyText}, is_error = ${isError}
      WHERE id = ${lastMessage.id}
    `
    await sql`UPDATE conversations SET updated_at = now() WHERE id = ${id}`

    res.status(200).json({
      aiMessage: { role: 'ai', ai: 'Gemini', text: replyText, error: isError },
    })
  } catch (err) {
    console.error('[api/conversations/[id]] unexpected error on retry', err)
    res.status(500).json({ error: '메시지를 처리하는 중 오류가 발생했어요.' })
  }
}
