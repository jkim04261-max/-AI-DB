import type { CompanionType } from '../context/GrowthContext'
import type { AgeTier } from './characterAge'

import nuriToddler from '../assets/grow/full-body/nuri-toddler.webp'
import nuriTeen from '../assets/grow/full-body/nuri-teen.webp'
import nuriJunior20s from '../assets/grow/full-body/nuri-junior-20s.webp'
import nuriCareer30s from '../assets/grow/full-body/nuri-career-30s.webp'
import nuriVeteran40s from '../assets/grow/full-body/nuri-veteran-40s.webp'
import nuriMaster50s from '../assets/grow/full-body/nuri-master-50s.webp'
import duriToddler from '../assets/grow/full-body/duri-toddler.webp'
import duriTeen from '../assets/grow/full-body/duri-teen.webp'
import duriJunior20s from '../assets/grow/full-body/duri-junior-20s.webp'
import duriCareer30s from '../assets/grow/full-body/duri-career-30s.webp'
import duriVeteran40s from '../assets/grow/full-body/duri-veteran-40s.webp'
import duriMaster50s from '../assets/grow/full-body/duri-master-50s.webp'

// 지시서(연령대별 성장 캐릭터 이미지 적용): 원장님이 제공한 "누리와 두리
// 나이대별 성장 캐릭터" 종합 시안 한 장(6단계×2인 얼굴·상반신 컷)에서
// 캐릭터별 칸을 그대로 오려내(src/assets/grow/full-body/*.webp) 6단계
// AgeTier에 매핑한다. PR #56까지는 캐릭터당 전신 원화가 한 장뿐이라
// 연령대 구분을 스케일(AGE_TIER_SCALE)과 배지로만 표현했지만, 이제
// 연령대별 실제 그림이 생겨서 이 표를 Record<CompanionType,
// Record<AgeTier, string>>로 확장한다.
//
// 원본 시안의 6칸 라벨(2~3세/10대/20대/30대/40~50대/60세 이상)은
// characterAge.ts의 AGE_TIER_LABEL(8~9살/10대/20대/30대/40대/50~60대)과
// 완전히 같은 숫자 구간은 아니다 — 가장 가까운 단계로 1:1 매핑했다
// (2~3세→toddler, 40~50대→veteran_40s, 60세 이상→master_50s). 레벨·
// 연령 해금 조건·미션 규칙 등 기존 로직은 전혀 바꾸지 않았고, 오직
// "어떤 그림을 보여줄지"만 연령대별로 달라진다.
export const FULL_BODY_PORTRAIT_SRC: Record<CompanionType, Record<AgeTier, string>> = {
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
