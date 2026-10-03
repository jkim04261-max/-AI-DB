import { Home, MessageCircle, Settings, User, type LucideIcon } from 'lucide-react'
import { homeFeatures } from './homeFeatures'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

// Plain routes — unlike the feature entries below, these always navigate.
export const sidebarNavItems: NavItem[] = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/chat', label: '대화', icon: MessageCircle },
]

// The same 6 cards shown on the home screen (src/components/FeatureCards.tsx),
// minus "AI와 대화" — the "대화" route above already covers that entry
// point in the sidebar. Reusing homeFeatures here (rather than a separate
// list) keeps the sidebar's "준비 중" items in lockstep with the home
// cards: same title/icon/description, same real link for 문서·사진 분석,
// same coming-soon notice for the rest.
//
// 글 작성 / 아이디어 / 사업·업무 / 템플릿 / 즐겨찾기 intentionally aren't
// listed here anymore — their routes, pages and data are untouched (see
// src/data/categories.ts, TemplatesPage, FavoritesPage), they're just no
// longer linked from the sidebar.
export const sidebarFeatureItems = homeFeatures.filter((f) => f.id !== 'chat')

export const sidebarFooterItems: NavItem[] = [
  { to: '/settings', label: '설정', icon: Settings },
  { to: '/mypage', label: '마이페이지', icon: User },
]
