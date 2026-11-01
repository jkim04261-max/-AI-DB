import { useEffect } from 'react'
import { PROFESSIONS, CATEGORY_LABEL, type ProfessionCategory, type ProfessionId } from '../../data/characterProfessions'

const CATEGORY_ORDER: ProfessionCategory[] = ['it', 'professional', 'healthcare', 'education', 'culture', 'service']

// PR #49에서 만든 50개 직업 카테고리 셀렉터. PR #51(직업 선택 제한
// 해제)부터는 50개 전부 클릭해서 목표 직업으로 고르고 저장할 수 있다.
// 다만 "문제 풀기"(퀴즈/시험)는 여전히 회계사·가수뿐이라
// (characterProfessions.ts의 examSupported 참고), 그 2개가 아닌 직업에는
// 작은 "문제 풀기 준비 중" 안내만 붙는다 — 직업 선택 자체를 막지는
// 않는다(고르면 실제로 저장되고, 가르치기/스스로 공부하기는 그대로
// 쓸 수 있다).
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
        className="motion-safe:animate-[grow-sheet-up_0.22s_ease-out] flex max-h-[80vh] w-full flex-col rounded-t-3xl border-2 border-[#d4af37] bg-amber-50 shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-4 ring-[#2b1a0f] ring-inset sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between rounded-t-[22px] border-b-2 border-[#d4af37] bg-gradient-to-b from-[#4a2f1a] to-[#2b1a0f] px-4 py-3">
          <p className="text-sm font-bold tracking-wide text-[#f4d58d]">직업 선택</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d4af37]/70 text-[#f4d58d] hover:bg-[#d4af37]/20"
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
                    onClick={() => onSelect(p.id)}
                    aria-current={p.id === currentProfession}
                    className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                      p.id === currentProfession
                        ? 'border-amber-500 bg-amber-100 text-amber-900'
                        : 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    <span>{p.label}</span>
                    {!p.examSupported && <span className="text-[10px] font-normal text-amber-400">문제 풀기 준비 중</span>}
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
