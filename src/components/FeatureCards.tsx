import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { homeFeatures } from '../data/homeFeatures'
import { useChats } from '../context/ChatContext'

const cardClass =
  'relative flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-transparent hover:shadow-lg hover:shadow-slate-200 lg:p-5'

export default function FeatureCards() {
  const { startNewChat } = useChats()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(null)

  // Auto-dismiss the "coming soon" notice instead of requiring a close tap.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(timer)
  }, [notice])

  const handleNewChat = async () => {
    const id = await startNewChat()
    if (id) navigate(`/chat/${id}`)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        {homeFeatures.map((feature) => {
          const content = (
            <>
              {feature.action.kind === 'comingSoon' && (
                <span className="absolute right-3 top-3 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                  준비 중
                </span>
              )}
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 lg:h-11 lg:w-11">
                <feature.icon size={20} />
              </span>
              <span>
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-slate-800 lg:text-base">
                    {feature.title}
                  </span>
                  {feature.tag && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                      {feature.tag}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">{feature.description}</span>
              </span>
            </>
          )

          if (feature.action.kind === 'link') {
            return (
              <Link key={feature.id} to={feature.action.to} className={cardClass}>
                {content}
              </Link>
            )
          }

          if (feature.action.kind === 'newChat') {
            return (
              <button key={feature.id} type="button" onClick={handleNewChat} className={cardClass}>
                {content}
              </button>
            )
          }

          return (
            <button
              key={feature.id}
              type="button"
              onClick={() => setNotice('현재 준비 중인 기능입니다.')}
              className={cardClass}
            >
              {content}
            </button>
          )
        })}
      </div>

      {notice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:bottom-8">
          <div className="rounded-full bg-slate-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {notice}
          </div>
        </div>
      )}
    </div>
  )
}
