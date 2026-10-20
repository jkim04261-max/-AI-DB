import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureCharacterTables, ensureKnowledgeTable, sql, type CharacterRow, type KnowledgeEntryRow } from './_lib/db'
import { getSessionUser } from './_lib/auth'
import { GeminiApiError, GeminiConfigError, verifyKnowledge, type KnowledgeVerificationResult } from './_lib/gemini'
import { DAILY_TEACH_LIMIT, reserveTeach, refundTeach } from './_lib/knowledgeLimit'

const COMPANION_TYPES = new Set(['nuri', 'duri'])
// PR #43's first two supported professions. Extending this later (e.g. a
// third job) is a one-line change here — a plain nullable column, not a
// separate table, so no migration is needed either.
const PROFESSIONS = new Set(['accountant', 'singer'])
const PROFESSION_LABEL: Record<string, string> = { accountant: '회계사', singer: '가수' }
const VERIFICATION_STATUSES = new Set(['appropriate', 'needs_revision', 'unverifiable'])

const MAX_TITLE_LENGTH = 100
const MAX_CONTENT_LENGTH = 2000
const DEFAULT_LIST_LIMIT = 20
const MAX_LIST_LIMIT = 50

const DAILY_TEACH_LIMIT_REACHED_MESSAGE = `오늘의 지식 검증 요청 ${DAILY_TEACH_LIMIT}회를 모두 사용했습니다. 내일 다시 이용할 수 있습니다.`

// Worst case for the verify-knowledge action: 2 Gemini attempts at
// KNOWLEDGE_VERIFICATION_TIMEOUT_MS each plus a short backoff (see
// api/_lib/gemini.ts) — comfortably above that so a genuinely slow request
// gets a clean error response instead of the platform killing the
// function mid-request. Every other action here (character/profession
// CRUD, listing knowledge) finishes in a fraction of this; the limit is
// just a ceiling, not something those paths wait for.
export const config = { maxDuration: 45 }

// GET lists the caller's characters (or, with ?action=knowledge, one
// character's learning records); POST creates a character (or, with
// ?action=verify-knowledge / save-knowledge, runs/confirms a Gemini
// knowledge check); PATCH sets/changes a character's profession. All of
// this lives in one file (the same "merge instead of add a new endpoint
// file" pattern as api/conversations/[id].ts and api/auth/password-reset.ts)
// because the Vercel Hobby plan caps this project at 12 serverless
// functions — see docs/design/PR41-plan.md.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await getSessionUser(req)
  if (!session) {
    res.status(401).json({ error: '로그인이 필요해요.' })
    return
  }

  const action = typeof req.query?.action === 'string' ? req.query.action : undefined

  if (req.method === 'GET') {
    if (action === 'knowledge') {
      await handleListKnowledge(req, res, session.sub)
      return
    }
    await handleGet(res, session.sub)
    return
  }

  if (req.method === 'POST') {
    if (action === 'verify-knowledge') {
      await handleVerifyKnowledge(req, res, session.sub)
      return
    }
    if (action === 'save-knowledge') {
      await handleSaveKnowledge(req, res, session.sub)
      return
    }
    await handlePost(req, res, session.sub)
    return
  }

  if (req.method === 'PATCH') {
    await handlePatch(req, res, session.sub)
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}

// Looks up the caller's own character by companionType — every knowledge
// action needs this same (ownership check + profession lookup) before
// doing anything else, so it's shared rather than repeated three times.
async function findOwnCharacter(userId: number, companionType: unknown): Promise<CharacterRow | null> {
  if (typeof companionType !== 'string' || !COMPANION_TYPES.has(companionType)) return null

  const result = await sql<CharacterRow>`
    SELECT id, user_id, companion_type, stage, profession, created_at
    FROM characters
    WHERE user_id = ${userId} AND companion_type = ${companionType}
  `
  return result.rows[0] ?? null
}

