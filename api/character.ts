import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  ensureCharacterTables,
  ensureKnowledgeTable,
  ensureCharacterMessagesTable,
  ensureGrowthTables,
  ensurePersonalKnowledgeLogTables,
  sql,
  type CharacterRow,
  type KnowledgeEntryRow,
  type CharacterMessageRow,
  type PersonalKnowledgeLogRow,
  type PersonalKnowledgeLogAttachmentRow,
} from './_lib/db'
import { getSessionUser } from './_lib/auth'
import {
  GeminiApiError,
  GeminiConfigError,
  verifyKnowledge,
  generateSelfStudyBatch,
  generateObjectiveQuizBatch,
  type KnowledgeVerificationResult,
} from './_lib/gemini'
import { DAILY_TEACH_LIMIT, reserveTeach, refundTeach, peekTeachUsage } from './_lib/knowledgeLimit'
import { DAILY_STUDY_LIMIT, reserveStudy, refundStudy, peekStudyUsage } from './_lib/studyLimit'
import {
  peekTickets,
  consumeAiRecommendTicket,
  refundAiRecommendTicket,
  consumeKnowledgeValidationTicket,
  refundKnowledgeValidationTicket,
  addAiRecommendTickets,
  addKnowledgeValidationTickets,
} from './_lib/ticketLimit'
import { signKnowledgeVerification, verifyKnowledgeVerificationToken } from './_lib/knowledgeToken'
import {
  buildTeachReply,
  buildSavedReply,
  buildQuizResultMessage,
  buildExamResultMessage,
  buildObjectiveQuizResultMessage,
} from './_lib/characterDialogue'
import {
  KNOWLEDGE_SAVE_EXP,
  QUIZ_CORRECT_EXP,
  EXAM_PASS_EXP,
  EXAM_PASS_THRESHOLD,
  levelForExp,
} from './_lib/characterGrowth'
import { getQuestionsForProfession, getQuestionById } from './_lib/examQuestions'
import { signObjectiveQuizToken, verifyObjectiveQuizToken } from './_lib/objectiveQuizToken'
import {
  meetsAgeTier,
  AGE_TIER_LABEL,
  MISSION_TYPES,
  type MissionType,
  ageBlockedMessage,
  ageNumberForTier,
  selfStudyDraftCountForTier,
  objectiveQuizChoiceCountForTier,
} from './_lib/characterAge'
import { effectiveAgeTier, getMissionProgress, maybeEvolveAgeTier } from './_lib/characterMissions'

const COMPANION_TYPES = new Set(['nuri', 'duri'])
// PR #51(직업 선택 제한 해제, 2026-11-01): 처음엔 회계사·가수 2개만
// 목표 직업으로 저장할 수 있었지만, 이제 src/data/characterProfessions.ts
// 의 50개 직업 전체를 저장할 수 있다(api/_lib/db.ts의 CHECK 제약도
// 같이 넓혔다) — 가르치기/스스로 공부하기는 Gemini에 직업명만 문자열로
// 넘기므로 어떤 직업이든 그대로 동작한다.
// PR #65('최종 통합 개발 명령서'): 'custom'은 사용자가 직접 입력한 자유
// 직업(예: "숲해설가")의 sentinel 값 — 기존 50개는 그대로 두고 51번째로
// 추가했다. 이 값으로 저장될 때는 customProfessionLabel도 함께 받아
// characters.custom_profession_label에 저장한다(아래 handlePatch).
const PROFESSIONS = new Set([
  'accountant', 'singer', 'developer', 'designer', 'data-scientist', 'pm',
  'security-engineer', 'devops', 'game-developer', 'qa-engineer', 'lawyer',
  'tax-accountant', 'financial-analyst', 'patent-attorney', 'actuary',
  'consultant', 'realtor', 'doctor', 'nurse', 'pharmacist',
  'physical-therapist', 'dietitian', 'dentist', 'veterinarian', 'psychologist',
  'teacher', 'professor', 'researcher', 'librarian', 'translator', 'tutor',
  'curriculum-developer', 'linguist', 'actor', 'musician', 'writer',
  'illustrator', 'photographer', 'film-director', 'architect',
  'fashion-designer', 'chef', 'barista', 'flight-attendant', 'firefighter',
  'police-officer', 'civil-servant', 'social-worker', 'event-planner',
  'massage-therapist', 'custom',
])
const CUSTOM_PROFESSION_MAX_LENGTH = 30
// PR #65: 지식 카드 10종 분류 — api/_lib/db.ts의 KnowledgeCategory와
// 반드시 같은 값이어야 한다.
const KNOWLEDGE_CATEGORIES = new Set([
  'basic_knowledge', 'expert_info', 'hands_on_experience', 'personal_knowhow',
  'skilled_technique', 'problem_solving_case', 'job_tip', 'failure_lesson',
  'training_experience', 'life_experience',
])
const PROFESSION_LABEL: Record<string, string> = {
  accountant: '회계사',
  singer: '가수',
  developer: '개발자',
  designer: 'UX/UI 디자이너',
  'data-scientist': '데이터 사이언티스트',
  pm: '기획자(PM)',
  'security-engineer': '보안 엔지니어',
  devops: '데브옵스 엔지니어',
  'game-developer': '게임 개발자',
  'qa-engineer': 'QA 엔지니어',
  lawyer: '변호사',
  'tax-accountant': '세무사',
  'financial-analyst': '금융 애널리스트',
  'patent-attorney': '변리사',
  actuary: '보험계리사',
  consultant: '경영 컨설턴트',
  realtor: '공인중개사',
  doctor: '의사',
  nurse: '간호사',
  pharmacist: '약사',
  'physical-therapist': '물리치료사',
  dietitian: '영양사',
  dentist: '치과의사',
  veterinarian: '수의사',
  psychologist: '심리상담사',
  teacher: '교사',
  professor: '교수',
  researcher: '연구원',
  librarian: '사서',
  translator: '번역가',
  tutor: '과외교사',
  'curriculum-developer': '교육 콘텐츠 기획자',
  linguist: '언어학자',
  actor: '배우',
  musician: '연주자',
  writer: '작가',
  illustrator: '일러스트레이터',
  photographer: '사진작가',
  'film-director': '영화감독',
  architect: '건축가',
  'fashion-designer': '패션 디자이너',
  chef: '요리사',
  barista: '바리스타',
  'flight-attendant': '승무원',
  firefighter: '소방관',
  'police-officer': '경찰관',
  'civil-servant': '공무원',
  'social-worker': '사회복지사',
  'event-planner': '이벤트 기획자',
  'massage-therapist': '마사지 테라피스트',
  custom: '사용자 지정 직업',
}
// PR #65: profession='custom'일 때는 PROFESSION_LABEL 대신 캐릭터가 그때
// 입력한 실제 직업명(custom_profession_label)을 Gemini 프롬프트/표시에
// 쓴다 — verify-knowledge/study-generate 두 곳 모두 이 함수를 거친다.
function resolveProfessionLabel(character: CharacterRow): string {
  if (character.profession === 'custom') {
    return character.custom_profession_label ?? PROFESSION_LABEL.custom
  }
  return PROFESSION_LABEL[character.profession ?? ''] ?? character.profession ?? ''
}
// "문제 풀기"(퀴즈/시험)는 사람이 직접 쓴 문제은행(api/_lib/examQuestions.ts)
// 에 묶여 있고, 그건 여전히 회계사·가수 2개뿐이다(법률·헬스케어 등은
// 틀리면 안 되는 영역이라 임의로 대량 생성할 수 없음) — handleGetQuiz
// 등 4개 핸들러가 이 집합으로 가드한다.
const EXAM_SUPPORTED_PROFESSIONS = new Set(['accountant', 'singer'])
const EXAM_NOT_SUPPORTED_MESSAGE = '이 직업은 아직 문제 풀기를 지원하지 않아요. 지금은 회계사·가수만 가능해요.'
// getQuestionsForProfession/getQuestionById는 여전히 'accountant' | 'singer'
// 만 받는다 — 이 가드를 타입 내로잉으로도 써서, 아래 4개 핸들러가 더 넓은
// ProfessionId를 두 값으로 좁힌 다음에만 그 함수들을 호출하게 한다.
function isExamSupportedProfession(profession: string): profession is 'accountant' | 'singer' {
  return EXAM_SUPPORTED_PROFESSIONS.has(profession)
}

