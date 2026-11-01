import { useState } from 'react'
import CharacterSprite, { type CharacterPose } from './CharacterSprite'
import SpeechBubble from './SpeechBubble'
import { sceneForProfession } from '../../data/growthScenes'
import type { CompanionType } from '../../context/GrowthContext'
import type { ProfessionId } from '../../data/characterProfessions'
import type { AppearanceTier } from '../../data/characterAppearance'

// PR #46: the "room" the character stands in. Pure CSS layering (no
// Three.js/WebGL) — a few absolutely-positioned gradient layers + emoji
// props give a sense of depth, and the character itself is rendered via
// the existing CharacterSprite (same pose prop contract as before, so
// InteractionPanel/ExamPanel's onPoseChange callers don't need to change
// at all). Swapping any of this for real art/3D later only touches this
// file and growthScenes.ts, never the business-logic components.
export default function GameStage({
  companionType,
  profession,
  pose,
  bubbleText,
  onTapCharacter,
  tier = 'rookie',
}: {
  companionType: CompanionType
  profession: ProfessionId | null
  pose: CharacterPose
  bubbleText: string | null
  onTapCharacter?: () => void
  tier?: AppearanceTier
}) {
  const scene = sceneForProfession(profession)
  const [tapped, setTapped] = useState(false)
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const handleTap = () => {
    onTapCharacter?.()
    if (reduceMotion) return
    setTapped(true)
    window.setTimeout(() => setTapped(false), 320)
  }

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-2xl ring-4 ring-amber-800/80 ring-inset sm:h-64">
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
      {scene.props.map((emoji, i) => (
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
      ))}

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
              않는 선에서 tabIndex만 남겨둔다.) */}
          <div
            data-testid="character-tap-target"
            onClick={handleTap}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleTap()
              }
            }}
            tabIndex={0}
            className={`cursor-pointer rounded-full transition-transform duration-200 ${tapped ? 'scale-110' : 'scale-100'} active:scale-95`}
          >
            <span className="mx-auto block w-[150px] [&>svg]:h-auto [&>svg]:w-full sm:w-[180px]">
              <CharacterSprite companionType={companionType} pose={pose} size={220} tier={tier} />
            </span>
          </div>
        </div>
        <div aria-hidden className="-mt-1 h-3 w-24 rounded-[50%] bg-slate-900/15 blur-[2px] sm:w-28" />
      </div>
    </div>
  )
}
