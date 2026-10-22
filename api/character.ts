import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  ensureCharacterTables,
  ensureKnowledgeTable,
  ensureCharacterMessagesTable,
  ensureGrowthTables,
  sql,
  type CharacterRow,
  type KnowledgeEntryRow,
  type CharacterMessageRow,
} from './_lib/db'
import { getSessionUser } from './_lib/auth'
import {
  GeminiApiError,
  GeminiConfigError,
  verifyKnowledge,
  generateSelfStudy,
  type KnowledgeVerificationResult,
} from './_lib/gemini'
import { DAILY_TEACH_LIMIT, reserveTeach, refundTeach } from './_lib/knowledgeLimit'
import { DAILY_STUDY_LIMIT, reserveStudy, refundStudy } from './_lib/studyLimit'
import { signKnowledgeVerification, verifyKnowledgeVerificationToken } from './_lib/knowledgeToken'
import { buildTeachReply, buildStudyReply, buildSavedReply, buildQuizResultMessage, buildExamResultMessage } from './_lib/characterDialogue'
import { KNOWLEDGE_SAVE_EXP, QUIZ_CORRECT_EXP, EXAM_PASS_EXP, EXAM_PASS_THRESHOLD, levelForExp } from './_lib/characterGrowth'
import { getQuestionsForProfession, getQuestionById } from './_lib/examQuestions'

const COMPANION_TYPES = new Set(['nuri', 'duri'])
// PR #43's first two supported professions. Extending this later (e.g. a
// third job) is a one-line change here — a plain nullable column, not a
// separate table, so no migration is needed either.
const PROFESSIONS = new Set(['accountant', 'singer'])
const PROFESSION_LABEL: Record<string, string> = { accountant: '회계사', singer: '가수' }

const MAX_TITLE_LENGTH = 100
const MAX_CONTENT_LENGTH = 2000
const DEFAULT_LIST_LIMIT = 20
const MAX_LIST_LIMIT = 50
// 대화 기록(character_messages)은 학습 기록보다 훨씬 자주 쌓이는
// 데이터라 기본/최대 조회 개수를 더 넉넉하게 둔다.
const DEFAULT_MESSAGES_LIMIT = 50
const MAX_MESSAGES_LIMIT = 200

