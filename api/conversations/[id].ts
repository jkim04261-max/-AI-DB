import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  ensureConversationsTables,
  sql,
  type ConversationRow,
  type MessageAttachmentRow,
  type MessageRow,
} from '../_lib/db'
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

const MAX_ATTACHMENTS_PER_MESSAGE = 5

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

// Validates the raw `attachments` field from a request body. Returns null
// (rather than throwing) on anything malformed so the caller can respond
// with a single, generic 400 — the exact shape of a bad payload isn't
// something the client needs back.
function parseIncomingAttachments(raw: unknown): IncomingAttachment[] | null {
  if (raw == null) return []
  if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS_PER_MESSAGE) return null

  const attachments: IncomingAttachment[] = []
  for (const item of raw) {
    const a = item as Partial<IncomingAttachment>
    if (
      typeof a.url !== 'string' ||
      typeof a.mimeType !== 'string' ||
      typeof a.name !== 'string' ||
      !ALLOWED_ATTACHMENT_MIME_TYPES.has(a.mimeType) ||
      !isTrustedBlobUrl(a.url)
    ) {
      return null
    }
    attachments.push({ url: a.url, mimeType: a.mimeType, name: a.name })
  }
  return attachments
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 // matches api/blob/upload.ts's upload-time limit, per file
// Gemini's generateContent REST API caps a request's total inline (base64)
// payload at roughly 20MB, and base64 inflates raw bytes by ~4/3 — so the
// *raw*, pre-encoding total across all of a message's attachments needs to
// stay well under that to leave room for the base64 overhead and the rest
// of the request body.
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024

// Unlike the Gemini call, this has no retry — a stuck blob fetch would
// otherwise hang until Vercel's own maxDuration kills the function, which
// looks like a silent "no response" to the user instead of a clean error.
const ATTACHMENT_FETCH_TIMEOUT_MS = 10_000

// Gemini's inlineData part needs the actual base64-encoded bytes, not a URL
// (fileData/fileUri only works with files uploaded through Gemini's own
// Files API), so we fetch the blob server-side before calling Gemini.
async function fetchImageAttachment(
  attachment: IncomingAttachment,
): Promise<{ attachment: GeminiImageAttachment; byteLength: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ATTACHMENT_FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(attachment.url, { signal: controller.signal })
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    console.error('[api/conversations/[id]] attachment fetch failed', err)
    throw new Error(
      isTimeout ? '첨부 이미지를 불러오는 데 시간이 너무 오래 걸려요.' : '첨부 이미지를 불러오지 못했어요.',
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new Error('첨부 이미지를 불러오지 못했어요.')
  }
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error('첨부 이미지가 너무 커요.')
  }
  return {
    attachment: { mimeType: attachment.mimeType, data: Buffer.from(buffer).toString('base64') },
    byteLength: buffer.byteLength,
  }
}

