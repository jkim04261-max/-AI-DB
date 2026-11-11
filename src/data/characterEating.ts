import type { CompanionType } from '../context/GrowthContext'
import type { AgeTier } from './characterAge'

import nuriToddler from '../assets/grow/eating/nuri-toddler-eating.webp'
import nuriTeen from '../assets/grow/eating/nuri-teen-eating.webp'
import nuriJunior20s from '../assets/grow/eating/nuri-junior-20s-eating.webp'
import nuriCareer30s from '../assets/grow/eating/nuri-career-30s-eating.webp'
import nuriVeteran40s from '../assets/grow/eating/nuri-veteran-40s-eating.webp'
import nuriMaster50s from '../assets/grow/eating/nuri-master-50s-eating.webp'
import nuriMaster60s from '../assets/grow/eating/nuri-master-60s-eating.webp'
import duriToddler from '../assets/grow/eating/duri-toddler-eating.webp'
import duriTeen from '../assets/grow/eating/duri-teen-eating.webp'
import duriJunior20s from '../assets/grow/eating/duri-junior-20s-eating.webp'
import duriCareer30s from '../assets/grow/eating/duri-career-30s-eating.webp'
import duriVeteran40s from '../assets/grow/eating/duri-veteran-40s-eating.webp'
import duriMaster50s from '../assets/grow/eating/duri-master-50s-eating.webp'
import duriMaster60s from '../assets/grow/eating/duri-master-60s-eating.webp'

// 지시서(연령대별 식사 모습 이미지 적용): 일러스트 모드(portraitSrc가
// 있는 경우)에서 pose === 'eating'일 때 기존 🍙 이모지 오버레이 대신
// 보여줄 연령대별 전신 식사 일러스트. characterFullBody.ts와 완전히
// 같은 구조(7장 원본을 6단계 AgeTier + master_50s 안에서 60세 이상
// 분기)를 그대로 재사용한다 — 배경 제거(rembg birefnet-general)도
// 동일하게 적용했다. 레벨·연령 해금 조건·경제 이벤트 트리거 등 기존
// 로직은 전혀 바꾸지 않았고, 오직 "식사 포즈일 때 어떤 그림을 보여줄지"
// 만 달라진다. CSS 모드(옷의 시각 오버라이드로 SVG CharacterSprite를
// 쓰는 경우)는 원래부터 자체 'eating' SVG 포즈(김밥 소품)가 있어 영향
// 없다.
export const EATING_PORTRAIT_SRC: Record<CompanionType, Record<AgeTier, string>> = {
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

const MASTER_TIER_60S_EATING_SRC: Record<CompanionType, string> = {
  nuri: nuriMaster60s,
  duri: duriMaster60s,
}

export function eatingPortraitSrc(companion: CompanionType, ageTier: AgeTier, ageNumber?: number): string {
  if (ageTier === 'master_50s' && ageNumber !== undefined && ageNumber >= 60) {
    return MASTER_TIER_60S_EATING_SRC[companion]
  }
  return EATING_PORTRAIT_SRC[companion][ageTier]
}
