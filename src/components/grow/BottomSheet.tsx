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
        className="motion-safe:animate-[grow-sheet-up_0.22s_ease-out] flex max-h-[88vh] w-full flex-col rounded-t-3xl border-2 border-[#d4af37] bg-amber-50 shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-4 ring-[#2b1a0f] ring-inset sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl"
      >
        {/* PR #50 긴급 재작업: 밋밋한 흰 모달 느낌을 벗어나려고 헤더만
            어두운 목재 + 금색 테두리로 — 본문(children)의 기존 색상은
            그대로 둬서 가독성/다른 컴포넌트 회귀 위험을 만들지 않는다. */}
        <div className="flex shrink-0 items-center justify-between rounded-t-[22px] border-b-2 border-[#d4af37] bg-gradient-to-b from-[#4a2f1a] to-[#2b1a0f] px-4 py-3 sm:rounded-t-[22px]">
          <p className="text-sm font-bold tracking-wide text-[#f4d58d]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d4af37]/70 text-[#f4d58d] hover:bg-[#d4af37]/20"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
