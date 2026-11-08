import SearchBar from '../components/SearchBar'
import FeatureCards from '../components/FeatureCards'
import RecentChatsList from '../components/RecentChatsList'
import HelperCard from '../components/HelperCard'
import AIProviders from '../components/AIProviders'

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 lg:max-w-none lg:py-14 xl:px-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src="/assets/logo.png"
          alt="누리AI 로고"
          className="h-14 w-14 rounded-2xl object-contain shadow-lg shadow-indigo-100"
        />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">
            오늘은 무엇을 해볼까요?
          </h1>
          <p className="mt-1 text-sm text-slate-400">궁금한 것은 편하게 물어보세요</p>
        </div>
        <div className="w-full max-w-xl">
          <SearchBar />
        </div>
      </div>

      <FeatureCards />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <RecentChatsList />
        <HelperCard />
      </div>

      <AIProviders />
    </div>
  )
}
