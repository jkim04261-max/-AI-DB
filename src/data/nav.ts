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

// homeFeatures 중 "AI와 대화"(chat)만 뺀 나머지 전부 — 그 항목은 위
// sidebarNavItems의 "대화" 라우트가 이미 사이드바에서 커버한다.
// homeFeatures를 그대로 재사용해서(별도 목록을 새로 안 만들고), 지금은
// 'analyze'(문서·사진 분석, 실제 링크)와 'media'(미디어 만들기, 준비
// 중) 2개만 남는다 — 'assistant'(비서·직원 만들기)는 지시서에 따라
// homeFeatures에서 아예 제거됐고, 예전의 'video'+'music' 2개는
// homeFeatures 쪽에서 'media' 하나로 이미 통합돼 있다.
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
