// 지시서(실제 업무·연구·비법·노하우 기록 시스템): 유저 본인의 "지식
// 기록장" 주제(카테고리) — character_knowledge_entries의 missionType/
// knowledgeCategory(AI 캐릭터를 가르치는 지식 분류)와는 완전히 다른,
// 독립된 축이다. api/_lib/db.ts의 personal_knowledge_logs.category
// CHECK 제약과 반드시 같은 값이어야 한다.
export type PersonalKnowledgeLogCategory = 'work_log' | 'research_note' | 'success_case' | 'failure_case' | 'tip'

export const PERSONAL_KNOWLEDGE_LOG_CATEGORIES: PersonalKnowledgeLogCategory[] = [
  'work_log',
  'research_note',
  'success_case',
  'failure_case',
  'tip',
]

export const PERSONAL_KNOWLEDGE_LOG_CATEGORY_LABEL: Record<PersonalKnowledgeLogCategory, string> = {
  work_log: '업무일지',
  research_note: '연구메모',
  success_case: '성공사례',
  failure_case: '실패사례',
  tip: '꿀팁',
}

export const PERSONAL_KNOWLEDGE_LOG_CATEGORY_ICON: Record<PersonalKnowledgeLogCategory, string> = {
  work_log: '📋',
  research_note: '🔬',
  success_case: '🏆',
  failure_case: '📉',
  tip: '💡',
}

// 지시서 4번: "공개 범위(비공개/부분공개/전체공개) 설정" — 지시서(프로필
// 작성 폼 직업 이력)의 공개 범위와 같은 이유로, 지금은 실제로 노출을
// 제어할 마켓·공개 지식DB 화면이 아직 없어 값만 저장한다(향후 그 기능을
// 만들 때 이 필드를 그대로 쓰면 된다).
export type PersonalKnowledgeLogVisibility = 'private' | 'partial' | 'public'

export const PERSONAL_KNOWLEDGE_LOG_VISIBILITIES: PersonalKnowledgeLogVisibility[] = ['private', 'partial', 'public']

export const PERSONAL_KNOWLEDGE_LOG_VISIBILITY_LABEL: Record<PersonalKnowledgeLogVisibility, string> = {
  private: '비공개',
  partial: '부분공개',
  public: '전체공개',
}

export const PERSONAL_KNOWLEDGE_LOG_VISIBILITY_DESCRIPTION: Record<PersonalKnowledgeLogVisibility, string> = {
  private: '나만 볼 수 있어요.',
  partial: '일부 내용만 다른 사람에게 보여줄 수 있어요.',
  public: '모두에게 공개할 수 있어요.',
}

export const MAX_BUSINESS_NAME_LENGTH = 100
export const MAX_TAGS_LENGTH = 200
export const MAX_CONTENT_LENGTH = 5000

// 지시서 3번: 등록 화면 하단에 고정으로 보여주는 경고 문구 — 지시서가 준
// 문장을 그대로 쓴다.
export const COPYRIGHT_PRIVACY_NOTICE = '회사 기밀, 타인 개인정보, 제3자 저작물은 권한 없이 등록·공유할 수 없습니다'

// 지시서 3번: "타인의 저작물이나 개인정보가 포함된 것으로 의심되는
// 콘텐츠는 저장 시 경고 팝업" — 실제 저작권/표절 판별은 이 범위를 크게
// 넘어서므로(법률적 판단이 필요한 영역), 개인정보가 섞여 있을 가능성이
// 높은 패턴(주민등록번호·전화번호·이메일·계좌번호)을 정규식으로 가볍게
// 훑어 "의심" 신호로만 쓴다 — 저장을 막지는 않고(지시서: "경고 팝업을
// 띄우세요", "차단"이 아님) 한 번 더 확인시킨 뒤 그대로 진행할 수
// 있다.
const RESIDENT_NUMBER_PATTERN = /\d{6}-?[1-4]\d{6}/
const PHONE_NUMBER_PATTERN = /01[0-9]-?\d{3,4}-?\d{4}/
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/
const ACCOUNT_NUMBER_KEYWORD_PATTERN = /계좌\s*번호|주민\s*등록\s*번호/

export function looksLikeSensitiveContent(content: string): boolean {
  return (
    RESIDENT_NUMBER_PATTERN.test(content) ||
    PHONE_NUMBER_PATTERN.test(content) ||
    EMAIL_PATTERN.test(content) ||
    ACCOUNT_NUMBER_KEYWORD_PATTERN.test(content)
  )
}
