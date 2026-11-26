import type { ProfessionCategory, ProfessionId } from './characterProfessions'
import { PROFESSION_CATEGORY } from './characterProfessions'
import buildingPharmacySrc from '../assets/grow/town/buildings/building-pharmacy.webp'
import buildingReligiousSrc from '../assets/grow/town/buildings/building-religious.webp'
import buildingFactorySrc from '../assets/grow/town/buildings/building-factory.webp'
import buildingOtherSrc from '../assets/grow/town/buildings/building-other.webp'
import buildingCommonSrc from '../assets/grow/town/buildings/building-common.webp'

// 지시서(건물 내부 이미지 9종 삽입)에서 "식당 및 음식점"이 새 건물
// 유형으로 추가됐다 — 기존 8종(상가·회사·학교·병원·약국·공장·
// 종교시설·기타)에 restaurant을 더한 9종. api/_lib/db.ts의 CHECK
// 제약과 api/character.ts의 BUILDING_TYPES 배열과 반드시 같은 값이어야
// 한다(이 저장소의 기존 "행 타입은 여러 파일에 리터럴로 중복 적는다"
// 관례). PR #156이 아직 main에 없어 운영에 이 값으로 저장된 캐릭터가
// 없으므로, 값 집합을 바꿔도 마이그레이션 문제가 없다.
export type BuildingType =
  | 'store'
  | 'office'
  | 'school'
  | 'hospital'
  | 'pharmacy'
  | 'factory'
  | 'religious'
  | 'restaurant'
  | 'other'

export const BUILDING_TYPES: BuildingType[] = [
  'store',
  'office',
  'school',
  'hospital',
  'pharmacy',
  'factory',
  'religious',
  'restaurant',
  'other',
]

export const BUILDING_TYPE_LABEL: Record<BuildingType, string> = {
  store: '상가·개인사업장',
  office: '회사·사무실',
  school: '학교·학원',
  hospital: '병원',
  pharmacy: '약국',
  factory: '공장·작업장',
  religious: '종교시설',
  restaurant: '식당·음식점',
  other: '기타 건물',
}

export const BUILDING_TYPE_ICON: Record<BuildingType, string> = {
  store: '🏪',
  office: '🏢',
  school: '🏫',
  hospital: '🏥',
  pharmacy: '💊',
  factory: '🏭',
  religious: '⛪',
  restaurant: '🍽️',
  other: '🏠',
}

// 건물 유형에 따라 입력란 명칭을 바꾼다(지시서 4번) — 이제 병원/약국이
// 별도 유형이라 직업 분기 없이 유형만으로 정확한 라벨이 나온다.
const BUILDING_NAME_FIELD_LABEL_BY_TYPE: Record<BuildingType, string> = {
  store: '상호명',
  office: '회사명',
  school: '학교명',
  hospital: '병원명',
  pharmacy: '약국명',
  factory: '공장명',
  religious: '시설명',
  restaurant: '식당명',
  other: '건물 이름',
}

export function buildingNameFieldLabel(buildingType: BuildingType): string {
  return BUILDING_NAME_FIELD_LABEL_BY_TYPE[buildingType]
}

// 긴급 수정 지시서("건물 그래픽이 지도에 나타나지 않음"): 부지 위에
// 실제로 그려 넣을 2.5D 건물 이미지. 약국·종교시설·공장·기타(펜션)는
// 전용 이미지가 있고, 상가·회사·학교·병원은 전용 이미지가 아직 없어
// 공통 건물 이미지(building-common.webp)로 대체한다 — 지시서 1번
// "전용 이미지가 없더라도 반드시 공통 건물이 표시되도록 하세요"를
// 그대로 따른 것이며, 유형 구분은 건물 위 아이콘 배지로 보완한다.
export const BUILDING_TYPE_IMAGE: Record<BuildingType, string> = {
  store: buildingCommonSrc,
  office: buildingCommonSrc,
  school: buildingCommonSrc,
  hospital: buildingCommonSrc,
  pharmacy: buildingPharmacySrc,
  factory: buildingFactorySrc,
  religious: buildingReligiousSrc,
  // 식당 전용 외부 그래픽은 아직 없다 — 공통 건물 그래픽으로 대체
  // (지시서: "전용 이미지가 없더라도 반드시 공통 건물이 표시되도록").
  restaurant: buildingCommonSrc,
  other: buildingOtherSrc,
}

// 직업 카테고리별로 가장 먼저 추천할 건물 유형 — 사용자가 직접
// 바꿀 수 있으므로 "기본 선택값"일 뿐, 강제 분기는 아니다.
const BUILDING_TYPE_BY_PROFESSION_CATEGORY: Record<ProfessionCategory, BuildingType> = {
  it: 'office',
  professional: 'office',
  healthcare: 'hospital',
  education: 'school',
  culture: 'store',
  service: 'store',
}

export function suggestedBuildingType(profession: ProfessionId | null): BuildingType {
  if (!profession) return 'other'
  if (profession === 'pharmacist') return 'pharmacy'
  if (profession === 'chef') return 'restaurant'
  const category = PROFESSION_CATEGORY[profession]
  return category ? BUILDING_TYPE_BY_PROFESSION_CATEGORY[category] : 'other'
}
