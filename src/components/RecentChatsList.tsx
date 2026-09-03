import { Link } from 'react-router-dom'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { useChats } from '../context/ChatContext'
import { recentChats as chatMeta } from '../data/chats'

export default function RecentChatsList() {
  const { chats } = useChats()
  const items = chats.slice(0, 3)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">최근 대화</h3>
        <Link
          to="/chat"
          className="flex items-center text-xs font-medium text-slate-400 hover:text-indigo-500"
        >
          더보기 <ChevronRight size={14} />
        </Link>
      </div>
      <ul className="flex flex-col">
        {items.map((chat) => {
          const meta = chatMeta.find((m) => m.id === chat.id)
          const Icon = meta?.icon ?? MessageSquare
          return (
            <li key={chat.id}>
              <Link
                to={`/chat/${chat.id}`}
                className="flex items-center gap-3 rounded-xl px-1 py-2.5 hover:bg-slate-50"
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
