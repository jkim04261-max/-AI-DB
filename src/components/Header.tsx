import { useState } from 'react'
import { Menu, Bell, Search, User } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import Logo from './Logo'
import MobileMenu from './MobileMenu'
import NotificationDropdown from './NotificationDropdown'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:justify-end lg:px-8">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="메뉴 열기"
          className="rounded-full p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
        >
          <Menu size={22} />
        </button>

        <div className="lg:hidden">
          <Logo />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            aria-label="검색"
            className="hidden rounded-full p-2 text-slate-500 hover:bg-slate-100 lg:flex"
          >
            <Search size={20} />
          </button>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="알림"
            className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
          >
            <Bell size={20} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />
          </button>
          <NavLink
            to="/mypage"
            aria-label="마이페이지"
            className="hidden rounded-full p-1 text-slate-500 hover:bg-slate-100 lg:flex"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-500">
              <User size={18} />
            </span>
          </NavLink>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      {notifOpen && <NotificationDropdown onClose={() => setNotifOpen(false)} />}
    </>
  )
}
