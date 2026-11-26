import type { ProfessionCategory, ProfessionId } from './characterProfessions'
import { PROFESSION_CATEGORY } from './characterProfessions'

// 지시서(누리AI 우리동네 2.5D 지도 적용 및 건물 입장 화면 개선)에서
// 건물 유형 목록을 "상가, 회사, 학교, 병원, 약국, 공장, 종교시설,
// 기타" 8종으로 다시 지정했다 — 1단계(PR #156, 아직 미병합)의 7종
// (병원·약국 통합, 공공기관 포함)을 대체한다. api/_lib/db.ts의 CHECK
// 제약과 api/character.ts의 BUILDING_TYPES 배열과 반드시 같은 값이어야
// 한다(이 저장소의 기존 "행 타입은 여러 파일에 리터럴로 중복 적는다"
// 관례). PR #156이 아직 main에 없어 운영에 이 값으로 저장된 캐릭터가
// 없으므로, 값 집합을 바꿔도 마이그레이션 문제가 없다.
export type BuildingType = 'store' | 'office' | 'school' | 'hospital' | 'pharmacy' | 'factory' | 'religious' | 'other'

export const BUILDING_TYPES: BuildingType[] = ['store', 'office', 'school', 'hospital', 'pharmacy', 'factory', 'religious', 'other']

export const BUILDING_TYPE_LABEL: Record<BuildingType, string> = {
  store: '상가·개인사업장',
  office: '회사·사무실',
  school: '학교·학원',
  hospital: '병원',
  pharmacy: '약국',
  factory: '공장·작업장',
  religious: '종교시설',
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
  other: '건물 이름',
}

export function buildingNameFieldLabel(buildingType: BuildingType): string {
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
  if (profession === 'pharmacist') return 'pharmacy'
  const category = PROFESSION_CATEGORY[profession]
  return category ? BUILDING_TYPE_BY_PROFESSION_CATEGORY[category] : 'other'
}
