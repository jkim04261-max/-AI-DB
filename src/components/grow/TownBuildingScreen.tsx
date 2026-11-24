import { useEffect, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }
const DEFAULT_ADDRESS = '우리 동네'

type BuildingStep = 'intro' | 'picking' | 'building' | 'complete'

// 지시서(프로필 주소 기반 2.5D 동네 건물 짓기 시스템 구현, 1단계): 온보딩
// (OpeningProfileScreen)에서 캐릭터를 막 만든 직후, 또는 아직 건물을
// 안 지은 기존 캐릭터를 선택했을 때 한 번 보여주는 전체화면 시퀀스 —
// "위치 선정 → 건설 애니메이션 → 완성" 세 단계를 거친 뒤에만 평소의
// 성장 화면으로 들어간다. 참고 이미지(5장)의 흐름·구성요소(주소 표시,
// 지도 위 핀, 진행률 바, 완성 모달)를 그대로 옮기되, 일러스트는 이
// 코드베이스의 기존 톤(그라디언트·이모지·Tailwind 도형)으로 새로
// 그렸다 — 참고 이미지를 그대로 복제하지 않는다(지식재산권 침해 예방
// 지침).
//
// 사용자 확인(2026-11-24): 직업별 건물 유형 자동 분기와 상호명 저장은
// 이번 단계에서 빼고 다음 PR로 미룬다 — 그래서 이 화면은 건물 모양이
// 하나뿐이고, 완성 모달에 상호명 입력칸이 없다.
export default function TownBuildingScreen({
  companionType,
  address,
  onComplete,
  submitting,
  error,
}: {
  companionType: CompanionType
  address: string
  onComplete: () => void
  submitting: boolean
  error: string | null
}) {
  const [step, setStep] = useState<BuildingStep>('intro')
  const [progress, setProgress] = useState(0)
  const displayAddress = address.trim().length > 0 ? address.trim() : DEFAULT_ADDRESS
  const label = COMPANION_LABEL[companionType]

  // 'building' 단계에 들어서면 0→100%까지 자동으로 차오른다(참고
  // 이미지의 "건물 건설 중... N%" 프로그레스 바) — 100%에 닿으면 1회만
  // 'complete'로 넘어간다.
  useEffect(() => {
    if (step !== 'building') return
    setProgress(0)
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 8, 100)
        if (next >= 100) {
          clearInterval(interval)
          setTimeout(() => setStep('complete'), 300)
        }
        return next
      })
    }, 150)
    return () => clearInterval(interval)
  }, [step])

  return (
    <div
      data-testid="town-building-screen"
      role="dialog"
      aria-modal="true"
      aria-label="동네 건물 짓기"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950 px-4 py-6"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/30 via-emerald-900/40 to-slate-950" />

      <div className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-3xl border-2 border-emerald-400/40 bg-slate-900/90 p-5 shadow-[0_8px_40px_rgba(16,185,129,0.25)] backdrop-blur-xl">
        <div
          data-testid="town-building-address-chip"
          className="flex items-center gap-1.5 self-center rounded-full border border-emerald-300/40 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-emerald-200"
        >
          📍 {displayAddress}
        </div>

        {step === 'intro' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-2xl">🏙️</p>
            <h1 className="text-lg font-bold text-emerald-100">{label}AI 키우기 시작</h1>
            <p data-testid="town-building-prompt" className="text-sm text-emerald-200/80">
              어느 곳에 상가 건물을 짓겠습니까?
            </p>
            <p className="text-xs text-emerald-200/60">지도를 보고 원하는 위치의 부지를 선택하세요.</p>
            <button
              type="button"
              data-testid="town-building-pick-location-button"
              onClick={() => setStep('picking')}
              className="mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-500"
            >
              📍 위치 선정
            </button>
          </div>
        )}

        {step === 'picking' && (
          <div className="flex flex-col gap-3">
            <div className="relative grid aspect-square grid-cols-4 grid-rows-4 gap-1 overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-800/60 to-slate-800/60 p-2">
              {Array.from({ length: 16 }, (_, i) => (
                <div
                  key={i}
                  className={`rounded-md ${i === 5 ? '' : i % 3 === 0 ? 'bg-emerald-600/30' : 'bg-slate-700/40'}`}
                />
              ))}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-3xl drop-shadow-[0_0_6px_rgba(248,113,113,0.8)]">📍</span>
              </div>
            </div>
            <div
              data-testid="town-building-selected-plot"
              className="rounded-xl border border-emerald-300/30 bg-slate-800/70 px-3 py-2 text-center text-xs text-emerald-100"
            >
              선택한 부지 ({displayAddress})
            </div>
            <button
              type="button"
              data-testid="town-building-start-button"
              onClick={() => setStep('building')}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-500"
            >
              🏗️ 이곳에 건물 짓겠습니다
            </button>
          </div>
        )}

        {step === 'building' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-3xl">🏗️🚧</p>
            <p data-testid="town-building-progress-label" className="text-sm font-semibold text-emerald-100">
              건물 건설 중... {progress}%
            </p>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                data-testid="town-building-progress-bar"
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-3xl">🏢✅</p>
            <p data-testid="town-building-complete-message" className="text-base font-bold text-emerald-100">
              건물이 완성되었습니다.
            </p>
            <p className="text-sm text-emerald-200/80">이제 {label}AI를 키우세요!</p>
            {error && <p className="text-xs font-semibold text-rose-300">{error}</p>}
            <button
              type="button"
              data-testid="town-building-complete-button"
              onClick={onComplete}
              disabled={submitting}
              className="mt-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
            >
              {submitting ? '시작하는 중...' : `${label}AI 키우기 시작 >`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
