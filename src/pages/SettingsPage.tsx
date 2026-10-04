import { Settings, FileText, ShieldCheck, Sparkles, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const legalLinks = [
  { to: '/terms', label: '이용약관', icon: FileText },
  { to: '/privacy', label: '개인정보처리방침', icon: ShieldCheck },
  { to: '/ai-notice', label: 'AI 서비스 이용 고지', icon: Sparkles },
]

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
          <Settings size={26} />
        </span>
        <h1 className="text-xl font-bold text-slate-900">설정</h1>
        <p className="text-sm text-slate-400">알림, 계정, 테마 등 누리AI 사용 환경을 관리하세요.</p>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        <h2 className="px-3 pt-2 text-sm font-semibold text-slate-700">법률 및 정책</h2>
        {legalLinks.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <span className="flex items-center gap-3">
              <item.icon size={18} className="text-slate-400" />
              {item.label}
            </span>
            <ChevronRight size={16} className="text-slate-300" />
          </Link>
        ))}
      </div>
    </div>
  )
}
