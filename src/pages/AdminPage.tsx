import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  MessageCircle,
  MessageSquare,
  Paperclip,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Percent,
  CalendarClock,
  Activity,
} from 'lucide-react'

interface AdminStats {
  users: number
  conversations: number
  messages: number
  attachments: number
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; stats: AdminStats }

const statCards = [
  { key: 'users' as const, label: '전체 회원 수', icon: Users },
  { key: 'conversations' as const, label: '전체 대화 수', icon: MessageCircle },
  { key: 'messages' as const, label: '전체 메시지 수', icon: MessageSquare },
  { key: 'attachments' as const, label: '전체 첨부파일 수', icon: Paperclip },
]

interface AiUsageError {
  id: number
  occurredAt: string
  model: string
  kind: string
  message: string
}

interface AiUsage {
  total: number
  success: number
  failed: number
  successRate: number
  today: number
  recentErrors: AiUsageError[]
}

type AiUsageLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; usage: AiUsage }

const aiUsageCards = [
  { key: 'total' as const, label: '전체 AI 요청 수', icon: Activity, format: (v: number) => v.toLocaleString() },
  { key: 'success' as const, label: '성공한 AI 요청 수', icon: CheckCircle2, format: (v: number) => v.toLocaleString() },
  { key: 'failed' as const, label: '실패한 AI 요청 수', icon: XCircle, format: (v: number) => v.toLocaleString() },
  { key: 'successRate' as const, label: '성공률', icon: Percent, format: (v: number) => `${v}%` },
  { key: 'today' as const, label: '오늘 AI 요청 수', icon: CalendarClock, format: (v: number) => v.toLocaleString() },
]

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetch('/api/admin/stats')
      .then(async (res) => {
        if (cancelled) return

        // Access control is enforced by the server (401/403) — a non-admin
        // (or logged-out) visitor is sent away without ever seeing any
        // stats, regardless of how they reached this URL.
        if (res.status === 401 || res.status === 403) {
          navigate('/', { replace: true })
          return
        }

        const data = (await res.json().catch(() => ({}))) as Partial<AdminStats> & {
          error?: string
        }

        if (!res.ok) {
          setState({ status: 'error', message: data.error || '통계를 불러오지 못했어요.' })
          return
        }

        if (
          typeof data.users !== 'number' ||
          typeof data.conversations !== 'number' ||
          typeof data.messages !== 'number' ||
          typeof data.attachments !== 'number'
        ) {
          setState({ status: 'error', message: '통계 응답 형식이 올바르지 않아요.' })
          return
        }

        setState({
          status: 'ready',
          stats: {
            users: data.users,
            conversations: data.conversations,
            messages: data.messages,
            attachments: data.attachments,
          },
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', message: '통계를 불러오는 중 오류가 발생했어요.' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [navigate])

  const [aiUsageState, setAiUsageState] = useState<AiUsageLoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetch('/api/admin/ai-usage')
      .then(async (res) => {
        if (cancelled) return

        // Same server-enforced access control as the stats fetch above —
        // a non-admin never sees AI usage/error data either.
        if (res.status === 401 || res.status === 403) {
          navigate('/', { replace: true })
          return
        }

        const data = (await res.json().catch(() => ({}))) as Partial<AiUsage> & { error?: string }

        if (!res.ok) {
          setAiUsageState({ status: 'error', message: data.error || 'AI 사용 현황을 불러오지 못했어요.' })
          return
        }

        if (
          typeof data.total !== 'number' ||
          typeof data.success !== 'number' ||
          typeof data.failed !== 'number' ||
          typeof data.successRate !== 'number' ||
          typeof data.today !== 'number' ||
          !Array.isArray(data.recentErrors)
        ) {
          setAiUsageState({ status: 'error', message: 'AI 사용 현황 응답 형식이 올바르지 않아요.' })
          return
        }

        setAiUsageState({
          status: 'ready',
          usage: {
            total: data.total,
            success: data.success,
            failed: data.failed,
            successRate: data.successRate,
            today: data.today,
            recentErrors: data.recentErrors,
          },
        })
      })
      .catch(() => {
        if (!cancelled) {
          setAiUsageState({ status: 'error', message: 'AI 사용 현황을 불러오는 중 오류가 발생했어요.' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-bold text-slate-900">관리자 대시보드</h1>

      {state.status === 'loading' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.key}
              className="h-24 animate-pulse rounded-2xl bg-slate-100"
            />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <ShieldAlert size={22} />
          </span>
          <p className="text-sm text-slate-500">{state.message}</p>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.key}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:p-5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                <card.icon size={18} />
              </span>
              <div>
                <p className="text-xl font-bold text-slate-900">
                  {state.stats[card.key].toLocaleString()}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{card.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-800">AI 사용 현황</h2>

        {aiUsageState.status === 'loading' && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {aiUsageCards.map((card) => (
              <div key={card.key} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        )}

        {aiUsageState.status === 'error' && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
              <ShieldAlert size={22} />
            </span>
            <p className="text-sm text-slate-500">{aiUsageState.message}</p>
          </div>
        )}

        {aiUsageState.status === 'ready' && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {aiUsageCards.map((card) => (
                <div
                  key={card.key}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:p-5"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                    <card.icon size={18} />
                  </span>
                  <div>
                    <p className="text-xl font-bold text-slate-900">
                      {card.format(aiUsageState.usage[card.key])}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{card.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
              <h3 className="text-sm font-semibold text-slate-700">최근 AI 오류 내역</h3>
              {aiUsageState.usage.recentErrors.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">최근 오류가 없어요.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {aiUsageState.usage.recentErrors.map((err) => (
                    <li key={err.id} className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>{formatDateTime(err.occurredAt)}</span>
                        <span className="text-slate-300">·</span>
                        <span>{err.model}</span>
                        <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-500">
                          {err.kind}
                        </span>
                      </div>
                      <p className="text-slate-600">{err.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
