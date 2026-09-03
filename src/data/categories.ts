import { FileText, PenLine, Lightbulb, BarChart3, type LucideIcon } from 'lucide-react'

export type CategoryId = 'document' | 'writing' | 'idea' | 'business'

export interface Category {
  id: CategoryId
  title: string
  subtitle: string
  description: string
  icon: LucideIcon
  color: 'blue' | 'green' | 'orange' | 'teal'
  prompts: string[]
}

export const categories: Category[] = [
  {
    id: 'document',
    title: '문서 분석',
    subtitle: 'PDF, 문서 요약·분석',
    description: 'PDF, 워드, 이미지 문서를 쉽게 요약하고 분석해요.',
    icon: FileText,
    color: 'blue',
    prompts: [
      '이 PDF 문서를 3줄로 요약해줘',
      '계약서에서 중요한 조항만 뽑아줘',
      '표로 정리된 데이터를 분석해줘',
    ],
  },
  {
    id: 'writing',
    title: '글 작성',
    subtitle: '블로그, 보고서, 글쓰기',
    description: '블로그, 보고서, 이메일 등 다양한 글을 도와드려요.',
    icon: PenLine,
    color: 'green',
    prompts: [
      '신제품 소개 블로그 글을 써줘',
      '정중한 사과 이메일을 작성해줘',
      '주간 업무 보고서 초안을 만들어줘',
    ],
  },
  {
    id: 'idea',
    title: '아이디어',
    subtitle: '창의적 아이디어 발상',
    description: '창의적인 아이디어와 기획을 함께 만들어봐요.',
    icon: Lightbulb,
    color: 'orange',
    prompts: [
      '유튜브 콘텐츠 아이디어 10개 추천해줘',
      '신규 서비스 네이밍을 제안해줘',
      '팀 워크숍 아이스브레이킹 아이디어 줘',
    ],
  },
  {
    id: 'business',
    title: '사업·업무',
    subtitle: '사업계획, 분석·전략',
    description: '사업계획, 시장분석, 전략 등 업무에 필요한 도움을 드려요.',
    icon: BarChart3,
    color: 'teal',
    prompts: [
      '사업계획서 목차를 잡아줘',
      '경쟁사 시장 분석을 도와줘',
      '분기별 매출 전략을 세워줘',
    ],
  },
]

export const colorClasses: Record<
  Category['color'],
  { bg: string; text: string; ring: string }
> = {
  blue: { bg: 'bg-blue-500', text: 'text-blue-500', ring: 'ring-blue-100' },
  green: { bg: 'bg-emerald-500', text: 'text-emerald-500', ring: 'ring-emerald-100' },
  orange: { bg: 'bg-orange-500', text: 'text-orange-500', ring: 'ring-orange-100' },
  teal: { bg: 'bg-cyan-600', text: 'text-cyan-600', ring: 'ring-cyan-100' },
}

export function getCategory(id: string | undefined): Category | undefined {
  return categories.find((c) => c.id === id)
}