const MAX_TITLE_LENGTH = 100
const MAX_CONTENT_LENGTH = 2000
const DEFAULT_LIST_LIMIT = 20
const MAX_LIST_LIMIT = 50
// 대화 기록(character_messages)은 학습 기록보다 훨씬 자주 쌓이는
// 데이터라 기본/최대 조회 개수를 더 넉넉하게 둔다.
const DEFAULT_MESSAGES_LIMIT = 50
const MAX_MESSAGES_LIMIT = 200

// 지시서(만능마켓 구매 즉시 이용권 실시간 연동): 하루 무료 한도도 다
// 쓰고, 구매한 이용권도 없을 때만 보여준다 — 둘 중 하나라도 남아있으면
// 이 메시지 대신 그걸로 계속 진행된다.
const NO_AI_RECOMMEND_TICKETS_MESSAGE =
  '오늘의 무료 횟수를 모두 사용했고, 구매한 이용권도 없습니다. 만능마켓에서 구매 후 이용해 주세요.'
const NO_KNOWLEDGE_VALIDATION_TICKETS_MESSAGE =
  '오늘의 무료 검증 횟수를 모두 사용했고, 구매한 이용권도 없습니다. 만능마켓에서 구매 후 이용해 주세요.'
// study-generate가 중복 생성을 피하려고 Gemini에 보내는 "이미 아는 제목"
// 목록의 최대 길이 — 프롬프트 크기(=비용)를 제한하면서도 최근에 배운
// 것 위주로 충분히 참고할 수 있는 수.
const SELF_STUDY_KNOWN_TITLES_LIMIT = 20

// PR #65: 집중력 게이지(characters.focus_percent)의 1차 최소 반영 —
// "교육·장비" 단계 자체는 PR #66에서 다루므로, 지금은 실제로 지식을
// 완성 저장했는지(성공=집중력 소폭 상승)와 검증에서 막혔는지(수정
// 필요·검증 불가=집중력 소폭 하락)만으로 가감한다. 증감 폭을 작게 둔
// 이유는 한 번의 성공/실패가 게이지를 급격히 흔들지 않게 하기 위해서다.
const FOCUS_UP_ON_SAVE = 2
const FOCUS_DOWN_ON_STRUGGLE = 2

