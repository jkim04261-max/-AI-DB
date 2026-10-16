import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export interface AuthUser {
  id: number
  email: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  // Both null when the server-side daily limit feature is off (or its
  // state hasn't loaded yet) — see api/auth/me.ts, which omits these
  // fields entirely in that case.
  dailyQuestionLimit: number | null
  remainingQuestions: number | null
  setRemainingQuestions: (value: number) => void
  signup: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  deleteAccount: () => Promise<void>
}

async function parseJsonResponse(res: Response) {
  const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string }
  if (!res.ok) {
    throw new Error(data.error || '요청 처리 중 오류가 발생했어요.')
  }
  return data
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [dailyQuestionLimit, setDailyQuestionLimit] = useState<number | null>(null)
  const [remainingQuestions, setRemainingQuestions] = useState<number | null>(null)

  type MeResponse = {
    user?: AuthUser | null
    dailyQuestionLimit?: number
    remainingQuestions?: number | null
  }
  const applyMeResponse = useCallback((data: MeResponse) => {
    setUser(data.user ?? null)
    setDailyQuestionLimit(data.dailyQuestionLimit ?? null)
    setRemainingQuestions(data.remainingQuestions ?? null)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data: MeResponse) => applyMeResponse(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [applyMeResponse])

  const signup = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await parseJsonResponse(res)
    setUser(data.user ?? null)
    // The signup response doesn't carry the daily-limit fields (that file
    // is untouched by this feature) — refetch /me right after so a brand
    // new account's "오늘 남은 무료 질문" shows up without waiting for a
    // page reload. Best-effort: a failure here just leaves the limit
    // fields at their current (null) value.
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((meData: MeResponse) => applyMeResponse(meData))
      .catch(() => {})
  }, [applyMeResponse])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await parseJsonResponse(res)
    setUser(data.user ?? null)
    // Same reasoning as signup above — login.ts's response also doesn't
    // carry the daily-limit fields.
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((meData: MeResponse) => applyMeResponse(meData))
      .catch(() => {})
  }, [applyMeResponse])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setDailyQuestionLimit(null)
    setRemainingQuestions(null)
  }, [])

  const deleteAccount = useCallback(async () => {
    const res = await fetch('/api/account/delete', { method: 'DELETE' })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      throw new Error(data.error || '계정을 삭제하는 중 오류가 발생했어요.')
    }
    setUser(null)
    setDailyQuestionLimit(null)
    setRemainingQuestions(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        dailyQuestionLimit,
        remainingQuestions,
        setRemainingQuestions,
        signup,
        login,
        logout,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