async function handleGet(res: VercelResponse, userId: number) {
  try {
    await ensureCharacterTables()

    const result = await sql<CharacterRow>`
      SELECT id, user_id, companion_type, stage, profession, created_at
      FROM characters
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `
    res.status(200).json({ characters: result.rows })
  } catch (err) {
    console.error('[api/character] unexpected error on GET', err)
    res.status(500).json({ error: '캐릭터 정보를 불러오는 중 오류가 발생했어요.' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType } = (req.body ?? {}) as { companionType?: unknown }
  if (typeof companionType !== 'string' || !COMPANION_TYPES.has(companionType)) {
    res.status(400).json({ error: '누리 또는 두리 중 하나를 선택해주세요.' })
    return
  }

  try {
    await ensureCharacterTables()

    // `stage` is never taken from the request — every account today is a
    // free account (there is no plan/payment system yet), and a free
    // account's character always starts as a child. The UNIQUE
    // (user_id, companion_type) constraint is both the "already has one"
    // check and the insert, in one round trip — the same pattern
    // api/conversations/[id].ts's handleDelete uses for ownership checks.
    const inserted = await sql<CharacterRow>`
      INSERT INTO characters (user_id, companion_type, stage)
      VALUES (${userId}, ${companionType}, 'child')
      ON CONFLICT (user_id, companion_type) DO NOTHING
      RETURNING id, user_id, companion_type, stage, profession, created_at
    `
    const character = inserted.rows[0]
    if (!character) {
      res.status(409).json({ error: '이미 만든 캐릭터예요.' })
      return
    }

    res.status(201).json({ character })
  } catch (err) {
    console.error('[api/character] unexpected error on POST', err)
    res.status(500).json({ error: '캐릭터를 만드는 중 오류가 발생했어요.' })
  }
}

// Sets or changes which profession a character has — never touches the
// character row itself beyond that one column, so this can never delete or
// reset a character (matches the "직업 변경 시 캐릭터 자체는 삭제하지
// 않는다" requirement). `companionType` + `userId` together are both the
// ownership check and the update target in one round trip, the same
// pattern handlePost's insert and api/conversations/[id].ts's delete use —
// a request naming another user's character simply matches no row.
async function handlePatch(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType, profession } = (req.body ?? {}) as {
    companionType?: unknown
    profession?: unknown
  }
  if (typeof companionType !== 'string' || !COMPANION_TYPES.has(companionType)) {
    res.status(400).json({ error: '누리 또는 두리 중 하나를 선택해주세요.' })
    return
  }
  if (typeof profession !== 'string' || !PROFESSIONS.has(profession)) {
    res.status(400).json({ error: '회계사 또는 가수 중 하나를 선택해주세요.' })
    return
  }

  try {
    await ensureCharacterTables()

    const updated = await sql<CharacterRow>`
      UPDATE characters
      SET profession = ${profession}
      WHERE user_id = ${userId} AND companion_type = ${companionType}
      RETURNING id, user_id, companion_type, stage, profession, created_at
    `
    const character = updated.rows[0]
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }

    res.status(200).json({ character })
  } catch (err) {
    console.error('[api/character] unexpected error on PATCH', err)
    res.status(500).json({ error: '직업을 저장하는 중 오류가 발생했어요.' })
  }
}

// Same classification api/conversations/[id].ts's resolveGeminiFailureMessage
// uses: GeminiConfigError/GeminiApiError already carry a Korean, user-facing
// message, anything else is unexpected and gets a generic one instead of a
// raw/English error reaching the client.
function resolveGeminiFailureMessage(err: unknown): { status: number; message: string } {
  if (err instanceof GeminiConfigError) {
    console.error('[api/character] GEMINI_API_KEY is not configured')
    return { status: 500, message: '서버에 GEMINI_API_KEY가 설정되지 않았어요.' }
  }
  if (err instanceof GeminiApiError) {
    console.error('[api/character] gemini knowledge verification error', err)
    return { status: err.status >= 400 && err.status < 600 ? err.status : 502, message: err.message }
  }
  console.error('[api/character] unexpected error calling gemini', err)
  return { status: 502, message: 'Gemini 응답을 받지 못했어요.' }
}

