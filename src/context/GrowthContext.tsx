import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import type { ProfessionId } from '../data/characterProfessions'

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
  title: string
  originalContent: string
  finalContent: string
  verificationStatus: VerificationStatus
  verificationExplanation: string
  source: KnowledgeSource
  createdAt: string
}

interface KnowledgeEntryApiRow {
  id: number
  character_id: number
  profession: ProfessionId
  title: string
  original_content: string
  final_content: string
  verification_status: VerificationStatus
  verification_explanation: string
  source: KnowledgeSource
  created_at: string
}

export interface Character {
  id: number
  companionType: CompanionType
  stage: 'child' | 'adult'
  profession: ProfessionId | null
  // PR #45 checkpoint 4: a game-progression indicator only — level/exp
  // reflect activity inside 누리AI (지식 저장/퀴즈/시험), never the real
  // Gemini model's actual capability. See characterDialogue.ts's
  // KNOWLEDGE_VS_MODEL_DISCLAIMER, shown next to this in the UI.
  level: number
  exp: number
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
  createCharacter: (companionType: CompanionType) => Promise<void>
  setProfession: (companionType: CompanionType, profession: ProfessionId) => Promise<void>
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
  }>
  studyGenerate: (companionType: CompanionType) => Promise<{
    knowledge: { title: string; content: string }
    verification: KnowledgeVerification
    verificationToken: string
    characterReply: string
    remaining: number
    dailyStudyLimit: number
  }>
  saveKnowledge: (
    companionType: CompanionType,
    title: string,
    originalContent: string,
    finalContent: string,
    verificationToken: string,
  ) => Promise<{ entry: KnowledgeEntry; savedReply: string } & GrowthUpdate>
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
  ) => Promise<{ correct: boolean; explanation: string; message: string } & GrowthUpdate>
  getExam: (companionType: CompanionType) => Promise<{ questions: ExamQuestion[]; alreadyPassed: boolean }>
  submitExam: (
    companionType: CompanionType,
    answers: { questionId: string; answerIndex: number }[],
  ) => Promise<{ passed: boolean; score: number; total: number; results: { questionId: string; correct: boolean }[]; message: string } & GrowthUpdate>
}

interface CharacterApiRow {
  id: number
  companion_type: CompanionType
  stage: 'child' | 'adult'
  profession: ProfessionId | null
  level: number
  exp: number
  created_at: string
}

function fromApiRow(row: CharacterApiRow): Character {
  return {
    id: row.id,
    companionType: row.companion_type,
    stage: row.stage,
    profession: row.profession,
    level: row.level ?? 1,
    exp: row.exp ?? 0,
    createdAt: row.created_at,
  }
}

function fromKnowledgeApiRow(companionType: CompanionType, row: KnowledgeEntryApiRow): KnowledgeEntry {
  return {
    id: row.id,
    companionType,
    profession: row.profession,
    title: row.title,
    originalContent: row.original_content,
    finalContent: row.final_content,
    verificationStatus: row.verification_status,
    verificationExplanation: row.verification_explanation,
    source: row.source,
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
  const updateCharacterGrowth = useCallback((companionType: CompanionType, level: number, exp: number) => {
    setCharacters((prev) => prev.map((c) => (c.companionType === companionType ? { ...c, level, exp } : c)))
  }, [])

  const createCharacter = useCallback(async (companionType: CompanionType) => {
    const res = await fetch('/api/character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionType }),
    })
    const data = (await res.json().catch(() => ({}))) as { character?: CharacterApiRow; error?: string }
    if (!res.ok || !data.character) {
      throw new Error(data.error || '캐릭터를 만드는 중 오류가 발생했어요.')
    }
    const created = fromApiRow(data.character)
    setCharacters((prev) => [...prev, created])
  }, [])

  const setProfession = useCallback(async (companionType: CompanionType, profession: ProfessionId) => {
    const res = await fetch('/api/character', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionType, profession }),
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
      error?: string
    }
    if (!res.ok || !data.verification || !data.verificationToken || !data.characterReply) {
      throw new Error(data.error || '지식을 검증하는 중 오류가 발생했어요.')
    }
    return {
      verification: data.verification,
      verificationToken: data.verificationToken,
      characterReply: data.characterReply,
      remaining: data.remaining ?? 0,
      dailyTeachLimit: data.dailyTeachLimit ?? 0,
    }
  }, [])

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
      error?: string
    }
    if (!res.ok || !data.knowledge || !data.verification || !data.verificationToken || !data.characterReply) {
      throw new Error(data.error || '스스로 공부하는 중 오류가 발생했어요.')
    }
    return {
      knowledge: data.knowledge,
      verification: data.verification,
      verificationToken: data.verificationToken,
      characterReply: data.characterReply,
      remaining: data.remaining ?? 0,
      dailyStudyLimit: data.dailyStudyLimit ?? 0,
    }
  }, [])

  const saveKnowledge = useCallback(
    async (
      companionType: CompanionType,
      title: string,
      originalContent: string,
      finalContent: string,
      verificationToken: string,
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
        body: JSON.stringify({ companionType, title, originalContent, finalContent, verificationToken, requestId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        entry?: KnowledgeEntryApiRow
        savedReply?: string
        expAwarded?: number
        exp?: number
        level?: number
        leveledUp?: boolean
        error?: string
      }
      if (!res.ok || !data.entry || !data.savedReply || data.exp === undefined || data.level === undefined) {
        throw new Error(data.error || '학습 기록을 저장하는 중 오류가 발생했어요.')
      }
      updateCharacterGrowth(companionType, data.level, data.exp)
      return {
        entry: fromKnowledgeApiRow(companionType, data.entry),
        savedReply: data.savedReply,
        expAwarded: data.expAwarded ?? 0,
        exp: data.exp,
        level: data.level,
        leveledUp: data.leveledUp ?? false,
      }
    },
    [updateCharacterGrowth],
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
        error?: string
      }
      if (!res.ok || data.correct === undefined || data.exp === undefined || data.level === undefined) {
        throw new Error(data.error || '퀴즈 채점 중 오류가 발생했어요.')
      }
      updateCharacterGrowth(companionType, data.level, data.exp)
      return {
        correct: data.correct,
        explanation: data.explanation ?? '',
        message: data.message ?? '',
        expAwarded: data.expAwarded ?? 0,
        exp: data.exp,
        level: data.level,
        leveledUp: data.leveledUp ?? false,
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
        error?: string
      }
      if (!res.ok || data.passed === undefined || data.score === undefined || data.total === undefined || data.exp === undefined || data.level === undefined) {
        throw new Error(data.error || '시험 채점 중 오류가 발생했어요.')
      }
      updateCharacterGrowth(companionType, data.level, data.exp)
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
      }
    },
    [updateCharacterGrowth],
  )

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
        listKnowledge,
        listMessages,
        getQuiz,
        submitQuiz,
        getExam,
        submitExam,
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
