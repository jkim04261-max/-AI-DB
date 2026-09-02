import { Sparkles } from 'lucide-react'
import SearchBar from '../components/SearchBar'
import CategoryGrid from '../components/CategoryGrid'
import RecentChatsList from '../components/RecentChatsList'
import HelperCard from '../components/HelperCard'
import AIProviders from '../components/AIProviders'

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 lg:py-14">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-lg shadow-indigo-100">
          <Sparkles size={26} fill="currentColor" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 lg:text-3xl">
            무엇을 도와드릴까요?
          </h1>
          <p className="mt-1 text-sm text-slate-400">궁금한 것은 편하게 물어보세요</p>
        </div>
        <div className="w-full max-w-xl">
          <SearchBar />
        </div>
      </div>

      <CategoryGrid />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <RecentChatsList />
        <HelperCard />
      </div>

      <AIProviders />
    </div>
  )
}
