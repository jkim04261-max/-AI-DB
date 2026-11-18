import { useEffect, useRef, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import { useGrowth, type TownBuilding } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import { walkingPortraitSrc } from '../../data/characterWalking'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
import { useImageFallback } from '../../hooks/useImageFallback'
import { PART_TIME_JOB_TOWN_WALK_BG_SRC } from '../../data/partTimeJobAssets'

// 지시서(지역 기반 2.5D 동네 및 직업 건물 건설 시스템): 메인 화면 진입 시
// 한 번 보여주는 오버레이 — ①일하는 지역 기반 2.5D 배경(패럴랙스, PR
// #116에서 쓰던 동네 걷기 배경 재사용) → ②(상호명을 등록해 둔 적이
// 있으면) 등록된 가게/회사 건물 확인 또는 [내 가게 등록] → ③건물로
// 걸어가는 애니메이션(JobEventModal의 걷기 연출과 같은 패턴) →
// ④페이드 전환 → onDone()으로 기존 메인 화면(GameStage/InteractionPanel,
// 전혀 건드리지 않음)으로 돌아간다.
//
// "자영업자 대표 vs 회사원"을 가르는 별도 필드는 아직 없다(CLAUDE.md
// 8번 — DB 구조에 큰 영향을 주는 결정은 화면 코딩 전에 따로 설계·승인을
// 받아야 한다). 그래서 이미 있는 직업 이력(workplaceName, PR #132)만으로
// 판단한다: 상호명을 입력해 둔 사람은 그 지역에 같은 상호명 건물이 있는지
// 확인해 있으면 그냥 입장하고(동료가 이미 등록한 회사 건물에 입장하는
// 경우를 포함), 없으면 [내 가게 등록]을 "선택적으로" 보여준다 — 내가
// 자영업자면 등록하면 되고, 회사원인데 아직 아무도 회사를 등록 안
// 했으면 그냥 건너뛰고 학습 화면으로 가면 된다(지시서의 "회사원은 건물
// 생성 없이 바로 학습 화면" 요구를 강제 등록 없이 만족).
const WALK_DURATION_MS = 1400
const ENTER_FADE_MS = 650

type Phase = 'checking' | 'intro' | 'registering' | 'walking' | 'entering'

export default function TownEntryOverlay({
  companionType,
  ageTier,
  ageNumber,
  region,
  workplaceName,
  onDone,
}: {
  companionType: CompanionType
  ageTier: AgeTier
  ageNumber?: number
  region: string
  workplaceName: string
  onDone: () => void
}) {
  const { getBuilding, registerBuilding } = useGrowth()
  const { src: walkingSrc, onError: handleWalkingPortraitError } = useImageFallback(
    walkingPortraitSrc(companionType, ageTier, ageNumber),
    fullBodyPortraitSrc(companionType, ageTier, ageNumber),
  )

  const [phase, setPhase] = useState<Phase>('checking')
  const [building, setBuilding] = useState<TownBuilding | null>(null)
  const [businessNameInput, setBusinessNameInput] = useState(workplaceName)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getBuilding(region, workplaceName || undefined)
      .then((found) => {
        if (!cancelled) setBuilding(found)
      })
      .catch((err) => {
        // 조회가 실패해도(네트워크 오류 등) 이 오버레이 전체를 막지
        // 않는다 — 부가 기능이라 배경/건너뛰기는 그대로 보여준다.
        console.error('[TownEntryOverlay] failed to look up building', err)
      })
      .finally(() => {
        if (!cancelled) setPhase('intro')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startWalk = () => {
    setPhase('walking')
    timeoutRef.current = setTimeout(() => {
      setPhase('entering')
      timeoutRef.current = setTimeout(onDone, ENTER_FADE_MS)
    }, WALK_DURATION_MS)
  }

  const handleRegisterSubmit = async () => {
    const trimmed = businessNameInput.trim()
    if (!trimmed) {
      setRegisterError('상호명을 입력해주세요.')
      return
    }
    setRegistering(true)
    setRegisterError(null)
    try {
      const created = await registerBuilding(region, trimmed)
      setBuilding(created)
      setPhase('intro')
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : '건물을 등록하는 중 오류가 발생했어요.')
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div data-testid="town-entry-overlay" role="dialog" aria-label="동네 입장" className="absolute inset-0 z-30 overflow-hidden rounded-2xl">
      <div aria-hidden className="absolute inset-0 overflow-hidden motion-safe:animate-[grow-hungry-bg-parallax_6s_ease-in-out_infinite]">
        <img src={PART_TIME_JOB_TOWN_WALK_BG_SRC} alt="" className="h-full w-full object-cover" />
      </div>
      <div aria-hidden className="absolute inset-0 bg-black/35" />

      <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
        <p
          data-testid="town-entry-region-label"
          className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] sm:text-sm"
        >
          📍 {region}
        </p>
      </div>

      {(phase === 'walking' || phase === 'entering') && (
        <div className="relative h-full">
          <div
            data-testid="town-entry-walk-sprite"
            className="grow-walk-sprite motion-safe:animate-[grow-walk-across_1.4s_ease-in-out_forwards] absolute bottom-6 left-0"
          >
            <img
              src={walkingSrc}
              onError={handleWalkingPortraitError}
              alt=""
              className="h-24 w-24 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)]"
            />
          </div>
        </div>
      )}

      {phase === 'intro' && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-3">
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/65 p-3 text-center backdrop-blur-sm">
            {building ? (
              <p className="text-sm font-bold text-white sm:text-base">🏢 ‘{building.businessName}’ 건물이 보여요!</p>
            ) : workplaceName ? (
              <p className="text-sm font-bold text-white sm:text-base">아직 이 지역에 등록된 가게가 없어요.</p>
            ) : (
              <p className="text-sm font-bold text-white sm:text-base">오늘도 열심히 배워볼까요?</p>
            )}
            <div className="flex w-full flex-col gap-1.5 sm:flex-row sm:justify-center">
              {!building && workplaceName && (
                <button
                  type="button"
                  data-testid="town-entry-register-open-button"
                  onClick={() => {
                    setRegisterError(null)
                    setPhase('registering')
                  }}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-yellow-600"
                >
                  🏪 내 가게 등록
                </button>
              )}
              <button
                type="button"
                data-testid="town-entry-primary-button"
                onClick={startWalk}
                className="rounded-xl bg-white/90 px-4 py-2 text-sm font-bold text-amber-900 shadow-[0_2px_0_rgba(0,0,0,0.2)] hover:bg-white"
              >
                {building ? '입장하기' : '학습하러 가기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'registering' && (
        <div
          data-testid="town-entry-register-modal"
          className="motion-safe:animate-[grow-bubble-pop_0.2s_ease-out] absolute inset-0 z-20 flex items-center justify-center bg-amber-950/80 p-4"
        >
          <div className="flex w-full max-w-xs flex-col gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-center shadow-xl">
            <p className="text-sm font-bold text-amber-900">🏪 내 가게 등록</p>
            <p className="text-xs text-amber-700/80">{region}에 등록할 상호명을 입력해주세요.</p>
            <input
              type="text"
              data-testid="town-entry-business-name-input"
              value={businessNameInput}
              onChange={(e) => setBusinessNameInput(e.target.value)}
              placeholder="예: 자양청년치킨"
              maxLength={30}
              className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900 outline-none focus:border-amber-500"
            />
            {registerError && (
              <p data-testid="town-entry-register-error" className="text-xs font-bold text-rose-600">
                {registerError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPhase('intro')}
                disabled={registering}
                className="flex-1 rounded-xl bg-white px-4 py-2 text-sm font-bold text-amber-700 ring-1 ring-amber-300 disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                data-testid="town-entry-register-submit"
                onClick={handleRegisterSubmit}
                disabled={registering}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] disabled:opacity-60"
              >
                {registering ? '등록 중...' : '등록하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'entering' && (
        <div
          data-testid="town-entry-fade"
          aria-hidden
          className="absolute inset-0 z-20 bg-black motion-safe:animate-[grow-town-enter-fade_0.65s_ease-in_forwards]"
        />
      )}
    </div>
  )
}
