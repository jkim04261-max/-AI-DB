import { BookOpen, MessageCircle, HelpCircle, Sparkles, TrendingUp, Images } from 'lucide-react'

export type GameMenuAction = 'teach' | 'chat-log' | 'quiz' | 'study' | 'growth' | 'album'

interface MenuItem {
  action: GameMenuAction
  label: string
  icon: typeof BookOpen
}

// PR #46 요청 5번: 하단 게임 메뉴 6종. 각 버튼은 GrowPage에서 기존
// 기능(InteractionPanel/ExamPanel/listMessages 등)에 연결된다 — 이
// 컴포넌트 자체는 어떤 API도 호출하지 않는 순수 메뉴 UI.
const ITEMS: MenuItem[] = [
  { action: 'teach', label: '가르치기', icon: BookOpen },
  { action: 'chat-log', label: '함께 대화하기', icon: MessageCircle },
  { action: 'quiz', label: '문제 풀기', icon: HelpCircle },
  { action: 'study', label: '스스로 공부하기', icon: Sparkles },
  { action: 'growth', label: '성장 보기', icon: TrendingUp },
  { action: 'album', label: '앨범·기록', icon: Images },
]

export default function GameMenu({
  disabled,
  onSelect,
}: {
  disabled: boolean
  onSelect: (action: GameMenuAction) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ITEMS.map(({ action, label, icon: Icon }) => (
        <button
          key={action}
          type="button"
          onClick={() => onSelect(action)}
          disabled={disabled}
          // 44px+ 터치 타깃 보장(py-3 + 아이콘/텍스트 2줄)
          className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-600 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
        >
          <Icon size={18} className="text-indigo-500" />
          {label}
        </button>
      ))}
    </div>
  )
}
