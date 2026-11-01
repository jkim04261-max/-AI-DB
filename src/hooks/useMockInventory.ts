import { useCallback, useState } from 'react'
import type { CompanionType } from '../context/GrowthContext'
import { CUSTOMIZATION_CATALOG, defaultOutfitFor, type OutfitId } from '../data/characterCustomization'
import { BACKGROUND_CATALOG, type BackgroundId } from '../data/backgroundCatalog'

// PR #50: 아이템 마켓/커스터마이징 룸의 "뼈대"용 모의 보유·재화 상태.
//
// 중요 — 이건 체험판이다: 실제 DB에 전혀 저장되지 않고, 새로고침하면
// 300골드/기본 아이템 상태로 되돌아간다. 실제 character.exp(=PR #49
// ResourceBar의 "포인트")와는 완전히 다른, 이 프로토타입 전용 숫자다 —
// 진짜 성장 포인트를 상점 재화처럼 깎아먹는 것처럼 보이면 안 되기
// 때문에 의도적으로 분리했다.
//
// 나중에 실제 구매 기능을 붙일 때는 이 훅의 반환 모양(state + action
// 함수들)을 그대로 두고 내부 구현만 GrowthContext 스타일의 fetch 기반
// 훅으로 바꾸면 되도록 설계했다 — CustomizationRoom/ItemMarket 등
// 호출부는 전혀 안 바뀐다.
const MOCK_STARTING_GOLD = 300

export function useMockInventory() {
  const [gold, setGold] = useState(MOCK_STARTING_GOLD)
  const [ownedOutfits, setOwnedOutfits] = useState<Set<OutfitId>>(new Set(['nuri_default', 'duri_default']))
  const [ownedBackgrounds, setOwnedBackgrounds] = useState<Set<BackgroundId>>(new Set(['lobby']))
  const [equippedOutfit, setEquippedOutfitState] = useState<Record<CompanionType, OutfitId>>({
    nuri: 'nuri_default',
    duri: 'duri_default',
  })
  const [equippedBackground, setEquippedBackgroundState] = useState<BackgroundId>('lobby')

  const purchaseOutfit = useCallback(
    (id: OutfitId): boolean => {
      const item = CUSTOMIZATION_CATALOG.find((i) => i.id === id && i.category === 'outfit')
      if (!item || ownedOutfits.has(id) || gold < item.priceGold) return false
      setGold((g) => g - item.priceGold)
      setOwnedOutfits((prev) => new Set(prev).add(id))
      return true
    },
    [gold, ownedOutfits],
  )

  const purchaseBackground = useCallback(
    (id: BackgroundId): boolean => {
      const item = BACKGROUND_CATALOG.find((b) => b.id === id)
      if (!item || ownedBackgrounds.has(id) || gold < item.priceGold) return false
      setGold((g) => g - item.priceGold)
      setOwnedBackgrounds((prev) => new Set(prev).add(id))
      return true
    },
    [gold, ownedBackgrounds],
  )

  const equipOutfit = useCallback(
    (companionType: CompanionType, id: OutfitId) => {
      if (!ownedOutfits.has(id)) return
      setEquippedOutfitState((prev) => ({ ...prev, [companionType]: id }))
    },
    [ownedOutfits],
  )

  const equipBackground = useCallback(
    (id: BackgroundId) => {
      if (!ownedBackgrounds.has(id)) return
      setEquippedBackgroundState(id)
    },
    [ownedBackgrounds],
  )

  const resetOutfitToDefault = useCallback((companionType: CompanionType) => {
    setEquippedOutfitState((prev) => ({ ...prev, [companionType]: defaultOutfitFor(companionType) }))
  }, [])

  return {
    gold,
    ownedOutfits,
    ownedBackgrounds,
    equippedOutfit,
    equippedBackground,
    purchaseOutfit,
    purchaseBackground,
    equipOutfit,
    equipBackground,
    resetOutfitToDefault,
  }
}

export type MockInventory = ReturnType<typeof useMockInventory>
