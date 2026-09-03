import { NavLink } from 'react-router-dom'
import { Plus } from 'lucide-react'
import Logo from './Logo'
import { sidebarNavItems, sidebarFooterItems } from '../data/nav'
import { useChats } from '../context/ChatContext'
import { useNavigate } from 'react-router-dom'

const linkBase =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors'
const linkActive = 'bg-indigo-50 text-indigo-600'
const linkInactive = 'text-slate-600 hover:bg-slate-100'

export default function Sidebar() {
  const { startNewChat } = useChats()
  const navigate = useNavigate()

  const handleNewChat = () => {
    const id = startNewChat()
    navigate(`/chat/${id}`)
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
      <div className="px-2">
        <Logo />
      </div>

      <button
        onClick={handleNewChat}
        className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:opacity-90"
      >
        <Plus size={16} />새 대화
      </button>

      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {sidebarNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkInactive}`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
        {sidebarFooterItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkInactive}`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}

        <NavLink
          to="/mypage"
          className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-100"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
            사용
          </span>
          <span className="flex flex-col text-left">
            <span className="text-sm font-semibold text-slate-800">사용자님</span>
            <span className="text-xs text-slate-400">무료 플랜</span>
          </span>
        </NavLink>
      </div>
    </aside>
  )
}
