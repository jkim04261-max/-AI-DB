import { Sparkles } from 'lucide-react'
import type { QuestAction } from '../../data/characterQuests'
import type { GameMenuAction } from './GameMenu'

// PR #48: 메인 화면에 항상 보이는 "퀘스트 제안" 카드 — characterQuests.ts가
// 계산한 문구를 보여주고, 바로 그 자리에서 해당 게임 메뉴를 열 수 있는
// 버튼을 둔다(새 화면 전환 없이 GrowPage의 기존 BottomSheet를 그대로
// 재사용). action이 없으면(직업 미선택) 버튼 없이 안내 문구만 보여준다.
export default function QuestBanner({
  text,
  action,
  onAction,
}: {
  text: string
  action: QuestAction | null
  onAction: (action: GameMenuAction) => void
}) {
  return (
    <div data-testid="quest-banner" className="flex items-center justify-between gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
        <Sparkles size={15} className="shrink-0 text-indigo-500" />
        <span>{text}</span>
      </div>
      {action && (
        <button
          onClick={() => onAction(action)}
          className="shrink-0 rounded-full bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white active:scale-95"
        >
          바로가기
        </button>
      )}
    </div>
  )
}
