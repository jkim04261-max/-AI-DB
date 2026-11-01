import { useState } from 'react'
import { Lock, Check } from 'lucide-react'
import CharacterSprite from './CharacterSprite'
import type { CompanionType } from '../../context/GrowthContext'
import type { AppearanceTier } from '../../data/characterAppearance'
import {
  CUSTOMIZATION_CATALOG,
  CATEGORY_LABEL,
  type CustomizationCategory,
  type OutfitId,
} from '../../data/characterCustomization'
import type { MockInventory } from '../../hooks/useMockInventory'

const CATEGORY_ORDER: CustomizationCategory[] = ['outfit', 'hair', 'face', 'scale', 'voice']

// PR #50: "커스터마이징 룸" — 보유한 외형을 실시간으로 미리보고 장착할
// 수 있는 화면. 옷(outfit)만 실제로 캐릭터 그림에 반영되고(아래
// CharacterSprite의 outfitId), 나머지 분류는 카탈로그/보유 상태는
// 실제지만 아직 그림에 반영되지 않는다 — 안 바뀌는데 바뀐 것처럼
// 보이지 않도록 "곧 추가될 예정" 안내를 함께 보여준다.
export default function CustomizationRoom({
  companionType,
  tier,
  inventory,
  onOpenMarket,
}: {
  companionType: CompanionType
  tier: AppearanceTier
  inventory: MockInventory
  onOpenMarket: () => void
}) {
  const [activeCategory, setActiveCategory] = useState<CustomizationCategory>('outfit')
  const equippedOutfitId = inventory.equippedOutfit[companionType]
  const items = CUSTOMIZATION_CATALOG.filter(
    (i) => i.category === activeCategory && (i.companionType === companionType || i.companionType === 'any'),
  )

  return (
    <div className="flex flex-col gap-4">
      {/* PR #50 긴급 재작업: 메인 화면이 이제 실제 일러스트 자체를 그대로
          보여주므로, 여기서 같은 그림을 "참고용"으로 또 보여줄 필요가
          없어졌다. 대신 옷을 실시간으로 갈아입혀 볼 수 있는 이 미리보기는
          (그림 한 장짜리 일러스트로는 불가능한 기능이라) 기존 SVG로
          계속 보여준다 — 그 차이를 짧게 안내한다. */}
      <p className="text-center text-[11px] text-amber-600">메인 화면은 제공해주신 일러스트로 표시돼요. 여기서는 옷을 실시간으로 갈아입혀 미리 볼 수 있어요.</p>

      <div className="flex justify-center rounded-2xl bg-amber-950 p-4">
        <CharacterSprite companionType={companionType} pose="idle" size={140} tier={tier} outfitId={equippedOutfitId as OutfitId} />
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-full bg-amber-100 p-1">
        {CATEGORY_ORDER.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeCategory === category ? 'bg-white text-amber-700 shadow-sm' : 'text-amber-500/70'
            }`}
          >
            {CATEGORY_LABEL[category]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const owned = activeCategory === 'outfit' ? inventory.ownedOutfits.has(item.id as OutfitId) : item.priceGold === 0
          const equipped = activeCategory === 'outfit' && item.id === equippedOutfitId
          return (
            <div
              key={item.id}
              className="flex flex-col items-center gap-1 rounded-xl border-2 border-[#d4af37]/60 bg-gradient-to-b from-white to-amber-50 p-3 text-center shadow-[0_1px_0_rgba(212,175,55,0.5)]"
            >
              <span className="text-2xl">{item.icon}</span>
              <p className="text-xs font-semibold text-amber-900">{item.label}</p>
              {!item.visuallyWired && <p className="text-[9px] text-amber-400">곧 추가될 예정</p>}
              {owned ? (
                equipped ? (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    <Check size={10} /> 장착 중
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={activeCategory !== 'outfit'}
                    onClick={() => activeCategory === 'outfit' && inventory.equipOutfit(companionType, item.id as OutfitId)}
                    className="rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    장착하기
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={onOpenMarket}
                  className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-500"
                >
                  <Lock size={10} /> 마켓에서 구매
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
