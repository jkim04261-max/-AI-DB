import type { BuildingType } from './buildingTypes'
import storePc from '../assets/grow/town/interiors/store-interior-pc.webp'
import storeMobile from '../assets/grow/town/interiors/store-interior-mobile.webp'
import officePc from '../assets/grow/town/interiors/office-interior-pc.webp'
import officeMobile from '../assets/grow/town/interiors/office-interior-mobile.webp'
import schoolPc from '../assets/grow/town/interiors/school-interior-pc.webp'
import schoolMobile from '../assets/grow/town/interiors/school-interior-mobile.webp'
import hospitalPc from '../assets/grow/town/interiors/hospital-interior-pc.webp'
import hospitalMobile from '../assets/grow/town/interiors/hospital-interior-mobile.webp'
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

// 지시서("누리AI 건물 내부 이미지 9종 적용 및 초경량 최적화"): 9종
// 건물 유형 전부 전용 내부 이미지를 쓴다 — PC(최대 1600×900)/
// 모바일(최대 960×540) 두 해상도로 미리 최적화해 둔(WebP, cwebp 품질
// 72~80) 자산을 srcset으로 제공해 화면 크기에 맞는 파일만 받게 한다.
// 이 9장은 식사·심부름 이벤트가 쓰는 lifeEventAssets의 store/classroom
// 이미지와는 별개 파일이다(건물 내부 전용, 서로 영향 없음).
export const BUILDING_TYPE_INTERIOR: Record<BuildingType, BuildingInterior> = {
  store: { pc: storePc, mobile: storeMobile },
  office: { pc: officePc, mobile: officeMobile },
  school: { pc: schoolPc, mobile: schoolMobile },
  hospital: { pc: hospitalPc, mobile: hospitalMobile },
  pharmacy: { pc: pharmacyPc, mobile: pharmacyMobile },
  factory: { pc: factoryPc, mobile: factoryMobile },
  religious: { pc: religiousPc, mobile: religiousMobile },
  restaurant: { pc: restaurantPc, mobile: restaurantMobile },
  other: { pc: otherPc, mobile: otherMobile },
}

export function buildingInteriorFor(type: BuildingType): BuildingInterior {
  return BUILDING_TYPE_INTERIOR[type]
}
