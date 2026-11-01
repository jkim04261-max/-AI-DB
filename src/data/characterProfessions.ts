// PR #49: 50개 직업 "카탈로그" 구조 — 요청하신 카테고리형 셀렉터 UI를
// 지금 바로 만들 수 있도록 데이터부터 전부 채웠다. 하지만 실제로 저장
// 가능한 직업은 여전히 회계사/가수 2개뿐이다: `profession`은 4개
// 테이블의 CHECK 제약(api/_lib/db.ts)과 손으로 쓴 시험 문제은행
// (api/_lib/examQuestions.ts)에 묶여 있어서, 나머지 48개를 실제로
// "플레이 가능"하게 만들려면 DB 스키마 변경 + 48개 직업분의 정확한
// 시험 콘텐츠를 새로 써야 한다(틀리면 안 되는 법률/헬스케어 분야 포함
// — 임의로 대량 생성할 수 없는 영역). 그래서 `selectable: false`인
// 항목은 선택 UI에서 "준비 중"으로 비활성화해 보여준다 — 고르면 실제로
// 저장되는 것처럼 보이지 않게(기존 "미구현 기능을 있는 것처럼 보이지
// 않는다" 원칙과 동일).
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
  // 실제로 서버에 저장·플레이 가능한 직업인지 — 위 설명 참고. 지금은
  // accountant/singer만 true다.
  selectable: boolean
}

export const PROFESSIONS: ProfessionOption[] = [
  // --- IT·개발 ---
  { id: 'developer', label: '개발자', category: 'it', selectable: false },
  { id: 'designer', label: 'UX/UI 디자이너', category: 'it', selectable: false },
  { id: 'data-scientist', label: '데이터 사이언티스트', category: 'it', selectable: false },
  { id: 'pm', label: '기획자(PM)', category: 'it', selectable: false },
  { id: 'security-engineer', label: '보안 엔지니어', category: 'it', selectable: false },
  { id: 'devops', label: '데브옵스 엔지니어', category: 'it', selectable: false },
  { id: 'game-developer', label: '게임 개발자', category: 'it', selectable: false },
  { id: 'qa-engineer', label: 'QA 엔지니어', category: 'it', selectable: false },
  // --- 전문직·금융 ---
  { id: 'accountant', label: '회계사', category: 'professional', selectable: true },
  { id: 'lawyer', label: '변호사', category: 'professional', selectable: false },
  { id: 'tax-accountant', label: '세무사', category: 'professional', selectable: false },
  { id: 'financial-analyst', label: '금융 애널리스트', category: 'professional', selectable: false },
  { id: 'patent-attorney', label: '변리사', category: 'professional', selectable: false },
  { id: 'actuary', label: '보험계리사', category: 'professional', selectable: false },
  { id: 'consultant', label: '경영 컨설턴트', category: 'professional', selectable: false },
  { id: 'realtor', label: '공인중개사', category: 'professional', selectable: false },
  // --- 헬스케어 ---
  { id: 'doctor', label: '의사', category: 'healthcare', selectable: false },
  { id: 'nurse', label: '간호사', category: 'healthcare', selectable: false },
  { id: 'pharmacist', label: '약사', category: 'healthcare', selectable: false },
  { id: 'physical-therapist', label: '물리치료사', category: 'healthcare', selectable: false },
  { id: 'dietitian', label: '영양사', category: 'healthcare', selectable: false },
  { id: 'dentist', label: '치과의사', category: 'healthcare', selectable: false },
  { id: 'veterinarian', label: '수의사', category: 'healthcare', selectable: false },
  { id: 'psychologist', label: '심리상담사', category: 'healthcare', selectable: false },
  // --- 교육·연구 ---
  { id: 'teacher', label: '교사', category: 'education', selectable: false },
  { id: 'professor', label: '교수', category: 'education', selectable: false },
  { id: 'researcher', label: '연구원', category: 'education', selectable: false },
  { id: 'librarian', label: '사서', category: 'education', selectable: false },
  { id: 'translator', label: '번역가', category: 'education', selectable: false },
  { id: 'tutor', label: '과외교사', category: 'education', selectable: false },
  { id: 'curriculum-developer', label: '교육 콘텐츠 기획자', category: 'education', selectable: false },
  { id: 'linguist', label: '언어학자', category: 'education', selectable: false },
  // --- 문화·예술 ---
  { id: 'singer', label: '가수', category: 'culture', selectable: true },
  { id: 'actor', label: '배우', category: 'culture', selectable: false },
  { id: 'musician', label: '연주자', category: 'culture', selectable: false },
  { id: 'writer', label: '작가', category: 'culture', selectable: false },
  { id: 'illustrator', label: '일러스트레이터', category: 'culture', selectable: false },
  { id: 'photographer', label: '사진작가', category: 'culture', selectable: false },
  { id: 'film-director', label: '영화감독', category: 'culture', selectable: false },
  { id: 'architect', label: '건축가', category: 'culture', selectable: false },
  { id: 'fashion-designer', label: '패션 디자이너', category: 'culture', selectable: false },
  // --- 서비스·공공 ---
  { id: 'chef', label: '요리사', category: 'service', selectable: false },
  { id: 'barista', label: '바리스타', category: 'service', selectable: false },
  { id: 'flight-attendant', label: '승무원', category: 'service', selectable: false },
  { id: 'firefighter', label: '소방관', category: 'service', selectable: false },
  { id: 'police-officer', label: '경찰관', category: 'service', selectable: false },
  { id: 'civil-servant', label: '공무원', category: 'service', selectable: false },
  { id: 'social-worker', label: '사회복지사', category: 'service', selectable: false },
  { id: 'event-planner', label: '이벤트 기획자', category: 'service', selectable: false },
  { id: 'massage-therapist', label: '마사지 테라피스트', category: 'service', selectable: false },
]

export const PROFESSION_LABEL: Record<ProfessionId, string> = Object.fromEntries(
  PROFESSIONS.map((p) => [p.id, p.label]),
) as Record<ProfessionId, string>
