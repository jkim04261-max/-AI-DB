import { genderForCompanion, type CharacterGender } from '../../shared/characterGender'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import type { ProfessionId } from '../data/characterProfessions'
import type { AgeTier } from '../data/characterAge'
import type { MissionType, MissionProgress } from '../data/characterMissions'
import type { KnowledgeCategory } from '../data/knowledgeCategories'

export type CompanionType = 'nuri' | 'duri'

export type VerificationStatus = 'appropriate' | 'needs_revision' | 'unverifiable'
// PR #45 checkpoint 3: who/what produced a knowledge entry — the user typed
// it in ('user_taught') or the character generated+self-graded it via
// "스스로 공부하기" ('ai_generated'). Server-trusted only (see
// api/_lib/knowledgeToken.ts); the client never sets this.
export type KnowledgeSource = 'user_taught' | 'ai_generated'

export interface KnowledgeVerification {
  status: VerificationStatus
  explanation: string
  relevance: string
  issues: string
  suggestion: string
}

export interface KnowledgeEntry {
  id: number
  companionType: CompanionType
  profession: ProfessionId
  // PR #65: profession==='custom'일 때만 값이 있다(그 외엔 항상 null).
  customProfessionLabel: string | null
  title: string
  originalContent: string
  finalContent: string
  verificationStatus: VerificationStatus
  verificationExplanation: string
  source: KnowledgeSource
  // PR #65: 지식 카드 10종 분류(선택값) — 안 고르고 저장했으면 null.
  knowledgeCategory: KnowledgeCategory | null
  createdAt: string
}

interface KnowledgeEntryApiRow {
  id: number
  character_id: number
  profession: ProfessionId
  custom_profession_label: string | null
  title: string
  original_content: string
  final_content: string
  verification_status: VerificationStatus
  verification_explanation: string
  source: KnowledgeSource
  knowledge_category: KnowledgeCategory | null
  created_at: string
}

export interface Character {
  id: number
  companionType: CompanionType
  stage: 'child' | 'adult'
  profession: ProfessionId | null
  // PR #65: profession==='custom'일 때만 값이 있다(사용자가 직접 입력한
  // 직업명, 예: "숲해설가") — 그 외엔 항상 null.
  customProfessionLabel: string | null
  // PR #65: 교육·장비 단계에 따라 오르내리는 집중력 게이지(0~100). 지금은
  // 저장/검증 성공·실패에 따른 소폭 가감만 반영한다(api/character.ts).
  focusPercent: number
  // PR #45 checkpoint 4: a game-progression indicator only — level/exp
  // reflect activity inside 누리AI (지식 저장/퀴즈/시험), never the real
  // Gemini model's actual capability. See characterDialogue.ts's
  // KNOWLEDGE_VS_MODEL_DISCLAIMER, shown next to this in the UI.
  level: number
  exp: number
  // PR #63: 더 이상 level에서 클라이언트가 직접 계산하지 않는다(그러면
  // 6미션 게이트로 고정된 상태를 무시하고 레벨만으로 다시 계산해버리게
  // 된다) — 서버가 계산한 "진짜" 연령대를 그대로 쓴다(api/character.ts의
  // toCharacterJson).
  ageTier: AgeTier
  createdAt: string
}

export interface QuizQuestion {
  id: string
  text: string
  choices: string[]
}

export interface ExamQuestion {
  id: string
  text: string
  choices: string[]
}

export interface GrowthUpdate {
  expAwarded: number
  exp: number
  level: number
  leveledUp: boolean
}

// PR #63: 지식 저장/퀴즈/시험 어느 경로로든 XP가 바뀌면 같은 모양의
// 진화 결과가 따라온다 — "레벨 조건 + 6미션 확정" 둘 다 충족된 바로 그
// 액션의 응답에 실려 온다(별도 폴링 없음).
export interface EvolutionUpdate {
  evolved: boolean
  newAgeTier: AgeTier | null
  newAgeTierLabel: string | null
}

// PR #45 checkpoint 3.6: one line of the persistent conversation log for a
// character (character_messages) — every exchange shown in
// InteractionPanel's dialogue feed, including needs_revision/unverifiable
// attempts that never become a KnowledgeEntry. `content` for a 'character'
// line is always server-generated text (see api/_lib/characterDialogue.ts)
// returned verbatim from verify-knowledge/study-generate/save-knowledge —
// the client never invents or edits it.
export interface CharacterMessage {
  id: number
  companionType: CompanionType
  speaker: 'user' | 'character'
  source: KnowledgeSource
  content: string
  verificationStatus: VerificationStatus | null
  knowledgeEntryId: number | null
  createdAt: string
}

