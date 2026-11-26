import { useEffect, useMemo, useRef, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import type { ProfessionId } from '../../data/characterProfessions'
import { PROFESSION_LABEL } from '../../data/characterProfessions'
import {
  BUILDING_TYPES,
  BUILDING_TYPE_ICON,
  BUILDING_TYPE_IMAGE,
  BUILDING_TYPE_LABEL,
  buildingNameFieldLabel,
  suggestedBuildingType,
  type BuildingType,
} from '../../data/buildingTypes'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
import { walkingPortraitSrc } from '../../data/characterWalking'
import { useImageFallback } from '../../hooks/useImageFallback'
import { buildingInteriorFor } from '../../data/buildingInteriors'
import townMapSrc from '../../assets/grow/town/town-map-2.5d.webp'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }
const DEFAULT_ADDRESS = '우리 동네'

type BuildingStep = 'intro' | 'wizard' | 'building' | 'walking' | 'entering'

// 건물 유형별 내부 이미지(PC/모바일 두 해상도) — 건물 입장
// 직전(entering 단계)에만 마운트되므로, 선택된 유형 1장만 실제로
// 네트워크에서 받아온다(지시서 "9장을 한꺼번에 로딩하지 마세요").
function BuildingInteriorImage({ type, alt }: { type: BuildingType; alt: string }) {
  const { pc, mobile } = buildingInteriorFor(type)
  return (
    <img
      data-testid="town-building-interior-image"
      data-building-type={type}
      src={pc}
      srcSet={`${mobile} 768w, ${pc} 1280w`}
      sizes="(max-width: 640px) 100vw, 1400px"
      loading="lazy"
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover"
    />
  )
}

// 지시서 1번: "향후 30~40개 이상의 건물을 배치할 수 있도록 확장
// 가능한 좌표 구조" — 부지는 {id, left, top}(배경 이미지 위 백분율
// 좌표) 평면 배열 하나뿐이라, 더 채우려면 이 배열에 항목을 추가하기만
// 하면 된다(렌더링·클릭 처리·건설 로직 전부 배열 길이에 의존하지
// 않는다). 지금은 사용자가 제공한 지도 원본(town-map-2.5d.webp, UI를
// 제거하고 지도만 남긴 버전)에 이미 "부지 1~5"로 표시돼 있는 자리에
// 맞춰 5개만 정의했다 — 좌표는 그 원본 이미지(1363×803) 위 핀 중심을
// 픽셀로 집어 백분율로 환산한 값이다.
interface Plot {
  id: string
  label: string
  left: number
  top: number
}
const PLOTS: Plot[] = [
  { id: 'plot-1', label: '부지 1', left: 28.5, top: 64.4 },
  { id: 'plot-2', label: '부지 2', left: 37.9, top: 29.4 },
  { id: 'plot-3', label: '부지 3', left: 73.0, top: 18.6 },
  { id: 'plot-4', label: '부지 4', left: 90.6, top: 40.1 },
  { id: 'plot-5', label: '부지 5', left: 73.0, top: 65.9 },
  // 여기 아래로 {id: 'plot-6', label: '부지 6', left: .., top: ..} 식으로
  // 계속 추가하면 된다(30~40개까지 그대로 확장 가능).
]

// 긴급 수정 지시서 2번: 건물 지붕 위에 상호명 간판을 띄운 실제 건물
// 그래픽. 지도(와이드 화면)와 걷기/입장 화면에서 공통으로 쓴다 —
// 부지 좌표(%)에 bottom-center 기준으로 배치해 건물이 "땅 위에 선"
// 것처럼 보이게 한다.
function BuildingMarker({
  left,
  top,
  buildingType,
  buildingName,
  dimmed,
}: {
  left: number
  top: number
  buildingType: BuildingType
  buildingName: string
  dimmed?: boolean
}) {
  return (
    <div
      data-testid="town-building-placed"
      data-plot-building-type={buildingType}
      className={`pointer-events-none absolute flex -translate-x-1/2 -translate-y-full flex-col items-center ${dimmed ? 'opacity-80' : ''}`}
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <div
        data-testid="town-building-placed-sign"
        className="mb-0.5 max-w-[7rem] truncate rounded-md border border-amber-300/70 bg-amber-100/95 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900 shadow sm:text-xs"
      >
        {buildingName}
      </div>
      <img
        src={BUILDING_TYPE_IMAGE[buildingType]}
        alt={`${buildingName} 건물`}
        className="h-16 w-20 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)] sm:h-20 sm:w-24"
      />
    </div>
  )
}

