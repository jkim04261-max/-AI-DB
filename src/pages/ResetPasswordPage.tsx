import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import PasswordInput from '../components/PasswordInput'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 해요.')
      return
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않아요.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error || '비밀번호를 변경하는 중 오류가 발생했어요.')
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호를 변경하는 중 오류가 발생했어요.')
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
        <h1 className="text-xl font-bold text-slate-900">새 비밀번호 설정</h1>
        <p className="mt-1 text-sm text-slate-400">새로 사용할 비밀번호를 입력해주세요</p>
      </div>

      {done ? (
        <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-slate-200 p-5 text-center">
          <p className="text-sm text-slate-600">비밀번호가 변경됐어요. 새 비밀번호로 다시 로그인해주세요.</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-1 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white"
          >
            로그인하러 가기
          </button>
        </div>
      ) : !token ? (
        <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-slate-200 p-5 text-center">
          <p className="text-sm text-red-500">재설정 링크가 올바르지 않아요.</p>
          <Link to="/forgot-password" className="text-sm font-semibold text-indigo-600 hover:underline">
            다시 요청하기
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
          <PasswordInput
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="새 비밀번호 (8자 이상)"
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
          <PasswordInput
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="새 비밀번호 확인"
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      )}
    </div>
  )
}
