import type { CompanionType } from '../context/GrowthContext'
import type { AgeTier } from './characterAge'

import nuriToddler from '../assets/grow/walking/nuri-toddler-walking.webp'
import nuriTeen from '../assets/grow/walking/nuri-teen-walking.webp'
import nuriJunior20s from '../assets/grow/walking/nuri-junior-20s-walking.webp'
import nuriCareer30s from '../assets/grow/walking/nuri-career-30s-walking.webp'
import nuriVeteran40s from '../assets/grow/walking/nuri-veteran-40s-walking.webp'
import nuriMaster50s from '../assets/grow/walking/nuri-master-50s-walking.webp'
import nuriMaster60s from '../assets/grow/walking/nuri-master-60s-walking.webp'
import duriToddler from '../assets/grow/walking/duri-toddler-walking.webp'
import duriTeen from '../assets/grow/walking/duri-teen-walking.webp'
import duriJunior20s from '../assets/grow/walking/duri-junior-20s-walking.webp'
import duriCareer30s from '../assets/grow/walking/duri-career-30s-walking.webp'
import duriVeteran40s from '../assets/grow/walking/duri-veteran-40s-walking.webp'
import duriMaster50s from '../assets/grow/walking/duri-master-50s-walking.webp'
import duriMaster60s from '../assets/grow/walking/duri-master-60s-walking.webp'

// 지시서(연령대별 걷는 모습 이미지 적용): 서점 외출 미션(BookstoreOutingOverlay)의
// "걸어가는 중" 연출이 그동안 CharacterSprite(SVG 도형)를 그대로
// 써서 다른 전신 일러스트와 어울리지 않았다 — characterFullBody.ts /
// characterEating.ts와 완전히 같은 구조(7장 원본을 6단계 AgeTier +
// master_50s 안에서 60세 이상 분기)로 연령대별 걷는 전신 일러스트를
// 추가한다. 레벨·연령 해금 조건·서점 외출 보상 로직 등 기존 로직은
// 전혀 바꾸지 않았고, 오직 "걷는 중일 때 어떤 그림을 보여줄지"만
// 달라진다.
export const WALKING_PORTRAIT_SRC: Record<CompanionType, Record<AgeTier, string>> = {
  nuri: {
    toddler: nuriToddler,
    teen: nuriTeen,
    junior_20s: nuriJunior20s,
    career_30s: nuriCareer30s,
    veteran_40s: nuriVeteran40s,
    master_50s: nuriMaster50s,
  },
  duri: {
    toddler: duriToddler,
    teen: duriTeen,
    junior_20s: duriJunior20s,
    career_30s: duriCareer30s,
    veteran_40s: duriVeteran40s,
    master_50s: duriMaster50s,
  },
}

const MASTER_TIER_60S_WALKING_SRC: Record<CompanionType, string> = {
  nuri: nuriMaster60s,
  duri: duriMaster60s,
}

export function walkingPortraitSrc(companion: CompanionType, ageTier: AgeTier, ageNumber?: number): string {
  if (ageTier === 'master_50s' && ageNumber !== undefined && ageNumber >= 60) {
    return MASTER_TIER_60S_WALKING_SRC[companion]
  }
  return WALKING_PORTRAIT_SRC[companion][ageTier]
}