// Fetches every attachment in parallel (bounded by ATTACHMENT_FETCH_TIMEOUT_MS
// regardless of count, since they run concurrently, not one after another),
// then enforces the combined-size cap Gemini's inline payload needs.
async function fetchImageAttachments(
  attachments: IncomingAttachment[],
): Promise<GeminiImageAttachment[]> {
  if (attachments.length === 0) return []

  const fetched = await Promise.all(attachments.map(fetchImageAttachment))
  const totalBytes = fetched.reduce((sum, f) => sum + f.byteLength, 0)
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error(
      `첨부 이미지 전체 용량이 너무 커요 (최대 ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024))}MB). 이미지 수를 줄이거나 더 작은 파일로 시도해주세요.`,
    )
  }
  return fetched.map((f) => f.attachment)
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
// above the Gemini call's worst case for a message with image attachments —
// a fast-failing first attempt (429/5xx), a short backoff, then a second
// attempt that runs the full 45s image timeout (see IMAGE_REQUEST_TIMEOUT_MS
// in api/_lib/gemini.ts; a timeout itself never retries, so two full
// timeouts back to back can't happen) — plus fetching up to
// MAX_ATTACHMENTS_PER_MESSAGE attachments in parallel (bounded by
// ATTACHMENT_FETCH_TIMEOUT_MS regardless of how many) and the handful of DB
// round trips this route makes, so a genuinely slow request gets a clean
// error response instead of the platform killing the function mid-request.
export const config = { maxDuration: 90 }

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

    // @vercel/postgres's sql tag only accepts primitive params (no arrays),
    // so this can't do "attachments WHERE message_id = ANY($1)" as a second
    // query — one LEFT JOIN instead, filtered by the single conversation_id,
    // producing one row per (message, attachment) pair (or one row with
    // null attachment columns for a message with none).
    const rows = await sql<{
      message_id: number
      role: MessageRow['role']
      content: string
      ai_provider: string | null
      is_error: boolean
      attachment_url: string | null
      attachment_mime_type: string | null
      attachment_name: string | null
    }>`
      SELECT m.id AS message_id, m.role, m.content, m.ai_provider, m.is_error,
        a.url AS attachment_url, a.mime_type AS attachment_mime_type, a.name AS attachment_name
      FROM messages m
      LEFT JOIN message_attachments a ON a.message_id = m.id
      WHERE m.conversation_id = ${id}
      ORDER BY m.created_at ASC, m.id ASC, a.position ASC
    `

    interface BuiltMessage {
      role: MessageRow['role']
      text: string
      ai: string | undefined
      error: boolean
      attachments: { url: string; mimeType: string | null; name: string | null }[]
    }
    const messagesById = new Map<number, BuiltMessage>()
    const orderedMessageIds: number[] = []
    for (const row of rows.rows) {
      let msg = messagesById.get(row.message_id)
      if (!msg) {
        msg = {
          role: row.role,
          text: row.content,
          ai: row.ai_provider ?? undefined,
          error: row.is_error,
          attachments: [],
        }
        messagesById.set(row.message_id, msg)
        orderedMessageIds.push(row.message_id)
      }
      if (row.attachment_url) {
        msg.attachments.push({
          url: row.attachment_url,
          mimeType: row.attachment_mime_type,
          name: row.attachment_name,
        })
      }
    }

    res.status(200).json({
      conversation: {
        ...conversation,
        messages: orderedMessageIds.map((messageId) => {
          const msg = messagesById.get(messageId)!
          return { ...msg, attachments: msg.attachments.length > 0 ? msg.attachments : undefined }
        }),
      },
    })
  } catch (err) {
    console.error('[api/conversations/[id]] unexpected error', err)
    res.status(500).json({ error: '대화를 불러오는 중 오류가 발생했어요.' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse, id: number, userId: number) {
  const { text, attachments } = (req.body ?? {}) as {
    text?: unknown
    attachments?: unknown
  }
  if (typeof text !== 'string') {
    res.status(400).json({ error: '메시지를 입력해주세요.' })
    return
  }
  const messageText = text.trim()

  const incomingAttachments = parseIncomingAttachments(attachments)
  if (incomingAttachments === null) {
    res.status(400).json({ error: '첨부 파일이 올바르지 않아요.' })
    return
  }

  // Text is required unless an image is attached — a caption-less image
  // should still be sendable.
  if (!messageText && incomingAttachments.length === 0) {
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

    const insertResult = await sql<{ id: number }>`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (${id}, 'user', ${messageText})
      RETURNING id
    `
    const userMessageId = insertResult.rows[0].id
    for (const [position, a] of incomingAttachments.entries()) {
      await sql`
        INSERT INTO message_attachments (message_id, position, url, mime_type, name)
        VALUES (${userMessageId}, ${position}, ${a.url}, ${a.mimeType}, ${a.name})
      `
    }

    let replyText: string
    let isError = false
    try {
      const imageAttachments = await fetchImageAttachments(incomingAttachments)
      replyText = await getGeminiReply(messageText, history, imageAttachments)
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
      userMessage: { role: 'user', text: messageText, attachments: incomingAttachments },
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

    const attachmentsResult = await sql<MessageAttachmentRow>`
      SELECT message_id, position, url, mime_type, name
      FROM message_attachments
      WHERE message_id = ${userMessage.id}
      ORDER BY position
    `
    const incomingAttachments: IncomingAttachment[] = attachmentsResult.rows.map((a) => ({
      url: a.url,
      mimeType: a.mime_type ?? '',
      name: a.name ?? '',
    }))

    let replyText: string
    let isError = false
    try {
      const imageAttachments = await fetchImageAttachments(incomingAttachments)
      replyText = await getGeminiReply(userMessage.content, history, imageAttachments)
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