// 0~100 범위를 SQL 레벨에서 직접 클램프한다(동시 요청에도 범위를
// 벗어나지 않는 원자적 UPDATE) — characters.focus_percent의 CHECK 제약과
// 같은 경계.
async function adjustFocusPercent(userId: number, characterId: number, delta: number): Promise<number> {
  const updated = await sql<{ focus_percent: number }>`
    UPDATE characters
    SET focus_percent = LEAST(100, GREATEST(0, focus_percent + ${delta}))
    WHERE id = ${characterId} AND user_id = ${userId}
    RETURNING focus_percent
  `
  return updated.rows[0]?.focus_percent ?? 90
}

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
    if (action === 'objective-quiz') {
      await handleGetObjectiveQuiz(req, res, session.sub)
      return
    }
    if (action === 'exam') {
      await handleGetExam(req, res, session.sub)
      return
    }
    if (action === 'usage') {
      await handleGetUsage(res, session.sub)
      return
    }
    if (action === 'missions') {
      await handleGetMissions(req, res, session.sub)
      return
    }
    // 지시서(실제 업무·연구·비법·노하우 기록 시스템): "지식 기록장" —
    // AI 캐릭터(누리/두리)와 전혀 무관한, 유저 본인의 개인 기록이다.
    // 새 서버리스 함수 파일을 만들 수 없는 Vercel Hobby 12개 함수
    // 한도 때문에 이 파일에 얹었을 뿐, companionType/character와는
    // 아무 관계가 없다(아래 handleListKnowledgeLog 등 참고).
    if (action === 'knowledge-log') {
      await handleListKnowledgeLog(req, res, session.sub)
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
    if (action === 'complete-card-game') {
      await handleCompleteCardGame(req, res, session.sub)
      return
    }
    if (action === 'quiz-submit') {
      await handleSubmitQuiz(req, res, session.sub)
      return
    }
    if (action === 'objective-quiz-submit') {
      await handleSubmitObjectiveQuiz(req, res, session.sub)
      return
    }
    if (action === 'exam-submit') {
      await handleSubmitExam(req, res, session.sub)
      return
    }
    if (action === 'purchase-ai-recommend-ticket') {
      await handlePurchaseAiRecommendTicket(res, session.sub)
      return
    }
    if (action === 'purchase-knowledge-validation-ticket') {
      await handlePurchaseKnowledgeValidationTicket(res, session.sub)
      return
    }
    if (action === 'knowledge-log-save') {
      await handleSaveKnowledgeLog(req, res, session.sub)
      return
    }
    if (action === 'knowledge-log-delete') {
      await handleDeleteKnowledgeLog(req, res, session.sub)
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
    SELECT id, user_id, companion_type, stage, profession, custom_profession_label, level, exp, mission_unlocked_tier, focus_percent, created_at
    FROM characters
    WHERE user_id = ${userId} AND companion_type = ${companionType}
  `
  return result.rows[0] ?? null
}

// PR #63: 캐릭터 행을 JSON으로 내보낼 때마다 effectiveAgeTier를 함께
// 계산해 age_tier 필드로 얹는다 — 프런트가 더 이상 character.level로
// 연령대를 직접 계산하지 않고(그러면 미션 게이트로 고정된 상태를 다시
// 레벨로 무시해버리게 된다) 이 값을 그대로 쓰게 하기 위해서다.
function toCharacterJson(row: CharacterRow) {
  return { ...row, age_tier: effectiveAgeTier(row) }
}

async function handleGet(res: VercelResponse, userId: number) {
  try {
    await ensureCharacterTables()

    const result = await sql<CharacterRow>`
      SELECT id, user_id, companion_type, stage, profession, custom_profession_label, level, exp, mission_unlocked_tier, focus_percent, created_at
      FROM characters
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `
    res.status(200).json({ characters: result.rows.map(toCharacterJson) })
  } catch (err) {
    console.error('[api/character] unexpected error on GET', err)
    res.status(500).json({ error: '캐릭터 정보를 불러오는 중 오류가 발생했어요.' })
  }
}

// PR #63: 지금 캐릭터의 연령대 미션 진행상황(카드 6개 UI용) — 소비 없는
// 순수 조회라 몇 번을 열어봐도 아무것도 바뀌지 않는다(peekTeachUsage와
// 같은 원칙).
async function handleGetMissions(req: VercelRequest, res: VercelResponse, userId: number) {
  const companionType = req.query.companionType

  try {
    await ensureCharacterTables()
    await ensureKnowledgeTable()

    const character = await findOwnCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }

    const progress = await getMissionProgress(userId, character.id, effectiveAgeTier(character))
    res.status(200).json({ missionProgress: progress })
  } catch (err) {
    console.error('[api/character] unexpected error on missions', err)
    res.status(500).json({ error: '성장 미션 정보를 불러오는 중 오류가 발생했어요.' })
  }
}

// PR #49: 메인 화면 상단 "행동력" HUD용 — 오늘 남은 가르치기/스스로
// 공부하기 횟수를 소비 없이 조회만 한다(peekTeachUsage/peekStudyUsage는
// 순수 SELECT). 새 테이블/스키마 변경 없음, 기존 reserveTeach/
// reserveStudy 로직은 전혀 건드리지 않았다. 지시서(AI 추천(예시
// 만들기) 개수에 대한 명확한 지시)에 따라 이 하루 클릭 한도는 다시
// 모든 연령대에 똑같은 플랫한 3이다 — 연령대별로 달라지는 건 클릭
// 1번이 만들어내는 예시 개수(study-generate 응답의 exampleCount)뿐.
async function handleGetUsage(res: VercelResponse, userId: number) {
  try {
    const [teach, study, tickets] = await Promise.all([peekTeachUsage(userId), peekStudyUsage(userId), peekTickets(userId)])
    res.status(200).json({
      teachRemaining: teach.remaining,
      teachLimit: DAILY_TEACH_LIMIT,
      studyRemaining: study.remaining,
      studyLimit: DAILY_STUDY_LIMIT,
      aiRecommendTickets: tickets.aiRecommendTickets,
      knowledgeValidationTickets: tickets.knowledgeValidationTickets,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on GET usage', err)
    res.status(500).json({ error: '오늘의 행동력 정보를 불러오는 중 오류가 발생했어요.' })
  }
}

// 지시서(만능마켓 구매 즉시 이용권 실시간 연동): 만능마켓에서 "AI 추천
// 충전권"/"지식 검증 충전권"을 구매했을 때 호출한다 — 클라이언트가
// 보낸 수량은 신뢰하지 않고 항상 1을 더한다(exampleDraftsLimit.ts의
// purchase 액션과 같은 방어 원칙). 응답에 양쪽 이용권 수량을 함께
// 돌려줘서, 호출부가 새로고침이나 별도 재조회 없이 바로 최신 값으로
// 상태를 맞출 수 있게 한다.
async function handlePurchaseAiRecommendTicket(res: VercelResponse, userId: number) {
  try {
    const tickets = await addAiRecommendTickets(userId, 1)
    res.status(200).json({
      aiRecommendTickets: tickets.aiRecommendTickets,
      knowledgeValidationTickets: tickets.knowledgeValidationTickets,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on purchase-ai-recommend-ticket', err)
    res.status(500).json({ error: 'AI 추천 충전권을 지급하는 중 오류가 발생했어요.' })
  }
}

async function handlePurchaseKnowledgeValidationTicket(res: VercelResponse, userId: number) {
  try {
    const tickets = await addKnowledgeValidationTickets(userId, 1)
    res.status(200).json({
      aiRecommendTickets: tickets.aiRecommendTickets,
      knowledgeValidationTickets: tickets.knowledgeValidationTickets,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on purchase-knowledge-validation-ticket', err)
    res.status(500).json({ error: '지식 검증 충전권을 지급하는 중 오류가 발생했어요.' })
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
      RETURNING id, user_id, companion_type, stage, profession, custom_profession_label, level, exp, mission_unlocked_tier, focus_percent, created_at
    `
    const character = inserted.rows[0]
    if (!character) {
      res.status(409).json({ error: '이미 만든 캐릭터예요.' })
      return
    }

    res.status(201).json({ character: toCharacterJson(character) })
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
  const { companionType, profession, customProfessionLabel } = (req.body ?? {}) as {
    companionType?: unknown
    profession?: unknown
    customProfessionLabel?: unknown
  }
  if (typeof companionType !== 'string' || !COMPANION_TYPES.has(companionType)) {
    res.status(400).json({ error: '누리 또는 두리 중 하나를 선택해주세요.' })
    return
  }
  if (typeof profession !== 'string' || !PROFESSIONS.has(profession)) {
    res.status(400).json({ error: '직업을 선택해주세요.' })
    return
  }

  // PR #65: profession='custom'일 때만 실제 입력 텍스트가 필요하다 —
  // 그 외 49개 직업에서는 (혹시 보내졌더라도) 항상 NULL로 저장해, 이전에
  // custom으로 저장했던 라벨이 다른 직업으로 바꾼 뒤에도 남아있는 걸
  // 막는다.
  let normalizedCustomLabel: string | null = null
  if (profession === 'custom') {
    if (typeof customProfessionLabel !== 'string' || !customProfessionLabel.trim() || customProfessionLabel.trim().length > CUSTOM_PROFESSION_MAX_LENGTH) {
      res.status(400).json({ error: `직업명을 ${CUSTOM_PROFESSION_MAX_LENGTH}자 이내로 입력해주세요.` })
      return
    }
    normalizedCustomLabel = customProfessionLabel.trim()
  }

  try {
    await ensureCharacterTables()

    const updated = await sql<CharacterRow>`
      UPDATE characters
      SET profession = ${profession}, custom_profession_label = ${normalizedCustomLabel}
      WHERE user_id = ${userId} AND companion_type = ${companionType}
      RETURNING id, user_id, companion_type, stage, profession, custom_profession_label, level, exp, mission_unlocked_tier, focus_percent, created_at
    `
    const character = updated.rows[0]
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }

    res.status(200).json({ character: toCharacterJson(character) })
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
    // 지시서(만능마켓 구매 즉시 이용권 실시간 연동): 하루 무료 한도를 다
    // 썼으면(reserved.ok===false) 곧바로 막지 않고, 구매한 "지식 검증
    // 충전권"이 있는지부터 확인한다 — 있으면 1장 깎아서 이번 한 번은
    // 그대로 진행시킨다. 둘 다 없을 때만 진짜로 차단한다. 어느 쪽을
    // 썼는지(usedTicket)를 기억해둬서, 아래에서 실패 시 정확히 그
    // 카운터만 되돌린다.
    const reserved = await reserveTeach(userId)
    let usedTicket = false
    let ticketsRemaining = 0
    if (!reserved.ok) {
      const ticket = await consumeKnowledgeValidationTicket(userId)
      if (!ticket.ok) {
        res.status(429).json({
          error: NO_KNOWLEDGE_VALIDATION_TICKETS_MESSAGE,
          remaining: 0,
          dailyTeachLimit: DAILY_TEACH_LIMIT,
          knowledgeValidationTickets: 0,
        })
        return
      }
      usedTicket = true
      ticketsRemaining = ticket.remaining
    }
    const refundReservation = () => (usedTicket ? refundKnowledgeValidationTicket(userId) : refundTeach(userId))

    let verification: KnowledgeVerificationResult
    try {
      verification = await verifyKnowledge(resolveProfessionLabel(character), title.trim(), content.trim())
    } catch (err) {
      // The call itself failed (config/timeout/network/non-2xx) — nothing
      // usable came back, so this attempt shouldn't count against today's
      // cap. A successful-but-malformed response (handled inside
      // verifyKnowledge itself, returned as a normal 'unverifiable' result
      // rather than thrown) is NOT refunded — see knowledgeLimit.ts.
      await refundReservation()
      const { status, message } = resolveGeminiFailureMessage(err)
      res.status(status).json({ error: message })
      return
    }

    // PR #52: 캐릭터의 "지금" 연령대와, Gemini가 이 지식에 매긴 "필요한
    // 최소 연령대"를 비교한다. 내용 자체는 적합(appropriate)해도 캐릭터가
    // 아직 너무 어리면 저장을 막는다.
    // PR #63: character.level의 순수 파생값이 아니라 effectiveAgeTier를
    // 쓴다 — 레벨은 이미 다음 단계에 닿았어도 6미션 게이트에 아직 막혀
    // 있는 캐릭터라면, 나이 제한도 그 "진짜" 연령대 기준으로 걸려야
    // 일관된다(화면엔 toddler 뱃지인데 teen 수준 지식은 통과하는 모순 방지).
    const characterAgeTier = effectiveAgeTier(character)
    const ageBlocked = verification.status === 'appropriate' && !meetsAgeTier(characterAgeTier, verification.requiredAgeTier)

    // Signed server-side, over the exact (user, character, title, content)
    // just graded — save-knowledge below requires this token instead of
    // trusting a client-resent verification object, so neither the status
    // nor the content can be altered between verifying and saving.
    // requiredAgeTier도 함께 서명해서, handleSaveKnowledge가 저장 시점의
    // 최신 캐릭터 레벨과 다시 비교할 수 있게 한다(토큰을 그대로 재전송해
    // 연령 게이트를 우회할 수 없다).
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
      requiredAgeTier: verification.requiredAgeTier,
    })

    // PR #45 checkpoint 3.6: this exchange is persisted to character_messages
    // *regardless* of verification.status — a needs_revision/unverifiable
    // attempt never becomes a character_knowledge_entries row (see
    // handleSaveKnowledge), but it still happened in the conversation and
    // must survive a refresh. The character's reply text is built here
    // (server-side), not trusted from the client, so what's persisted is
    // exactly what the server actually decided to say.
    // 나이 제한에 막혔으면 기존 buildTeachReply(적합/수정 필요/검증 불가
    // 문구)를 쓰지 않고, 요청하신 아동 말투의 거절 메시지를 보여준다.
    const characterReply = ageBlocked ? ageBlockedMessage(AGE_TIER_LABEL[verification.requiredAgeTier]) : buildTeachReply(verification)

    // PR #65: 수정 필요/검증 불가 — 내용을 다듬어야 했던 시도라 집중력을
    // 소폭 낮춘다(ageBlocked는 내용 자체는 적합 판정이라 제외).
    const focusPercent =
      verification.status !== 'appropriate' ? await adjustFocusPercent(userId, character.id, -FOCUS_DOWN_ON_STRUGGLE) : character.focus_percent

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
      await refundReservation()
      res.status(500).json({ error: '대화를 저장하는 중 오류가 발생했어요.' })
      return
    }

    res.status(200).json({
      verification,
      verificationToken,
      characterReply,
      remaining: usedTicket ? 0 : reserved.remaining,
      knowledgeValidationTickets: usedTicket ? ticketsRemaining : undefined,
      dailyTeachLimit: DAILY_TEACH_LIMIT,
      ageBlocked,
      characterAgeTier,
      requiredAgeTier: verification.requiredAgeTier,
      focusPercent,
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
    // 않는다. 지시서(AI 추천(예시 만들기) 개수에 대한 명확한 지시)에
    // 따라 이 "클릭 1번" 한도는 연령대와 무관하게 플랫한 3회 그대로다
    // — 연령대별로 달라지는 건 이 클릭 1번이 만들어내는 예시 개수뿐.
    // 지시서(만능마켓 구매 즉시 이용권 실시간 연동): handleVerifyKnowledge와
    // 같은 원칙 — 하루 무료 한도를 다 썼으면 구매한 "AI 추천 충전권"이
    // 있는지 확인하고, 있으면 1장 깎아 이번 한 번은 그대로 진행한다.
    const reserved = await reserveStudy(userId)
    let usedTicket = false
    let ticketsRemaining = 0
    if (!reserved.ok) {
      const ticket = await consumeAiRecommendTicket(userId)
      if (!ticket.ok) {
        res.status(429).json({
          error: NO_AI_RECOMMEND_TICKETS_MESSAGE,
          remaining: 0,
          dailyStudyLimit: DAILY_STUDY_LIMIT,
          aiRecommendTickets: 0,
        })
        return
      }
      usedTicket = true
      ticketsRemaining = ticket.remaining
    }
    const refundReservation = () => (usedTicket ? refundAiRecommendTicket(userId) : refundStudy(userId))

    const knownTitlesResult = await sql<{ title: string }>`
      SELECT title FROM character_knowledge_entries
      WHERE character_id = ${character.id} AND user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${SELF_STUDY_KNOWN_TITLES_LIMIT}
    `

    const characterAgeTier = effectiveAgeTier(character)
    // 지시서(AI 추천(예시 만들기) 개수에 대한 명확한 지시): 이 캐릭터의
    // 지금 연령대가 몇 개의 예시를 한 번에 받을지 정한다(characterAge.ts의
    // selfStudyDraftCountForTier) — 1개씩 exampleCount번 호출하지 않고
    // 프롬프트에 "exampleCount개를 한 번에"라고 요청해 Gemini 호출은
    // 여전히 1번만 쓴다(지시서가 명시한 비용 절감 요구).
    const exampleCount = selfStudyDraftCountForTier(characterAgeTier, ageNumberForTier(characterAgeTier, character.level))

    let studies
    try {
      // PR #52 후속: 생성 단계부터 캐릭터의 지금 연령대 눈높이로 만들어
      // 달라고 요청한다 — 사후 판정(ageBlocked)만으로는 "다 만들고 나서
      // 막혀서 하루 한도만 날린다"는 진도 막힘을 못 막는다.
      studies = await generateSelfStudyBatch(
        resolveProfessionLabel(character),
        knownTitlesResult.rows.map((r) => r.title),
        characterAgeTier,
        exampleCount,
      )
    } catch (err) {
      // 생성 자체가 실패했거나(설정/타임아웃/네트워크/비2xx) 응답을 해석할
      // 수 없었던 경우(SelfStudyParseError) — 둘 다 쓸 수 있는 결과가
      // 없으므로 오늘 한도에서 제외한다. handleVerifyKnowledge와 같은
      // 회계 원칙.
      await refundReservation()
      const { status, message } = resolveGeminiFailureMessage(err)
      res.status(status).json({ error: message })
      return
    }

    // PR #52: 스스로 공부하기도 같은 연령 게이트를 적용한다 — 캐릭터가
    // 아직 어린데 스스로 전문 자격증 수준 지식을 만들어 저장하는 건
    // 일관성이 없다고 판단했다(handleVerifyKnowledge와 동일한 로직).
    // 후보마다 requiredAgeTier가 다를 수 있어 각자 따로 판정한다.
    const drafts = studies.map((study) => {
      const ageBlocked = study.status === 'appropriate' && !meetsAgeTier(characterAgeTier, study.requiredAgeTier)
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
        requiredAgeTier: study.requiredAgeTier,
      })
      return {
        knowledge: { title: study.title, content: study.content },
        verification: {
          status: study.status,
          explanation: study.explanation,
          relevance: study.relevance,
          issues: study.issues,
          suggestion: study.suggestion,
        },
        verificationToken,
        ageBlocked,
        requiredAgeTier: study.requiredAgeTier,
      }
    })

    // PR #45 checkpoint 3.6: only one line here (no "user" line — the user
    // didn't type anything yet, the character only generated candidates),
    // but the same rule applies: persisted regardless of status, refunded
    // on log failure so a result the client can't later reload is never
    // presented as if it happened. 후보가 여럿이라 더 이상 특정 제목 하나를
    // 언급하지 않고, "몇 개를 만들었으니 골라보라"는 안내로 통일한다 —
    // 실제로 무엇을 배웠다는 말은 사용자가 그중 하나를 골라 저장했을 때
    // (save-knowledge의 savedReply)에만 한다.
    const characterReply = `예시 ${drafts.length}개를 만들었어요! 마음에 드는 걸 골라보세요. ✨`

    // PR #65: handleVerifyKnowledge와 동일한 집중력 반영 규칙을 배치로
    // 일반화한다 — 후보 중 하나라도 적합(appropriate)하면 평소처럼
    // 집중력을 건드리지 않고, 전부 다 적합하지 않을 때만(이번 클릭이
    // 통째로 쓸모없었을 때) 떨어뜨린다.
    const anyAppropriate = studies.some((s) => s.status === 'appropriate')
    const focusPercent = anyAppropriate ? character.focus_percent : await adjustFocusPercent(userId, character.id, -FOCUS_DOWN_ON_STRUGGLE)

    try {
      await ensureCharacterMessagesTable()
      await sql`
        INSERT INTO character_messages (user_id, character_id, speaker, source, content, verification_status, knowledge_entry_id)
        VALUES (${userId}, ${character.id}, 'character', 'ai_generated', ${characterReply}, ${anyAppropriate ? 'appropriate' : 'unverifiable'}, ${null})
      `
    } catch (err) {
      console.error('[api/character] failed to persist character_messages for study-generate', err)
      await refundReservation()
      res.status(500).json({ error: '대화를 저장하는 중 오류가 발생했어요.' })
      return
    }

    res.status(200).json({
      drafts,
      characterReply,
      remaining: usedTicket ? 0 : reserved.remaining,
      aiRecommendTickets: usedTicket ? ticketsRemaining : undefined,
      dailyStudyLimit: DAILY_STUDY_LIMIT,
      exampleCount,
      characterAgeTier,
      focusPercent,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on study-generate', err)
    res.status(500).json({ error: '스스로 공부하기 중 오류가 발생했어요.' })
  }
}

