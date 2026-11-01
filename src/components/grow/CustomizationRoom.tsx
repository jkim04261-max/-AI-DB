import { useState } from 'react'
import { Lock, Check } from 'lucide-react'
import conceptLobbyImg from '../../assets/grow/concept-lobby.webp'
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
      <div className="overflow-hidden rounded-2xl border border-amber-200">
        <img src={conceptLobbyImg} alt="참고 컨셉 아트 — 목표로 하는 분위기" className="w-full object-cover" />
        <p className="bg-amber-50 px-2 py-1 text-center text-[10px] text-amber-600">참고 컨셉 아트 — 이 느낌으로 점점 발전시킬 예정이에요</p>
      </div>

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
            <div key={item.id} className="flex flex-col items-center gap-1 rounded-xl border border-amber-200 bg-white p-3 text-center">
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