const DAILY_TEACH_LIMIT_REACHED_MESSAGE = `오늘의 지식 검증 요청 ${DAILY_TEACH_LIMIT}회를 모두 사용했습니다. 내일 다시 이용할 수 있습니다.`
const DAILY_STUDY_LIMIT_REACHED_MESSAGE = `오늘의 스스로 공부하기 요청 ${DAILY_STUDY_LIMIT}회를 모두 사용했습니다. 내일 다시 이용할 수 있습니다.`
// study-generate가 중복 생성을 피하려고 Gemini에 보내는 "이미 아는 제목"
// 목록의 최대 길이 — 프롬프트 크기(=비용)를 제한하면서도 최근에 배운
// 것 위주로 충분히 참고할 수 있는 수.
const SELF_STUDY_KNOWN_TITLES_LIMIT = 20

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
    if (action === 'messages') {
      await handleListMessages(req, res, session.sub)
      return
    }
    if (action === 'quiz') {
      await handleGetQuiz(req, res, session.sub)
      return
    }
    if (action === 'exam') {
      await handleGetExam(req, res, session.sub)
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
    if (action === 'study-generate') {
      await handleGenerateStudy(req, res, session.sub)
      return
    }
    if (action === 'quiz-submit') {
      await handleSubmitQuiz(req, res, session.sub)
      return
    }
    if (action === 'exam-submit') {
      await handleSubmitExam(req, res, session.sub)
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
    SELECT id, user_id, companion_type, stage, profession, level, exp, created_at
    FROM characters
    WHERE user_id = ${userId} AND companion_type = ${companionType}
  `
  return result.rows[0] ?? null
}

async function handleGet(res: VercelResponse, userId: number) {
  try {
    await ensureCharacterTables()

    const result = await sql<CharacterRow>`
      SELECT id, user_id, companion_type, stage, profession, level, exp, created_at
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
      RETURNING id, user_id, companion_type, stage, profession, level, exp, created_at
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
      RETURNING id, user_id, companion_type, stage, profession, level, exp, created_at
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

export interface ExpGainResult {
  exp: number
  oldLevel: number
  newLevel: number
  leveledUp: boolean
}

// PR #45 checkpoint 4: the single place that ever changes characters.exp —
// every XP-granting action (knowledge save, quiz, exam) routes through
// this. `oldLevel` is passed in by the caller (already has the character
// row from findOwnCharacter, fetched *before* this gain) rather than
// re-queried here, so the before/after comparison is exact. exp and level
// are both scoped by `user_id = ${userId} AND id = ${characterId}` — same
// ownership guarantee as every other write in this file.
async function applyExpGain(userId: number, characterId: number, oldLevel: number, delta: number): Promise<ExpGainResult> {
  const updated = await sql<{ exp: number }>`
    UPDATE characters
    SET exp = exp + ${delta}
    WHERE id = ${characterId} AND user_id = ${userId}
    RETURNING exp
  `
  const exp = updated.rows[0]?.exp ?? 0
  const newLevel = levelForExp(exp)
  if (newLevel !== oldLevel) {
    await sql`UPDATE characters SET level = ${newLevel} WHERE id = ${characterId} AND user_id = ${userId}`
  }
  return { exp, oldLevel, newLevel, leveledUp: newLevel > oldLevel }
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

    // Signed server-side, over the exact (user, character, title, content)
    // just graded — save-knowledge below requires this token instead of
    // trusting a client-resent verification object, so neither the status
    // nor the content can be altered between verifying and saving.
    const verificationToken = signKnowledgeVerification({
      userId,
      characterId: character.id,
      companionType: companionType as string,
      title: title.trim(),
      content: content.trim(),
      status: verification.status,
      explanation: verification.explanation,
      relevance: verification.relevance,
      issues: verification.issues,
      suggestion: verification.suggestion,
      source: 'user_taught',
    })

    // PR #45 checkpoint 3.6: this exchange is persisted to character_messages
    // *regardless* of verification.status — a needs_revision/unverifiable
    // attempt never becomes a character_knowledge_entries row (see
    // handleSaveKnowledge), but it still happened in the conversation and
    // must survive a refresh. The character's reply text is built here
    // (server-side), not trusted from the client, so what's persisted is
    // exactly what the server actually decided to say.
    const characterReply = buildTeachReply(verification)
    try {
      await ensureCharacterMessagesTable()
      await sql`
        INSERT INTO character_messages (user_id, character_id, speaker, source, content, verification_status, knowledge_entry_id)
        VALUES (${userId}, ${character.id}, 'user', 'user_taught', ${`${title.trim()}\n${content.trim()}`}, ${null}, ${null})
      `
      await sql`
        INSERT INTO character_messages (user_id, character_id, speaker, source, content, verification_status, knowledge_entry_id)
        VALUES (${userId}, ${character.id}, 'character', 'user_taught', ${characterReply}, ${verification.status}, ${null})
      `
    } catch (err) {
      // The verification result itself is real and already cost a Gemini
      // call, but if we can't persist the exchange we must not claim it
      // succeeded (요청 조건 8) — refund the reservation (same accounting
      // as a failed Gemini call above) and fail cleanly instead of
      // returning a result the client would show but that won't survive a
      // refresh.
      console.error('[api/character] failed to persist character_messages for verify-knowledge', err)
      await refundTeach(userId)
      res.status(500).json({ error: '대화를 저장하는 중 오류가 발생했어요.' })
      return
    }

    res.status(200).json({
      verification,
      verificationToken,
      characterReply,
      remaining: reserved.remaining,
      dailyTeachLimit: DAILY_TEACH_LIMIT,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on verify-knowledge', err)
    res.status(500).json({ error: '지식을 검증하는 중 오류가 발생했어요.' })
  }
}

// "스스로 공부하기" — 사용자가 아무것도 입력하지 않아도, 캐릭터가 자기
// 직업과 관련된 새 지식 1개를 스스로 만들고 스스로 평가한다(Gemini 호출
// 1회, generateSelfStudy). 결과는 handleVerifyKnowledge와 완전히 동일한
// 모양의 verification + 서명 토큰으로 내려가므로, 저장은 기존
// save-knowledge 액션을 그대로 재사용한다 — 새 저장 경로를 만들지 않는다.
async function handleGenerateStudy(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType } = (req.body ?? {}) as { companionType?: unknown }

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

    // 지식 검증(하루 10회)과 완전히 별도인 한도 — 이 호출이 Gemini에
    // 닿기 전에 먼저 예약하므로, 한도 초과 요청은 비용이 전혀 들지
    // 않는다.
    const reserved = await reserveStudy(userId)
    if (!reserved.ok) {
      res.status(429).json({
        error: DAILY_STUDY_LIMIT_REACHED_MESSAGE,
        remaining: 0,
        dailyStudyLimit: DAILY_STUDY_LIMIT,
      })
      return
    }

    const knownTitlesResult = await sql<{ title: string }>`
      SELECT title FROM character_knowledge_entries
      WHERE character_id = ${character.id} AND user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${SELF_STUDY_KNOWN_TITLES_LIMIT}
    `

    let study
    try {
      study = await generateSelfStudy(
        PROFESSION_LABEL[character.profession],
        knownTitlesResult.rows.map((r) => r.title),
      )
    } catch (err) {
      // 생성 자체가 실패했거나(설정/타임아웃/네트워크/비2xx) 응답을 해석할
      // 수 없었던 경우(SelfStudyParseError) — 둘 다 쓸 수 있는 결과가
      // 없으므로 오늘 한도에서 제외한다. handleVerifyKnowledge와 같은
      // 회계 원칙.
      await refundStudy(userId)
      const { status, message } = resolveGeminiFailureMessage(err)
      res.status(status).json({ error: message })
      return
    }

    const verificationToken = signKnowledgeVerification({
      userId,
      characterId: character.id,
      companionType: companionType as string,
      title: study.title,
      content: study.content,
      status: study.status,
      explanation: study.explanation,
      relevance: study.relevance,
      issues: study.issues,
      suggestion: study.suggestion,
      source: 'ai_generated',
    })

    // PR #45 checkpoint 3.6: only one line here (no "user" line — the user
    // didn't type anything, the character generated this on its own), but
    // the same rule applies: persisted regardless of status, refunded on
    // log failure so a result the client can't later reload is never
    // presented as if it happened.
    const characterReply = buildStudyReply(study.title, study)
    try {
      await ensureCharacterMessagesTable()
      await sql`
        INSERT INTO character_messages (user_id, character_id, speaker, source, content, verification_status, knowledge_entry_id)
        VALUES (${userId}, ${character.id}, 'character', 'ai_generated', ${characterReply}, ${study.status}, ${null})
      `
    } catch (err) {
      console.error('[api/character] failed to persist character_messages for study-generate', err)
      await refundStudy(userId)
      res.status(500).json({ error: '대화를 저장하는 중 오류가 발생했어요.' })
      return
    }

    res.status(200).json({
      knowledge: { title: study.title, content: study.content },
      verification: {
        status: study.status,
        explanation: study.explanation,
        relevance: study.relevance,
        issues: study.issues,
        suggestion: study.suggestion,
      },
      verificationToken,
      characterReply,
      remaining: reserved.remaining,
      dailyStudyLimit: DAILY_STUDY_LIMIT,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on study-generate', err)
    res.status(500).json({ error: '스스로 공부하기 중 오류가 발생했어요.' })
  }
}

// Persists a knowledge entry the user has reviewed and confirmed. Only
// ever inserts a row when a *signed* verification token (minted by
// handleVerifyKnowledge above, over the exact user/character/title/content
// it graded) says 'appropriate' — a client can no longer save a
// 'needs_revision'/'unverifiable' result, or any result at all, by simply
// sending a different status or editing the content after verifying,
// because the token's signature only matches the content it was issued
// for. This replaces the earlier design, which trusted a client-resent
// verification object; see PR #44's follow-up fix for the reasoning.
async function handleSaveKnowledge(req: VercelRequest, res: VercelResponse, userId: number) {
  const body = (req.body ?? {}) as {
    companionType?: unknown
    title?: unknown
    originalContent?: unknown
    finalContent?: unknown
    verificationToken?: unknown
    requestId?: unknown
  }
  const { companionType, title, originalContent, finalContent, verificationToken } = body
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
  // confirmed, including if that's the unedited original. Either way, both
  // must match the verification token's bound content exactly (checked
  // below) — this endpoint never saves text Gemini hasn't actually graded.
  if (typeof finalContent !== 'string' || !finalContent.trim() || finalContent.trim().length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `저장할 지식 내용을 ${MAX_CONTENT_LENGTH}자 이내로 입력해주세요.` })
    return
  }

  const tokenPayload = verifyKnowledgeVerificationToken(verificationToken)
  if (!tokenPayload) {
    res.status(400).json({ error: '검증 결과가 만료되었거나 올바르지 않아요. 다시 검증해주세요.' })
    return
  }
  if (tokenPayload.status !== 'appropriate') {
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

    // The core fix: the token must have been issued for this exact user,
    // character, title and content. Any mismatch — a tampered status, a
    // token replayed against another character, or content edited after
    // verifying — fails here rather than silently saving something Gemini
    // never actually graded.
    if (
      tokenPayload.userId !== userId ||
      tokenPayload.characterId !== character.id ||
      tokenPayload.companionType !== companionType ||
      tokenPayload.title !== title.trim() ||
      tokenPayload.content !== originalContent.trim() ||
      tokenPayload.content !== finalContent.trim()
    ) {
      res.status(400).json({ error: '검증 당시의 내용과 달라요. 내용을 바꾼 뒤에는 다시 검증해주세요.' })
      return
    }

    // Idempotency: if this exact save was already processed (double-click,
    // a retried request), return the existing row instead of inserting a
    // duplicate — same two-step "look for a prior match, else insert"
    // shape as findReplay in api/conversations/[id].ts.
    if (requestId) {
      const existing = await sql<KnowledgeEntryRow>`
        SELECT id, user_id, character_id, profession, title, original_content, final_content, verification_status, verification_explanation, source, created_at
        FROM character_knowledge_entries
        WHERE character_id = ${character.id} AND client_request_id = ${requestId}
      `
      if (existing.rows[0]) {
        // A repeat of an already-processed save — XP was already granted
        // the first time (that INSERT only ever happens once per
        // requestId), so this response reports the character's *current*
        // level/exp without granting anything again or re-announcing a
        // level-up that already happened.
        res.status(200).json({
          entry: existing.rows[0],
          savedReply: buildSavedReply(existing.rows[0].source, false, character.level),
          expAwarded: 0,
          exp: character.exp,
          level: character.level,
          leveledUp: false,
        })
        return
      }
    }

    const explanationParts = [
      tokenPayload.explanation ? `설명: ${tokenPayload.explanation}` : null,
      tokenPayload.relevance ? `관련성: ${tokenPayload.relevance}` : null,
      tokenPayload.issues ? `문제점: ${tokenPayload.issues}` : null,
      tokenPayload.suggestion ? `제안: ${tokenPayload.suggestion}` : null,
    ].filter((p): p is string => typeof p === 'string')
    const verificationExplanation = explanationParts.join('\n') || '적합'

    const inserted = await sql<KnowledgeEntryRow>`
      INSERT INTO character_knowledge_entries
        (user_id, character_id, profession, title, original_content, final_content, verification_status, verification_explanation, client_request_id, source)
      VALUES
        (${userId}, ${character.id}, ${character.profession}, ${title.trim()}, ${originalContent.trim()}, ${finalContent.trim()}, 'appropriate', ${verificationExplanation}, ${requestId}, ${tokenPayload.source})
      RETURNING id, user_id, character_id, profession, title, original_content, final_content, verification_status, verification_explanation, source, created_at
    `
    const entry = inserted.rows[0]

    // PR #45 checkpoint 4: XP for a verified knowledge save — granted
    // exactly once per entry, because this line only runs on the genuine
    // INSERT path above (the idempotent-replay branch for a repeated
    // requestId already returned earlier, before ever reaching here). No
    // separate dedup table needed: the existing client_request_id unique
    // index is what makes the INSERT above itself happen at most once.
    const expResult = await applyExpGain(userId, character.id, character.level, KNOWLEDGE_SAVE_EXP)

    // PR #45 checkpoint 3.6: unlike verify-knowledge/study-generate, the
    // knowledge entry above is the thing that matters and it has already
    // committed successfully — a client must never be told "저장 실패"
    // for something that genuinely saved. So this log line is best-effort:
    // on failure, log server-side and still return 201 with the real
    // entry, rather than failing (or refunding anything) for a save that
    // actually worked.
    const savedReply = buildSavedReply(tokenPayload.source, expResult.leveledUp, expResult.newLevel)
    try {
      await ensureCharacterMessagesTable()
      await sql`
        INSERT INTO character_messages (user_id, character_id, speaker, source, content, verification_status, knowledge_entry_id)
        VALUES (${userId}, ${character.id}, 'character', ${tokenPayload.source}, ${savedReply}, 'appropriate', ${entry.id})
      `
    } catch (err) {
      console.error('[api/character] failed to persist character_messages for save-knowledge (entry already saved)', err)
    }

    res.status(201).json({
      entry,
      savedReply,
      expAwarded: KNOWLEDGE_SAVE_EXP,
      exp: expResult.exp,
      level: expResult.newLevel,
      leveledUp: expResult.leveledUp,
    })
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
        SELECT id, user_id, character_id, profession, title, original_content, final_content, verification_status, verification_explanation, source, created_at
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

// PR #45 checkpoint 3.6: returns one character's full conversation log
// (가르치기/스스로 공부하기 교환 전부, needs_revision/unverifiable 포함),
// oldest first so the client can render it top-to-bottom like a chat —
// unlike handleListKnowledge, this is *not* restricted to 'appropriate'
// results, because it's a conversation record, not the knowledge base.
// Scoped identically to handleListKnowledge: character_id AND user_id,
// via findOwnCharacter, so a companionType naming another user's
// character matches nothing (404).
async function handleListMessages(req: VercelRequest, res: VercelResponse, userId: number) {
  const companionType = req.query.companionType
  const rawLimit = Number(req.query.limit)
  const rawOffset = Number(req.query.offset)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), MAX_MESSAGES_LIMIT) : DEFAULT_MESSAGES_LIMIT
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0

  try {
    await ensureCharacterTables()
    await ensureCharacterMessagesTable()

    const character = await findOwnCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }

    const [messages, countResult] = await Promise.all([
      sql<CharacterMessageRow>`
        SELECT id, user_id, character_id, speaker, source, content, verification_status, knowledge_entry_id, created_at
        FROM character_messages
        WHERE character_id = ${character.id} AND user_id = ${userId}
        ORDER BY created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM character_messages
        WHERE character_id = ${character.id} AND user_id = ${userId}
      `,
    ])

    res.status(200).json({ messages: messages.rows, total: countResult.rows[0].count })
  } catch (err) {
    console.error('[api/character] unexpected error on list messages', err)
    res.status(500).json({ error: '대화 기록을 불러오는 중 오류가 발생했어요.' })
  }
}

