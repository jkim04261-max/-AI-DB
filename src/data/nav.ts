import {
  Home,
  MessageCircle,
  FileText,
  PenLine,
  Lightbulb,
  BarChart3,
  LayoutTemplate,
  Star,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const sidebarNavItems: NavItem[] = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/chat', label: '대화', icon: MessageCircle },
  { to: '/category/document', label: '문서 분석', icon: FileText },
  { to: '/category/writing', label: '글 작성', icon: PenLine },
  { to: '/category/idea', label: '아이디어', icon: Lightbulb },
  { to: '/category/business', label: '사업·업무', icon: BarChart3 },
  { to: '/templates', label: '템플릿', icon: LayoutTemplate },
  { to: '/favorites', label: '즐겨찾기', icon: Star },
]

export const sidebarFooterItems: NavItem[] = [
  { to: '/settings', label: '설정', icon: Settings },
  { to: '/mypage', label: '마이페이지', icon: User },
]
