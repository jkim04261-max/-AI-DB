import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

export type CompanionType = 'nuri' | 'duri'

export interface Character {
  id: number
  companionType: CompanionType
  stage: 'child' | 'adult'
  createdAt: string
}

interface GrowthContextValue {
  characters: Character[]
  loading: boolean
  createCharacter: (companionType: CompanionType) => Promise<void>
}

interface CharacterApiRow {
  id: number
  companion_type: CompanionType
  stage: 'child' | 'adult'
  created_at: string
}

function fromApiRow(row: CharacterApiRow): Character {
  return { id: row.id, companionType: row.companion_type, stage: row.stage, createdAt: row.created_at }
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

  return (
    <GrowthContext.Provider value={{ characters, loading, createCharacter }}>
      {children}
    </GrowthContext.Provider>
  )
}

export function useGrowth() {
  const ctx = useContext(GrowthContext)
  if (!ctx) throw new Error('useGrowth must be used within GrowthProvider')
  return ctx
}
