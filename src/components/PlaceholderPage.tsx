import type { LucideIcon } from 'lucide-react'

export default function PlaceholderPage({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
        <Icon size={26} />
      </span>
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-400">{description}</p>
    </div>
  )
}
