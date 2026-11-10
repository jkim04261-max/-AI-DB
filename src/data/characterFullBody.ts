import type { CompanionType } from '../context/GrowthContext'
import type { AgeTier } from './characterAge'

import nuriToddler from '../assets/grow/full-body/nuri-toddler.webp'
import nuriTeen from '../assets/grow/full-body/nuri-teen.webp'
import nuriJunior20s from '../assets/grow/full-body/nuri-junior-20s.webp'
import nuriCareer30s from '../assets/grow/full-body/nuri-career-30s.webp'
import nuriVeteran40s from '../assets/grow/full-body/nuri-veteran-40s.webp'
import nuriMaster50s from '../assets/grow/full-body/nuri-master-50s.webp'
import nuriMaster60s from '../assets/grow/full-body/nuri-master-60s.webp'
import duriToddler from '../assets/grow/full-body/duri-toddler.webp'
import duriTeen from '../assets/grow/full-body/duri-teen.webp'
import duriJunior20s from '../assets/grow/full-body/duri-junior-20s.webp'
import duriCareer30s from '../assets/grow/full-body/duri-career-30s.webp'
import duriVeteran40s from '../assets/grow/full-body/duri-veteran-40s.webp'
import duriMaster50s from '../assets/grow/full-body/duri-master-50s.webp'
import duriMaster60s from '../assets/grow/full-body/duri-master-60s.webp'

// 지시서(캐릭터 이미지 파일 없이... 로직 우선 구현 → 연령대별 성장
// 캐릭터 이미지 적용 → 원본 고화질 14장 적용): 원장님이 제공한
// NURI_AI_fullbody_14_PNG 원본(캐릭터당 8세/10대/20대/30대/40대/50대/
// 60대 7장, 총 14장 — 각 파일 상단·좌측의 카드 템플릿 테두리 잔여물만
// 정리하고 배경은 원본 그대로 보존)으로 PR #79의 저해상도 콜라주 크롭
// 이미지를 교체한다.
//
// AgeTier는 6단계(toddler/teen/junior_20s/career_30s/veteran_40s/
// master_50s)뿐인데 원본은 7장(50대·60대가 따로)이라, 8세→toddler/
// 10대→teen/20대→junior_20s/30대→career_30s/40대→veteran_40s까지는
// 그대로 매핑하고, master_50s(50~60대 통합 구간) 안에서는
// ageNumberForLevel(level)이 60세를 넘는 시점부터 60대 그림으로
// 바뀌도록 fullBodyPortraitSrc()에서 한 번 더 분기한다 — 이미 있는
// AGE_NUMBER_AGE_RANGE.master_50s=[50,65] 보간과 같은 경계를 그대로
// 재사용하므로 새 레벨 상수를 추가하지 않는다. 레벨·연령 해금 조건·
// 미션 규칙 등 기존 로직은 전혀 바꾸지 않았고, 오직 "어떤 그림을
// 보여줄지"만 달라진다.
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

// master_50s 구간에서 60세 이상일 때만 쓰는 "60대" 그림. 위 표의
// master_50s 기본값(50대 그림)과 짝을 이룬다 — fullBodyPortraitSrc()
// 밖에서 직접 쓸 일은 없다.
const MASTER_TIER_60S_PORTRAIT_SRC: Record<CompanionType, string> = {
  nuri: nuriMaster60s,
  duri: duriMaster60s,
}

// 60세 이상이면 60대 그림, 그 아래(50~59세)면 50대 그림 — 둘 다
// master_50s 한 티어 안에서 갈린다. ageNumber를 모르는 호출부(아직
// 없음)를 위해 옵셔널로 두고, 생략하면 항상 50대 그림을 쓴다.
export function fullBodyPortraitSrc(companion: CompanionType, ageTier: AgeTier, ageNumber?: number): string {
  if (ageTier === 'master_50s' && ageNumber !== undefined && ageNumber >= 60) {
    return MASTER_TIER_60S_PORTRAIT_SRC[companion]
  }
  return FULL_BODY_PORTRAIT_SRC[companion][ageTier]
}