// Runs a Gemini check on a piece of knowledge the user wants to teach a
// character — never writes to character_knowledge_entries. Saving only
// happens in handleSaveKnowledge, and only once the user has reviewed this
// result and explicitly confirmed it ("검증이 끝났다는 이유만으로 자동
// 저장하지 않는다").
async function handleVerifyKnowledge(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType, title, content } = (req.body ?? {}) as {
    companionType?: unknown
    title?: unknown
    content?: unknown
  }

  if (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
    res.status(400).json({ error: `지식 제목을 ${MAX_TITLE_LENGTH}자 이내로 입력해주세요.` })
    return
  }
  if (typeof content !== 'string' || !content.trim() || content.trim().length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `지식 내용을 ${MAX_CONTENT_LENGTH}자 이내로 입력해주세요.` })
    return
  }

  try {
    await ensureCharacterTables()

    const character = await findOwnCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }
    if (!character.profession) {
      res.status(400).json({ error: '먼저 직업을 선택해주세요.' })
      return
    }

    // Reserved *before* calling Gemini — a request already over today's cap
    // never reaches Gemini at all, so going over the limit can never cost
    // anything. Same ordering as api/conversations/[id].ts's chat quota.
    const reserved = await reserveTeach(userId)
    if (!reserved.ok) {
      res.status(429).json({
        error: DAILY_TEACH_LIMIT_REACHED_MESSAGE,
        remaining: 0,
        dailyTeachLimit: DAILY_TEACH_LIMIT,
      })
      return
    }

    let verification: KnowledgeVerificationResult
    try {
      verification = await verifyKnowledge(PROFESSION_LABEL[character.profession], title.trim(), content.trim())
    } catch (err) {
      // The call itself failed (config/timeout/network/non-2xx) — nothing
      // usable came back, so this attempt shouldn't count against today's
      // cap. A successful-but-malformed response (handled inside
      // verifyKnowledge itself, returned as a normal 'unverifiable' result
      // rather than thrown) is NOT refunded — see knowledgeLimit.ts.
      await refundTeach(userId)
      const { status, message } = resolveGeminiFailureMessage(err)
      res.status(status).json({ error: message })
      return
    }

    res.status(200).json({ verification, remaining: reserved.remaining, dailyTeachLimit: DAILY_TEACH_LIMIT })
  } catch (err) {
    console.error('[api/character] unexpected error on verify-knowledge', err)
    res.status(500).json({ error: '지식을 검증하는 중 오류가 발생했어요.' })
  }
}

