import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedPrivacy, setAgreedPrivacy] = useState(false)

  const canSubmit = agreedTerms && agreedPrivacy

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
    if (!canSubmit) {
      setError('이용약관과 개인정보처리방침에 동의해야 가입할 수 있어요.')
      return
    }

    setSubmitting(true)
    try {
      await signup(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입 중 오류가 발생했어요.')
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
        <h1 className="text-xl font-bold text-slate-900">회원가입</h1>
        <p className="mt-1 text-sm text-slate-400">누리AI 계정을 만들어보세요</p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 (8자 이상)"
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="비밀번호 확인"
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        />

        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-200"
            />
            <span>
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 hover:underline">
                이용약관
              </Link>
              에 동의합니다 (필수)
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={agreedPrivacy}
              onChange={(e) => setAgreedPrivacy(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-200"
            />
            <span>
              <Link
                to="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 hover:underline"
              >
                개인정보처리방침
              </Link>
              에 동의합니다 (필수)
            </span>
          </label>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="mt-1 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? '가입 중...' : '회원가입'}
        </button>
      </form>

      <p className="text-sm text-slate-500">
        이미 계정이 있으신가요?{' '}
        <Link to="/login" className="font-semibold text-indigo-600 hover:underline">
          로그인
        </Link>
      </p>
    </div>
  )
}
