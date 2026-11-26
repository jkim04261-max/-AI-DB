import { useEffect, useMemo, useRef, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import type { ProfessionId } from '../../data/characterProfessions'
import { PROFESSION_LABEL } from '../../data/characterProfessions'
import {
  BUILDING_TYPES,
  BUILDING_TYPE_ICON,
  BUILDING_TYPE_LABEL,
  buildingNameFieldLabel,
  suggestedBuildingType,
  type BuildingType,
} from '../../data/buildingTypes'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
import { walkingPortraitSrc } from '../../data/characterWalking'
import { useImageFallback } from '../../hooks/useImageFallback'
import { TOWN_SQUARE_BG_SRC, STORE_INTERIOR_SRC, CLASSROOM_INTERIOR_SRC } from '../../data/lifeEventAssets'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }
const DEFAULT_ADDRESS = '우리 동네'

type BuildingStep = 'intro' | 'picking' | 'details' | 'building' | 'walking' | 'entering'

// 지시서(2.5D 우리동네 지도 및 건물 건설·캐릭터 입장 기능 완성)에서
// 쓸 건물 내부 이미지 — 학교 유형만 교실(classroom-interior.webp),
// 나머지 전부는 가게 내부(store-interior.webp)를 공유한다. 병원/공공
// 기관/공장 전용 내부 이미지는 이 저장소에 아직 없다(아래 보고 참고).
function interiorSrcFor(type: BuildingType): string {
  return type === 'school' ? CLASSROOM_INTERIOR_SRC : STORE_INTERIOR_SRC
}

// 지시서 2번: 지도 위 건설 가능한 "빈 부지" 좌표 — 실제 동네 전경
// 사진(town-square.webp) 위에, 도로·보도블록이 깔린 열린 공간으로
// 보이는 지점들을 골라 핀으로 표시한다(사진 속 건물들은 전부 이미
// 배경에 그려진 기존 건물이라 겹쳐 지을 수 없으므로 애초에 선택
// 대상에 넣지 않는다 — "이미 건물이 있는 부지에 중복 건설 금지"를
// 이렇게 구조적으로 보장한다). 좌표는 백분율(left/top)이라 배경
// 이미지가 어떤 크기로 보여도 같은 자리를 가리킨다.
interface Plot {
  id: string
  left: number
  top: number
}
const PLOTS: Plot[] = [
  { id: 'plot-1', left: 10, top: 86 },
  { id: 'plot-2', left: 28, top: 92 },
  { id: 'plot-3', left: 50, top: 94 },
  { id: 'plot-4', left: 70, top: 90 },
  { id: 'plot-5', left: 90, top: 84 },
]

// 지시서 2번: 도로/인도/가로수/공원 표시 — town-square.webp 안에 이미
// 실제로 그려져 있는 요소(분수 광장, 가로수, 횡단보도, 상가 거리)를
// 가리키는 안내 배지. 그림을 새로 그리는 대신, 이미 있는 2.5D 배경
// 사진의 해당 위치를 짚어서 알려준다.
const MAP_LABELS: { text: string; left: number; top: number }[] = [
  { text: '⛲ 공원·광장', left: 50, top: 70 },
  { text: '🌳 가로수길', left: 14, top: 18 },
  { text: '🚦 도로·횡단보도', left: 58, top: 46 },
  { text: '🏪 상가 거리', left: 16, top: 42 },
]