// PR #45 checkpoint 4: returns one random quiz question for the
// character's profession, with the answer stripped — grading always
// happens in handleSubmitQuiz, never on the client (요청 조건 4).
async function handleGetQuiz(req: VercelRequest, res: VercelResponse, userId: number) {
  const companionType = req.query.companionType

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

    const questions = getQuestionsForProfession(character.profession)
    const question = questions[Math.floor(Math.random() * questions.length)]
    res.status(200).json({ question: { id: question.id, text: question.text, choices: question.choices } })
  } catch (err) {
    console.error('[api/character] unexpected error on quiz', err)
    res.status(500).json({ error: '퀴즈를 불러오는 중 오류가 발생했어요.' })
  }
}

// PR #45 checkpoint 4: grades a single quiz question server-side against
// api/_lib/examQuestions.ts's answer key (the client only ever sends an
// answerIndex, never a claimed "correct" flag). XP (+5) is granted only
// the *first* time this character answers this specific question_id
// correctly — character_quiz_firsts' PRIMARY KEY is the atomic guard
// (INSERT ... ON CONFLICT DO NOTHING) that makes repeated submissions,
// retries, or refreshes unable to grant XP more than once per question
// (요청 조건 3). Every attempt (first or not, correct or not) is still
// logged to character_exam_attempts for history.
async function handleSubmitQuiz(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType, questionId, answerIndex } = (req.body ?? {}) as {
    companionType?: unknown
    questionId?: unknown
    answerIndex?: unknown
  }

  if (typeof questionId !== 'string' || !questionId) {
    res.status(400).json({ error: '잘못된 문제예요.' })
    return
  }
  if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) || answerIndex < 0) {
    res.status(400).json({ error: '답을 선택해주세요.' })
    return
  }

  try {
    await ensureCharacterTables()
    await ensureGrowthTables()
    await ensureCharacterMessagesTable()

    const character = await findOwnCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }
    if (!character.profession) {
      res.status(400).json({ error: '먼저 직업을 선택해주세요.' })
      return
    }

    const question = getQuestionById(questionId)
    if (!question || question.profession !== character.profession) {
      res.status(400).json({ error: '이 캐릭터의 직업과 맞지 않는 문제예요.' })
      return
    }

    const correct = answerIndex === question.correctIndex

    let expAwarded = 0
    if (correct) {
      const firstTime = await sql<{ character_id: number }>`
        INSERT INTO character_quiz_firsts (character_id, question_id)
        VALUES (${character.id}, ${questionId})
        ON CONFLICT DO NOTHING
        RETURNING character_id
      `
      if (firstTime.rows[0]) {
        expAwarded = QUIZ_CORRECT_EXP
      }
    }

    const expResult =
      expAwarded > 0
        ? await applyExpGain(userId, character.id, character.level, expAwarded)
        : { exp: character.exp, oldLevel: character.level, newLevel: character.level, leveledUp: false }

    await sql`
      INSERT INTO character_exam_attempts (user_id, character_id, kind, profession, question_id, score, passed, exp_awarded)
      VALUES (${userId}, ${character.id}, 'quiz', ${character.profession}, ${questionId}, ${null}, ${correct}, ${expAwarded})
    `

    const message = buildQuizResultMessage(correct, question.explanation, expAwarded, expResult.leveledUp, expResult.newLevel)

    res.status(200).json({
      correct,
      explanation: question.explanation,
      expAwarded,
      exp: expResult.exp,
      level: expResult.newLevel,
      leveledUp: expResult.leveledUp,
      message,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on quiz-submit', err)
    res.status(500).json({ error: '퀴즈 채점 중 오류가 발생했어요.' })
  }
}

