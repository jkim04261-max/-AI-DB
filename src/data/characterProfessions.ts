// PR #49에서 50개 직업 "카탈로그" 구조를 만들었고, PR #51(직업 선택
// 제한 해제, 2026-11-01)에서 50개 전체를 목표 직업으로 선택·저장할 수
// 있게 됐다(api/_lib/db.ts의 CHECK 제약을 50개로 넓힘). 다만 "문제
// 풀기"(퀴즈/시험)는 여전히 다르다 — 사람이 직접 쓴 시험 문제은행
// (api/_lib/examQuestions.ts)이 회계사/가수 2개뿐이라서(틀리면 안 되는
// 법률/헬스케어 분야 포함 — 임의로 대량 생성할 수 없는 영역), 그 기능만
// `examSupported: false`인 직업에서 "준비 중"으로 비활성화된다 — 고르면
// 실제로 시험을 볼 수 있는 것처럼 보이지 않게(기존 "미구현 기능을 있는
// 것처럼 보이지 않는다" 원칙과 동일). 직업 자체를 고르고 저장하는 것,
// 가르치기/스스로 공부하기는 50개 전부 동작한다.
export type ProfessionId =
  | 'accountant'
  | 'singer'
  | 'developer'
  | 'designer'
  | 'data-scientist'
  | 'pm'
  | 'security-engineer'
  | 'devops'
  | 'game-developer'
  | 'qa-engineer'
  | 'lawyer'
  | 'tax-accountant'
  | 'financial-analyst'
  | 'patent-attorney'
  | 'actuary'
  | 'consultant'
  | 'realtor'
  | 'doctor'
  | 'nurse'
  | 'pharmacist'
  | 'physical-therapist'
  | 'dietitian'
  | 'dentist'
  | 'veterinarian'
  | 'psychologist'
  | 'teacher'
  | 'professor'
  | 'researcher'
  | 'librarian'
  | 'translator'
  | 'tutor'
  | 'curriculum-developer'
  | 'linguist'
  | 'actor'
  | 'musician'
  | 'writer'
  | 'illustrator'
  | 'photographer'
  | 'film-director'
  | 'architect'
  | 'fashion-designer'
  | 'chef'
  | 'barista'
  | 'flight-attendant'
  | 'firefighter'
  | 'police-officer'
  | 'civil-servant'
  | 'social-worker'
  | 'event-planner'
  | 'massage-therapist'

export type ProfessionCategory = 'it' | 'professional' | 'healthcare' | 'education' | 'culture' | 'service'

export const CATEGORY_LABEL: Record<ProfessionCategory, string> = {
  it: 'IT·개발',
  professional: '전문직·금융',
  healthcare: '헬스케어',
  education: '교육·연구',
  culture: '문화·예술',
  service: '서비스·공공',
}

export interface ProfessionOption {
  id: ProfessionId
  label: string
  category: ProfessionCategory
  // "문제 풀기"(퀴즈/시험)를 실제로 쓸 수 있는 직업인지 — 위 설명 참고.
  // 지금은 accountant/singer만 true다. 직업 자체를 고르고 저장하는 건
  // 50개 전부 가능하다(이 플래그와 무관).
  examSupported: boolean
}

