import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getCategory, colorClasses } from '../data/categories'
import { useChats } from '../context/ChatContext'

export default function CategoryPage() {
  const { id } = useParams()
  const category = getCategory(id)
  const { startNewChat } = useChats()
  const navigate = useNavigate()

  if (!category) return <Navigate to="/" replace />

  const colors = colorClasses[category.color]

  const handlePrompt = (prompt: string) => {
    const chatId = startNewChat(prompt, category.title)
    navigate(`/chat/${chatId}`)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center gap-4">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white ${colors.bg}`}
        >
          <category.icon size={26} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{category.title}</h1>
          <p className="text-sm text-slate-400">{category.description}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">추천 질문</h2>
        <div className="flex flex-col gap-2">
          {category.prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handlePrompt(prompt)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
