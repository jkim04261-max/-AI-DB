import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import type { ProfessionId } from '../data/characterProfessions'

export type CompanionType = 'nuri' | 'duri'

export type VerificationStatus = 'appropriate' | 'needs_revision' | 'unverifiable'

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
  created_at: string
}

export interface Character {
  id: number
  companionType: CompanionType
  stage: 'child' | 'adult'
  profession: ProfessionId | null
  createdAt: string
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
  ) => Promise<{ verification: KnowledgeVerification; remaining: number; dailyTeachLimit: number }>
  saveKnowledge: (
    companionType: CompanionType,
    title: string,
    originalContent: string,
    finalContent: string,
    verification: KnowledgeVerification,
  ) => Promise<KnowledgeEntry>
  listKnowledge: (
    companionType: CompanionType,
    options?: { limit?: number; offset?: number },
  ) => Promise<{ entries: KnowledgeEntry[]; total: number }>
}

interface CharacterApiRow {
  id: number
  companion_type: CompanionType
  stage: 'child' | 'adult'
  profession: ProfessionId | null
  created_at: string
}

function fromApiRow(row: CharacterApiRow): Character {
  return {
    id: row.id,
    companionType: row.companion_type,
    stage: row.stage,
    profession: row.profession,
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
      remaining?: number
      dailyTeachLimit?: number
      error?: string
    }
    if (!res.ok || !data.verification) {
      throw new Error(data.error || '지식을 검증하는 중 오류가 발생했어요.')
    }
    return { verification: data.verification, remaining: data.remaining ?? 0, dailyTeachLimit: data.dailyTeachLimit ?? 0 }
  }, [])

  const saveKnowledge = useCallback(
    async (
      companionType: CompanionType,
      title: string,
      originalContent: string,
      finalContent: string,
      verification: KnowledgeVerification,
    ) => {
      // A fresh key per save attempt — if this exact request somehow reaches
      // the server twice (a retried fetch, a double click that got through
      // before the button disabled), the server recognizes the repeat and
      // returns the original row instead of saving a duplicate.
      const requestId = crypto.randomUUID()
      const res = await fetch('/api/character?action=save-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionType, title, originalContent, finalContent, verification, requestId }),
      })
      const data = (await res.json().catch(() => ({}))) as { entry?: KnowledgeEntryApiRow; error?: string }
      if (!res.ok || !data.entry) {
        throw new Error(data.error || '학습 기록을 저장하는 중 오류가 발생했어요.')
      }
      return fromKnowledgeApiRow(companionType, data.entry)
    },
    [],
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

  return (
    <GrowthContext.Provider
      value={{ characters, loading, createCharacter, setProfession, verifyKnowledge, saveKnowledge, listKnowledge }}
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