// 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): CardMatchGame(직업 카드
// 맞추기 미니게임, src/components/games/CardMatchGame.tsx)을 1세트
// 클리어했을 때 호출한다 — 검증할 사용자 콘텐츠가 전혀 없는(고정 문구)
// 결정적인 "완료 확인" 액션이라 Gemini를 부르지 않고, 하루 검증/공부
// 한도도 전혀 소비하지 않는다. verify-knowledge/study-generate와 똑같은
// 모양(verification + 서명된 verificationToken)으로 응답해서, 프런트가
// 그 토큰을 기존 save-knowledge(missionType='card_game')에 그대로
// 넘기기만 하면 되도록 한다 — XP 지급·집중력 반영·진화 판정·대화 로그
// 저장을 전부 그 기존 경로가 처리한다(새 저장 경로를 만들지 않는다).
const CARD_GAME_COMPLETION_TITLE = '직업 카드 맞추기 완료'
const CARD_GAME_COMPLETION_CONTENT = '직업 카드와 도구 카드를 모두 맞춰서 한 세트를 클리어했습니다.'

async function handleCompleteCardGame(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType } = (req.body ?? {}) as { companionType?: unknown }

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

    const verification: KnowledgeVerificationResult = {
      status: 'appropriate',
      explanation: '모든 카드를 맞췄어요!',
      relevance: '',
      issues: '',
      suggestion: '',
      requiredAgeTier: 'toddler',
    }
    const verificationToken = signKnowledgeVerification({
      userId,
      characterId: character.id,
      companionType: companionType as string,
      title: CARD_GAME_COMPLETION_TITLE,
      content: CARD_GAME_COMPLETION_CONTENT,
      status: verification.status,
      explanation: verification.explanation,
      relevance: verification.relevance,
      issues: verification.issues,
      suggestion: verification.suggestion,
      source: 'user_taught',
      requiredAgeTier: verification.requiredAgeTier,
    })

    res.status(200).json({
      knowledge: { title: CARD_GAME_COMPLETION_TITLE, content: CARD_GAME_COMPLETION_CONTENT },
      verification,
      verificationToken,
      characterReply: '우와, 카드를 다 맞췄어요! 정말 멋져요!',
    })
  } catch (err) {
    console.error('[api/character] unexpected error on complete-card-game', err)
    res.status(500).json({ error: '카드 맞추기 완료를 처리하는 중 오류가 발생했어요.' })
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
    missionType?: unknown
    knowledgeCategory?: unknown
  }
  const { companionType, title, originalContent, finalContent, verificationToken } = body
  const requestId = typeof body.requestId === 'string' && body.requestId ? body.requestId : null
  // PR #65: 지식 카드 10종 분류(선택값) — 안 보내면 그냥 NULL로 저장되고
  // 어떤 기존 동작도 바뀌지 않는다(missionType과 같은 "선택적 태그" 패턴).
  const knowledgeCategory =
    typeof body.knowledgeCategory === 'string' && KNOWLEDGE_CATEGORIES.has(body.knowledgeCategory) ? body.knowledgeCategory : null
  // PR #63: 어느 미션 카드(① 선택지 고르기=objective ② AI 추천=subjective
  // ③ 직접 입력=knowhow)로 저장했는지 — 선택값이라 안 보내도(예: 기존
  // e2e가 쓰는 "그냥 저장") 저장 자체는 그대로 성공하고, 그저 어느
  // 미션에도 집계되지 않을 뿐이다(source/profession과 같은 "저장 당시
  // 값을 스냅샷"하는 트러스트 모델 — 클라이언트가 어느 입력 경로를 썼는지
  // 그대로 신뢰한다).
  const missionType = typeof body.missionType === 'string' && (MISSION_TYPES as string[]).includes(body.missionType) ? (body.missionType as MissionType) : null

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

    // PR #52: verify-knowledge에서 이미 한 번 막았어도, 서명된 토큰만으로
    // 저장을 직접 시도하는 우회를 막기 위해 저장 시점에도 다시 검사한다
    // (캐릭터의 "현재" 레벨 기준 — verify 이후 레벨이 바뀌었을 수도 있다).
    if (!meetsAgeTier(effectiveAgeTier(character), tokenPayload.requiredAgeTier)) {
      res.status(400).json({ error: ageBlockedMessage(AGE_TIER_LABEL[tokenPayload.requiredAgeTier]) })
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
        SELECT id, user_id, character_id, profession, custom_profession_label, title, original_content, final_content, verification_status, verification_explanation, source, mission_type, age_tier_at_save, knowledge_category, created_at
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
          focusPercent: character.focus_percent,
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

    // PR #63: 이 저장이 적용되는 "지금" 연령대 — INSERT/진화 판정 둘 다
    // 이 값을 쓴다(이번 저장 자체가 주는 XP로 레벨이 바뀌기 *전* 스냅샷,
    // profession과 같은 "행위 당시 값을 그대로 박아둔다" 원칙).
    const tierAtSaveStart = effectiveAgeTier(character)

    const inserted = await sql<KnowledgeEntryRow>`
      INSERT INTO character_knowledge_entries
        (user_id, character_id, profession, custom_profession_label, title, original_content, final_content, verification_status, verification_explanation, client_request_id, source, mission_type, age_tier_at_save, knowledge_category)
      VALUES
        (${userId}, ${character.id}, ${character.profession}, ${character.custom_profession_label}, ${title.trim()}, ${originalContent.trim()}, ${finalContent.trim()}, 'appropriate', ${verificationExplanation}, ${requestId}, ${tokenPayload.source}, ${missionType}, ${tierAtSaveStart}, ${knowledgeCategory})
      RETURNING id, user_id, character_id, profession, custom_profession_label, title, original_content, final_content, verification_status, verification_explanation, source, mission_type, age_tier_at_save, knowledge_category, created_at
    `
    const entry = inserted.rows[0]

    // PR #45 checkpoint 4: XP for a verified knowledge save — granted
    // exactly once per entry, because this line only runs on the genuine
    // INSERT path above (the idempotent-replay branch for a repeated
    // requestId already returned earlier, before ever reaching here). No
    // separate dedup table needed: the existing client_request_id unique
    // index is what makes the INSERT above itself happen at most once.
    const expResult = await applyExpGain(userId, character.id, character.level, KNOWLEDGE_SAVE_EXP)

    // PR #63: "지식 적합 저장 개수가 쌓이면 조기 진화"하던 예전 로직을
    // 대체한다 — 이번 저장 덕분에 레벨 조건(필요하다면)과 6미션 조건을
    // 둘 다 만족했는지 확인하고, 만족하면 다음 연령대로 진화시킨다.
    const evolveResult = await maybeEvolveAgeTier(userId, character.id, expResult.newLevel, character.mission_unlocked_tier)

    // PR #65: 지식이 실제로 완성 저장된 성공 신호 — 집중력을 소폭 올린다.
    const focusPercent = await adjustFocusPercent(userId, character.id, FOCUS_UP_ON_SAVE)

    // PR #45 checkpoint 3.6: unlike verify-knowledge/study-generate, the
    // knowledge entry above is the thing that matters and it has already
    // committed successfully — a client must never be told "저장 실패"
    // for something that genuinely saved. So this log line is best-effort:
    // on failure, log server-side and still return 201 with the real
    // entry, rather than failing (or refunding anything) for a save that
    // actually worked.
    const savedReply = buildSavedReply(tokenPayload.source, expResult.leveledUp, expResult.newLevel, evolveResult.newAgeTierStageLabel)
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
      missionProgress: evolveResult.missionProgress,
      evolved: evolveResult.evolved,
      newAgeTier: evolveResult.newAgeTier,
      newAgeTierLabel: evolveResult.newAgeTierLabel,
      focusPercent,
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
        SELECT id, user_id, character_id, profession, custom_profession_label, title, original_content, final_content, verification_status, verification_explanation, source, mission_type, age_tier_at_save, knowledge_category, created_at
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
    if (!isExamSupportedProfession(character.profession)) {
      res.status(400).json({ error: EXAM_NOT_SUPPORTED_MESSAGE })
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
    if (!isExamSupportedProfession(character.profession)) {
      res.status(400).json({ error: EXAM_NOT_SUPPORTED_MESSAGE })
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

    // PR #63: 퀴즈 XP만으로도(6미션은 이미 끝났는데 레벨만 모자랐던 경우)
    // 진화 조건을 채울 수 있다 — save-knowledge와 같은 공통 판정을 쓴다.
    const evolveResult = await maybeEvolveAgeTier(userId, character.id, expResult.newLevel, character.mission_unlocked_tier)

    const message = buildQuizResultMessage(correct, question.explanation, expAwarded, expResult.leveledUp, expResult.newLevel, evolveResult.newAgeTierStageLabel)

    res.status(200).json({
      correct,
      explanation: question.explanation,
      expAwarded,
      exp: expResult.exp,
      level: expResult.newLevel,
      leveledUp: expResult.leveledUp,
      message,
      evolved: evolveResult.evolved,
      newAgeTier: evolveResult.newAgeTier,
      newAgeTierLabel: evolveResult.newAgeTierLabel,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on quiz-submit', err)
    res.status(500).json({ error: '퀴즈 채점 중 오류가 발생했어요.' })
  }
}

// 지시서(학습 플로우 전면 개편) 2단계 "객관식 2문제" — 원래는 직업과
// 무관한 고정 생활상식 문제은행(objectiveQuizQuestions.ts)에서 2문제를
// 무작위로 뽑았다(기존 getQuiz/getExam과 달리 EXAM_SUPPORTED_PROFESSIONS
// 가드 없이 50개 직업 전체에서 동작).
//
// 지시서(연령대별 객관식 선택지 개수 동적 변경 및 문제 유형 확장): 이제는
// 그 자리에서 직업별 역사·도구·목적·핵심역량을 묻는 문제를 Gemini가 매번
// 새로 만든다(generateObjectiveQuizBatch) — 선택지 개수도 캐릭터의 지금
// 연령대에 맞춰 늘어난다(objectiveQuizChoiceCountForTier, selfStudy의
// "예시 개수"와 같은 연령대별 표를 공유). 사용자 확인: 의사·변호사·약사
// 같은 전문직도 포함해 전체 적용하기로 했다 — 정답(correctIndex)은
// 여전히 응답에 내려가지 않고, 생성된 문제 전체를 서명된 quizToken에
// 담아(objectiveQuizToken.ts) 채점 시 그 서명만 신뢰한다.
async function handleGetObjectiveQuiz(req: VercelRequest, res: VercelResponse, userId: number) {
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

    // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): toddler(8~9살)의 2단계는
    // 그대로 2문제, teen(10대) ④번 단계만 3문제 — 클라이언트가 보낸 값은
    // 신뢰하지 않고 서버가 "지금" 연령대로 직접 정한다(연령 게이트와 같은
    // 신뢰 모델).
    const characterAgeTier = effectiveAgeTier(character)
    const objectiveQuizCount = characterAgeTier === 'teen' ? 3 : 2
    const choiceCount = objectiveQuizChoiceCountForTier(characterAgeTier, ageNumberForTier(characterAgeTier, character.level))

    let generated
    try {
      generated = await generateObjectiveQuizBatch(resolveProfessionLabel(character), characterAgeTier, objectiveQuizCount, choiceCount)
    } catch (err) {
      const { status, message } = resolveGeminiFailureMessage(err)
      res.status(status).json({ error: message })
      return
    }

    const questions = generated.map((g, idx) => ({
      id: `q-${idx}`,
      text: g.text,
      choices: g.choices,
      correctIndex: g.correctIndex,
      explanation: g.explanation,
    }))
    const quizToken = signObjectiveQuizToken({
      userId,
      characterId: character.id,
      companionType: String(companionType),
      questions,
    })

    res.status(200).json({
      questions: questions.map((q) => ({ id: q.id, text: q.text, choices: q.choices })),
      quizToken,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on objective-quiz', err)
    res.status(500).json({ error: '문제를 불러오는 중 오류가 발생했어요.' })
  }
}

// 지시서(학습 플로우 전면 개편) 2단계 채점 — "세트를 전부 맞혀야만"
// 통과한다(요청 2번: 하나라도 틀리면 통과 못함). 통과하면 문제마다
// character_knowledge_entries에 mission_type='objective'로 저장해(일반
// 가르치기 저장과 똑같은 XP·집중력·진화 판정 경로를 그대로 탄다) 이
// 단계가 끝났다는 사실이 서버 쪽 진짜 상태(미션 집계)에 반영되게 한다
// — 틀리면 아무것도 저장하지 않고 "앗, 틀렸어요! 다시 도전해 볼까요?"
// 만 돌려줘, 클라이언트가 새 GET 호출로 새 문제 세트를 다시 받아
// 처음부터 반복하게 한다(요청 3번: 세트 단위 무한 반복). 지시서(10대
// 커리큘럼: 직업 카드 맞추기 통합): 세트 크기가 toddler는 2문제,
// teen은 3문제로 서버가 연령대에 따라 정한다(handleGetObjectiveQuiz).
async function handleSubmitObjectiveQuiz(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType, quizToken, answers, requestId } = (req.body ?? {}) as {
    companionType?: unknown
    quizToken?: unknown
    answers?: unknown
    requestId?: unknown
  }

  if (!Array.isArray(answers) || answers.length === 0 || answers.some((a) => typeof a !== 'number' || !Number.isInteger(a) || a < 0)) {
    res.status(400).json({ error: '모든 문제의 답을 선택해주세요.' })
    return
  }

  const tokenPayload = verifyObjectiveQuizToken(quizToken)
  if (!tokenPayload) {
    res.status(400).json({ error: '문제가 만료되었거나 올바르지 않아요. 다시 받아주세요.' })
    return
  }
  // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 문제 수가 더 이상
  // 항상 2로 고정되지 않으므로, 토큰이 실제로 출제한 문제 수와 제출한
  // 답의 개수가 정확히 같은지부터 확인한다.
  if (answers.length !== tokenPayload.questions.length) {
    res.status(400).json({ error: '모든 문제의 답을 선택해주세요.' })
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
    if (tokenPayload.userId !== userId || tokenPayload.characterId !== character.id || tokenPayload.companionType !== companionType) {
      res.status(400).json({ error: '이 캐릭터에게 출제된 문제가 아니에요. 다시 받아주세요.' })
      return
    }

    // 지시서(연령대별 객관식 선택지 개수 동적 변경 및 문제 유형 확장):
    // 더 이상 id로 문제은행을 다시 찾지 않는다 — 서명된 토큰 자체가
    // 문제 전체(정답 인덱스 포함)를 담고 있으므로, 토큰 검증을 통과했다는
    // 사실이 곧 "이 문제들이 실제로 출제됐다"는 보증이다.
    const resolvedQuestions = tokenPayload.questions

    const results = resolvedQuestions.map((q, idx) => ({ questionId: q.id, correct: answers[idx] === q.correctIndex }))
    const allCorrect = results.every((r) => r.correct)

    const normalizedRequestId = typeof requestId === 'string' && requestId ? requestId : null

    if (!allCorrect) {
      res.status(200).json({
        allCorrect: false,
        results,
        message: buildObjectiveQuizResultMessage(false, 0, false, character.level),
        expAwarded: 0,
        exp: character.exp,
        level: character.level,
        leveledUp: false,
        missionProgress: null,
        evolved: false,
        newAgeTier: null,
        newAgeTierLabel: null,
      })
      return
    }

    // Idempotency: a retried submit of the exact same (already-passed)
    // attempt returns the current state instead of inserting the 2 entries
    // (and granting XP) a second time — same client_request_id-based guard
    // save-knowledge uses.
    if (normalizedRequestId) {
      const existing = await sql<{ id: number }>`
        SELECT id FROM character_knowledge_entries
        WHERE character_id = ${character.id} AND client_request_id = ${`${normalizedRequestId}:0`}
      `
      if (existing.rows[0]) {
        const progress = await getMissionProgress(userId, character.id, effectiveAgeTier(character))
        res.status(200).json({
          allCorrect: true,
          results,
          message: buildObjectiveQuizResultMessage(true, 0, false, character.level),
          expAwarded: 0,
          exp: character.exp,
          level: character.level,
          leveledUp: false,
          missionProgress: progress,
          evolved: false,
          newAgeTier: null,
          newAgeTierLabel: null,
        })
        return
      }
    }

    const tierAtSaveStart = effectiveAgeTier(character)

    for (const [idx, q] of resolvedQuestions.entries()) {
      await sql`
        INSERT INTO character_knowledge_entries
          (user_id, character_id, profession, custom_profession_label, title, original_content, final_content, verification_status, verification_explanation, client_request_id, source, mission_type, age_tier_at_save, knowledge_category)
        VALUES
          (${userId}, ${character.id}, ${character.profession}, ${character.custom_profession_label}, ${q.text}, ${q.explanation}, ${q.explanation}, 'appropriate', ${q.explanation}, ${normalizedRequestId ? `${normalizedRequestId}:${idx}` : null}, ${'user_taught'}, ${'objective'}, ${tierAtSaveStart}, ${null})
      `
    }

    // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 예전엔 항상 정확히
    // 2문제라 applyExpGain/adjustFocusPercent를 두 번 직접 썼지만, 세트
    // 크기가 가변이 되었으므로 저장한 문제 수만큼 반복한다 — 문제 하나당
    // 정확히 한 번씩 XP·집중력이 오르는 건 기존과 동일하다.
    let runningLevel = character.level
    let runningExp = character.exp
    let anyLeveledUp = false
    for (let i = 0; i < resolvedQuestions.length; i++) {
      const gain = await applyExpGain(userId, character.id, runningLevel, KNOWLEDGE_SAVE_EXP)
      runningLevel = gain.newLevel
      runningExp = gain.exp
      anyLeveledUp = anyLeveledUp || gain.leveledUp
    }
    const evolveResult = await maybeEvolveAgeTier(userId, character.id, runningLevel, character.mission_unlocked_tier)
    let focusPercent = character.focus_percent
    for (let i = 0; i < resolvedQuestions.length; i++) {
      focusPercent = await adjustFocusPercent(userId, character.id, FOCUS_UP_ON_SAVE)
    }

    const expAwarded = KNOWLEDGE_SAVE_EXP * resolvedQuestions.length
    const message = buildObjectiveQuizResultMessage(true, expAwarded, anyLeveledUp, runningLevel, evolveResult.newAgeTierStageLabel)

    res.status(201).json({
      allCorrect: true,
      results,
      message,
      expAwarded,
      exp: runningExp,
      level: runningLevel,
      leveledUp: anyLeveledUp,
      missionProgress: evolveResult.missionProgress,
      evolved: evolveResult.evolved,
      newAgeTier: evolveResult.newAgeTier,
      newAgeTierLabel: evolveResult.newAgeTierLabel,
      focusPercent,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on objective-quiz-submit', err)
    res.status(500).json({ error: '채점 중 오류가 발생했어요.' })
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
    if (!isExamSupportedProfession(character.profession)) {
      res.status(400).json({ error: EXAM_NOT_SUPPORTED_MESSAGE })
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
    if (!isExamSupportedProfession(character.profession)) {
      res.status(400).json({ error: EXAM_NOT_SUPPORTED_MESSAGE })
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

    // PR #63: 시험 XP도 퀴즈와 같은 이유로 진화 판정을 공유한다.
    const evolveResult = await maybeEvolveAgeTier(userId, character.id, expResult.newLevel, character.mission_unlocked_tier)

    const message = buildExamResultMessage(passed, score, total, expAwarded, expResult.leveledUp, expResult.newLevel, evolveResult.newAgeTierStageLabel)

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
      evolved: evolveResult.evolved,
      newAgeTier: evolveResult.newAgeTier,
      newAgeTierLabel: evolveResult.newAgeTierLabel,
    })
  } catch (err) {
    console.error('[api/character] unexpected error on exam-submit', err)
    res.status(500).json({ error: '시험 채점 중 오류가 발생했어요.' })
  }
}

// ============================================================
// 지시서(실제 업무·연구·비법·노하우 기록 시스템) — "지식 기록장"
//
// 위의 모든 핸들러와 달리 characters/companionType과 전혀 무관하다 —
// userId만으로 유저 본인의 개인 기록을 읽고 쓴다. Vercel Hobby 플랜의
// 12개 서버리스 함수 한도(이 파일 처음 부분의 "merge instead of add"
// 설명 참고) 때문에 새 함수 파일을 못 만들어 여기 이어붙였을 뿐이다.
// ============================================================

// src/data/personalKnowledgeLog.ts의 프런트엔드 사본과 반드시 같은 값이어야
// 한다(이 저장소의 기존 api//src 중복 패턴, characterAge.ts와 동일).
const KNOWLEDGE_LOG_CATEGORIES = new Set(['work_log', 'research_note', 'success_case', 'failure_case', 'tip'])
const KNOWLEDGE_LOG_VISIBILITIES = new Set(['private', 'partial', 'public'])
const KNOWLEDGE_LOG_ATTACHMENT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
])
const MAX_KNOWLEDGE_LOG_ATTACHMENTS = 5
const MAX_KNOWLEDGE_LOG_BUSINESS_NAME_LENGTH = 100
const MAX_KNOWLEDGE_LOG_TAGS_LENGTH = 200
const MAX_KNOWLEDGE_LOG_CONTENT_LENGTH = 5000
// YYYY-MM-DD만 허용 — Postgres DATE 컬럼에 그대로 바인딩한다. 모양만
// 보는 정규식(자릿수만 확인)으로는 "2026-13-99"처럼 달력에 없는 날짜도
// 통과시켜 저장 시점에 Postgres 에러(500)로서야 드러나므로, 실제
// 연/월/일 범위와 Date로 되돌렸을 때 입력과 정확히 일치하는지까지
// (2월 30일처럼 JS의 날짜 롤오버를 역으로 이용해) 확인한다.
const ENTRY_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
function isValidEntryDate(value: string): boolean {
  const match = ENTRY_DATE_PATTERN.exec(value)
  if (!match) return false
  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

interface IncomingKnowledgeLogAttachment {
  url: string
  mimeType: string
  name: string | null
}

// api/conversations/[id].ts의 isTrustedBlobUrl과 같은 이유(SSRF 방지) —
// 이 핸들러는 첨부 바이트를 직접 fetch하지는 않지만, DB에 저장하는
// url이 우리 Blob 스토어가 아니면 다른 사람이 아무 외부 URL이나 "첨부"
// 로 등록해 지식 기록장을 임의 링크 저장소처럼 악용할 수 있다.
function isTrustedBlobUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && hostname.endsWith('.public.blob.vercel-storage.com')
  } catch {
    return false
  }
}

function parseIncomingKnowledgeLogAttachments(raw: unknown): IncomingKnowledgeLogAttachment[] | null {
  if (raw == null) return []
  if (!Array.isArray(raw) || raw.length > MAX_KNOWLEDGE_LOG_ATTACHMENTS) return null

  const attachments: IncomingKnowledgeLogAttachment[] = []
  for (const item of raw) {
    const a = item as Partial<IncomingKnowledgeLogAttachment>
    if (
      typeof a.url !== 'string' ||
      typeof a.mimeType !== 'string' ||
      !KNOWLEDGE_LOG_ATTACHMENT_MIME_TYPES.has(a.mimeType) ||
      !isTrustedBlobUrl(a.url)
    ) {
      return null
    }
    attachments.push({ url: a.url, mimeType: a.mimeType, name: typeof a.name === 'string' ? a.name : null })
  }
  return attachments
}

function toKnowledgeLogJson(row: PersonalKnowledgeLogRow, attachments: PersonalKnowledgeLogAttachmentRow[]) {
  return {
    id: row.id,
    entryDate: row.entry_date,
    businessName: row.business_name,
    category: row.category,
    tags: row.tags,
    content: row.content,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: attachments.map((a) => ({ url: a.url, mimeType: a.mime_type, name: a.name })),
  }
}

// 목록 조회 — 최신순. 삭제 전까지는 몇 번을 조회해도 데이터가 바뀌지
// 않는 순수 읽기다(peekTeachUsage 등과 같은 원칙).
async function handleListKnowledgeLog(req: VercelRequest, res: VercelResponse, userId: number) {
  try {
    await ensurePersonalKnowledgeLogTables()

    // @vercel/postgres의 sql 태그는 배열 파라미터를 못 받으므로(위
    // api/conversations/[id].ts의 같은 주석 참고) "로그 목록 먼저 →
    // 그 id들로 ANY($1) 조회" 두 단계가 아니라, user_id 하나로 거르는
    // LEFT JOIN 한 번으로 (로그, 첨부) 쌍을 전부 받아온다(첨부가 없는
    // 로그는 첨부 컬럼이 전부 null인 행 하나로 온다).
    const rows = await sql<{
      log_id: number
      entry_date: string
      business_name: string | null
      category: PersonalKnowledgeLogRow['category']
      tags: string | null
      content: string
      visibility: PersonalKnowledgeLogRow['visibility']
      created_at: string
      updated_at: string
      attachment_url: string | null
      attachment_mime_type: string | null
      attachment_name: string | null
    }>`
      SELECT l.id AS log_id, l.entry_date, l.business_name, l.category, l.tags, l.content, l.visibility,
        l.created_at, l.updated_at,
        a.url AS attachment_url, a.mime_type AS attachment_mime_type, a.name AS attachment_name
      FROM personal_knowledge_logs l
      LEFT JOIN personal_knowledge_log_attachments a ON a.log_id = l.id
      WHERE l.user_id = ${userId}
      ORDER BY l.entry_date DESC, l.created_at DESC, l.id DESC, a.position ASC
    `

    interface BuiltEntry {
      id: number
      entryDate: string
      businessName: string | null
      category: PersonalKnowledgeLogRow['category']
      tags: string | null
      content: string
      visibility: PersonalKnowledgeLogRow['visibility']
      createdAt: string
      updatedAt: string
      attachments: { url: string; mimeType: string | null; name: string | null }[]
    }
    const entriesById = new Map<number, BuiltEntry>()
    const orderedIds: number[] = []
    for (const row of rows.rows) {
      let entry = entriesById.get(row.log_id)
      if (!entry) {
        entry = {
          id: row.log_id,
          entryDate: row.entry_date,
          businessName: row.business_name,
          category: row.category,
          tags: row.tags,
          content: row.content,
          visibility: row.visibility,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          attachments: [],
        }
        entriesById.set(row.log_id, entry)
        orderedIds.push(row.log_id)
      }
      if (row.attachment_url) {
        entry.attachments.push({ url: row.attachment_url, mimeType: row.attachment_mime_type, name: row.attachment_name })
      }
    }

    res.status(200).json({ entries: orderedIds.map((id) => entriesById.get(id)) })
  } catch (err) {
    console.error('[api/character] unexpected error on knowledge-log', err)
    res.status(500).json({ error: '지식 기록을 불러오는 중 오류가 발생했어요.' })
  }
}

// 등록/수정 — body에 id가 있으면(그리고 그 id가 실제로 이 유저 소유면)
// UPDATE, 없으면 INSERT. 첨부는 매번 통째로 다시 쓴다(UPDATE 시 기존
// 행을 지우고 새로 넣는다) — 순서 변경·삭제까지 한 번에 반영되는 가장
// 단순한 방법이고, 어차피 한 번에 최대 5개뿐이라 비용도 작다.
async function handleSaveKnowledgeLog(req: VercelRequest, res: VercelResponse, userId: number) {
  const { id, entryDate, businessName, category, tags, content, visibility, attachments } = (req.body ?? {}) as {
    id?: unknown
    entryDate?: unknown
    businessName?: unknown
    category?: unknown
    tags?: unknown
    content?: unknown
    visibility?: unknown
    attachments?: unknown
  }

  if (typeof entryDate !== 'string' || !isValidEntryDate(entryDate)) {
    res.status(400).json({ error: '날짜를 올바르게 입력해주세요.' })
    return
  }
  if (typeof category !== 'string' || !KNOWLEDGE_LOG_CATEGORIES.has(category)) {
    res.status(400).json({ error: '주제(카테고리)를 선택해주세요.' })
    return
  }
  if (typeof content !== 'string' || !content.trim() || content.trim().length > MAX_KNOWLEDGE_LOG_CONTENT_LENGTH) {
    res.status(400).json({ error: `내용을 ${MAX_KNOWLEDGE_LOG_CONTENT_LENGTH}자 이내로 입력해주세요.` })
    return
  }
  if (businessName !== undefined && businessName !== null) {
    if (typeof businessName !== 'string' || businessName.length > MAX_KNOWLEDGE_LOG_BUSINESS_NAME_LENGTH) {
      res.status(400).json({ error: `직장/상호명은 ${MAX_KNOWLEDGE_LOG_BUSINESS_NAME_LENGTH}자 이내로 입력해주세요.` })
      return
    }
  }
  if (tags !== undefined && tags !== null) {
    if (typeof tags !== 'string' || tags.length > MAX_KNOWLEDGE_LOG_TAGS_LENGTH) {
      res.status(400).json({ error: `태그는 ${MAX_KNOWLEDGE_LOG_TAGS_LENGTH}자 이내로 입력해주세요.` })
      return
    }
  }
  const resolvedVisibility = typeof visibility === 'string' && KNOWLEDGE_LOG_VISIBILITIES.has(visibility) ? visibility : 'private'
  const parsedAttachments = parseIncomingKnowledgeLogAttachments(attachments)
  if (parsedAttachments === null) {
    res.status(400).json({ error: `첨부 파일은 최대 ${MAX_KNOWLEDGE_LOG_ATTACHMENTS}개까지, 허용된 사진·동영상 형식만 가능해요.` })
    return
  }

  try {
    await ensurePersonalKnowledgeLogTables()

    const resolvedBusinessName = typeof businessName === 'string' && businessName.trim() ? businessName.trim() : null
    const resolvedTags = typeof tags === 'string' && tags.trim() ? tags.trim() : null

    let logId: number
    if (typeof id === 'number') {
      // 소유자 확인을 UPDATE 쿼리 자체의 WHERE 조건으로 걸어, 남의
      // 기록을 id만 바꿔 보내는 시도를 막는다(건물 등록 PR의 owner_user_id
      // 패턴과 동일).
      const updated = await sql<{ id: number }>`
        UPDATE personal_knowledge_logs
        SET entry_date = ${entryDate}, business_name = ${resolvedBusinessName}, category = ${category},
            tags = ${resolvedTags}, content = ${content.trim()}, visibility = ${resolvedVisibility}, updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
      `
      if (!updated.rows[0]) {
        res.status(404).json({ error: '지식 기록을 찾을 수 없어요.' })
        return
      }
      logId = updated.rows[0].id
      await sql`DELETE FROM personal_knowledge_log_attachments WHERE log_id = ${logId}`
    } else {
      const inserted = await sql<{ id: number }>`
        INSERT INTO personal_knowledge_logs (user_id, entry_date, business_name, category, tags, content, visibility)
        VALUES (${userId}, ${entryDate}, ${resolvedBusinessName}, ${category}, ${resolvedTags}, ${content.trim()}, ${resolvedVisibility})
        RETURNING id
      `
      logId = inserted.rows[0].id
    }

    for (let i = 0; i < parsedAttachments.length; i++) {
      const a = parsedAttachments[i]
      await sql`
        INSERT INTO personal_knowledge_log_attachments (log_id, position, url, mime_type, name)
        VALUES (${logId}, ${i}, ${a.url}, ${a.mimeType}, ${a.name})
      `
    }

    const savedResult = await sql<PersonalKnowledgeLogRow>`
      SELECT id, user_id, entry_date, business_name, category, tags, content, visibility, created_at, updated_at
      FROM personal_knowledge_logs
      WHERE id = ${logId}
    `
    const attachmentsResult = await sql<PersonalKnowledgeLogAttachmentRow>`
      SELECT id, log_id, position, url, mime_type, name, created_at
      FROM personal_knowledge_log_attachments
      WHERE log_id = ${logId}
      ORDER BY position
    `

    res.status(200).json({ entry: toKnowledgeLogJson(savedResult.rows[0], attachmentsResult.rows) })
  } catch (err) {
    console.error('[api/character] unexpected error on knowledge-log-save', err)
    res.status(500).json({ error: '지식 기록을 저장하는 중 오류가 발생했어요.' })
  }
}

// 삭제 — ON DELETE CASCADE로 첨부 행도 함께 지워진다. 소유자 확인을
// DELETE 쿼리 자체의 WHERE 조건으로 건다(위 저장 핸들러와 같은 원칙).
async function handleDeleteKnowledgeLog(req: VercelRequest, res: VercelResponse, userId: number) {
  const { id } = (req.body ?? {}) as { id?: unknown }
  if (typeof id !== 'number') {
    res.status(400).json({ error: '삭제할 기록을 찾을 수 없어요.' })
    return
  }

  try {
    await ensurePersonalKnowledgeLogTables()

    const deleted = await sql<{ id: number }>`
      DELETE FROM personal_knowledge_logs WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `
    if (!deleted.rows[0]) {
      res.status(404).json({ error: '지식 기록을 찾을 수 없어요.' })
      return
    }
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[api/character] unexpected error on knowledge-log-delete', err)
    res.status(500).json({ error: '지식 기록을 삭제하는 중 오류가 발생했어요.' })
  }
}