interface CharacterMessageApiRow {
  id: number
  character_id: number
  speaker: 'user' | 'character'
  source: KnowledgeSource
  content: string
  verification_status: VerificationStatus | null
  knowledge_entry_id: number | null
  created_at: string
}

interface GrowthContextValue {
  characters: Character[]
  loading: boolean
  createCharacter: (companionType: CompanionType, gender?: CharacterGender) => Promise<void>
  setProfession: (companionType: CompanionType, profession: ProfessionId, customProfessionLabel?: string) => Promise<void>
  verifyKnowledge: (
    companionType: CompanionType,
    title: string,
    content: string,
  ) => Promise<{
    verification: KnowledgeVerification
    verificationToken: string
    characterReply: string
    remaining: number
    dailyTeachLimit: number
    // PR #52: 내용은 적합해도 캐릭터가 아직 이 지식에 필요한 연령대보다
    // 어리면 true — 저장은 서버(save-knowledge)에서도 다시 막히지만,
    // 화면에서 "저장" 버튼을 미리 숨기는 데 쓴다.
    ageBlocked: boolean
    characterAgeTier: AgeTier
    requiredAgeTier: AgeTier
    focusPercent: number
  }>
  studyGenerate: (companionType: CompanionType) => Promise<{
    knowledge: { title: string; content: string }
    verification: KnowledgeVerification
    verificationToken: string
    characterReply: string
    remaining: number
    dailyStudyLimit: number
    ageBlocked: boolean
    characterAgeTier: AgeTier
    requiredAgeTier: AgeTier
    focusPercent: number
  }>
  saveKnowledge: (
    companionType: CompanionType,
    title: string,
    originalContent: string,
    finalContent: string,
    verificationToken: string,
    missionType?: MissionType,
    knowledgeCategory?: KnowledgeCategory,
  ) => Promise<
    { entry: KnowledgeEntry; savedReply: string; missionProgress: MissionProgress | null; focusPercent: number } & GrowthUpdate & EvolutionUpdate
  >
  getMissionProgress: (companionType: CompanionType) => Promise<MissionProgress>
  listKnowledge: (
    companionType: CompanionType,
    options?: { limit?: number; offset?: number },
  ) => Promise<{ entries: KnowledgeEntry[]; total: number }>
  listMessages: (
    companionType: CompanionType,
    options?: { limit?: number; offset?: number },
  ) => Promise<{ messages: CharacterMessage[]; total: number }>
  getQuiz: (companionType: CompanionType) => Promise<{ question: QuizQuestion }>
  submitQuiz: (
    companionType: CompanionType,
    questionId: string,
    answerIndex: number,
  ) => Promise<{ correct: boolean; explanation: string; message: string } & GrowthUpdate & EvolutionUpdate>
  getExam: (companionType: CompanionType) => Promise<{ questions: ExamQuestion[]; alreadyPassed: boolean }>
  getUsage: () => Promise<{ teachRemaining: number; teachLimit: number; studyRemaining: number; studyLimit: number }>
  submitExam: (
    companionType: CompanionType,
    answers: { questionId: string; answerIndex: number }[],
  ) => Promise<
    { passed: boolean; score: number; total: number; results: { questionId: string; correct: boolean }[]; message: string } & GrowthUpdate &
      EvolutionUpdate
  >
}

interface CharacterApiRow {
  id: number
  companion_type: CompanionType
  stage: 'child' | 'adult'
  profession: ProfessionId | null
  custom_profession_label: string | null
  level: number
  exp: number
  age_tier: AgeTier
  focus_percent: number
  created_at: string
}

function fromApiRow(row: CharacterApiRow): Character {
  console.log('[gender:load]', { gender: genderForCompanion(row.companion_type), companionType: row.companion_type })
  return {
    id: row.id,
    companionType: row.companion_type,
    stage: row.stage,
    profession: row.profession,
    customProfessionLabel: row.custom_profession_label ?? null,
    level: row.level ?? 1,
    exp: row.exp ?? 0,
    ageTier: row.age_tier ?? 'toddler',
    focusPercent: row.focus_percent ?? 90,
    createdAt: row.created_at,
  }
}

