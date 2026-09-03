import { Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Logo({ withIcon = false }: { withIcon?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 shrink-0">
      {withIcon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white">
          <Sparkles size={18} fill="currentColor" />
        </span>
      )}
      <span className="text-xl font-extrabold tracking-tight text-slate-900">
        누리
        <span className="bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text text-transparent">
          AI
        </span>
      </span>
    </Link>
  )
}
