import type { CompanionType } from '../context/GrowthContext'

// PR #50: 캐릭터 외형 커스터마이징의 데이터 뼈대 — 옷/머리/얼굴/키·몸집/
// 목소리 5개 분류. 지금은 전부 프런트엔드 전용 카탈로그이고 실제 DB에는
// 아무것도 저장되지 않는다(useMockInventory 훅이 새로고침하면 초기화
// 되는 React state로만 보유/장착 상태를 들고 있음). 나중에 진짜 구매·
// 저장 기능을 붙일 때는 이 타입들을 그대로 API 응답/요청 스키마로
// 옮기면 되도록 설계했다 — id/companionType/priceGold 구조가 바로
// DB 컬럼이 될 수 있는 모양이다.
export type CustomizationCategory = 'outfit' | 'hair' | 'face' | 'scale' | 'voice'

export const CATEGORY_LABEL: Record<CustomizationCategory, string> = {
  outfit: '옷',
  hair: '머리스타일',
  face: '얼굴·표정',
  scale: '키·몸집',
  voice: '목소리',
}

export type OutfitId = 'nuri_default' | 'duri_default' | 'hanbok_blouse'
export type HairId = 'nuri_hair_default' | 'duri_hair_default'
export type FaceId = 'face_default'
export type ScaleId = 'scale_default'
export type VoiceId = 'voice_default'

export interface CustomizationItem {
  id: string
  category: CustomizationCategory
  // 'any'면 누리·두리 둘 다 착용 가능, 아니면 해당 캐릭터 전용(지금은
  // 옷만 캐릭터별로 다름 — 다른 분류는 전부 공용 기본값 하나뿐).
  companionType: CompanionType | 'any'
  label: string
  // 0 = 기본 무료 배포 아이템(요청 3번 "2~3개 무료 배포").
  priceGold: number
  icon: string
  // 실제로 CharacterSprite 렌더링에 반영되는 항목인지 — false인
  // 항목은 아직 구조(타입/카탈로그/UI)만 있고 시각적으로는 기본값과
  // 동일하게 보인다(얼굴/키/목소리는 이번 PR 범위에서 실제 그림을
  // 바꾸지 않는다 — 가짜로 바뀐 것처럼 보이게 하지 않기 위해서다).
  visuallyWired: boolean
}

export const CUSTOMIZATION_CATALOG: CustomizationItem[] = [
  // --- 옷(Outfit) — 실제로 캐릭터 색상에 반영됨 ---
  { id: 'nuri_default', category: 'outfit', companionType: 'nuri', label: '기본 의상', priceGold: 0, icon: '👕', visuallyWired: true },
  { id: 'duri_default', category: 'outfit', companionType: 'duri', label: '기본 의상', priceGold: 0, icon: '👕', visuallyWired: true },
  { id: 'hanbok_blouse', category: 'outfit', companionType: 'nuri', label: '한복 블라우스', priceGold: 150, icon: '👘', visuallyWired: true },
  // --- 머리스타일(Hair) — 구조만, 아직 그림에 반영 안 됨 ---
  { id: 'nuri_hair_default', category: 'hair', companionType: 'nuri', label: '기본 단발', priceGold: 0, icon: '💇‍♀️', visuallyWired: false },
  { id: 'duri_hair_default', category: 'hair', companionType: 'duri', label: '기본 소년 머리', priceGold: 0, icon: '💇‍♂️', visuallyWired: false },
  // --- 얼굴·표정 / 키·몸집 / 목소리 — 구조만 ---
  { id: 'face_default', category: 'face', companionType: 'any', label: '기본 표정', priceGold: 0, icon: '🙂', visuallyWired: false },
  { id: 'scale_default', category: 'scale', companionType: 'any', label: '기본 체형', priceGold: 0, icon: '📏', visuallyWired: false },
  { id: 'voice_default', category: 'voice', companionType: 'any', label: '기본 목소리', priceGold: 0, icon: '🔊', visuallyWired: false },
]

export function defaultOutfitFor(companionType: CompanionType): OutfitId {
  return companionType === 'nuri' ? 'nuri_default' : 'duri_default'
}

export function defaultItemIdFor(category: CustomizationCategory, companionType: CompanionType): string {
  const item = CUSTOMIZATION_CATALOG.find(
    (i) => i.category === category && i.priceGold === 0 && (i.companionType === companionType || i.companionType === 'any'),
  )
  return item?.id ?? ''
}
