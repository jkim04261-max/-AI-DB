import { BookOpen, MessageCircle, HelpCircle, Sparkles, TrendingUp, Images, Shirt, Store } from 'lucide-react'

export type GameMenuAction = 'teach' | 'chat-log' | 'quiz' | 'study' | 'growth' | 'album' | 'customize' | 'market'

interface MenuItem {
  action: GameMenuAction
  label: string
  icon: typeof BookOpen
  // PR #50: 커스터마이징 룸/마켓은 직업 선택과 무관하게 항상 쓸 수
  // 있다 — 나머지 6개(가르치기 등)는 기존처럼 직업이 있어야 한다.
  alwaysEnabled?: boolean
}

// PR #46 요청 5번: 하단 게임 메뉴. 각 버튼은 GrowPage에서 기존
// 기능(InteractionPanel/ExamPanel/listMessages 등)에 연결된다 — 이
// 컴포넌트 자체는 어떤 API도 호출하지 않는 순수 메뉴 UI. PR #50:
// 커스터마이징 룸/아이템 마켓 2개를 추가해 4열×2행으로 늘렸다.
const ITEMS: MenuItem[] = [
  { action: 'teach', label: '가르치기', icon: BookOpen },
  { action: 'chat-log', label: '함께 대화하기', icon: MessageCircle },
  { action: 'quiz', label: '문제 풀기', icon: HelpCircle },
  { action: 'study', label: '스스로 공부하기', icon: Sparkles },
  { action: 'growth', label: '성장 보기', icon: TrendingUp },
  { action: 'album', label: '앨범·기록', icon: Images },
  { action: 'customize', label: '커스터마이징', icon: Shirt, alwaysEnabled: true },
  { action: 'market', label: '아이템 마켓', icon: Store, alwaysEnabled: true },
]

export default function GameMenu({
  disabled,
  examSupported,
  onSelect,
}: {
  disabled: boolean
  // PR #51(직업 선택 제한 해제): "문제 풀기"는 지금 고른 직업이 회계사·
  // 가수일 때만 쓸 수 있다(나머지 48개는 시험 문제은행이 없음) — 이
  // 메뉴 전체를 막는 disabled와 달리 quiz 버튼 하나만 추가로 막는다.
  examSupported: boolean
  onSelect: (action: GameMenuAction) => void
}) {
  return (
    // PR #49: 스테이지 하단에 얹히는 반투명 목재 액션 바 — 흰 카드 그리드
    // 목록에서, 게임 화면 하단에 붙은 RPG형 액션 바 느낌으로 바꿨다.
    // 버튼 텍스트/role은 그대로라 기존 e2e 셀렉터가 그대로 통한다.
    // PR #54 요청 3번: PC(lg+)에서는 더 이상 4열 그리드가 아니라 세로
    // 한 줄 사이드 패널 목록으로 보여준다 — GrowPage가 바깥에서 이
    // 메뉴를 하단 대신 옆면 패널에 배치하고(flex-row), 이 컴포넌트는
    // lg:grid-cols-1로 한 칸씩 쌓이게만 바꾸면 된다(별도 prop 없이
    // 반응형 클래스만으로 처리 — 로직/접근성 계약은 100% 동일).
    <div className="grid grid-cols-4 gap-1.5 rounded-2xl border border-amber-900/40 bg-amber-950/75 p-1.5 backdrop-blur-sm sm:gap-2 lg:grid-cols-1 lg:gap-1.5 lg:border-none lg:bg-transparent lg:p-0">
      {ITEMS.map(({ action, label, icon: Icon, alwaysEnabled }) => {
        const quizBlocked = action === 'quiz' && !examSupported
        return (
          <button
            key={action}
            type="button"
            onClick={() => onSelect(action)}
            disabled={(!alwaysEnabled && disabled) || quizBlocked}
            // 44px+ 터치 타깃 보장(py-3 + 아이콘/텍스트 2줄). lg+에서는
            // 세로 목록이라 아이콘+글자를 가로로 나란히 배치한다.
            className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-semibold text-amber-50 active:scale-95 disabled:opacity-40 disabled:active:scale-100 lg:min-h-[48px] lg:flex-row lg:justify-start lg:gap-2.5 lg:rounded-xl lg:px-3 lg:text-xs lg:hover:bg-amber-900/40"
          >
            <Icon size={17} className="text-amber-300" />
            {label}
            {quizBlocked && <span className="text-[9px] font-normal text-amber-300/70">준비 중</span>}
          </button>
        )
      })}
    </div>
  )
}