export const PROFESSIONS: ProfessionOption[] = [
  // --- IT·개발 ---
  { id: 'developer', label: '개발자', category: 'it', examSupported: false },
  { id: 'designer', label: 'UX/UI 디자이너', category: 'it', examSupported: false },
  { id: 'data-scientist', label: '데이터 사이언티스트', category: 'it', examSupported: false },
  { id: 'pm', label: '기획자(PM)', category: 'it', examSupported: false },
  { id: 'security-engineer', label: '보안 엔지니어', category: 'it', examSupported: false },
  { id: 'devops', label: '데브옵스 엔지니어', category: 'it', examSupported: false },
  { id: 'game-developer', label: '게임 개발자', category: 'it', examSupported: false },
  { id: 'qa-engineer', label: 'QA 엔지니어', category: 'it', examSupported: false },
  // --- 전문직·금융 ---
  { id: 'accountant', label: '회계사', category: 'professional', examSupported: true },
  { id: 'lawyer', label: '변호사', category: 'professional', examSupported: false },
  { id: 'tax-accountant', label: '세무사', category: 'professional', examSupported: false },
  { id: 'financial-analyst', label: '금융 애널리스트', category: 'professional', examSupported: false },
  { id: 'patent-attorney', label: '변리사', category: 'professional', examSupported: false },
  { id: 'actuary', label: '보험계리사', category: 'professional', examSupported: false },
  { id: 'consultant', label: '경영 컨설턴트', category: 'professional', examSupported: false },
  { id: 'realtor', label: '공인중개사', category: 'professional', examSupported: false },
  // --- 헬스케어 ---
  { id: 'doctor', label: '의사', category: 'healthcare', examSupported: false },
  { id: 'nurse', label: '간호사', category: 'healthcare', examSupported: false },
  { id: 'pharmacist', label: '약사', category: 'healthcare', examSupported: false },
  { id: 'physical-therapist', label: '물리치료사', category: 'healthcare', examSupported: false },
  { id: 'dietitian', label: '영양사', category: 'healthcare', examSupported: false },
  { id: 'dentist', label: '치과의사', category: 'healthcare', examSupported: false },
  { id: 'veterinarian', label: '수의사', category: 'healthcare', examSupported: false },
  { id: 'psychologist', label: '심리상담사', category: 'healthcare', examSupported: false },
  // --- 교육·연구 ---
  { id: 'teacher', label: '교사', category: 'education', examSupported: false },
  { id: 'professor', label: '교수', category: 'education', examSupported: false },
  { id: 'researcher', label: '연구원', category: 'education', examSupported: false },
  { id: 'librarian', label: '사서', category: 'education', examSupported: false },
  { id: 'translator', label: '번역가', category: 'education', examSupported: false },
  { id: 'tutor', label: '과외교사', category: 'education', examSupported: false },
  { id: 'curriculum-developer', label: '교육 콘텐츠 기획자', category: 'education', examSupported: false },
  { id: 'linguist', label: '언어학자', category: 'education', examSupported: false },
  // --- 문화·예술 ---
  { id: 'singer', label: '가수', category: 'culture', examSupported: true },
  { id: 'actor', label: '배우', category: 'culture', examSupported: false },
  { id: 'musician', label: '연주자', category: 'culture', examSupported: false },
  { id: 'writer', label: '작가', category: 'culture', examSupported: false },
  { id: 'illustrator', label: '일러스트레이터', category: 'culture', examSupported: false },
  { id: 'photographer', label: '사진작가', category: 'culture', examSupported: false },
  { id: 'film-director', label: '영화감독', category: 'culture', examSupported: false },
  { id: 'architect', label: '건축가', category: 'culture', examSupported: false },
  { id: 'fashion-designer', label: '패션 디자이너', category: 'culture', examSupported: false },
  // --- 서비스·공공 ---
  { id: 'chef', label: '요리사', category: 'service', examSupported: false },
  { id: 'barista', label: '바리스타', category: 'service', examSupported: false },
  { id: 'flight-attendant', label: '승무원', category: 'service', examSupported: false },
  { id: 'firefighter', label: '소방관', category: 'service', examSupported: false },
  { id: 'police-officer', label: '경찰관', category: 'service', examSupported: false },
  { id: 'civil-servant', label: '공무원', category: 'service', examSupported: false },
  { id: 'social-worker', label: '사회복지사', category: 'service', examSupported: false },
  { id: 'event-planner', label: '이벤트 기획자', category: 'service', examSupported: false },
  { id: 'massage-therapist', label: '마사지 테라피스트', category: 'service', examSupported: false },
]

export const PROFESSION_LABEL: Record<ProfessionId, string> = Object.fromEntries(
  PROFESSIONS.map((p) => [p.id, p.label]),
) as Record<ProfessionId, string>

export const PROFESSION_CATEGORY: Record<ProfessionId, ProfessionCategory> = Object.fromEntries(
  PROFESSIONS.map((p) => [p.id, p.category]),
) as Record<ProfessionId, ProfessionCategory>

// api/character.ts의 EXAM_SUPPORTED_PROFESSIONS와 같은 2개 직업(회계사/
// 가수) — "문제 풀기" 메뉴를 그 직업에서만 활성화하는 데 쓴다.
export const EXAM_SUPPORTED_PROFESSIONS: ReadonlySet<ProfessionId> = new Set(
  PROFESSIONS.filter((p) => p.examSupported).map((p) => p.id),
)
