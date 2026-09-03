import { NavLink, useNavigate } from 'react-router-dom'
import { Home, MessageCircle, Plus, LayoutTemplate, User } from 'lucide-react'
import { useChats } from '../context/ChatContext'

const itemBase = 'flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium'

export default function BottomNav() {
  const { startNewChat } = useChats()
  const navigate = useNavigate()

  const handleNewChat = () => {
    const id = startNewChat()
    navigate(`/chat/${id}`)
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `${itemBase} ${isActive ? 'text-indigo-600' : 'text-slate-400'}`
        }
      >
        <Home size={22} />홈
      </NavLink>
      <NavLink
        to="/chat"
        className={({ isActive }) =>
          `${itemBase} ${isActive ? 'text-indigo-600' : 'text-slate-400'}`
        }
      >
        <MessageCircle size={22} />대화
      </NavLink>

      <div className="flex flex-1 items-center justify-center">
        <button
          onClick={handleNewChat}
          aria-label="새 대화 시작"
          className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-lg shadow-indigo-200 active:scale-95"
        >
          <Plus size={26} />
        </button>
      </div>

      <NavLink
        to="/templates"
        className={({ isActive }) =>
          `${itemBase} ${isActive ? 'text-indigo-600' : 'text-slate-400'}`
        }
      >
        <LayoutTemplate size={22} />
        템플릿
      </NavLink>
      <NavLink
        to="/mypage"
        className={({ isActive }) =>
          `${itemBase} ${isActive ? 'text-indigo-600' : 'text-slate-400'}`
        }
      >
        <User size={22} />
        마이페이지
      </NavLink>
    </nav>
  )
}
