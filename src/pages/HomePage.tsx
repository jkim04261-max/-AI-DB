import { Link, useNavigate } from 'react-router-dom'
import { homeFeatures } from '../data/homeFeatures'
import { useChats } from '../context/ChatContext'

// 지시서(메인 대시보드 전면 개편): ChatGPT/Gemini/Grok 스타일의 단조롭고
// 간결한 레이아웃으로 교체 — 기존 6개 카드 그리드(FeatureCards)·검색창
// (SearchBar)·최근 대화 미리보기(RecentChatsList)·안내 카드(HelperCard)·
// AI 공급자 표시(AIProviders)는 이 화면에서 더 이상 쓰지 않는다(파일
// 자체는 삭제하지 않음 — 기존 파일 삭제 금지 규칙). 화면 중앙에 로고·
// 인사말만 크게 두고, 그 아래엔 핵심 기능 [대화]/[AI 키우기] 2개만
// 큰 버튼으로 남긴다. 새 대화 시작 로직(startNewChat)과 라우팅 대상은
// homeFeatures의 기존 데이터·액션을 그대로 재사용한다 — 비즈니스
// 로직은 전혀 바꾸지 않았다.
const mainFeatures = homeFeatures.filter((f) => f.id === 'chat' || f.id === 'grow')

export default function HomePage() {
  const { startNewChat } = useChats()
  const navigate = useNavigate()

  const handleNewChat = async () => {
    const id = await startNewChat()
    if (id) navigate(`/chat/${id}`)
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center gap-10 px-4 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <img
          src="/assets/logo.png"
          alt="누리AI 로고"
          width={64}
          height={64}
          className="h-16 w-16 rounded-2xl object-contain"
        />
        <h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">
          오늘은 무엇을 해볼까요?
        </h1>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-2">
        {mainFeatures.map((feature) => {
          const content = (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-500">
                <feature.icon size={22} />
              </span>
              <span className="text-base font-semibold text-slate-800">{feature.title}</span>
              <span className="text-sm text-slate-400">{feature.description}</span>
            </>
          )
          const cardClass =
            'flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-6 py-8 transition hover:border-slate-200 hover:bg-slate-50'

          if (feature.action.kind === 'link') {
            return (
              <Link key={feature.id} to={feature.action.to} className={cardClass}>
                {content}
              </Link>
            )
          }

          return (
            <button key={feature.id} type="button" onClick={handleNewChat} className={cardClass}>
              {content}
            </button>
          )
        })}
      </div>
    </div>
  )
}
