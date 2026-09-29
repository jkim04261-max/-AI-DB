import { Sparkles, Atom, Star, Waves } from 'lucide-react'

// Only Gemini is actually wired up (see api/_lib/gemini.ts) — the others
// have no backend integration at all, so they're marked 준비 중 instead of
// being shown as if they were selectable today.
const providers = [
  { name: 'Gemini', icon: Sparkles, color: 'text-blue-500', active: true },
  { name: 'GPT', icon: Atom, color: 'text-slate-300', active: false },
  { name: 'Claude', icon: Star, color: 'text-slate-300', active: false },
  { name: 'DeepSeek', icon: Waves, color: 'text-slate-300', active: false },
]

export default function AIProviders() {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {providers.map((p, i) => (
          <span key={p.name} className="flex items-center gap-3">
            {i > 0 && <span className="h-3 w-px bg-slate-200" />}
            <span
              className={`flex items-center gap-1.5 text-sm font-medium ${
                p.active ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              <p.icon size={15} className={p.color} />
              {p.name}
              {!p.active && <span className="text-[10px] text-slate-300">(준비 중)</span>}
            </span>
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-400">현재는 Gemini가 응답해요.</p>
    </div>
  )
}