// PR #45 checkpoint 4: returns every question for the character's
// profession (3~5문항, no answers) plus whether this character has
// already passed this profession's exam before (so the UI can show that
// without a separate history endpoint).
async function handleGetExam(req: VercelRequest, res: VercelResponse, userId: number) {
  const companionType = req.query.companionType

  try {
    await ensureCharacterTables()
    await ensureGrowthTables()

    const character = await findOwnCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }
    if (!character.profession) {
      res.status(400).json({ error: '먼저 직업을 선택해주세요.' })
      return
    }

    const questions = getQuestionsForProfession(character.profession)
    const alreadyPassed = await sql<{ character_id: number }>`
      SELECT character_id FROM character_exam_firsts
      WHERE character_id = ${character.id} AND profession = ${character.profession}
    `

    res.status(200).json({
      questions: questions.map((q) => ({ id: q.id, text: q.text, choices: q.choices })),
      alreadyPassed: alreadyPassed.rows.length > 0,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on exam', err)
    res.status(500).json({ error: '시험 문제를 불러오는 중 오류가 발생했어요.' })
  }
}

// PR #45 checkpoint 4: grades the full exam server-side. Requires an
// answer for *every* question in the character's profession bank (no
// partial submissions) — score = fraction correct, passed if it meets
// EXAM_PASS_THRESHOLD. +50XP only on this character's *first* pass of
// this profession's exam, guarded the same atomic way as quizzes
// (character_exam_firsts' PRIMARY KEY + ON CONFLICT DO NOTHING) — retries,
// refreshes, or repeated submissions after already passing can never grant
// it again (요청 조건 3).
async function handleSubmitExam(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType, answers } = (req.body ?? {}) as {
    companionType?: unknown
    answers?: unknown
  }

  if (!Array.isArray(answers)) {
    res.status(400).json({ error: '답안을 제출해주세요.' })
    return
  }

  try {
    await ensureCharacterTables()
    await ensureGrowthTables()

    const character = await findOwnCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }
    if (!character.profession) {
      res.status(400).json({ error: '먼저 직업을 선택해주세요.' })
      return
    }

    const questions = getQuestionsForProfession(character.profession)
    const answerMap = new Map<string, number>()
    for (const a of answers) {
      if (
        a &&
        typeof a === 'object' &&
        typeof (a as { questionId?: unknown }).questionId === 'string' &&
        typeof (a as { answerIndex?: unknown }).answerIndex === 'number'
      ) {
        answerMap.set((a as { questionId: string }).questionId, (a as { answerIndex: number }).answerIndex)
      }
    }
    const allAnswered = questions.every((q) => answerMap.has(q.id))
    if (!allAnswered || answerMap.size !== questions.length) {
      res.status(400).json({ error: '모든 문항에 답해주세요.' })
      return
    }

    const results = questions.map((q) => ({ questionId: q.id, correct: answerMap.get(q.id) === q.correctIndex }))
    const score = results.filter((r) => r.correct).length
    const total = questions.length
    const passed = score / total >= EXAM_PASS_THRESHOLD

    let expAwarded = 0
    if (passed) {
      const firstTime = await sql<{ character_id: number }>`
        INSERT INTO character_exam_firsts (character_id, profession)
        VALUES (${character.id}, ${character.profession})
        ON CONFLICT DO NOTHING
        RETURNING character_id
      `
      if (firstTime.rows[0]) {
        expAwarded = EXAM_PASS_EXP
      }
    }

    const expResult =
      expAwarded > 0
        ? await applyExpGain(userId, character.id, character.level, expAwarded)
        : { exp: character.exp, oldLevel: character.level, newLevel: character.level, leveledUp: false }

    await sql`
      INSERT INTO character_exam_attempts (user_id, character_id, kind, profession, question_id, score, passed, exp_awarded)
      VALUES (${userId}, ${character.id}, 'exam', ${character.profession}, ${null}, ${score}, ${passed}, ${expAwarded})
    `

    const message = buildExamResultMessage(passed, score, total, expAwarded, expResult.leveledUp, expResult.newLevel)

    res.status(200).json({
      passed,
      score,
      total,
      results,
      expAwarded,
      exp: expResult.exp,
      level: expResult.newLevel,
      leveledUp: expResult.leveledUp,
      message,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on exam-submit', err)
    res.status(500).json({ error: '시험 채점 중 오류가 발생했어요.' })
  }
}
