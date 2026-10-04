import type { ReactNode } from 'react'

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  )
}

export default function LegalPageLayout({
  title,
  effectiveDate,
  intro,
  children,
}: {
  title: string
  effectiveDate: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-xs text-slate-400">시행일(최종 수정일): {effectiveDate}</p>
      </div>

      {intro && <p className="text-sm leading-relaxed text-slate-500">{intro}</p>}

      <div className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-5 lg:p-6">
        {children}
      </div>
    </div>
  )
}