export default function TownBuildingScreen({
  companionType,
  address,
  onComplete,
  submitting,
  error,
  profession,
  customProfessionLabel,
  ageTier,
}: {
  companionType: CompanionType
  address: string
  onComplete: (building: { buildingType: BuildingType; buildingName: string; plotId: string }) => void
  submitting: boolean
  error: string | null
  profession: ProfessionId | null
  customProfessionLabel: string | null
  ageTier: AgeTier
}) {
  const [step, setStep] = useState<BuildingStep>('intro')
  const [progress, setProgress] = useState(0)
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null)
  const [buildingType, setBuildingType] = useState<BuildingType>(() => suggestedBuildingType(profession))
  // 지시서 4번: 프로필에 기존 직장명/상호명이 등록되어 있다면 자동
  // 입력 — 이 캐릭터는 직업명(custom_profession_label 또는
  // PROFESSION_LABEL)만 저장돼 있고 "상호명" 자체를 담는 별도 필드가
  // 없어서(기존 DB 구조), 직업명을 출발점으로 자동 채워주고 사용자가
  // 자유롭게 고쳐 쓰게 한다 — 완전한 자동완성이 아니라 "초안 채우기".
  const [buildingName, setBuildingName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [mapZoom, setMapZoom] = useState(1)
  const [skipWalking, setSkipWalking] = useState(false)

  const displayAddress = address.trim().length > 0 ? address.trim() : DEFAULT_ADDRESS
  const label = COMPANION_LABEL[companionType]
  const professionLabel = profession === 'custom' ? (customProfessionLabel ?? '') : profession ? PROFESSION_LABEL[profession] : ''
  const nameFieldLabel = buildingNameFieldLabel(buildingType, profession)

  // professionLabel이 뒤늦게 로드되거나(캐릭터 목록 응답이 아직 안
  // 왔을 때) buildingType이 바뀌면, 사용자가 아직 직접 고치지 않은
  // 한(nameTouched) 계속 최신 초안으로 다시 채운다.
  useEffect(() => {
    if (nameTouched) return
    if (professionLabel) setBuildingName(`${professionLabel.replace(/\(.*\)$/, '').trim()}`)
  }, [professionLabel, nameTouched])

  const { src: walkingSrc, onError: handleWalkingError } = useImageFallback(
    walkingPortraitSrc(companionType, ageTier),
    fullBodyPortraitSrc(companionType, ageTier),
  )

  const selectedPlot = useMemo(() => PLOTS.find((p) => p.id === selectedPlotId) ?? null, [selectedPlotId])

  // 'building' 단계에 들어서면 0→100%까지 자동으로 차오른다 — 약
  // 2.5초(150ms * 약 17회) 동안 건물이 완성되는 연출(지시서 5번).
  useEffect(() => {
    if (step !== 'building') return
    setProgress(0)
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 6, 100)
        if (next >= 100) {
          clearInterval(interval)
          setTimeout(() => setStep('walking'), 300)
        }
        return next
      })
    }, 150)
    return () => clearInterval(interval)
  }, [step])

  // 'walking' 단계 — 캐릭터가 동네 도로를 따라 선택한 부지까지 실제로
  // 좌우로 이동한다(지시서 6번: "화면 중앙에서 제자리로 움직이거나
  // 버튼 클릭 즉시 전환되는 방식은 완료로 인정하지 않는다"). 출발
  // 지점(왼쪽 가장자리, 인도 위)에서 목적지(선택한 부지)까지 2.4초
  // 동안 translateX로 가로질러 걷고, 도착하면 'entering'(문 안으로
  // 들어가는 축소·페이드 연출)으로 넘어간다. "애니메이션 건너뛰기"를
  // 누르면 즉시 'entering'으로 넘어간다.
  const WALK_START_LEFT = 6
  const WALK_DURATION_MS = 2400
  const walkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (step !== 'walking' || skipWalking) return
    walkTimeoutRef.current = setTimeout(() => setStep('entering'), WALK_DURATION_MS)
    return () => {
      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current)
    }
  }, [step, skipWalking])
  useEffect(() => {
    if (step === 'walking' && skipWalking) setStep('entering')
  }, [step, skipWalking])

  // 'entering' 단계 — 문 안으로 들어가는 축소·페이드 연출 뒤, 저장
  // 성공(onComplete)까지 끝나야만 "들어갔다"로 본다(지시서 5번: "DB
  // 저장 성공 후에만 건설 완료 메시지를 표시한다"와 같은 원칙을
  // 입장에도 적용 — submitting이 길어져도 화면은 안내만 보여주고
  // 조용히 기다린다).
  const ENTER_ANIMATION_MS = 900
  const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (step !== 'entering') return
    enterTimeoutRef.current = setTimeout(() => setEntered(true), ENTER_ANIMATION_MS)
    return () => {
      if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current)
    }
  }, [step])

  const handleEnterConfirm = () => {
    if (!selectedPlot) return
    onComplete({ buildingType, buildingName: buildingName.trim() || nameFieldLabel, plotId: selectedPlot.id })
  }

  const walkTargetLeft = selectedPlot ? selectedPlot.left : 50

  return (
    <div
      data-testid="town-building-screen"
      role="dialog"
      aria-modal="true"
      aria-label="동네 건물 짓기"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950 px-2 py-4 sm:px-4 sm:py-6"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/20 via-emerald-900/30 to-slate-950" />

      {/* 지시서 2번: 화면 최상단 근무지역 표시 — 가상 마을 안내 포함. */}
      <div
        data-testid="town-building-address-chip"
        className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-emerald-300/40 bg-slate-800/90 px-3 py-1 text-xs font-semibold text-emerald-200 shadow-lg"
      >
        📍 {displayAddress}
        <span className="text-emerald-300/60">· 가상 마을</span>
      </div>

      {step === 'picking' ? (
        // 지시서 2번: PC는 화면 가로 90%·세로 75~85%를 쓰는 넓은 지도.
        <div className="relative z-10 flex h-[80vh] w-[90vw] max-w-5xl flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <p data-testid="town-building-prompt" className="text-sm font-bold text-emerald-100 sm:text-base">
              어느 곳에 건물을 지으시겠습니까? 원하는 부지를 선택해주세요.
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="town-building-zoom-out"
                onClick={() => setMapZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                className="rounded-lg bg-slate-800/80 px-2 py-1 text-sm font-bold text-emerald-100"
                aria-label="지도 축소"
              >
                −
              </button>
              <button
                type="button"
                data-testid="town-building-zoom-in"
                onClick={() => setMapZoom((z) => Math.min(2, Math.round((z + 0.25) * 100) / 100))}
                className="rounded-lg bg-slate-800/80 px-2 py-1 text-sm font-bold text-emerald-100"
                aria-label="지도 확대"
              >
                +
              </button>
            </div>
          </div>

          {/* 모바일에서는 이 컨테이너가 overflow-auto라 터치로 좌우·상하
              이동(pan)할 수 있고, 위 +/- 버튼으로 확대·축소(zoom)한다. */}
          <div
            data-testid="town-building-map"
            className="relative flex-1 touch-pan-x touch-pan-y overflow-auto rounded-2xl border border-emerald-300/30 bg-slate-900"
          >
            <div
              className="relative h-full min-h-full w-full origin-top-left"
              style={{ transform: `scale(${mapZoom})`, minWidth: '100%' }}
            >
              <img src={TOWN_SQUARE_BG_SRC} alt="우리 동네 2.5D 지도" className="block h-full w-full object-cover" />

              {MAP_LABELS.map((l) => (
                <span
                  key={l.text}
                  aria-hidden
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white shadow sm:text-xs"
                  style={{ left: `${l.left}%`, top: `${l.top}%` }}
                >
                  {l.text}
                </span>
              ))}

              {PLOTS.map((plot) => {
                const isSelected = plot.id === selectedPlotId
                return (
                  <button
                    key={plot.id}
                    type="button"
                    data-testid="town-building-plot"
                    data-plot-id={plot.id}
                    data-selected={isSelected}
                    onClick={() => setSelectedPlotId(plot.id)}
                    aria-label={`빈 부지 ${plot.id}${isSelected ? ' (선택됨)' : ''}`}
                    className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 text-base shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 sm:h-11 sm:w-11 ${
                      isSelected ? 'border-yellow-300 bg-yellow-400/80' : 'border-emerald-300 bg-emerald-500/70'
                    }`}
                    style={{ left: `${plot.left}%`, top: `${plot.top}%` }}
                  >
                    🏗️
                  </button>
                )
              })}
            </div>
          </div>

          <div
            data-testid="town-building-selected-plot"
            className="rounded-xl border border-emerald-300/30 bg-slate-900/90 px-3 py-2 text-center text-xs text-emerald-100 sm:text-sm"
          >
            {selectedPlot ? `선택한 부지: ${selectedPlot.id} (${displayAddress})` : '아직 부지를 선택하지 않았어요.'}
          </div>
          <button
            type="button"
            data-testid="town-building-start-button"
            disabled={!selectedPlot}
            onClick={() => setStep('details')}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-500 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-600 disabled:opacity-60"
          >
            🏗️ 이곳에 건물을 짓겠습니다
          </button>
        </div>
      ) : (
        <div className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-3xl border-2 border-emerald-400/40 bg-slate-900/90 p-5 pt-12 shadow-[0_8px_40px_rgba(16,185,129,0.25)] backdrop-blur-xl">
          {step === 'intro' && (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-2xl">🏙️</p>
              <h1 className="text-lg font-bold text-emerald-100">{label}AI 키우기 시작</h1>
              <p className="text-sm text-emerald-200/80">어느 곳에 건물을 짓겠습니까?</p>
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

          {step === 'details' && (
            <div className="flex flex-col gap-3">
              <p className="text-center text-sm font-bold text-emerald-100">어떤 건물을 지을까요?</p>
              <div className="grid grid-cols-2 gap-1.5" data-testid="town-building-type-grid">
                {BUILDING_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    data-testid={`town-building-type-${type}`}
                    onClick={() => setBuildingType(type)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-2 text-xs font-bold transition-colors ${
                      buildingType === type
                        ? 'border-yellow-300 bg-yellow-400/20 text-yellow-100'
                        : 'border-emerald-300/20 bg-slate-800/60 text-emerald-100 hover:border-emerald-300/50'
                    }`}
                  >
                    <span className="text-lg">{BUILDING_TYPE_ICON[type]}</span>
                    {BUILDING_TYPE_LABEL[type]}
                  </button>
                ))}
              </div>

              <label className="flex flex-col gap-1 text-xs font-bold text-emerald-200/80">
                {nameFieldLabel}
                <input
                  data-testid="town-building-name-input"
                  value={buildingName}
                  onChange={(e) => {
                    setNameTouched(true)
                    setBuildingName(e.target.value)
                  }}
                  maxLength={30}
                  placeholder={`예: 강남${nameFieldLabel}`}
                  className="rounded-xl border border-emerald-300/30 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:border-emerald-300/70 focus:outline-none"
                />
              </label>

              <button
                type="button"
                data-testid="town-building-confirm-details-button"
                disabled={!buildingName.trim()}
                onClick={() => setStep('building')}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                이곳에 건물을 짓겠습니다
              </button>
            </div>
          )}

          {step === 'building' && (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-3xl">
                {BUILDING_TYPE_ICON[buildingType]}
                🚧
              </p>
              <p data-testid="town-building-progress-label" className="text-sm font-semibold text-emerald-100">
                {buildingName || nameFieldLabel} 건설 중... {progress}%
              </p>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  data-testid="town-building-progress-bar"
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-[width] duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* 지시서 5번: 건물 정면 간판 — 사용자 입력값을 동적으로
                  렌더링(이미지에 고정하지 않는다). */}
              <div
                data-testid="town-building-sign"
                className="mt-1 rounded-xl border-2 border-amber-300/60 bg-gradient-to-b from-amber-100 to-amber-200 px-4 py-2 text-base font-extrabold text-amber-900 shadow-inner"
              >
                {buildingName || nameFieldLabel}
              </div>
            </div>
          )}

          {(step === 'walking' || step === 'entering') && (
            <div className="flex flex-col gap-3">
              <p className="text-center text-sm font-bold text-emerald-100">
                {step === 'walking' ? `${label}(이)가 ${buildingName || nameFieldLabel}(으)로 걸어가고 있어요` : '건물로 들어가는 중...'}
              </p>
              <div
                data-testid="town-building-walk-stage"
                className="relative aspect-video w-full overflow-hidden rounded-2xl border border-emerald-300/30"
              >
                <img src={TOWN_SQUARE_BG_SRC} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
                {/* 목적지 건물 표시 — 선택한 부지 자리에 방금 지은 건물
                    간판을 겹쳐 보여준다. */}
                <div
                  aria-hidden
                  className="absolute -translate-x-1/2 -translate-y-full rounded-lg border border-amber-300/70 bg-amber-100/95 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 shadow"
                  style={{ left: `${walkTargetLeft}%`, top: '88%' }}
                >
                  {BUILDING_TYPE_ICON[buildingType]} {buildingName || nameFieldLabel}
                </div>

                {/* 지시서 6번: 제자리 바운스가 아니라 실제 좌우 이동 —
                    도로/인도를 따라 출발지(왼쪽)에서 목적지(선택한
                    부지)까지 translateX로 걸어간다. 이동 방향에 따라
                    scaleX로 좌우 반전한다. 'entering'에서는 문 앞에서
                    축소·페이드되며 사라진다. */}
                <div
                  data-testid="town-building-walking-character"
                  className="absolute bottom-[6%] h-16 w-16 transition-all ease-linear sm:h-20 sm:w-20"
                  style={{
                    left: `${step === 'walking' && !skipWalking ? WALK_START_LEFT : walkTargetLeft}%`,
                    transitionDuration: step === 'walking' && !skipWalking ? `${WALK_DURATION_MS}ms` : '0ms',
                    transform: `translate(-50%, 0) scaleX(${walkTargetLeft >= WALK_START_LEFT ? 1 : -1}) ${
                      step === 'entering' ? 'scale(0.4)' : 'scale(1)'
                    }`,
                    opacity: step === 'entering' ? 0 : 1,
                    transitionProperty: step === 'entering' ? 'transform, opacity' : 'left',
                  }}
                >
                  <img
                    src={walkingSrc}
                    onError={handleWalkingError}
                    alt={`${label} 캐릭터, 걷는 중`}
                    className="h-full w-full object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)]"
                  />
                </div>
              </div>

              {step === 'walking' && (
                <button
                  type="button"
                  data-testid="town-building-skip-walk-button"
                  onClick={() => setSkipWalking(true)}
                  className="self-center rounded-xl bg-white/10 px-4 py-1.5 text-xs font-bold text-emerald-100 hover:bg-white/20"
                >
                  애니메이션 건너뛰기 »
                </button>
              )}

              {step === 'entering' && entered && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div
                    aria-hidden
                    className="relative aspect-video w-full overflow-hidden rounded-2xl border border-emerald-300/30"
                  >
                    <img src={interiorSrcFor(buildingType)} alt="" className="h-full w-full object-cover" />
                  </div>
                  <p data-testid="town-building-complete-message" className="text-base font-bold text-emerald-100">
                    {buildingName || nameFieldLabel} 건물이 완성되었습니다!
                  </p>
                  <p className="text-sm text-emerald-200/80">
                    이제 {professionLabel ? `${professionLabel}님만의 ` : ''}
                    {label}AI를 키워보세요.
                  </p>
                  {error && <p className="text-xs font-semibold text-rose-300">{error}</p>}
                  <button
                    type="button"
                    data-testid="town-building-complete-button"
                    onClick={handleEnterConfirm}
                    disabled={submitting}
                    className="mt-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
                  >
                    {submitting ? '시작하는 중...' : `${label}AI 키우기 시작 >`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
