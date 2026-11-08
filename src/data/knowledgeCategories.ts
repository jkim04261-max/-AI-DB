// PR #65: '최종 통합 개발 명령서'가 정의한 지식 카드 10종 분류 —
// api/_lib/db.ts의 KnowledgeCategory와 반드시 같은 값이어야 한다(이
// 저장소의 기존 api//src 중복 패턴, characterProfessions.ts와 동일).
// PR #63의 MissionType(선택지/AI추천/직접입력이라는 "입력 방식" 축)과는
// 독립된 축이다 — 하나의 지식 카드가 missionType='objective'이면서
// knowledgeCategory='job_tip'일 수 있다.
export type KnowledgeCategory =
  | 'basic_knowledge'
  | 'expert_info'
  | 'hands_on_experience'
  | 'personal_knowhow'
  | 'skilled_technique'
  | 'problem_solving_case'
  | 'job_tip'
  | 'failure_lesson'
  | 'training_experience'
  | 'life_experience'

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  'basic_knowledge',
  'expert_info',
  'hands_on_experience',
  'personal_knowhow',
  'skilled_technique',
  'problem_solving_case',
  'job_tip',
  'failure_lesson',
  'training_experience',
  'life_experience',
]

export const KNOWLEDGE_CATEGORY_LABEL: Record<KnowledgeCategory, string> = {
  basic_knowledge: '직업기초지식',
  expert_info: '전문정보',
  hands_on_experience: '실무경험',
  personal_knowhow: '개인노하우',
  skilled_technique: '숙련기술',
  problem_solving_case: '실전문제해결사례',
  job_tip: '직업관련팁',
  failure_lesson: '실패경험과교훈',
  training_experience: '교육훈련경험',
  life_experience: '인생경험과가치관',
}

export const KNOWLEDGE_CATEGORY_ICON: Record<KnowledgeCategory, string> = {
  basic_knowledge: '📘',
  expert_info: '🔬',
  hands_on_experience: '🛠️',
  personal_knowhow: '💡',
  skilled_technique: '🎯',
  problem_solving_case: '🧩',
  job_tip: '📌',
  failure_lesson: '🪵',
  training_experience: '🎓',
  life_experience: '🌱',
}
