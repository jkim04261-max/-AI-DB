import type { CompanionType } from '../context/GrowthContext'
import type { AgeTier } from './characterAge'

import nuriToddler from '../assets/grow/age-portraits/nuri-toddler.webp'
import nuriTeen from '../assets/grow/age-portraits/nuri-teen.webp'
import nuriJunior20s from '../assets/grow/age-portraits/nuri-junior_20s.webp'
import nuriCareer30s from '../assets/grow/age-portraits/nuri-career_30s.webp'
import nuriVeteran40s from '../assets/grow/age-portraits/nuri-veteran_40s.webp'
import nuriMaster50s from '../assets/grow/age-portraits/nuri-master_50s.webp'
import duriToddler from '../assets/grow/age-portraits/duri-toddler.webp'
import duriTeen from '../assets/grow/age-portraits/duri-teen.webp'
import duriJunior20s from '../assets/grow/age-portraits/duri-junior_20s.webp'
import duriCareer30s from '../assets/grow/age-portraits/duri-career_30s.webp'
import duriVeteran40s from '../assets/grow/age-portraits/duri-veteran_40s.webp'
import duriMaster50s from '../assets/grow/age-portraits/duri-master_50s.webp'

// PR #52 후속 3차: 사용자가 직접 제공한 연령대별 일러스트 레퍼런스
// 시트(누리·두리 각 6단계, 한 장짜리 콜라주)에서 캐릭터별·연령대별
// 초상 이미지만 깔끔하게 잘라낸 결과물이다. 라벨/캡션/장식 테두리는
// 전부 잘라내고 얼굴·상반신만 남겼다.
//
// 기본 로비(GameStage의 backgroundImageSrc 모드)는 이미 PR #50 때
// 받은 실제 일러스트(누리·두리가 함께 그려진 한 장)를 그대로 쓰고
// 있어서 이 매핑과 무관하다 — 여기서는 CSS 모드(마켓에서 구매한
// 사무실/병원 등 8곳, 그리고 그 전까지 손그림 SVG만 쓰던 곳)에서
// CharacterSprite의 파란 도형 SVG 대신 쓸 실제 초상화만 담는다.
export const AGE_PORTRAIT_SRC: Record<CompanionType, Record<AgeTier, string>> = {
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
