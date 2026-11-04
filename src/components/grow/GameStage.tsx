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

// PR #54 요청 2번: PR #50~53까지는 "누리·두리가 함께 그려진 고정 배경
// 일러스트" 위에 지금 선택된 쪽의 연령대 초상화 카드를 겹쳐 올리고, 안
// 보고 있는 쪽 절반만 어둡게 가리는 방식이었다 — 그런데 이게 바로
// "상단 캐릭터 영역에 여러 일러스트가 중복으로 겹쳐 보인다"는 버그의
// 원인이었다: 같은 캐릭터가 (1) 배경 그림 속에 고정으로 한 번,
// (2) 그 위의 초상화 카드로 또 한 번, 총 두 장 겹쳐 보였고, 안 보고
// 있는 쪽도 어둡게만 가려질 뿐 '두리 화면' 자체는 여전히 그대로 떠
// 있었다. 이제는 배경 그림 전체(양쪽 다)를 똑같이 어둡게 가라앉혀
// 순수 분위기(ambient)용으로만 쓰고, 지금 선택된 캐릭터의 초상화
// 카드 하나만 프레임 정중앙에 크게 띄운다 — 화면에 "분명하게 보이는
// 캐릭터 그림"은 항상 딱 하나뿐이다.
const ILLUSTRATED_PORTRAIT_ANCHOR = '50%'

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

  // PR #54 요청 1·2번: 기존엔 h-80/sm:h-96(320/384px) 고정 높이라, PC에서
  // 화면 가로폭이 넓어질수록(요청 1의 풀스크린 확장과 맞물려) 세로는
  // 그대로인데 가로만 늘어나 배경 그림이 object-cover로 과도하게
  // 눌려 잘리는 문제가 있었다(캐릭터 하반신이 통째로 잘려나가 거의
  // 얼굴만 남는 클로즈업처럼 보임 — 요청 2번 "얼굴만 나오는 클로즈업"
  // 피드백의 실제 원인). 가로폭과 무관하게 세로를 지금보다 눈에 띄게
  // 키워서(모바일도 더 커짐) 초상화가 훨씬 크고 길게 보이도록 했다 —
  // 실제 전신 에셋은 없지만(220x220 정사각 흉상 컷뿐, PR #52 5차에서
  // 확인), 카드 자체를 세로로 더 크게 보여줘서 "전신처럼 꽉 찬" 느낌에
  // 최대한 가깝게 만든다.
  // PR #55 긴급 패치: GrowPage의 풀스크린 캡을 완전히 제거(lg:max-w-none)
  // 했더니 스테이지 가로폭이 훨씬 넓어졌다 — 세로도 한 번 더 키워서
  // (32rem→42rem) 넓어진 가로폭에 맞는 비율을 유지하고, 캐릭터 영역이
  // 화면에서 실제로 더 크고 길게 느껴지도록 했다.
  const frameClassName = `relative h-96 w-full overflow-hidden rounded-2xl ring-4 ring-inset sm:h-[28rem] lg:h-[42rem] transition-[--tw-ring-color] duration-300 ${ageTier ? AGE_TIER_RING_CLASS[ageTier] : 'ring-amber-800/80'}`

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
        {/* PR #54 요청 2번: 배경 그림 전체(누리·두리 양쪽 다)를 똑같이
            가라앉혀 순수 분위기(ambient)로만 쓴다 — "지금 안 보고 있는
            쪽만 가린다"던 PR #53 방식은 그 쪽 화면이 여전히 선명하게
            남아있어 '두리 화면이 중복으로 떠 있다'는 버그로 보였다.
            이제는 어느 쪽을 보고 있어도 배경 속 두 사람 모두 똑같이
            어두워지고, 화면에서 분명하게 보이는 캐릭터 그림은 아래의
            중앙 초상화 카드 하나뿐이다. Tailwind의 bg-slate-950/55
            (oklab 기반 색)가 이 환경에서 거의 안 보일 정도로 흐리게
            렌더링되는 문제가 있어(스크린샷으로 직접 확인), 일반 sRGB
            rgba()를 인라인으로 직접 써서 피했다(PR #53에서 확인된 환경
            버그, 그대로 유지). */}
        <div
          data-testid="illustrated-ambient-dim"
          aria-hidden
          className="absolute inset-0 z-[5] transition-opacity duration-300"
          style={{ backgroundColor: 'rgba(2, 6, 23, 0.58)' }}
        />

        {/* 지금 선택된 캐릭터의 연령대 초상화 카드 — 프레임 정중앙에 하나만
            크게 띄운다. role=img/aria-label은 기존 CharacterSprite와 동일한
            포맷이라 포즈 검증 e2e가 그대로 통한다. 금색 테두리로 "지금 이
            캐릭터를 보고 있다"를 표시한다(탭하면 살짝 더 밝아짐).
            z-0(배경+ambient dim) < z-10(초상화 카드) < z-20(말풍선·뱃지)로
            레이어를 명시적으로 분리해 서로 가리는 일이 없게 했다. */}
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
          className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center overflow-visible"
        >
          {portraitSrc && (
            <img
              data-testid={`illustrated-age-portrait-${companionType}`}
              src={portraitSrc}
              alt=""
              aria-hidden
              className="pointer-events-none h-[88%] w-auto rounded-2xl object-cover transition-shadow duration-200"
              style={{
                boxShadow: tapped
                  ? 'inset 0 0 0 3px rgba(212, 175, 55, 0.9), 0 0 16px 2px rgba(212, 175, 55, 0.5)'
                  : 'inset 0 0 0 2px rgba(212, 175, 55, 0.5)',
              }}
            />
          )}
        </div>

        {bubbleText && (
          <div className="absolute top-[4%] z-20 -translate-x-1/2" style={{ left: ILLUSTRATED_PORTRAIT_ANCHOR }}>
            <SpeechBubble text={bubbleText} />
          </div>
        )}
        {moodIcon && (
          <span
            aria-hidden
            className="motion-safe:animate-[grow-bubble-pop_0.25s_ease-out] pointer-events-none absolute top-0 z-20 -translate-x-1/2 text-2xl drop-shadow"
            style={{ left: ILLUSTRATED_PORTRAIT_ANCHOR }}
          >
            {moodIcon}
          </span>
        )}
        <div
          className="pointer-events-none absolute top-[6%] z-20 flex -translate-x-1/2 items-center gap-1"
          style={{ left: ILLUSTRATED_PORTRAIT_ANCHOR }}
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
              // PR #54 요청 2번: 프레임 자체가 더 커졌으니(위 frameClassName
              // 참고) 카드도 같이 키워서 "더 꽉 차고 눈에 잘 들어오는" 느낌을
              // 살렸다 — 비율/스케일 로직은 그대로.
              <span
                data-testid="age-scale-wrapper"
                className="mx-auto block w-[190px] origin-bottom overflow-hidden rounded-2xl shadow-lg ring-2 ring-amber-900/30 transition-transform duration-300 sm:w-[230px] lg:w-[320px]"
                style={{ transform: `scale(${ageTier ? AGE_TIER_SCALE[ageTier] : 1})` }}
              >
                <img src={portraitSrc} alt="" aria-hidden className="h-auto w-full object-cover" />
              </span>
            ) : (
              <span
                data-testid="age-scale-wrapper"
                className="mx-auto block w-[190px] origin-bottom transition-transform duration-300 [&>svg]:h-auto [&>svg]:w-full sm:w-[230px] lg:w-[320px]"
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
