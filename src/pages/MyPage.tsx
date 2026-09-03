import { User, Crown, LogOut } from 'lucide-react'

export default function MyPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-bold text-slate-900">마이페이지</h1>

      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-slate-500">
          <User size={30} />
        </span>
        <div>
          <p className="text-base font-semibold text-slate-900">사용자님</p>
          <p className="text-sm text-slate-400">jkim04261@gmail.com</p>
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
            무료 플랜
          </span>
        </div>
      </div>

      <button className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left hover:bg-indigo-100">
        <span className="flex items-center gap-3 text-sm font-semibold text-indigo-600">
          <Crown size={18} />
          프리미엄으로 업그레이드
        </span>
        <span className="text-xs text-indigo-400">자세히 보기</span>
      </button>

      <button className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm font-medium text-slate-500 hover:bg-slate-50">
        <LogOut size={18} />
        로그아웃
      </button>
    </div>
  )
}
