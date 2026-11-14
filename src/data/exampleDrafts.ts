// 지시서(AI 예시문 3개 자동 생성 기능 복구): "캐릭터당 평생 3번 무료"의
// 그 3 — api/_lib/exampleDraftsLimit.ts의 같은 이름의 상수와 반드시
// 같아야 한다(이 저장소의 기존 api//src 중복 상수 관례와 동일, 예:
// characterAge.ts의 AGE_TIER_MIN_LEVEL).
export const FREE_EXAMPLE_DRAFTS_LIMIT = 3

// AI가 만들어주는 "짧은 아이디어" 1개 — 완성된 지식이 아니라 사용자가
// 제목/본문 입력창에 채운 뒤 자유롭게 고쳐 쓸 출발점이다. 기존
// ageAppropriateTopics.ts의 TopicSuggestion과 모양이 똑같지만, 정적
// 데이터가 아니라 Gemini가 그때그때 생성한다는 점이 다르다.
export interface ExampleDraft {
  title: string
  content: string
}
