import { useEffect } from 'react'
import { PROFESSIONS, CATEGORY_LABEL, type ProfessionCategory, type ProfessionId } from '../../data/characterProfessions'

const CATEGORY_ORDER: ProfessionCategory[] = ['it', 'professional', 'healthcare', 'education', 'culture', 'service']

// PR #49: 50개 직업을 카테고리별로 묶어 보여주는 팝업 셀렉터. 실제로
// 선택 가능한 직업(현재는 회계사·가수뿐 — characterProfessions.ts의
// selectable 플래그 참고)만 클릭할 수 있고, 나머지는 "준비 중" 배지와
// 함께 비활성 처리된다 — 고르면 저장되는 것처럼 보이게 하지 않는다.
export default function ProfessionPicker({
  currentProfession,
  onSelect,
  onClose,
}: {
  currentProfession: ProfessionId | null
  onSelect: (id: ProfessionId) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-amber-950/50 px-0 sm:items-center sm:px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="직업 선택"
        onClick={(e) => e.stopPropagation()}
        className="motion-safe:animate-[grow-sheet-up_0.22s_ease-out] flex max-h-[80vh] w-full flex-col rounded-t-3xl bg-amber-50 sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-amber-200 px-4 py-3">
          <p className="text-sm font-bold text-amber-900">직업 선택</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full text-amber-500 hover:bg-amber-100 hover:text-amber-700"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {CATEGORY_ORDER.map((category) => (
            <section key={category} className="mb-4">
              <h3 className="mb-2 text-xs font-bold text-amber-700">{CATEGORY_LABEL[category]}</h3>
              <div className="grid grid-cols-2 gap-2">
                {PROFESSIONS.filter((p) => p.category === category).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!p.selectable}
                    onClick={() => p.selectable && onSelect(p.id)}
                    aria-current={p.id === currentProfession}
                    className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                      p.id === currentProfession
                        ? 'border-amber-500 bg-amber-100 text-amber-900'
                        : p.selectable
                          ? 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50'
                          : 'cursor-not-allowed border-amber-100 bg-amber-50/40 text-amber-400'
                    }`}
                  >
                    <span>{p.label}</span>
                    {!p.selectable && <span className="text-[10px] font-normal text-amber-400">준비 중</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
