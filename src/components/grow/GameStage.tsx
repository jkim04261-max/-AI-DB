import { useState } from 'react'
import CharacterSprite, { POSE_LABEL, OUTFIT_PALETTE_OVERRIDE, type CharacterPose } from './CharacterSprite'
import SpeechBubble from './SpeechBubble'
import { sceneForProfession, type SceneTheme } from '../../data/growthScenes'
import type { CompanionType } from '../../context/GrowthContext'
import type { ProfessionId } from '../../data/characterProfessions'
import type { AppearanceTier } from '../../data/characterAppearance'
import type { OutfitId } from '../../data/characterCustomization'
import type { AgeTier } from '../../data/characterAge'
import { AGE_PORTRAIT_SRC } from '../../data/characterAgePortraits'

const COMPANION_NAME: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }

// PR #50 긴급 재작업: 제공받은 실제 일러스트 속 누리·두리 대략적인
// 위치(퍼센트 좌표) — 캐릭터별 탭 타깃·말풍선·기분 이모지를 그 위에
// 겹쳐 그린다. 그림 자체는 통째로 하나라 두 사람을 따로 자르지 않고
// 같이 보여주고, "지금 선택된 쪽"만 금색 테두리로 강조한다.
const ILLUSTRATED_REGION: Record<CompanionType, { left: string; top: string; width: string; height: string; anchorLeft: string }> = {
  nuri: { left: '2%', top: '3%', width: '48%', height: '94%', anchorLeft: '26%' },
  duri: { left: '50%', top: '3%', width: '48%', height: '94%', anchorLeft: '72%' },
}

const MOOD_ICON: Partial<Record<CharacterPose, string>> = {
  happy: '✨',
  sad: '💧',
  studying: '📖',
}

// PR #52: 일러스트 모드에서 쓰는 연령대 배지 — CharacterSprite(CSS 모드)
// 의 SVG 배지와 같은 의도를 이모지로 표현한다(실일러스트는 통짜 이미지라
// 레이어 분리가 안 됨 — PR #50과 같은 한계). junior_20s는 기존
// "기본 모습"과 같은 뜻이라 배지를 붙이지 않는다.
const AGE_TIER_EMOJI: Partial<Record<AgeTier, string>> = {
  toddler: '🎒',
  teen: '📘',
  career_30s: '💼',
  veteran_40s: '👓',
  master_50s: '🏆',
}

// PR #52 후속: "배지만 있고 실제로는 안 바뀌는 것 같다"는 피드백을 반영해,
// 방 전체 액자 테두리 색도 연령대에 따라 함께 바뀌도록 했다 — 새 그림
// 에셋 없이도 화면 전체가 지금 몇 살 단계인지 한눈에 느껴지게 하는
// 가장 눈에 띄는 변화다. ageTier가 없으면(지정 안 함) 기존 amber 그대로.
const AGE_TIER_RING_CLASS: Record<AgeTier, string> = {
  toddler: 'ring-pink-300/80',
  teen: 'ring-sky-400/80',
  junior_20s: 'ring-amber-800/80',
  career_30s: 'ring-emerald-600/80',
  veteran_40s: 'ring-indigo-700/80',
  master_50s: 'ring-yellow-400/90',
}

// PR #52 후속: CSS 모드(마켓 배경)에서 캐릭터 자체의 크기를 연령대에 따라
// 실제로 다르게 그려서 "자라는" 느낌을 준다 — 내부 SVG는 전혀 건드리지
// 않고 바깥 래퍼에 CSS scale만 적용하므로(CharacterSprite.tsx 내부 좌표/
// path는 그대로) 기존 포즈·표정 로직이 깨질 위험이 없다.
const AGE_TIER_SCALE: Record<AgeTier, number> = {
  toddler: 0.78,
  teen: 0.88,
  junior_20s: 1,
  career_30s: 1,
  veteran_40s: 1,
  master_50s: 1.08,
}

