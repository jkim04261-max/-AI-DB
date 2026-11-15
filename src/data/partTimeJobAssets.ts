import type { PartTimeJobType } from './partTimeJobQuizzes'

// 지시서(10대 전용 알바 시스템): 사용자가 채팅에 직접 첨부한 4장의
// 참고 이미지(설거지·서빙·편의점 알바 상점 도착 장면 3장 + 동네 전경
// 1장) — 이번에는 실제 파일로 접근 가능함을 확인했고(이전 PR #121
// 심부름 이벤트 때의 "채팅 이미지는 받을 방법이 없다"는 전례와 다름),
// 사용자 본인이 상업적 이용이 허용된 AI 생성물임을 확인해 줘서(2026-11-
// 15 사용자 승인) 실제 배경 이미지 에셋으로 그대로 사용한다. 출처:
// 사용자 제공, AI 이미지 생성 서비스로 만든 2.5D 스타일 일러스트 —
// 상업적 이용 가능(사용자 확인).
import dishwashingArrival from '../assets/grow/part-time-job/dishwashing-arrival.webp'
import servingArrival from '../assets/grow/part-time-job/serving-arrival.webp'
import convenienceStoreArrival from '../assets/grow/part-time-job/convenience-store-arrival.webp'
import townWalkBg from '../assets/grow/part-time-job/town-walk-bg.webp'

export const PART_TIME_JOB_ARRIVAL_SRC: Record<PartTimeJobType, string> = {
  dishwashing: dishwashingArrival,
  serving: servingArrival,
  convenience_store: convenienceStoreArrival,
}

export const PART_TIME_JOB_TOWN_WALK_BG_SRC = townWalkBg
