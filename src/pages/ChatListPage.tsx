import { Link, useNavigate } from 'react-router-dom'
import { MessageSquare, Plus } from 'lucide-react'
import { useChats } from '../context/ChatContext'
import { recentChats as chatMeta } from '../data/chats'

export default function ChatListPage() {
  const { chats, startNewChat } = useChats()
  const navigate = useNavigate()

  const handleNewChat = () => {
    const id = startNewChat()
    navigate(`/chat/${id}`)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">대화</h1>
        <button
          onClick={handleNewChat}
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} />새 대화
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {chats.map((chat) => {
          const meta = chatMeta.find((m) => m.id === chat.id)
          const Icon = meta?.icon ?? MessageSquare
          return (
            <li key={chat.id}>
              <Link
                to={`/chat/${chat.id}`}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50"
              >
                <Icon size={18} className={meta?.iconColor ?? 'text-slate-400'} />
                <span className="flex-1 truncate text-sm text-slate-700">{chat.title}</span>
                <span className="shrink-0 text-xs text-slate-400">{chat.time}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
