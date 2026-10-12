import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureConversationsTables, sql } from '../_lib/db'
import { getSessionUser } from '../_lib/auth'

// Same admin check as api/admin/stats.ts — kept as a separate copy rather
// than a shared import so this endpoint doesn't create a dependency between
// the two admin files; both read the same ADMIN_EMAILS env var.
function isAdminEmail(email: string): boolean {
  const raw = process.env.ADMIN_EMAILS || ''
  const normalized = email.trim().toLowerCase()
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized)
}

// These mirror the exact strings api/conversations/[id].ts's
// resolveGeminiFailureMessage() and api/_lib/gemini.ts's
// TRANSIENT_FAILURE_MESSAGE already store in messages.content for a failed
// AI turn — duplicated here (not imported) so this admin-only file carries
// no dependency on, and makes no change to, the protected Gemini call path.
// Every string content can hold here was already shown to the end user in
// the chat UI, so none of this classification touches secrets.
const GEMINI_API_KEY_MISSING_MESSAGE = '서버에 GEMINI_API_KEY가 설정되지 않았어요.'
const TRANSIENT_FAILURE_MESSAGE = '일시적으로 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.'
const MAX_ERROR_MESSAGE_LENGTH = 200
const RECENT_ERRORS_LIMIT = 20

function classifyErrorKind(content: string): string {
  if (content === GEMINI_API_KEY_MISSING_MESSAGE) return '서버 설정 오류'
  if (content === TRANSIENT_FAILURE_MESSAGE) return '일시적 오류(지연·과부하)'
  return '요청/응답 오류'
}

interface AiMessageAggRow {
  total: number
  success: number
  failed: number
  today: number
}

interface RecentErrorRow {
  id: number
  created_at: string
  ai_provider: string | null
  content: string
}

// Admin-only AI usage/error monitoring, built entirely from the existing
// messages table (role='ai' rows) — no new table or column. Access control
// mirrors api/admin/stats.ts: session required, then session.email must be
// in ADMIN_EMAILS, or this returns 401/403 with no data in the body.
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

    const [aggResult, errorsResult] = await Promise.all([
      sql<AiMessageAggRow>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE NOT is_error)::int AS success,
          COUNT(*) FILTER (WHERE is_error)::int AS failed,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today
        FROM messages
        WHERE role = 'ai'
      `,
      sql<RecentErrorRow>`
        SELECT id, created_at, ai_provider, content
        FROM messages
        WHERE role = 'ai' AND is_error = true
        ORDER BY created_at DESC
        LIMIT ${RECENT_ERRORS_LIMIT}
      `,
    ])

    const agg = aggResult.rows[0]
    const successRate = agg.total > 0 ? Math.round((agg.success / agg.total) * 1000) / 10 : 0

    res.status(200).json({
      total: agg.total,
      success: agg.success,
      failed: agg.failed,
      successRate,
      today: agg.today,
      recentErrors: errorsResult.rows.map((row) => ({
        id: row.id,
        occurredAt: row.created_at,
        model: row.ai_provider ?? 'Gemini',
        kind: classifyErrorKind(row.content),
        message: row.content.slice(0, MAX_ERROR_MESSAGE_LENGTH),
      })),
    })
  } catch (err) {
    console.error('[api/admin/ai-usage] unexpected error', err)
    res.status(500).json({ error: 'AI 사용 현황을 불러오는 중 오류가 발생했어요.' })
  }
}
