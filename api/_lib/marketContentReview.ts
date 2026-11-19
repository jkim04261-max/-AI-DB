// 지시서(만능마켓·공유·거래 후속 개발을 위한 데이터 구조 및 정책
// 설계) 2번: "지식 등록 시 의료/위험 제조 기술, 영업비밀, 개인정보,
// 저작권/특허 관련 키워드를 감지하는 '검수 대기(Under Review)' 상태를
// 추가하세요." 제대로 된 검수 시스템(사람 또는 별도 AI 분류기)이
// 생기기 전까지 쓰는 placeholder라 키워드 목록은 거칠고 넓게 잡는다 —
// 과탐지(false positive)로 '검수 대기'에 묶이는 쪽이, 위험 자료가
// 그대로 공개되는 쪽보다 안전하다.
const RISKY_KEYWORD_PATTERNS: RegExp[] = [
  // 의료
  /처방전|진단서|수술\s*방법|마취\s*방법|의료\s*시술/,
  // 위험 제조 기술
  /폭발물|사제\s*총|총기\s*제작|마약\s*제조|독극물\s*제조|화학\s*무기/,
  // 영업비밀
  /영업비밀|고객\s*명단|거래처\s*명단|회사\s*기밀/,
  // 개인정보
  /주민등록번호|여권번호|계좌번호|카드번호/,
  // 저작권/특허
  /저작권\s*침해|무단\s*복제|특허\s*침해|타인의\s*저작물/,
]

export function detectRiskyKeywords(text: string): string[] {
  const found = new Set<string>()
  for (const pattern of RISKY_KEYWORD_PATTERNS) {
    const match = text.match(pattern)
    if (match) found.add(match[0])
  }
  return Array.from(found)
}
