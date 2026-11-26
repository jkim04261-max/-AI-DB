import { useState } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import type { AgeTier } from '../../data/characterAge'
import { MINIGAME_REGISTRY, minigameSlotCountForTier, type MinigameId } from '../../data/characterMinigames'

// 지시서(연령별 미니게임 보조 편성): 메인 학습 화면의 "서브 메뉴"로
// 들어오는 휴식 공간 — 기존 GameMenu/BottomSheet 패턴 그대로, 새
// 액션('minigames') 하나만 추가해 여기로 연결한다(GrowPage.tsx).
// 지금 연령대가 몇 번째 미니게임까지 "해금"했는지만 보여주고, 실제
// 플레이는 전부 이미 검증된 독립형 컴포넌트(CardMatchGame/JobQuiz,
// 각자 자기 전용 useMockWallet)에 그대로 위임한다 — 여기서 새로
// 점수·XP·잔액 로직을 만들지 않는다.
export default function MinigameHub({ ageTier, ageNumber }: { ageTier: AgeTier; ageNumber?: number }) {
  const [playing, setPlaying] = useState<MinigameId | null>(null)

  const slots = minigameSlotCountForTier(ageTier, ageNumber)
  const unlockedCount = Math.min(slots, MINIGAME_REGISTRY.length)
  // 지시서가 지정한 슬롯 수(1/3/5/7/9/11/13) 중, 아직 실제로 만들어진
  // 미니게임(MINIGAME_REGISTRY)이 못 채우는 나머지 — "앞으로 더 늘어날
  // 자리"가 있다는 걸 숨기지 않고 "준비 중"으로 보여준다.
  const comingSoonCount = Math.max(0, slots - MINIGAME_REGISTRY.length)

  if (playing) {
    const game = MINIGAME_REGISTRY.find((g) => g.id === playing)
    if (game) {
      const GameComponent = game.Component
      return (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-testid="minigame-back-button"
            onClick={() => setPlaying(null)}
            className="flex items-center gap-1 self-start text-xs font-bold text-amber-700 hover:text-amber-900"
          >
            <ArrowLeft size={14} /> 목록으로
          </button>
          <GameComponent />
        </div>
      )
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p data-testid="minigame-slot-count" className="text-xs font-semibold text-amber-700/80">
        지금 연령대에서는 미니게임을 최대 {slots}개까지 즐길 수 있어요 (지금 플레이 가능: {unlockedCount}개)
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MINIGAME_REGISTRY.map((game, index) => {
          const unlocked = index < unlockedCount
          const Icon = game.icon
          return (
            <button
              key={game.id}
              type="button"
              data-testid={`minigame-tile-${game.id}`}
              disabled={!unlocked}
              onClick={() => setPlaying(game.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-colors ${
                unlocked ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 bg-slate-100 opacity-60'
              }`}
            >
              {unlocked ? <Icon size={22} className="text-amber-600" /> : <Lock size={20} className="text-slate-400" />}
              <span className="text-xs font-bold text-amber-900">{game.label}</span>
              <span className="text-[10px] text-amber-700/70">{unlocked ? game.description : '더 자란 뒤에 열려요'}</span>
            </button>
          )
        })}
        {Array.from({ length: comingSoonCount }).map((_, i) => (
          <div
            key={`minigame-coming-soon-${i}`}
            data-testid="minigame-tile-coming-soon"
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center"
          >
            <Lock size={20} className="text-slate-300" />
            <span className="text-[10px] font-semibold text-slate-400">준비 중</span>
          </div>
        ))}
      </div>
    </div>
  )
}
