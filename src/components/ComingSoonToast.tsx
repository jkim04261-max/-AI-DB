// Paired with useComingSoonNotice() (src/lib/comingSoon.ts) — renders
// nothing until a "준비 중" entry point is clicked.
export default function ComingSoonToast({ message }: { message: string | null }) {
  if (!message) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:bottom-8">
      <div className="rounded-full bg-slate-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
        {message}
      </div>
    </div>
  )
}
