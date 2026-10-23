import { useEffect } from 'react'
import { X } from 'lucide-react'

// PR #46: generic slide-up panel used to host the existing
// InteractionPanel/ExamPanel/직업 선택 UI outside the main stage — this
// component owns only presentation (overlay, slide animation, close
// button), never the business logic of whatever it wraps.
export default function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="motion-safe:animate-[grow-sheet-up_0.22s_ease-out] flex max-h-[88vh] w-full flex-col rounded-t-3xl bg-white sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
