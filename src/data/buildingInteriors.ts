import type { BuildingType } from './buildingTypes'
import { STORE_INTERIOR_SRC, CLASSROOM_INTERIOR_SRC } from './lifeEventAssets'
import pharmacyPc from '../assets/grow/town/interiors/pharmacy-interior-pc.webp'
import pharmacyMobile from '../assets/grow/town/interiors/pharmacy-interior-mobile.webp'
import factoryPc from '../assets/grow/town/interiors/factory-interior-pc.webp'
import factoryMobile from '../assets/grow/town/interiors/factory-interior-mobile.webp'
import religiousPc from '../assets/grow/town/interiors/religious-interior-pc.webp'
import religiousMobile from '../assets/grow/town/interiors/religious-interior-mobile.webp'
import otherPc from '../assets/grow/town/interiors/other-interior-pc.webp'
import otherMobile from '../assets/grow/town/interiors/other-interior-mobile.webp'
import restaurantPc from '../assets/grow/town/interiors/restaurant-interior-pc.webp'
import restaurantMobile from '../assets/grow/town/interiors/restaurant-interior-mobile.webp'

export interface BuildingInterior {
  pc: string
  mobile: string
}

// 지시서("건물 내부 이미지 9종 삽입 및 초경량 최적화"): 건물 유형별
// 내부 이미지 — PC(최대 1280px 가로)/모바일(최대 768px 가로) 두
// 해상도로 미리 최적화해 둔(WebP, cwebp 품질 65~72) 자산을 srcset으로
// 제공해 화면 크기에 맞는 파일만 받게 한다. 상가(store)·학교(school)는
// 기존 lifeEventAssets의 store/classroom 내부 이미지(식사·심부름
// 이벤트에서도 재사용 중)를 그대로 쓰고, 전용 이미지가 없는
// 회사·병원은 "공통 건물" 원칙과 동일하게 상가 내부로 대체한다.
export const BUILDING_TYPE_INTERIOR: Record<BuildingType, BuildingInterior> = {
  store: { pc: STORE_INTERIOR_SRC, mobile: STORE_INTERIOR_SRC },
  office: { pc: STORE_INTERIOR_SRC, mobile: STORE_INTERIOR_SRC },
  hospital: { pc: STORE_INTERIOR_SRC, mobile: STORE_INTERIOR_SRC },
  school: { pc: CLASSROOM_INTERIOR_SRC, mobile: CLASSROOM_INTERIOR_SRC },
  pharmacy: { pc: pharmacyPc, mobile: pharmacyMobile },
  factory: { pc: factoryPc, mobile: factoryMobile },
  religious: { pc: religiousPc, mobile: religiousMobile },
  restaurant: { pc: restaurantPc, mobile: restaurantMobile },
  other: { pc: otherPc, mobile: otherMobile },
}

export function buildingInteriorFor(type: BuildingType): BuildingInterior {
  return BUILDING_TYPE_INTERIOR[type]
}
