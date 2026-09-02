import { Sparkles, Atom, Star, Waves } from 'lucide-react'

const providers = [
  { name: 'Gemini', icon: Sparkles, color: 'text-blue-500' },
  { name: 'GPT', icon: Atom, color: 'text-emerald-500' },
  { name: 'Claude', icon: Star, color: 'text-orange-500' },
  { name: 'DeepSeek', icon: Waves, color: 'text-indigo-500' },
]

export default function AIProviders() {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {providers.map((p, i) => (
          <span key={p.name} className="flex items-center gap-3">
            {i > 0 && <span className="h-3 w-px bg-slate-200" />}
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <p.icon size={15} className={p.color} />
              {p.name}
            </span>
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-400">질문에 맞는 AI를 누리AI가 선택합니다.</p>
    </div>
  )
}
