import { useState } from 'react'
import { Lock, Check } from 'lucide-react'
import CharacterSprite, { OUTFIT_PALETTE_OVERRIDE } from './CharacterSprite'
import type { CompanionType } from '../../context/GrowthContext'
import type { AppearanceTier } from '../../data/characterAppearance'
import type { AgeTier } from '../../data/characterAge'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
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
  ageTier,
  ageNumber,
  inventory,
  onOpenMarket,
}: {
  companionType: CompanionType
  tier: AppearanceTier
  // PR #53 요청 5번: 연령대별 실제 초상화 미리보기용. 지정하지 않으면
  // (호출부가 아직 안 넘기면) 기존처럼 SVG만 보여준다.
  ageTier?: AgeTier
  // 지시서(연령대별 성장 캐릭터 이미지 적용, 원본 14장 적용): master_50s
  // (50~60대) 구간에서 50대/60대 그림을 가르는 데 쓴다. GameStage.tsx와
  // 같은 값을 그대로 넘겨받는다 — 없으면 fullBodyPortraitSrc가 50대
  // 그림으로 처리한다.
  ageNumber?: number
  inventory: MockInventory
  onOpenMarket: () => void
}) {
  const [activeCategory, setActiveCategory] = useState<CustomizationCategory>('outfit')
  const equippedOutfitId = inventory.equippedOutfit[companionType]
  const items = CUSTOMIZATION_CATALOG.filter(
    (i) => i.category === activeCategory && (i.companionType === companionType || i.companionType === 'any'),
  )
  // PR #53 요청 5번: 파란 도형 SVG 대신 실제 캐릭터 이미지를 보여준다.
  // 단, 한복처럼 그림에 실제 색이 반영되는 옷을 입었을 때는 "옷
  // 갈아입히기 실시간 미리보기"라는 이 화면의 핵심 기능을 지키기 위해
  // 계속 SVG를 쓴다(GameStage.tsx와 같은 조건 — 정적 사진으로는 옷을
  // 갈아입혀도 반영할 수 없다).
  const outfitHasVisualOverride = Boolean(equippedOutfitId && OUTFIT_PALETTE_OVERRIDE[equippedOutfitId as OutfitId])
  // 지시서(연령대별 성장 캐릭터 이미지 적용): 이제 ageTier로 실제 그림
  // 자체를 고른다(characterFullBody.ts 참고) — "지정됐는지"만 보던
  // 기존 게이트는 그대로 두고, 값이 있으면 그 단계의 그림을 쓴다.
  const portraitSrc = ageTier && !outfitHasVisualOverride ? fullBodyPortraitSrc(companionType, ageTier, ageNumber) : null

  return (
    <div className="flex flex-col gap-4">
      {/* PR #53 후속: 기본 의상(outfitHasVisualOverride가 false)일 때는
          실제 연령대 초상화를 보여주고, 한복처럼 그림에 반영되는 옷을
          입었을 때만 "옷 갈아입히기 미리보기" 용도로 SVG로 바뀐다는
          안내로 교체했다(PR #50 때는 실제 사진 자체가 없어서 안내문으로
          차이를 때웠지만, 이제는 실제로 사진이 뜬다). */}
      {portraitSrc ? (
        <p className="text-center text-[11px] text-amber-600">지금 연령대의 실제 모습이에요. 옷을 갈아입히면 미리보기로 바뀌어요.</p>
      ) : (
        <p className="text-center text-[11px] text-amber-600">옷을 실시간으로 갈아입혀 미리 볼 수 있어요.</p>
      )}

      <div className="flex justify-center rounded-2xl bg-amber-950 p-4">
        {portraitSrc ? (
          // PR #56: 전신 원화는 배경을 제거한 투명 PNG라 object-contain으로
          // 통째로 보여준다(예전 220x220 정사각 흉상 컷의 object-cover와
          // 달리, 전신이 잘리면 안 되므로) — 사각 카드 테두리도 다른
          // 화면들과 같은 이유로 없애고 drop-shadow만 남겼다.
          <img
            data-testid="customization-age-portrait"
            src={portraitSrc}
            alt={`${companionType === 'nuri' ? '누리' : '두리'} 캐릭터`}
            className="h-[140px] w-[140px] object-contain"
            style={{ filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))' }}
          />
        ) : (
          <CharacterSprite companionType={companionType} pose="idle" size={140} tier={tier} outfitId={equippedOutfitId as OutfitId} />
        )}
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
