import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error || '요청 처리 중 오류가 발생했어요.')
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 처리 중 오류가 발생했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 px-4 py-14">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white">
        <Sparkles size={22} fill="currentColor" />
      </span>
      <div className="text-center">
        <h1 className="text-xl font-bold text-slate-900">비밀번호 재설정</h1>
        <p className="mt-1 text-sm text-slate-400">가입하신 이메일로 재설정 링크를 보내드려요</p>
      </div>

      {sent ? (
        <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-slate-200 p-5 text-center">
          <p className="text-sm text-slate-600">
            입력하신 이메일이 가입되어 있다면 잠시 후 재설정 메일을 받으실 수 있어요.
          </p>
          <p className="text-xs text-slate-400">메일이 오지 않으면 스팸함도 확인해주세요.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="가입한 이메일"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? '요청 중...' : '재설정 링크 받기'}
          </button>
        </form>
      )}

      <p className="text-sm text-slate-500">
        <Link to="/login" className="font-semibold text-indigo-600 hover:underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  )
}
