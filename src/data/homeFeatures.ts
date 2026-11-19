import { FileSearch, Image, MessageCircle, Share2, ShoppingBag, Sprout, type LucideIcon } from 'lucide-react'

// 지시서(메인 대시보드 전면 개편): 예전엔 이 4개(원래 6개 — "비서·직원
// 만들기" 제거, "동영상 만들기"+"음악 만들기"를 "미디어 만들기" 하나로
// 통합)가 전부 홈 화면 카드 그리드(FeatureCards.tsx)에 그대로 나왔지만,
// 지금은 홈 화면(HomePage.tsx)이 이 중 'chat'/'grow' 두 개만 직접 꺼내
// 쓰고, 나머지('analyze'/'media')는 사이드바(Sidebar.tsx, nav.ts의
// sidebarFeatureItems)에서만 보인다. FeatureCards.tsx 자체는 삭제하지
// 않았다(기존 파일 삭제 금지) — 지금은 어디서도 쓰이지 않는다.
// `action`이 클릭 시 동작을 정한다:
//  - 'newChat': 새 대화 시작 (useChats().startNewChat 재사용, 사이드바/
//    하단 네비게이션의 "새 대화" 버튼과 같은 메커니즘)
//  - 'link': 이미 존재하는 실제 라우트로 이동
//  - 'comingSoon': 아직 구현 안 됨 — 라우팅도 API 호출도 하지 않고 짧은
//    안내만 띄움(ComingSoonToast). 실제 기능이 생기기 전까지는 라우트/
//    엔드포인트로 바꾸지 말 것.
export type HomeFeatureAction =
  | { kind: 'newChat' }
  | { kind: 'link'; to: string }
  | { kind: 'comingSoon' }

export interface HomeFeature {
  id: string
  icon: LucideIcon
  title: string
  /** Small pill shown next to the title, e.g. a product name — optional. */
  tag?: string
  description: string
  action: HomeFeatureAction
}

export const homeFeatures: HomeFeature[] = [
  {
    id: 'chat',
    icon: MessageCircle,
    title: 'AI와 대화',
    description: '궁금한 것을 무엇이든 물어보세요',
    action: { kind: 'newChat' },
  },
  {
    id: 'analyze',
    icon: FileSearch,
    title: '문서·사진 분석',
    description: '문서와 이미지를 AI가 분석해드려요',
    // /category/document is the existing, real entry point: it starts a
    // real chat with document-analysis prompt suggestions, and photo
    // analysis already works by attaching an image inside any chat.
    action: { kind: 'link', to: '/category/document' },
  },
  {
    id: 'grow',
    icon: Sprout,
    title: 'AI 키우기',
    tag: '누리·두리',
    description: '나만의 AI를 성장시켜 보세요',
    action: { kind: 'link', to: '/grow' },
  },
  {
    id: 'media',
    icon: Image,
    title: '미디어 만들기',
    description: '동영상과 음악을 AI로 만들어 보세요',
    action: { kind: 'comingSoon' },
  },
  // 지시서(사이드바 '직업 카드 맞추기' 메뉴 삭제): 여기 있던 독립
  // 'cardMatch' 항목(→ /card-match)을 제거했다 — 같은 미니게임
  // (CardMatchGame)은 이제 '가르치기 · 스스로 공부하기' 모달의 teen(10대)
  // 커리큘럼 ②단계 안에서만 뜬다(InteractionPanel.tsx). 사이드바 입구를
  // 없앴을 뿐, CardMatchGame 컴포넌트와 /card-match 라우트의 페이지 파일
  // 자체는 "기존 파일 삭제 금지" 규칙에 따라 그대로 둔다 — App.tsx에서
  // 라우트 등록만 빼서 더 이상 그 경로로 들어갈 수 없게 막았다.
  {
    id: 'market',
    icon: ShoppingBag,
    title: '지식 마켓',
    description: '나만의 노하우를 나누고 거래해보세요',
    // 지시서(만능마켓·공유·거래 후속 개발을 위한 데이터 구조 및 정책
    // 설계) 4번: 사이드바에 "준비 중" 안내만 뜨는 입구를 둔다. 이미
    // 출시된 "만능마켓"(GameMenu.tsx action='universalMarket',
    // UniversalMarket.tsx, PR #88 — AI 키우기 화면 안에서 가상용돈으로
    // 옷/배경을 사는 완전히 다른 기능)과 이름이 겹치면 사용자가
    // 혼동하므로, 여기서는 지시서 1~3번이 실제로 다루는 개념인 "유저
    // 간 지식/마스터 패키지 거래"를 그대로 드러내는 이름(지식 마켓)을
    // 썼다 — CLAUDE.md 절대 규칙 4("기존 마켓과 상태를 섞지 말 것")를
    // 지키기 위한 선택이다.
    action: { kind: 'comingSoon' },
  },
  {
    id: 'share',
    icon: Share2,
    title: '공유',
    description: '기록과 성장을 다른 사람과 나눠보세요',
    action: { kind: 'comingSoon' },
  },
]
