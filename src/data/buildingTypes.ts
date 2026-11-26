import type { ProfessionCategory, ProfessionId } from './characterProfessions'
import { PROFESSION_CATEGORY } from './characterProfessions'

// 지시서(2.5D 우리동네 지도 및 건물 건설·캐릭터 입장 기능 완성): 1단계
// (PR #152)가 미뤘던 건물 유형 7종 — api/_lib/db.ts의 CHECK 제약과
// api/character.ts의 BUILDING_TYPES 배열과 반드시 같은 값이어야 한다
// (이 저장소의 기존 "행 타입은 여러 파일에 리터럴로 중복 적는다" 관례).
export type BuildingType = 'store' | 'office' | 'school' | 'hospital' | 'public' | 'factory' | 'other'

export const BUILDING_TYPES: BuildingType[] = ['store', 'office', 'school', 'hospital', 'public', 'factory', 'other']

export const BUILDING_TYPE_LABEL: Record<BuildingType, string> = {
  store: '상가·개인사업장',
  office: '회사·사무실',
  school: '학교·학원',
  hospital: '병원·약국',
  public: '공공기관',
  factory: '공장·작업장',
  other: '기타 건물',
}

export const BUILDING_TYPE_ICON: Record<BuildingType, string> = {
  store: '🏪',
  office: '🏢',
  school: '🏫',
  hospital: '🏥',
  public: '🏛️',
  factory: '🏭',
  other: '🏠',
}

// 건물 유형에 따라 입력란 명칭을 바꾼다(지시서 4번) — "병원·약국"은
// 한 유형이지만, 실제로는 직업이 약사면 "약국명", 그 외 헬스케어
// 직업이면 "병원명"으로 더 구체적으로 보여준다(예시: "직업: 약사 →
// 건물 유형: 약국 → 상호명: 강남약국"). profession을 모르면(custom
// 직업이거나 아직 선택 전) 유형 기준 기본 라벨로 떨어진다.
const BUILDING_NAME_FIELD_LABEL_BY_TYPE: Record<BuildingType, string> = {
  store: '상호명',
  office: '회사명',
  school: '학교명',
  hospital: '병원명',
  public: '기관명',
  factory: '공장명',
  other: '건물 이름',
}

export function buildingNameFieldLabel(buildingType: BuildingType, profession?: ProfessionId | null): string {
  if (buildingType === 'hospital' && profession === 'pharmacist') return '약국명'
  return BUILDING_NAME_FIELD_LABEL_BY_TYPE[buildingType]
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
  const category = PROFESSION_CATEGORY[profession]
  return category ? BUILDING_TYPE_BY_PROFESSION_CATEGORY[category] : 'other'
}
