import type { PartTimeJobType } from './partTimeJobQuizzes'
import { TOWN_SQUARE_BG_SRC } from './lifeEventAssets'

// 지시서(10대 전용 알바 시스템): 사용자가 채팅에 직접 첨부한 참고
// 이미지(설거지·서빙·편의점 알바 상점 도착 장면 3장) — 실제 파일로
// 접근 가능함을 확인했고, 사용자 본인이 상업적 이용이 허용된 AI
// 생성물임을 확인해 줘서(2026-11-15 사용자 승인) 실제 배경 이미지
// 에셋으로 그대로 사용한다. 출처: 사용자 제공, AI 이미지 생성
// 서비스로 만든 2.5D 스타일 일러스트 — 상업적 이용 가능(사용자 확인).
import dishwashingArrival from '../assets/grow/part-time-job/dishwashing-arrival.webp'
import servingArrival from '../assets/grow/part-time-job/serving-arrival.webp'
import convenienceStoreArrival from '../assets/grow/part-time-job/convenience-store-arrival.webp'

export const PART_TIME_JOB_ARRIVAL_SRC: Record<PartTimeJobType, string> = {
  dishwashing: dishwashingArrival,
  serving: servingArrival,
  convenience_store: convenienceStoreArrival,
}

// 지시서(이벤트별(밥 먹기/심부름/알바) 2.5D 배경 이미지 매핑 및 입장
// 연출 구현): "동네 전경"을 심부름(ErrandEventModal)·알바 공통 기본
// 배경으로 통일하라는 지시에 따라, 기존에 쓰던 part-time-job 전용
// town-walk-bg.webp 대신 lifeEventAssets.ts의 공통 동네 전경을
// 쓴다 — 기존 이미지 파일 자체는 삭제하지 않고 그대로 둔다("기존
// 파일 삭제 금지").
export const PART_TIME_JOB_TOWN_WALK_BG_SRC = TOWN_SQUARE_BG_SRC
