import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, MessageCircle, MessageSquare, Paperclip, ShieldAlert } from 'lucide-react'

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
    </div>
  )
}
