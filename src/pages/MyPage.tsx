import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Crown, LogOut, LogIn, UserPlus, MessageSquare, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useChats } from '../context/ChatContext'
import { useComingSoonNotice } from '../lib/comingSoon'
import ComingSoonToast from '../components/ComingSoonToast'

export default function MyPage() {
  const { user, loading, logout, deleteAccount } = useAuth()
  const { chats } = useChats()
  const navigate = useNavigate()
  const { notice, showComingSoon } = useComingSoonNotice()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const handleDeleteAccountConfirm = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount()
      navigate('/')
    } catch (err) {
      setIsDeleting(false)
      setDeleteError(err instanceof Error ? err.message : '회원탈퇴 중 오류가 발생했어요.')
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <h1 className="text-xl font-bold text-slate-900">마이페이지</h1>
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <h1 className="text-xl font-bold text-slate-900">마이페이지</h1>

        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <User size={26} />
          </span>
          <p className="text-sm text-slate-500">로그인하면 대화 기록과 설정을 이용할 수 있어요.</p>

          <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
            <button
              onClick={() => navigate('/login')}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white"
            >
              <LogIn size={16} />
              로그인
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <UserPlus size={16} />
              회원가입
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-bold text-slate-900">마이페이지</h1>

      {/* 계정 정보 + 이용 플랜 */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
          <User size={30} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{user.email}</p>
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
            무료 플랜
          </span>
        </div>
      </div>

      {/* 이용 현황 + 데이터 관리 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">이용 현황</h2>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
            <MessageSquare size={18} />
          </span>
          <div>
            <p className="text-lg font-bold text-slate-900">{chats.length}개</p>
            <p className="text-xs text-slate-400">저장된 대화</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/chat')}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          내 대화 보기
        </button>
      </div>

      {/* 이용 플랜 업그레이드 — 결제 기능은 아직 없어서 "준비 중" 안내만 표시 */}
      <button
        onClick={showComingSoon}
        className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left hover:bg-indigo-100"
      >
        <span className="flex items-center gap-3 text-sm font-semibold text-indigo-600">
          <Crown size={18} />
          프리미엄으로 업그레이드
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-indigo-400">
          준비 중
        </span>
      </button>

      {/* 계정 관리 */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-500 hover:bg-slate-50"
        >
          <LogOut size={18} />
          로그아웃
        </button>

        <button
          onClick={() => {
            setDeleteError(null)
            setConfirmOpen(true)
          }}
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-red-500 hover:bg-red-50"
        >
          <Trash2 size={18} />
          회원탈퇴
        </button>
      </div>

      <ComingSoonToast message={notice} />

      {confirmOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-slate-900">정말 회원탈퇴 하시겠어요?</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              계정과 저장된 모든 대화, 첨부 이미지가 영구적으로 삭제되며 되돌릴 수 없어요.
            </p>
            {deleteError && <p className="mt-2 text-xs text-red-500">{deleteError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isDeleting}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteAccountConfirm}
                disabled={isDeleting}
                className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {isDeleting ? '삭제 중...' : '회원탈퇴'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
