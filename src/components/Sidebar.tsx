import { NavLink } from 'react-router-dom'
import { Library, MessageSquare, Plus, LogIn, UserPlus } from 'lucide-react'
import Logo from './Logo'
import ComingSoonToast from './ComingSoonToast'
import { sidebarNavItems, sidebarFeatureItems, sidebarFooterItems } from '../data/nav'
import { useChats } from '../context/ChatContext'
import { useAuth } from '../context/AuthContext'
import { useComingSoonNotice } from '../lib/comingSoon'
import { useNavigate } from 'react-router-dom'

// 지시서(메인 대시보드 전면 개편): 메뉴 간격을 넓히고(gap-2) 테두리·
// 그림자를 최소화해 더 단조롭게 — 링크 자체의 구조(아이콘+텍스트)는
// 그대로 둔다.
const linkBase =
  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors'
const linkActive = 'bg-indigo-50 text-indigo-600'
const linkInactive = 'text-slate-600 hover:bg-slate-100'

export default function Sidebar() {
  const { startNewChat, chats } = useChats()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { notice, showComingSoon } = useComingSoonNotice()

  const handleNewChat = async () => {
    const id = await startNewChat()
    if (id) navigate(`/chat/${id}`)
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-6 lg:flex">
      <div className="px-2">
        <Logo />
      </div>

      <button
        onClick={handleNewChat}
        className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600"
      >
        <Plus size={16} />새 대화
      </button>

      <nav className="mt-6 flex flex-col gap-2">
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

        {sidebarFeatureItems.map((feature) =>
          feature.action.kind === 'link' ? (
            <NavLink
              key={feature.id}
              to={feature.action.to}
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              <feature.icon size={18} />
              {feature.title}
            </NavLink>
          ) : (
            <button
              key={feature.id}
              type="button"
              onClick={showComingSoon}
              className={`${linkBase} ${linkInactive} justify-between`}
            >
              <span className="flex items-center gap-3">
                <feature.icon size={18} />
                {feature.title}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                준비 중
              </span>
            </button>
          ),
        )}
      </nav>

      {/* 지시서(메인 대시보드 전면 개편): 하단에 [라이브러리] + 그 밑에
          최근 대화 스크롤 목록. 실제 "라이브러리" 기능/라우트는 아직
          없어 기존 ComingSoonToast 메커니즘을 그대로 재사용한다(다른
          "준비 중" 항목들과 동일 패턴). min-h-0이 있어야 이 영역이
          flex 컨테이너 안에서 실제로 줄어들어 overflow-y-auto 스크롤이
          동작한다. */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-slate-100 pt-3">
        <button type="button" onClick={showComingSoon} className={`${linkBase} ${linkInactive}`}>
          <Library size={18} />
          라이브러리
        </button>

        <div className="mt-1 flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">아직 대화가 없어요</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <NavLink
                    to={`/chat/${chat.id}`}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-100'
                      }`
                    }
                  >
                    <MessageSquare size={14} className="shrink-0 text-slate-300" />
                    <span className="truncate">{chat.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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

        {user ? (
          <NavLink
            to="/mypage"
            className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-100"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
              {user.email.slice(0, 2).toUpperCase()}
            </span>
            <span className="flex flex-col text-left">
              <span className="truncate text-sm font-semibold text-slate-800">{user.email}</span>
              <span className="text-xs text-slate-400">무료 플랜</span>
            </span>
          </NavLink>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5 px-1">
            <NavLink
              to="/login"
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <LogIn size={16} />
              로그인
            </NavLink>
            <NavLink
              to="/signup"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <UserPlus size={16} />
              회원가입
            </NavLink>
          </div>
        )}
      </div>

      <ComingSoonToast message={notice} />
    </aside>
  )
}