export default function TownBuildingScreen({
  companionType,
  address,
  onComplete,
  submitting,
  error,
  profession,
  customProfessionLabel,
  ageTier,
  occupiedPlots = [],
}: {
  companionType: CompanionType
  address: string
  onComplete: (building: { buildingType: BuildingType; buildingName: string; plotId: string }) => void
  submitting: boolean
  error: string | null
  profession: ProfessionId | null
  customProfessionLabel: string | null
  ageTier: AgeTier
  occupiedPlots?: { plotId: string; buildingType: BuildingType; buildingName: string }[]
}) {
  const [step, setStep] = useState<BuildingStep>('intro')
  const [progress, setProgress] = useState(0)
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null)
  const [buildingType, setBuildingType] = useState<BuildingType | null>(null)
  // 지시서 2번: 프로필에 기존 직장명/상호명이 등록되어 있다면 자동
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
  const nameFieldLabel = buildingType ? buildingNameFieldLabel(buildingType) : '건물 이름'

  // 유형을 아직 고르지 않았으면 직업 기준 추천 유형을 1회 기본 선택.
  useEffect(() => {
    if (buildingType !== null) return
    setBuildingType(suggestedBuildingType(profession))
    // eslint 규칙(react-hooks/exhaustive-deps)과 달리, 이 효과는 "최초
    // 1회만 추천값을 채운다"는 의도라 buildingType을 의존성에 넣지
    // 않는다(넣으면 사용자가 직접 바꾼 값을 다시 덮어쓰게 된다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profession])

  // professionLabel이 뒤늦게 로드되거나 buildingType이 바뀌면, 사용자가
  // 아직 직접 고치지 않은 한(nameTouched) 계속 최신 초안으로 다시 채운다.
  useEffect(() => {
    if (nameTouched) return
    if (professionLabel) setBuildingName(professionLabel.replace(/\(.*\)$/, '').trim())
  }, [professionLabel, nameTouched])

  const { src: walkingSrc, onError: handleWalkingError } = useImageFallback(
    walkingPortraitSrc(companionType, ageTier),
    fullBodyPortraitSrc(companionType, ageTier),
  )

  const selectedPlot = useMemo(() => PLOTS.find((p) => p.id === selectedPlotId) ?? null, [selectedPlotId])
  const canBuild = selectedPlot !== null && buildingType !== null && buildingName.trim().length > 0

  // 'building' 단계에 들어서면 0→100%까지 자동으로 차오른다 — 약
  // 2.5초(150ms * 약 17회) 동안 건물이 완성되는 연출(지시서 2번).
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
  // 좌우로 이동한다(지시서 3번: "화면 중앙에서 제자리로 움직이거나
  // 버튼 클릭 즉시 전환되는 방식은 완료로 인정하지 않는다"). 출발
  // 지점(왼쪽 가장자리, 인도 위)에서 목적지(선택한 부지)까지 2.4초
  // 동안 translateX로 가로질러 걷고, 도착하면 'entering'(건물 외부 전체
  // 화면 → 문 안으로 들어가는 연출)으로 넘어간다. "애니메이션
  // 건너뛰기"를 누르면 즉시 'entering'으로 넘어간다.
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

  // 'entering' 단계 — 지시서 4번: 작은 사진 두 장을 세로로 쌓지 않고,
  // "건물 외부 전체 화면 → 캐릭터 입장 → 건물 내부 전체 화면" 순서로
  // 하나씩 전체 화면 전환한다. DB 저장 성공(onComplete)까지는 내부
  // 화면에서 기다린다.
  const EXTERIOR_HOLD_MS = 900
  const DOOR_ANIMATION_MS = 700
  const [enteringPhase, setEnteringPhase] = useState<'exterior' | 'door' | 'interior'>('exterior')
  const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (step !== 'entering') return
    setEnteringPhase('exterior')
    enterTimeoutRef.current = setTimeout(() => {
      setEnteringPhase('door')
      enterTimeoutRef.current = setTimeout(() => setEnteringPhase('interior'), DOOR_ANIMATION_MS)
    }, EXTERIOR_HOLD_MS)
    return () => {
      if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current)
    }
  }, [step])

  const handleEnterConfirm = () => {
    if (!selectedPlot || !buildingType) return
    onComplete({ buildingType, buildingName: buildingName.trim() || nameFieldLabel, plotId: selectedPlot.id })
  }

  const walkTargetLeft = selectedPlot ? selectedPlot.left : 50
  const walkTargetTop = selectedPlot ? selectedPlot.top : 70

  return (
    <div
      data-testid="town-building-screen"
      role="dialog"
      aria-modal="true"
      aria-label="동네 건물 짓기"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950 px-2 py-3 sm:px-4 sm:py-4"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/20 via-emerald-900/30 to-slate-950" />

      {step === 'intro' && (
        <div className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-3xl border-2 border-emerald-400/40 bg-slate-900/90 p-5 shadow-[0_8px_40px_rgba(16,185,129,0.25)] backdrop-blur-xl">
          <div
            data-testid="town-building-address-chip"
            className="flex items-center gap-1.5 self-center rounded-full border border-emerald-300/40 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-emerald-200"
          >
            📍 {displayAddress}
            <span className="text-emerald-300/60">· 가상 마을</span>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-2xl">🏙️</p>
            <h1 className="text-lg font-bold text-emerald-100">{label}AI 키우기 시작</h1>
            <p className="text-sm text-emerald-200/80">어느 곳에 건물을 짓겠습니까?</p>
            <p className="text-xs text-emerald-200/60">지도를 보고 원하는 위치의 부지를 선택하세요.</p>
            <button
              type="button"
              data-testid="town-building-pick-location-button"
              onClick={() => setStep('wizard')}
              className="mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-500"
            >
              📍 위치 선정
            </button>
          </div>
        </div>
      )}

      {step === 'wizard' && (
        // 지시서 1번: PC 기준 화면 가로의 90~95%를 쓰는 지도+사이드바
        // 레이아웃 — 참고 이미지("우리동네 마을 만들기" UI)의 구성(좌측
        // 지도, 우측 1·2·3단계 위자드, 상단 제목/카운터)을 실제 작동
        // 하는 UI로 재현한다. 배경은 그 참고 이미지에서 UI(제목바·
        // 사이드바)만 잘라낸 순수 지도 원본(town-map-2.5d.webp)이다.
        <div className="relative z-10 flex h-[94vh] w-[94vw] max-w-[1800px] flex-col gap-2 overflow-hidden rounded-2xl border border-emerald-300/30 bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-300/20 bg-slate-950/80 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏠</span>
              <div>
                <p className="text-sm font-extrabold text-emerald-100 sm:text-base">우리동네 마을 만들기</p>
                <p className="hidden text-xs text-emerald-200/70 sm:block">빈 부지에 건물을 짓고, 우리 마을을 채워보세요!</p>
              </div>
            </div>
            <div
              data-testid="town-building-address-chip"
              className="hidden items-center gap-1.5 rounded-full border border-emerald-300/40 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-emerald-200 md:flex"
            >
              📍 {displayAddress}
              <span className="text-emerald-300/60">· 가상 마을</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-slate-800/70 px-3 py-1 text-xs font-bold text-emerald-100">
              🏗️ 건설한 건물 0/1
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 md:flex-row md:gap-3 md:p-3">
            {/* 지시서 1번: 모바일에서 터치로 지도를 좌우·상하 이동(pan)할
                수 있어야 하는데, 확대·축소(+/−) 버튼까지 스크롤되는
                내용물 안에 두면 패닝 중에 버튼이 같이 밀려 사라진다 —
                그래서 버튼은 스크롤되지 않는 바깥 래퍼(이 div, overflow-
                hidden으로 모서리도 정확히 잘린다)에 고정하고, 실제로
                팬·줌이 되는 내용물만 안쪽 overflow-auto 레이어에 둔다. */}
            <div
              data-testid="town-building-map"
              className="relative min-h-[45vh] flex-1 overflow-hidden rounded-xl border border-emerald-300/20 bg-slate-950"
            >
              <div className="h-full w-full touch-pan-x touch-pan-y overflow-auto">
                <div className="relative h-full min-h-full w-full origin-top-left" style={{ transform: `scale(${mapZoom})`, minWidth: '100%' }}>
                  <img src={townMapSrc} alt="우리 동네 2.5D 지도" className="block h-full w-full object-cover" />

                  {PLOTS.map((plot) => {
                    const occupied = occupiedPlots.find((p) => p.plotId === plot.id)
                    // 다른 캐릭터가 이미 지은 부지는 빈 부지 핀 대신
                    // 실제 건물 그래픽을 보여주고, 클릭(재건설)을 막는다
                    // (지시서 "이미 건설된 부지에는 중복 건설되지 않도록").
                    if (occupied) {
                      return (
                        <BuildingMarker
                          key={plot.id}
                          left={plot.left}
                          top={plot.top}
                          buildingType={occupied.buildingType}
                          buildingName={occupied.buildingName}
                        />
                      )
                    }
                    const isSelected = plot.id === selectedPlotId
                    return (
                      <button
                        key={plot.id}
                        type="button"
                        data-testid="town-building-plot"
                        data-plot-id={plot.id}
                        data-selected={isSelected}
                        onClick={() => setSelectedPlotId(plot.id)}
                        aria-label={`빈 부지 ${plot.label}${isSelected ? ' (선택됨)' : ''}`}
                        className={`absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 shadow-[0_0_14px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 sm:h-12 sm:w-12 ${
                          isSelected ? 'border-yellow-300 bg-yellow-400/40' : 'border-transparent bg-transparent'
                        }`}
                        style={{ left: `${plot.left}%`, top: `${plot.top}%` }}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="pointer-events-none absolute inset-0 flex items-end justify-start p-3">
                <div className="pointer-events-auto flex flex-col gap-1">
                  <button
                    type="button"
                    data-testid="town-building-zoom-in"
                    onClick={() => setMapZoom((z) => Math.min(2, Math.round((z + 0.25) * 100) / 100))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/90 text-base font-bold text-emerald-100 shadow"
                    aria-label="지도 확대"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    data-testid="town-building-zoom-out"
                    onClick={() => setMapZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/90 text-base font-bold text-emerald-100 shadow"
                    aria-label="지도 축소"
                  >
                    −
                  </button>
                </div>
              </div>
            </div>

            {/* 우측 1·2·3단계 위자드 패널 — 참고 이미지 레이아웃. */}
            <div className="flex w-full flex-col gap-3 overflow-y-auto rounded-xl border border-emerald-300/20 bg-slate-950/60 p-3 md:w-72">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-extrabold ${
                      selectedPlot ? 'bg-emerald-400 text-slate-900' : 'bg-slate-700 text-emerald-200'
                    }`}
                  >
                    1
                  </span>
                  <p className="text-sm font-bold text-emerald-100">건물 위치 선택</p>
                </div>
                <p data-testid="town-building-selected-plot" className="pl-7 text-xs text-emerald-200/70">
                  {selectedPlot ? `선택한 부지: ${selectedPlot.label}` : '지도에서 빈 부지를 클릭하세요.'}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-extrabold ${
                      buildingType ? 'bg-emerald-400 text-slate-900' : 'bg-slate-700 text-emerald-200'
                    }`}
                  >
                    2
                  </span>
                  <p className="text-sm font-bold text-emerald-100">건물 종류 선택</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5 pl-1" data-testid="town-building-type-grid">
                  {BUILDING_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      data-testid={`town-building-type-${type}`}
                      onClick={() => setBuildingType(type)}
                      className={`flex items-center gap-1.5 rounded-xl border-2 px-2 py-1.5 text-xs font-bold transition-colors ${
                        buildingType === type
                          ? 'border-yellow-300 bg-yellow-400/20 text-yellow-100'
                          : 'border-emerald-300/20 bg-slate-800/60 text-emerald-100 hover:border-emerald-300/50'
                      }`}
                    >
                      <span>{BUILDING_TYPE_ICON[type]}</span>
                      {BUILDING_TYPE_LABEL[type]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-extrabold ${
                      buildingName.trim() ? 'bg-emerald-400 text-slate-900' : 'bg-slate-700 text-emerald-200'
                    }`}
                  >
                    3
                  </span>
                  <p className="text-sm font-bold text-emerald-100">건물 정보 입력</p>
                </div>
                <input
                  data-testid="town-building-name-input"
                  value={buildingName}
                  onChange={(e) => {
                    setNameTouched(true)
                    setBuildingName(e.target.value)
                  }}
                  maxLength={30}
                  placeholder={`건물 이름 (예: 누리${nameFieldLabel})`}
                  className="ml-7 rounded-xl border border-emerald-300/30 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:border-emerald-300/70 focus:outline-none"
                />
              </div>

              <button
                type="button"
                data-testid="town-building-start-button"
                disabled={!canBuild}
                onClick={() => setStep('building')}
                className="mt-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-500 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 disabled:opacity-60"
              >
                🛠️ 건물 짓기
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'building' && buildingType && (
        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border-2 border-emerald-400/40 bg-slate-900/90 p-6 text-center shadow-[0_8px_40px_rgba(16,185,129,0.25)] backdrop-blur-xl">
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
          {/* 지시서(1단계 PR #156) 5번: 건물 정면 간판 — 사용자 입력값을
              동적으로 렌더링(이미지에 고정하지 않는다). */}
          <div
            data-testid="town-building-sign"
            className="mt-1 rounded-xl border-2 border-amber-300/60 bg-gradient-to-b from-amber-100 to-amber-200 px-4 py-2 text-base font-extrabold text-amber-900 shadow-inner"
          >
            {buildingName || nameFieldLabel}
          </div>
        </div>
      )}

      {step === 'walking' && buildingType && (
        <div className="relative z-10 flex h-[90vh] w-[92vw] max-w-[1400px] flex-col gap-3">
          <p className="text-center text-sm font-bold text-emerald-100 sm:text-base">
            {label}(이)가 {buildingName || nameFieldLabel}(으)로 걸어가고 있어요
          </p>
          <div
            data-testid="town-building-walk-stage"
            className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-emerald-300/30"
          >
            <img src={townMapSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
            {occupiedPlots.map((plot) => (
              <BuildingMarker
                key={plot.plotId}
                left={PLOTS.find((p) => p.id === plot.plotId)?.left ?? 0}
                top={PLOTS.find((p) => p.id === plot.plotId)?.top ?? 0}
                buildingType={plot.buildingType}
                buildingName={plot.buildingName}
                dimmed
              />
            ))}
            {/* 목적지 건물 — 방금 지은 건물 그래픽+상호명 간판을 부지
                자리에 실제로 그려 넣는다(긴급 수정 지시서 1·2번: 완성
                문구만 표시하지 말고 지도 위에 실제 건물을 배치). */}
            <BuildingMarker left={walkTargetLeft} top={walkTargetTop} buildingType={buildingType} buildingName={buildingName || nameFieldLabel} />

            {/* 지시서(1단계 PR #156) 6번: 제자리 바운스가 아니라 실제
                좌우 이동 — 도로/인도를 따라 출발지(왼쪽)에서 목적지
                (선택한 부지)까지 translateX로 걸어간다. 이동 방향에
                따라 scaleX로 좌우 반전한다. */}
            <div
              data-testid="town-building-walking-character"
              className="absolute h-20 w-20 transition-all ease-linear sm:h-28 sm:w-28"
              style={{
                left: `${skipWalking ? walkTargetLeft : WALK_START_LEFT}%`,
                top: `${walkTargetTop}%`,
                transitionDuration: skipWalking ? '0ms' : `${WALK_DURATION_MS}ms`,
                transform: `translate(-50%, -20%) scaleX(${walkTargetLeft >= WALK_START_LEFT ? 1 : -1})`,
                transitionProperty: 'left',
              }}
            >
              <img
                src={walkingSrc}
                onError={handleWalkingError}
                alt={`${label} 캐릭터, 걷는 중`}
                className="h-full w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]"
              />
            </div>
          </div>

          <button
            type="button"
            data-testid="town-building-skip-walk-button"
            onClick={() => setSkipWalking(true)}
            className="self-center rounded-xl bg-white/10 px-4 py-1.5 text-xs font-bold text-emerald-100 hover:bg-white/20"
          >
            애니메이션 건너뛰기 »
          </button>
        </div>
      )}

      {step === 'entering' && buildingType && (
        // 지시서 4번: 350px짜리 작은 화면 두 장 세로 배치를 없애고,
        // PC 기준 최대 1400px의 큰 화면 하나로 "건물 외부 전체 화면 →
        // 캐릭터 입장 → 건물 내부 전체 화면" 순서로 전환한다.
        <div className="relative z-10 flex h-[90vh] w-[92vw] max-w-[1400px] flex-col overflow-hidden rounded-3xl border-2 border-emerald-400/40 bg-slate-900 shadow-2xl">
          <p data-testid="town-building-complete-message" className="px-4 py-3 text-center text-lg font-extrabold text-emerald-100 sm:text-xl">
            {buildingName || nameFieldLabel} 건물이 완성되었습니다!
          </p>

          <div className="relative min-h-0 flex-1">
            <img
              src={townMapSrc}
              alt=""
              aria-hidden
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                enteringPhase === 'interior' ? 'opacity-0' : 'opacity-100'
              }`}
            />
            {enteringPhase !== 'interior' && (
              <BuildingMarker left={walkTargetLeft} top={walkTargetTop} buildingType={buildingType} buildingName={buildingName || nameFieldLabel} />
            )}
            {/* 내부 이미지는 문 애니메이션이 시작되는 시점(= 실제 표시
                직전)에야 마운트한다 — 'exterior' 단계에서는 아예 DOM에
                없으므로 외부 화면만 보고 바로 나가는 경우 내부 이미지를
                받아오지 않는다(지시서 "건물 입장 직전에 1장만 미리
                로딩"). */}
            {enteringPhase !== 'exterior' && (
              <div
                className={`absolute inset-0 transition-opacity duration-500 ${enteringPhase === 'interior' ? 'opacity-100' : 'opacity-0'}`}
              >
                <BuildingInteriorImage type={buildingType} alt={`${buildingName || nameFieldLabel} 내부`} />
              </div>
            )}
            {/* 문 앞까지 걸어온 캐릭터가 축소·페이드되며 안으로
                들어가는 연출('door' 단계에서만 보인다). */}
            {enteringPhase !== 'interior' && (
              <div
                aria-hidden
                className={`absolute bottom-[10%] left-1/2 h-24 w-24 -translate-x-1/2 transition-all duration-700 sm:h-32 sm:w-32 ${
                  enteringPhase === 'door' ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
                }`}
              >
                <img src={walkingSrc} alt="" className="h-full w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]" />
              </div>
            )}
          </div>

          {enteringPhase === 'interior' && (
            <div className="flex flex-col items-center gap-2 border-t border-emerald-300/20 bg-slate-950/70 px-4 py-4">
              <p className="text-center text-sm font-semibold text-emerald-200/90 sm:text-base">
                이제 {professionLabel ? `${professionLabel}님만의 ` : ''}
                {label}AI를 키워보세요.
              </p>
              {error && <p className="text-xs font-semibold text-rose-300">{error}</p>}
              <button
                type="button"
                data-testid="town-building-complete-button"
                onClick={handleEnterConfirm}
                disabled={submitting}
                className="w-full max-w-xs rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3.5 text-base font-extrabold text-white shadow-[0_0_16px_rgba(16,185,129,0.5)] hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
              >
                {submitting ? '시작하는 중...' : `${label}AI 키우기 시작 >`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
