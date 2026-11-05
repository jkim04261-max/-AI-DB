import { useEffect } from 'react'
import { X } from 'lucide-react'

// PR #46: generic slide-up panel used to host the existing
// InteractionPanel/ExamPanel/직업 선택 UI outside the main stage — this
// component owns only presentation (overlay, slide animation, close
// button), never the business logic of whatever it wraps.
// PR #62 요청 1번: "가르치기·스스로 공부하기" 화면만 판타지 테두리의
// 반투명 글래스모피즘 "미션 창"으로 보여달라는 요청 — 기존 호박목재
// 모달은 퀴즈/대화기록/성장보기/앨범/커스터마이징/마켓 6개 화면이
// 그대로 쓰고 있어, 공유 컴포넌트 자체를 바꾸면 요청 범위 밖인 그
// 화면들까지 전부 바뀐다(CLAUDE.md 2번 규칙 위반 위험). 그래서 선택적
// variant를 추가해 기본값은 기존 스타일을 1바이트도 바꾸지 않고
// 그대로 유지하고, teach/study를 여는 GrowPage 호출부에서만
// variant="mission"을 넘긴다.
export default function BottomSheet({
  title,
  onClose,
  children,
  variant = 'default',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  variant?: 'default' | 'mission'
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isMission = variant === 'mission'

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          isMission
            ? 'motion-safe:animate-[grow-sheet-up_0.22s_ease-out] flex max-h-[88vh] w-full flex-col rounded-t-3xl border-2 border-cyan-400/50 bg-slate-900/80 shadow-[0_8px_40px_rgba(56,189,248,0.3)] ring-4 ring-cyan-300/20 ring-inset backdrop-blur-xl sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl'
            : 'motion-safe:animate-[grow-sheet-up_0.22s_ease-out] flex max-h-[88vh] w-full flex-col rounded-t-3xl border-2 border-[#d4af37] bg-amber-50 shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-4 ring-[#2b1a0f] ring-inset sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl'
        }
      >
        {/* PR #50 긴급 재작업: 밋밋한 흰 모달 느낌을 벗어나려고 헤더만
            어두운 목재 + 금색 테두리로 — 본문(children)의 기존 색상은
            그대로 둬서 가독성/다른 컴포넌트 회귀 위험을 만들지 않는다. */}
        <div
          className={
            isMission
              ? 'flex shrink-0 items-center justify-between rounded-t-[22px] border-b-2 border-cyan-400/40 bg-gradient-to-b from-indigo-950/90 to-slate-950/90 px-4 py-3 sm:rounded-t-[22px]'
              : 'flex shrink-0 items-center justify-between rounded-t-[22px] border-b-2 border-[#d4af37] bg-gradient-to-b from-[#4a2f1a] to-[#2b1a0f] px-4 py-3 sm:rounded-t-[22px]'
          }
        >
          <p className={isMission ? 'text-sm font-bold tracking-wide text-cyan-100' : 'text-sm font-bold tracking-wide text-[#f4d58d]'}>
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className={
              isMission
                ? 'flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/60 text-cyan-100 hover:bg-cyan-400/20'
                : 'flex h-8 w-8 items-center justify-center rounded-full border border-[#d4af37]/70 text-[#f4d58d] hover:bg-[#d4af37]/20'
            }
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
