import { FileText, Lightbulb, FileType } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ChatMessage {
  role: 'user' | 'ai'
  text: string
  ai?: 'Gemini' | 'GPT' | 'Claude' | 'DeepSeek'
}

export interface RecentChat {
  id: string
  title: string
  time: string
  icon: LucideIcon
  iconColor: string
  messages: ChatMessage[]
}

export const recentChats: RecentChat[] = [
  {
    id: 'business-plan',
    title: '사업계획서 작성 도움',
    time: '방금 전',
    icon: FileText,
    iconColor: 'text-blue-500',
    messages: [
      { role: 'user', text: '카페 창업 사업계획서 목차를 잡아줘' },
      {
        role: 'ai',
        ai: 'Claude',
        text: '사업개요, 시장분석, 마케팅 전략, 운영계획, 재무계획 순서로 목차를 구성해볼게요. 각 항목을 함께 채워나가 볼까요?',
      },
    ],
  },
  {
    id: 'youtube-idea',
    title: '유튜브 콘텐츠 아이디어',
    time: '1시간 전',
    icon: Lightbulb,
    iconColor: 'text-orange-500',
    messages: [
      { role: 'user', text: '초보자를 위한 요리 유튜브 콘텐츠 아이디어 줘' },
      {
        role: 'ai',
        ai: 'GPT',
        text: '"10분 완성 자취요리", "냉장고 파먹기 챌린지", "실패 없는 계란요리 5가지" 같은 주제는 어떨까요?',
      },
    ],
  },
  {
    id: 'pdf-summary',
    title: 'PDF 문서 요약',
    time: '3시간 전',
    icon: FileType,
    iconColor: 'text-red-500',
    messages: [
      { role: 'user', text: '첨부한 보고서를 3줄로 요약해줘' },
      {
        role: 'ai',
        ai: 'Gemini',
        text: '1) 3분기 매출은 전년 대비 12% 증가했습니다. 2) 신규 고객 유입이 확대됐습니다. 3) 물류비 절감이 다음 과제로 제시됐습니다.',
      },
    ],
  },
]

export function getChat(id: string | undefined): RecentChat | undefined {
  return recentChats.find((c) => c.id === id)
}