// Persists a knowledge entry the user has reviewed and confirmed. Only
// ever inserts a row when the *resubmitted* verification result says
// 'appropriate' — a 'needs_revision' or 'unverifiable' result can never be
// saved through this endpoint, matching "검증 불가 상태에서는 검증된
// 지식으로 저장하지 않는다". (This trusts the verification object the
// client resends rather than re-deriving it server-side from a stored
// draft row — a deliberate, documented scope boundary: the worst case is a
// user mislabeling their own character's own knowledge entry inside their
// own account, which never exposes another user's data or costs an extra
// Gemini call, so the added complexity of a signed verification token
// wasn't justified for this PR. See the PR description for this tradeoff.)
async function handleSaveKnowledge(req: VercelRequest, res: VercelResponse, userId: number) {
  const body = (req.body ?? {}) as {
    companionType?: unknown
    title?: unknown
    originalContent?: unknown
    finalContent?: unknown
    verification?: { status?: unknown; explanation?: unknown; relevance?: unknown; issues?: unknown; suggestion?: unknown }
    requestId?: unknown
  }
  const { companionType, title, originalContent, finalContent, verification } = body
  const requestId = typeof body.requestId === 'string' && body.requestId ? body.requestId : null

  if (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
    res.status(400).json({ error: `지식 제목을 ${MAX_TITLE_LENGTH}자 이내로 입력해주세요.` })
    return
  }
  if (typeof originalContent !== 'string' || !originalContent.trim() || originalContent.trim().length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `지식 내용을 ${MAX_CONTENT_LENGTH}자 이내로 입력해주세요.` })
    return
  }
  // finalContent may differ from originalContent (the user edited it, or
  // adopted Gemini's suggestion) but is never *silently* substituted by
  // this endpoint — the client must send whichever text the user actually
  // confirmed, including if that's the unedited original.
  if (typeof finalContent !== 'string' || !finalContent.trim() || finalContent.trim().length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `저장할 지식 내용을 ${MAX_CONTENT_LENGTH}자 이내로 입력해주세요.` })
    return
  }
  if (
    !verification ||
    typeof verification.status !== 'string' ||
    !VERIFICATION_STATUSES.has(verification.status)
  ) {
    res.status(400).json({ error: '검증 결과가 올바르지 않아요. 다시 검증해주세요.' })
    return
  }
  if (verification.status !== 'appropriate') {
    res.status(400).json({ error: '적합 판정을 받은 지식만 저장할 수 있어요. 수정 후 다시 검증해주세요.' })
    return
  }

  try {
    await ensureCharacterTables()
    await ensureKnowledgeTable()

    const character = await findOwnCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }
    if (!character.profession) {
      res.status(400).json({ error: '먼저 직업을 선택해주세요.' })
      return
    }

    // Idempotency: if this exact save was already processed (double-click,
    // a retried request), return the existing row instead of inserting a
    // duplicate — same two-step "look for a prior match, else insert"
    // shape as findReplay in api/conversations/[id].ts.
    if (requestId) {
      const existing = await sql<KnowledgeEntryRow>`
        SELECT id, user_id, character_id, profession, title, original_content, final_content, verification_status, verification_explanation, created_at
        FROM character_knowledge_entries
        WHERE character_id = ${character.id} AND client_request_id = ${requestId}
      `
      if (existing.rows[0]) {
        res.status(200).json({ entry: existing.rows[0] })
        return
      }
    }

    const explanationParts = [
      verification.explanation ? `설명: ${verification.explanation}` : null,
      verification.relevance ? `관련성: ${verification.relevance}` : null,
      verification.issues ? `문제점: ${verification.issues}` : null,
      verification.suggestion ? `제안: ${verification.suggestion}` : null,
    ].filter((p): p is string => typeof p === 'string')
    const verificationExplanation = explanationParts.join('\n') || '적합'

    const inserted = await sql<KnowledgeEntryRow>`
      INSERT INTO character_knowledge_entries
        (user_id, character_id, profession, title, original_content, final_content, verification_status, verification_explanation, client_request_id)
      VALUES
        (${userId}, ${character.id}, ${character.profession}, ${title.trim()}, ${originalContent.trim()}, ${finalContent.trim()}, 'appropriate', ${verificationExplanation}, ${requestId})
      RETURNING id, user_id, character_id, profession, title, original_content, final_content, verification_status, verification_explanation, created_at
    `

    res.status(201).json({ entry: inserted.rows[0] })
  } catch (err) {
    console.error('[api/character] unexpected error on save-knowledge', err)
    res.status(500).json({ error: '학습 기록을 저장하는 중 오류가 발생했어요.' })
  }
}

// Lists one character's saved knowledge entries, newest first, scoped to
// both character_id and user_id (defense in depth, same reasoning as the
// growth-system design doc's 7절) — a companionType naming another user's
// character simply matches no character at all via findOwnCharacter.
async function handleListKnowledge(req: VercelRequest, res: VercelResponse, userId: number) {
  const companionType = req.query.companionType
  const rawLimit = Number(req.query.limit)
  const rawOffset = Number(req.query.offset)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), MAX_LIST_LIMIT) : DEFAULT_LIST_LIMIT
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0

  try {
    await ensureCharacterTables()
    await ensureKnowledgeTable()

    const character = await findOwnCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }

    const [entries, countResult] = await Promise.all([
      sql<KnowledgeEntryRow>`
        SELECT id, user_id, character_id, profession, title, original_content, final_content, verification_status, verification_explanation, created_at
        FROM character_knowledge_entries
        WHERE character_id = ${character.id} AND user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM character_knowledge_entries
        WHERE character_id = ${character.id} AND user_id = ${userId}
      `,
    ])

    res.status(200).json({ entries: entries.rows, total: countResult.rows[0].count })
  } catch (err) {
    console.error('[api/character] unexpected error on list knowledge', err)
    res.status(500).json({ error: '학습 기록을 불러오는 중 오류가 발생했어요.' })
  }
}
