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
    // PR #49: 스테이지 하단에 얹히는 반투명 목재 액션 바 — 흰 카드 그리드
    // 목록에서, 게임 화면 하단에 붙은 RPG형 액션 바 느낌으로 바꿨다.
    // 버튼 텍스트/role은 그대로라 기존 e2e 셀렉터가 그대로 통한다.
    <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-amber-900/40 bg-amber-950/75 p-1.5 backdrop-blur-sm sm:gap-2">
      {ITEMS.map(({ action, label, icon: Icon }) => (
        <button
          key={action}
          type="button"
          onClick={() => onSelect(action)}
          disabled={disabled}
          // 44px+ 터치 타깃 보장(py-3 + 아이콘/텍스트 2줄)
          className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-semibold text-amber-50 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
        >
          <Icon size={18} className="text-amber-300" />
          {label}
        </button>
      ))}
    </div>
  )
}