// PR #46: the "room" the character stands in. 두 가지 렌더링 모드가 있다:
// (1) scene.backgroundImageSrc가 있으면(기본 로비) — 제공받은 실제
//     일러스트를 그대로 배경으로 쓰고, 그 위에 선택 표시·말풍선·기분
//     이모지만 얹는다(그림 속에 누리·두리가 이미 함께 그려져 있어서
//     SVG 캐릭터는 그리지 않는다).
// (2) 그 외(마켓에서 산 사무실/병원 등 전용 아트가 없는 8개 장소) — 기존
//     CSS 그라디언트 레이어 + CharacterSprite SVG로 그대로 그린다.
// 어느 쪽이든 바깥 role="img"/aria-label/data-testid 계약은 동일해서
// (companionType/pose 기반) 기존 e2e의 포즈·소품 검증이 그대로 통한다.
export default function GameStage({
  companionType,
  profession,
  pose,
  bubbleText,
  onTapCharacter,
  onPropClick,
  tier = 'rookie',
  outfitId,
  backgroundOverride,
  ageTier,
  ageNumber,
}: {
  companionType: CompanionType
  profession: ProfessionId | null
  pose: CharacterPose
  bubbleText: string | null
  onTapCharacter?: () => void
  // PR #49: 소품(책상/책 등)도 클릭 가능한 인터랙션으로 — 지정하지
  // 않으면 기존처럼 순수 장식(aria-hidden)으로 남는다.
  onPropClick?: (emoji: string) => void
  tier?: AppearanceTier
  // PR #50: 커스터마이징 룸에서 장착한 옷 — CharacterSprite로 그대로 전달.
  outfitId?: OutfitId
  // PR #50: 마켓에서 구매해 장착한 배경(BACKGROUND_SCENES) — 지정하면
  // 기존 직업 기반 배경(sceneForProfession) 대신 이걸 그린다.
  backgroundOverride?: SceneTheme
  // PR #52: 6단계 연령대 — 지정하지 않으면 배지를 아예 그리지 않는다
  // (기존 화면과 100% 동일).
  ageTier?: AgeTier
  // PR #52 후속 5차 요청 3번: 머리 위에 표시할 구체적인 나이 숫자 —
  // ageTier(6단계)보다 더 촘촘한 표시용 값이다. 지정하지 않으면 뱃지를
  // 그리지 않는다.
  ageNumber?: number
}) {
  const scene = backgroundOverride ?? sceneForProfession(profession)
  const [tapped, setTapped] = useState(false)
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const handleTap = () => {
    onTapCharacter?.()
    if (reduceMotion) return
    setTapped(true)
    window.setTimeout(() => setTapped(false), 320)
  }

  const frameClassName = `relative h-80 w-full overflow-hidden rounded-2xl ring-4 ring-inset sm:h-96 transition-[--tw-ring-color] duration-300 ${ageTier ? AGE_TIER_RING_CLASS[ageTier] : 'ring-amber-800/80'}`

  // PR #52 후속 3차: CSS 모드(마켓 구매 배경 8곳)에서 그동안 손그림 SVG
  // (파란 도형)만 쓰던 캐릭터를, 연령대를 알 때는 실제로 제공받은
  // 초상화로 바꿔 그린다. 단, 한복처럼 그림에 실제로 색이 반영되는
  // 옷(OUTFIT_PALETTE_OVERRIDE에 있는 outfitId)을 장착한 경우에는
  // 커스터마이징이 눈에 안 보이게 되므로 계속 SVG를 쓴다 — 정적
  // 초상화 한 장으로는 옷 갈아입히기를 반영할 수 없기 때문이다.
  const outfitHasVisualOverride = Boolean(outfitId && OUTFIT_PALETTE_OVERRIDE[outfitId])
  const portraitSrc = ageTier && !outfitHasVisualOverride ? AGE_PORTRAIT_SRC[companionType][ageTier] : null
  const name = COMPANION_NAME[companionType]
  const moodIcon = MOOD_ICON[pose]

  if (scene.backgroundImageSrc) {
    const region = ILLUSTRATED_REGION[companionType]

    return (
      <div className={frameClassName}>
        <img
          data-testid="illustrated-scene-background"
          src={scene.backgroundImageSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 z-0 h-full w-full object-cover"
        />
        {/* 아늑한 느낌의 상/하단 비네트 — 실제 일러스트 위에도 자연스럽게 얹힌다 */}
        <div
          aria-hidden
          className="absolute inset-0 z-0"
          style={{ boxShadow: 'inset 0 18px 24px -18px rgba(40, 24, 8, 0.45), inset 0 -10px 16px -10px rgba(40, 24, 8, 0.3)' }}
        />

        {/* 지금 선택된 캐릭터 영역 — role=img/aria-label은 기존 CharacterSprite와
            동일한 포맷이라 포즈 검증 e2e가 그대로 통한다. 금색 테두리로
            "지금 이 캐릭터를 보고 있다"를 표시한다(탭하면 살짝 더 밝아짐).
            PR #52 후속 4차: 그림 속에 원래 그려진 누리·두리는 고정된
            모습이라 연령대가 바뀌어도 그대로다 — 그래서 실제 연령대
            초상화를 이 영역 가운데에 카드 형태로 띄워, 기본 로비
            화면에서도 "지금 몇 살 단계인지"가 실제로 다른 그림으로
            보이게 한다(badge/ring 테두리만으로는 부족하다는 반복된
            피드백에 대한 대응). PR #52 후속 5차: 말풍선/뱃지류를 전부
            이 영역 "뒤"가 아니라 "다음"(z-index 더 높게)에 그려서,
            카드에 가려 안 보이던 겹침 문제를 없앴다 — z-0(배경) <
            z-10(초상화 카드) < z-20(말풍선·뱃지)로 레이어를 명시적으로
            분리했다. */}
        <div
          data-testid="character-tap-target"
          role="img"
          aria-label={`${name} 캐릭터, ${POSE_LABEL[pose]}`}
          onClick={handleTap}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleTap()
            }
          }}
          tabIndex={0}
          className="absolute z-10 cursor-pointer overflow-visible rounded-2xl transition-shadow duration-200"
          style={{
            left: region.left,
            top: region.top,
            width: region.width,
            height: region.height,
            boxShadow: tapped
              ? 'inset 0 0 0 3px rgba(212, 175, 55, 0.9), 0 0 16px 2px rgba(212, 175, 55, 0.5)'
              : 'inset 0 0 0 2px rgba(212, 175, 55, 0.5)',
          }}
        >
          {portraitSrc && (
            <img
              data-testid={`illustrated-age-portrait-${companionType}`}
              src={portraitSrc}
              alt=""
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-2xl object-cover shadow-xl ring-2 ring-amber-100/80 transition-transform duration-300"
            />
          )}
        </div>

        {bubbleText && (
          <div className="absolute top-[4%] z-20 -translate-x-1/2" style={{ left: region.anchorLeft }}>
            <SpeechBubble text={bubbleText} />
          </div>
        )}
        {moodIcon && (
          <span
            aria-hidden
            className="motion-safe:animate-[grow-bubble-pop_0.25s_ease-out] pointer-events-none absolute top-0 z-20 -translate-x-1/2 text-2xl drop-shadow"
            style={{ left: region.anchorLeft }}
          >
            {moodIcon}
          </span>
        )}
        <div
          className="pointer-events-none absolute top-[12%] z-20 flex -translate-x-1/2 items-center gap-1"
          style={{ left: region.anchorLeft }}
        >
          {tier === 'student' && (
            <span data-testid="appearance-accessory-student" aria-hidden className="text-lg drop-shadow">
              🤓
            </span>
          )}
          {tier === 'expert' && (
            <span data-testid="appearance-accessory-expert" aria-hidden className="text-lg drop-shadow">
              🏅
            </span>
          )}
          {ageTier && AGE_TIER_EMOJI[ageTier] && (
            <span
              data-testid={`age-badge-${ageTier.replace(/_/g, '-')}`}
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-amber-200/80 bg-amber-950/70 text-lg shadow-lg"
            >
              {AGE_TIER_EMOJI[ageTier]}
            </span>
          )}
          {ageNumber !== undefined && (
            <span
              data-testid="age-number-badge"
              aria-hidden
              className="rounded-full border-2 border-amber-200/80 bg-amber-950/85 px-2 py-0.5 text-xs font-bold text-amber-50 shadow-lg"
            >
              {ageNumber}세
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={frameClassName}>
      {/* 배경 레이어 (뒤->앞), 아주 약한 패럴랙스 오프셋만 — 스크롤 리스너 없이 CSS만 사용 */}
      {scene.layers.map((layer, i) => (
        <div
          key={i}
          aria-hidden
          className={`absolute inset-0 ${layer.className}`}
          style={{ transform: `translateY(${i * 2}px) scale(${1 + i * 0.015})` }}
        />
      ))}

      {/* PR #49: 목재 액자 느낌의 창문 — 이중 테두리로 프레임감을 준다
          (실제 에셋 전까지의 임시 표현, 구조는 PR #46과 동일). */}
      <div aria-hidden className="absolute right-4 top-3 h-12 w-16 rounded-lg border-2 border-amber-700/70 bg-sky-100/60 ring-2 ring-amber-900/40 ring-offset-1 ring-offset-amber-50/60 sm:h-14 sm:w-20" />
      {/* PR #49: 상단 비네트 — 방 안쪽으로 시선이 모이는 아늑한 느낌 */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ boxShadow: 'inset 0 18px 24px -18px rgba(120, 72, 24, 0.35), inset 0 -10px 16px -10px rgba(120, 72, 24, 0.25)' }}
      />
      {scene.props.map((emoji, i) =>
        onPropClick ? (
          <button
            key={emoji + i}
            type="button"
            aria-label={`소품 ${emoji} 살펴보기`}
            onClick={() => onPropClick(emoji)}
            className="absolute select-none text-xl opacity-80 transition-transform hover:scale-110 active:scale-95 sm:text-2xl"
            style={{
              left: `${12 + i * 28}%`,
              top: `${18 + (i % 2) * 10}%`,
              animation: reduceMotion ? undefined : `grow-prop-sway ${3.4 + i * 0.6}s ease-in-out infinite`,
            }}
          >
            {emoji}
          </button>
        ) : (
          <span
            key={emoji + i}
            aria-hidden
            className="absolute select-none text-xl opacity-80 sm:text-2xl"
            style={{
              left: `${12 + i * 28}%`,
              top: `${18 + (i % 2) * 10}%`,
              animation: reduceMotion ? undefined : `grow-prop-sway ${3.4 + i * 0.6}s ease-in-out infinite`,
            }}
          >
            {emoji}
          </span>
        ),
      )}

      {/* 바닥 + PR #49: 목재 마루 느낌의 가로 결(반복 그라디언트) 오버레이 —
          색은 scene.floorClassName(Tailwind 그라디언트)이 그대로 맡고,
          결 무늬는 별도 레이어로 얹어 인라인 style과 충돌하지 않게 했다. */}
      <div aria-hidden className={`absolute inset-x-0 bottom-0 h-16 ${scene.floorClassName}`} />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-16"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(120, 72, 24, 0.12) 0px, rgba(120, 72, 24, 0.12) 2px, transparent 2px, transparent 16px)',
        }}
      />

      {/* 캐릭터 + 그림자 + 말풍선 */}
      <div className="absolute inset-x-0 bottom-2 flex flex-col items-center">
        <div className="relative">
          {bubbleText && <SpeechBubble text={bubbleText} />}
          {/* 일부러 role="button"을 주지 않는다 — button/role="button" 같은
              인터랙티브 요소는 ARIA 규칙상 자손을 접근성 트리에서
              "presentational"로 눌러버려, CharacterSprite 내부의
              <svg role="img" aria-label="..."> 가 사라진다(기존 테스트의
              포즈 검증이 의존하는 바로 그 role). 평범한 div로 클릭/터치
              반응만 유지하고 캐릭터 고유의 img 역할은 그대로 보존한다.
              (쓰다듬기는 부가 연출이라 키보드 접근성을 완전히 희생하지
              않는 선에서 tabIndex만 남겨둔다.) 실제 초상화 모드에서는
              역할/이름을 이 바깥 div가 직접 들고(일러스트 모드와 동일한
              계약), 안쪽 <img>는 장식용(aria-hidden)으로 둔다. */}
          <div
            data-testid="character-tap-target"
            role={portraitSrc ? 'img' : undefined}
            aria-label={portraitSrc ? `${name} 캐릭터, ${POSE_LABEL[pose]}` : undefined}
            onClick={handleTap}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleTap()
              }
            }}
            tabIndex={0}
            className={`relative z-10 cursor-pointer rounded-full transition-transform duration-200 ${tapped ? 'scale-110' : 'scale-100'} active:scale-95`}
          >
            {portraitSrc ? (
              <span
                data-testid="age-scale-wrapper"
                className="mx-auto block w-[150px] origin-bottom overflow-hidden rounded-2xl shadow-lg ring-2 ring-amber-900/30 transition-transform duration-300 sm:w-[180px]"
                style={{ transform: `scale(${ageTier ? AGE_TIER_SCALE[ageTier] : 1})` }}
              >
                <img src={portraitSrc} alt="" aria-hidden className="h-auto w-full object-cover" />
              </span>
            ) : (
              <span
                data-testid="age-scale-wrapper"
                className="mx-auto block w-[150px] origin-bottom transition-transform duration-300 [&>svg]:h-auto [&>svg]:w-full sm:w-[180px]"
                style={{ transform: `scale(${ageTier ? AGE_TIER_SCALE[ageTier] : 1})` }}
              >
                <CharacterSprite companionType={companionType} pose={pose} size={220} tier={tier} outfitId={outfitId} ageTier={ageTier} />
              </span>
            )}
            {/* PR #52 후속 5차: 뱃지들이 카드 모서리에 딱 걸쳐 반쯤 잘려
                보이던 겹침 문제 — 한 줄로 묶어 카드 "위"(z-20, 음수
                top)로 확실히 띄우고, 기분 이모지는 그보다 더 위에
                둬서 서로도 겹치지 않게 했다. */}
            {portraitSrc && moodIcon && (
              <span
                aria-hidden
                className="motion-safe:animate-[grow-bubble-pop_0.25s_ease-out] pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 text-2xl drop-shadow"
              >
                {moodIcon}
              </span>
            )}
            {portraitSrc && (
              <div className="pointer-events-none absolute -top-3 inset-x-0 z-20 flex items-center justify-center gap-1">
                {tier === 'student' && (
                  <span data-testid="appearance-accessory-student" aria-hidden className="text-lg drop-shadow">
                    🤓
                  </span>
                )}
                {tier === 'expert' && (
                  <span data-testid="appearance-accessory-expert" aria-hidden className="text-lg drop-shadow">
                    🏅
                  </span>
                )}
                {ageTier && AGE_TIER_EMOJI[ageTier] && (
                  <span
                    data-testid={`age-badge-${ageTier.replace(/_/g, '-')}`}
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-200/80 bg-amber-950/70 text-base shadow-lg"
                  >
                    {AGE_TIER_EMOJI[ageTier]}
                  </span>
                )}
                {ageNumber !== undefined && (
                  <span
                    data-testid="age-number-badge"
                    aria-hidden
                    className="rounded-full border-2 border-amber-200/80 bg-amber-950/85 px-2 py-0.5 text-xs font-bold text-amber-50 shadow-lg"
                  >
                    {ageNumber}세
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div aria-hidden className="-mt-1 h-3 w-24 rounded-[50%] bg-slate-900/15 blur-[2px] sm:w-28" />
      </div>
    </div>
  )
}
