import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import Logo from './Logo'
import ComingSoonToast from './ComingSoonToast'
import { sidebarNavItems, sidebarFeatureItems, sidebarFooterItems } from '../data/nav'
import { useComingSoonNotice } from '../lib/comingSoon'

const linkBase =
  'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors'
const linkActive = 'bg-indigo-50 text-indigo-600'
const linkInactive = 'text-slate-600 hover:bg-slate-100'

export default function MobileMenu({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  // Always called (hooks can't be conditional), but the notice only ever
  // renders below while the menu itself is open anyway.
  const { notice, showComingSoon } = useComingSoonNotice()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button
        aria-label="메뉴 닫기"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white px-4 py-6 shadow-xl">
        <div className="flex items-center justify-between px-2">
          <Logo />
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto">
          {sidebarNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
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
                onClick={onClose}
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

        <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
          {sidebarFooterItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>

      <ComingSoonToast message={notice} />
    </div>
  )
}
