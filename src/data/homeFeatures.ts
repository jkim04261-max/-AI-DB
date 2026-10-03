import { Bot, Clapperboard, FileSearch, MessageCircle, Music, Sprout, type LucideIcon } from 'lucide-react'

// The 6 entry points shown on the home screen. `action` decides what
// clicking a card actually does:
//  - 'newChat': starts a new conversation (reuses useChats().startNewChat,
//    the same mechanism the sidebar/bottom-nav "새 대화" buttons already use)
//  - 'link': navigates to an existing, real route
//  - 'comingSoon': not implemented yet — never navigates or calls an API,
//    just shows a short inline notice (see FeatureCards.tsx). Do not repoint
//    this at a route or endpoint until the feature actually exists.
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
    action: { kind: 'comingSoon' },
  },
  {
    id: 'assistant',
    icon: Bot,
    title: '비서·직원 만들기',
    description: '나만의 AI 비서와 직원을 만들어 보세요',
    action: { kind: 'comingSoon' },
  },
  {
    id: 'video',
    icon: Clapperboard,
    title: '동영상 만들기',
    description: '아이디어를 영상으로 만들어 보세요',
    action: { kind: 'comingSoon' },
  },
  {
    id: 'music',
    icon: Music,
    title: '음악 만들기',
    description: 'AI와 함께 음악을 만들어 보세요',
    action: { kind: 'comingSoon' },
  },
]