function fromKnowledgeApiRow(companionType: CompanionType, row: KnowledgeEntryApiRow): KnowledgeEntry {
  return {
    id: row.id,
    companionType,
    profession: row.profession,
    customProfessionLabel: row.custom_profession_label ?? null,
    title: row.title,
    originalContent: row.original_content,
    finalContent: row.final_content,
    verificationStatus: row.verification_status,
    verificationExplanation: row.verification_explanation,
    source: row.source,
    knowledgeCategory: row.knowledge_category ?? null,
    createdAt: row.created_at,
  }
}

function fromMessageApiRow(companionType: CompanionType, row: CharacterMessageApiRow): CharacterMessage {
  return {
    id: row.id,
    companionType,
    speaker: row.speaker,
    source: row.source,
    content: row.content,
    verificationStatus: row.verification_status,
    knowledgeEntryId: row.knowledge_entry_id,
    createdAt: row.created_at,
  }
}

const GrowthContext = createContext<GrowthContextValue | null>(null)

export function GrowthProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)

  // Characters are per-user, so the list is cleared and re-fetched whenever
  // the signed-in user changes (including logout) — same reasoning as
  // ChatContext's conversation list.
  useEffect(() => {
    if (!user) {
      setCharacters([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    fetch('/api/character')
      .then((res) => res.json())
      .then((data: { characters?: CharacterApiRow[] }) => {
        if (cancelled) return
        setCharacters((data.characters ?? []).map(fromApiRow))
      })
      .catch(() => {
        if (!cancelled) setCharacters([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  // PR #45 checkpoint 4: the single place that patches a character's
  // level/exp in local state after any XP-granting action (지식 저장,
  // 퀴즈, 시험) — so the Lv./XP shown on the game screen stays in sync
  // without re-fetching the whole character list every time.
  // PR #63: evolved가 true인 액션은 newAgeTier도 함께 넘겨 ageTier까지
  // 같이 갱신한다 — 생략하면(진화하지 않은 보통의 XP 획득) ageTier는
  // 건드리지 않는다(레벨이 올라도 미션 게이트가 안 끝났으면 서버가
  // ageTier를 그대로 유지해 보내주므로, 굳이 다시 계산할 필요가 없다).
  const updateCharacterGrowth = useCallback((companionType: CompanionType, level: number, exp: number, newAgeTier?: AgeTier | null) => {
    setCharacters((prev) =>
      prev.map((c) => (c.companionType === companionType ? { ...c, level, exp, ...(newAgeTier ? { ageTier: newAgeTier } : {}) } : c)),
    )
  }, [])

  // PR #65: verify-knowledge/study-generate/save-knowledge 세 액션 모두
  // 서버가 그때그때 가감한 focusPercent를 응답에 실어 보낸다 — 이걸로
  // 로컬 상태만 갱신한다(전체 캐릭터 목록을 다시 불러오지 않는다).
  const updateFocusPercent = useCallback((companionType: CompanionType, focusPercent: number) => {
    setCharacters((prev) => prev.map((c) => (c.companionType === companionType ? { ...c, focusPercent } : c)))
  }, [])

  const createCharacter = useCallback(async (companionType: CompanionType, gender?: CharacterGender) => {
    const res = await fetch('/api/character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionType, gender }),
    })
    const data = (await res.json().catch(() => ({}))) as { character?: CharacterApiRow; error?: string }
    if (!res.ok || !data.character) {
      throw new Error(data.error || '캐릭터를 만드는 중 오류가 발생했어요.')
    }
    const created = fromApiRow(data.character)
    setCharacters((prev) => [...prev, created])
  }, [])

  // PR #65: profession==='custom'일 때만 customProfessionLabel을 함께
  // 보낸다 — 기존 50개 직업 선택 흐름은 호출부가 세 번째 인자를 안 넘기면
  // 그대로 동작한다(회귀 없음).
  const setProfession = useCallback(async (companionType: CompanionType, profession: ProfessionId, customProfessionLabel?: string) => {
    const res = await fetch('/api/character', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionType, profession, customProfessionLabel }),
    })
    const data = (await res.json().catch(() => ({}))) as { character?: CharacterApiRow; error?: string }
    if (!res.ok || !data.character) {
      throw new Error(data.error || '직업을 저장하는 중 오류가 발생했어요.')
    }
    const updated = fromApiRow(data.character)
    setCharacters((prev) => prev.map((c) => (c.companionType === companionType ? updated : c)))
  }, [])

  // Ephemeral — never persists anything, just runs the Gemini check. Only
  // saveKnowledge below writes to the DB, and only once the user confirms.
  const verifyKnowledge = useCallback(async (companionType: CompanionType, title: string, content: string) => {
    const res = await fetch('/api/character?action=verify-knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionType, title, content }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      verification?: KnowledgeVerification
      verificationToken?: string
      characterReply?: string
      remaining?: number
      dailyTeachLimit?: number
      ageBlocked?: boolean
      characterAgeTier?: AgeTier
      requiredAgeTier?: AgeTier
      focusPercent?: number
      error?: string
    }
    if (!res.ok || !data.verification || !data.verificationToken || !data.characterReply) {
      throw new Error(data.error || '지식을 검증하는 중 오류가 발생했어요.')
    }
    if (data.focusPercent !== undefined) updateFocusPercent(companionType, data.focusPercent)
    return {
      verification: data.verification,
      verificationToken: data.verificationToken,
      characterReply: data.characterReply,
      remaining: data.remaining ?? 0,
      dailyTeachLimit: data.dailyTeachLimit ?? 0,
      ageBlocked: data.ageBlocked ?? false,
      characterAgeTier: data.characterAgeTier ?? 'toddler',
      requiredAgeTier: data.requiredAgeTier ?? 'toddler',
      focusPercent: data.focusPercent ?? 90,
    }
  }, [updateFocusPercent])

  // "스스로 공부하기" — Gemini 호출 1회로 캐릭터가 새 지식을 생성하고
  // 스스로 평가한다. verifyKnowledge와 마찬가지로 이 호출 자체는 아무것도
  // 저장하지 않는다 — 돌아온 verificationToken을 그대로 saveKnowledge에
  // 넘겨야 실제로 저장된다(사용자가 결과를 보고 확인한 뒤).
  const studyGenerate = useCallback(async (companionType: CompanionType) => {
    const res = await fetch('/api/character?action=study-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionType }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      knowledge?: { title: string; content: string }
      verification?: KnowledgeVerification
      verificationToken?: string
      characterReply?: string
      remaining?: number
      dailyStudyLimit?: number
      ageBlocked?: boolean
      characterAgeTier?: AgeTier
      requiredAgeTier?: AgeTier
      focusPercent?: number
      error?: string
    }
    if (!res.ok || !data.knowledge || !data.verification || !data.verificationToken || !data.characterReply) {
      throw new Error(data.error || '스스로 공부하는 중 오류가 발생했어요.')
    }
    if (data.focusPercent !== undefined) updateFocusPercent(companionType, data.focusPercent)
    return {
      knowledge: data.knowledge,
      verification: data.verification,
      verificationToken: data.verificationToken,
      characterReply: data.characterReply,
      remaining: data.remaining ?? 0,
      dailyStudyLimit: data.dailyStudyLimit ?? 0,
      ageBlocked: data.ageBlocked ?? false,
      characterAgeTier: data.characterAgeTier ?? 'toddler',
      requiredAgeTier: data.requiredAgeTier ?? 'toddler',
      focusPercent: data.focusPercent ?? 90,
    }
  }, [updateFocusPercent])

  const saveKnowledge = useCallback(
    async (
      companionType: CompanionType,
      title: string,
      originalContent: string,
      finalContent: string,
      verificationToken: string,
      missionType?: MissionType,
      knowledgeCategory?: KnowledgeCategory,
    ) => {
      // A fresh key per save attempt — if this exact request somehow reaches
      // the server twice (a retried fetch, a double click that got through
      // before the button disabled), the server recognizes the repeat and
      // returns the original row instead of saving a duplicate. The server
      // no longer trusts a client-sent verification object at all — it
      // only trusts verificationToken, a signature it issued itself.
      const requestId = crypto.randomUUID()
      const res = await fetch('/api/character?action=save-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionType, title, originalContent, finalContent, verificationToken, requestId, missionType, knowledgeCategory }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        entry?: KnowledgeEntryApiRow
        savedReply?: string
        expAwarded?: number
        exp?: number
        level?: number
        leveledUp?: boolean
        missionProgress?: MissionProgress
        evolved?: boolean
        newAgeTier?: AgeTier | null
        newAgeTierLabel?: string | null
        focusPercent?: number
        error?: string
      }
      if (!res.ok || !data.entry || !data.savedReply || data.exp === undefined || data.level === undefined) {
        throw new Error(data.error || '학습 기록을 저장하는 중 오류가 발생했어요.')
      }
      updateCharacterGrowth(companionType, data.level, data.exp, data.newAgeTier)
      if (data.focusPercent !== undefined) updateFocusPercent(companionType, data.focusPercent)
      return {
        entry: fromKnowledgeApiRow(companionType, data.entry),
        savedReply: data.savedReply,
        expAwarded: data.expAwarded ?? 0,
        exp: data.exp,
        level: data.level,
        leveledUp: data.leveledUp ?? false,
        missionProgress: data.missionProgress ?? null,
        evolved: data.evolved ?? false,
        newAgeTier: data.newAgeTier ?? null,
        newAgeTierLabel: data.newAgeTierLabel ?? null,
        focusPercent: data.focusPercent ?? 90,
      }
    },
    [updateCharacterGrowth, updateFocusPercent],
  )

  const listKnowledge = useCallback(
    async (companionType: CompanionType, options?: { limit?: number; offset?: number }) => {
      const params = new URLSearchParams({ action: 'knowledge', companionType })
      if (options?.limit) params.set('limit', String(options.limit))
      if (options?.offset) params.set('offset', String(options.offset))
      const res = await fetch(`/api/character?${params.toString()}`)
      const data = (await res.json().catch(() => ({}))) as {
        entries?: KnowledgeEntryApiRow[]
        total?: number
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error || '학습 기록을 불러오는 중 오류가 발생했어요.')
      }
      return {
        entries: (data.entries ?? []).map((row) => fromKnowledgeApiRow(companionType, row)),
        total: data.total ?? 0,
      }
    },
    [],
  )

  // PR #45 checkpoint 3.6: the persistent conversation log — every line of
  // InteractionPanel's dialogue feed comes from here on mount, instead of
  // starting empty, so a refresh/re-login no longer loses the conversation.
  const listMessages = useCallback(
    async (companionType: CompanionType, options?: { limit?: number; offset?: number }) => {
      const params = new URLSearchParams({ action: 'messages', companionType })
      if (options?.limit) params.set('limit', String(options.limit))
      if (options?.offset) params.set('offset', String(options.offset))
      const res = await fetch(`/api/character?${params.toString()}`)
      const data = (await res.json().catch(() => ({}))) as {
        messages?: CharacterMessageApiRow[]
        total?: number
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error || '대화 기록을 불러오는 중 오류가 발생했어요.')
      }
      return {
        messages: (data.messages ?? []).map((row) => fromMessageApiRow(companionType, row)),
        total: data.total ?? 0,
      }
    },
    [],
  )

  const getQuiz = useCallback(async (companionType: CompanionType) => {
    const res = await fetch(`/api/character?${new URLSearchParams({ action: 'quiz', companionType })}`)
    const data = (await res.json().catch(() => ({}))) as { question?: QuizQuestion; error?: string }
    if (!res.ok || !data.question) {
      throw new Error(data.error || '퀴즈를 불러오는 중 오류가 발생했어요.')
    }
    return { question: data.question }
  }, [])

  const submitQuiz = useCallback(
    async (companionType: CompanionType, questionId: string, answerIndex: number) => {
      const res = await fetch('/api/character?action=quiz-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionType, questionId, answerIndex }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        correct?: boolean
        explanation?: string
        message?: string
        expAwarded?: number
        exp?: number
        level?: number
        leveledUp?: boolean
        evolved?: boolean
        newAgeTier?: AgeTier | null
        newAgeTierLabel?: string | null
        error?: string
      }
      if (!res.ok || data.correct === undefined || data.exp === undefined || data.level === undefined) {
        throw new Error(data.error || '퀴즈 채점 중 오류가 발생했어요.')
      }
      updateCharacterGrowth(companionType, data.level, data.exp, data.newAgeTier)
      return {
        correct: data.correct,
        explanation: data.explanation ?? '',
        message: data.message ?? '',
        expAwarded: data.expAwarded ?? 0,
        exp: data.exp,
        level: data.level,
        leveledUp: data.leveledUp ?? false,
        evolved: data.evolved ?? false,
        newAgeTier: data.newAgeTier ?? null,
        newAgeTierLabel: data.newAgeTierLabel ?? null,
      }
    },
    [updateCharacterGrowth],
  )

  const getExam = useCallback(async (companionType: CompanionType) => {
    const res = await fetch(`/api/character?${new URLSearchParams({ action: 'exam', companionType })}`)
    const data = (await res.json().catch(() => ({}))) as {
      questions?: ExamQuestion[]
      alreadyPassed?: boolean
      error?: string
    }
    if (!res.ok || !data.questions) {
      throw new Error(data.error || '시험 문제를 불러오는 중 오류가 발생했어요.')
    }
    return { questions: data.questions, alreadyPassed: data.alreadyPassed ?? false }
  }, [])

  const submitExam = useCallback(
    async (companionType: CompanionType, answers: { questionId: string; answerIndex: number }[]) => {
      const res = await fetch('/api/character?action=exam-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionType, answers }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        passed?: boolean
        score?: number
        total?: number
        results?: { questionId: string; correct: boolean }[]
        message?: string
        expAwarded?: number
        exp?: number
        level?: number
        leveledUp?: boolean
        evolved?: boolean
        newAgeTier?: AgeTier | null
        newAgeTierLabel?: string | null
        error?: string
      }
      if (!res.ok || data.passed === undefined || data.score === undefined || data.total === undefined || data.exp === undefined || data.level === undefined) {
        throw new Error(data.error || '시험 채점 중 오류가 발생했어요.')
      }
      updateCharacterGrowth(companionType, data.level, data.exp, data.newAgeTier)
      return {
        passed: data.passed,
        score: data.score,
        total: data.total,
        results: data.results ?? [],
        message: data.message ?? '',
        expAwarded: data.expAwarded ?? 0,
        exp: data.exp,
        level: data.level,
        leveledUp: data.leveledUp ?? false,
        evolved: data.evolved ?? false,
        newAgeTier: data.newAgeTier ?? null,
        newAgeTierLabel: data.newAgeTierLabel ?? null,
      }
    },
    [updateCharacterGrowth],
  )

  // PR #49: 메인 화면 상단 "행동력" HUD용 — 오늘 남은 가르치기/스스로
  // 공부하기 횟수를 소비 없이 조회만 한다(서버의 peekTeachUsage/
  // peekStudyUsage, 순수 SELECT). 캐릭터별이 아니라 계정 전체 하루
  // 한도라 companionType 파라미터가 없다.
  const getUsage = useCallback(async () => {
    const res = await fetch(`/api/character?${new URLSearchParams({ action: 'usage' })}`)
    const data = (await res.json().catch(() => ({}))) as {
      teachRemaining?: number
      teachLimit?: number
      studyRemaining?: number
      studyLimit?: number
      error?: string
    }
    if (!res.ok || data.teachRemaining === undefined || data.studyRemaining === undefined) {
      throw new Error(data.error || '오늘의 행동력 정보를 불러오는 중 오류가 발생했어요.')
    }
    return {
      teachRemaining: data.teachRemaining,
      teachLimit: data.teachLimit ?? 0,
      studyRemaining: data.studyRemaining,
      studyLimit: data.studyLimit ?? 0,
    }
  }, [])

  // PR #63: "가르치기·스스로 공부하기" 패널이 열릴 때(그리고 저장
  // 직후) 지금 연령대의 6개 미션 카드 진행 상태를 보여주기 위한 조회 —
  // 소비 없는 순수 GET이다.
  const getMissionProgress = useCallback(async (companionType: CompanionType) => {
    const res = await fetch(`/api/character?${new URLSearchParams({ action: 'missions', companionType })}`)
    const data = (await res.json().catch(() => ({}))) as { missionProgress?: MissionProgress; error?: string }
    if (!res.ok || !data.missionProgress) {
      throw new Error(data.error || '성장 미션 정보를 불러오는 중 오류가 발생했어요.')
    }
    return data.missionProgress
  }, [])

  return (
    <GrowthContext.Provider
      value={{
        characters,
        loading,
        createCharacter,
        setProfession,
        verifyKnowledge,
        studyGenerate,
        saveKnowledge,
        getMissionProgress,
        listKnowledge,
        listMessages,
        getQuiz,
        submitQuiz,
        getExam,
        submitExam,
        getUsage,
      }}
    >
      {children}
    </GrowthContext.Provider>
  )
}

export function useGrowth() {
  const ctx = useContext(GrowthContext)
  if (!ctx) throw new Error('useGrowth must be used within GrowthProvider')
  return ctx
}
