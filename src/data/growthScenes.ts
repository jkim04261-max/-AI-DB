import type { ProfessionId } from './characterProfessions'

// PR #46: purely a visual theme lookup (profession -> room dressing). No
// DB/API involved — this never decides what profession a character has,
// it only decides how to *paint* whatever profession is already stored
// (profession itself stays fully user-selectable, see characterProfessions.ts
// and api/character.ts's existing setProfession flow — this file must never
// hardcode a companion-to-profession lock). Kept as plain data so a future
// 2.5D/3D reskin only has to edit this file, never the components that
// read it.
//
// PR #49: 전면 톤 리뉴얼 — 차갑던 인디고/블루 계열 배경을 따뜻한 목재·
// 크림 톤으로 바꿨다(레퍼런스: 클래식 육성 게임 특유의 아늑한 방 느낌).
// 구조(레이어 수/프롭/바닥)는 그대로, 색만 전면 교체했다.
export interface SceneLayer {
  // Tailwind gradient classes, back-to-front — rendered as stacked
  // absolutely-positioned divs inside GameStage with a slight parallax
  // offset per layer (pure CSS transform, no JS scroll listener).
  className: string
}

export interface SceneTheme {
  label: string
  layers: SceneLayer[]
  // Small emoji "props" scattered in the mid-layer to suggest depth
  // (desk/books for accountant, mic/notes for singer) without needing
  // real art assets yet — swappable 1:1 for sprites later.
  props: string[]
  floorClassName: string
}

export const DEFAULT_SCENE: SceneTheme = {
  label: '아늑한 방',
  layers: [
    { className: 'bg-gradient-to-b from-amber-100 via-orange-50 to-amber-50' },
    { className: 'bg-gradient-to-t from-amber-900/0 via-amber-900/0 to-amber-900/10' },
  ],
  props: ['🪴', '📚'],
  floorClassName: 'bg-gradient-to-t from-amber-300/70 to-amber-100/40',
}

// PR #49: 직업이 50종으로 늘어나면서 모든 직업에 전용 방 꾸밈을 바로
// 만들 수는 없다 — 전용 테마가 없는 직업은 sceneForProfession이
// DEFAULT_SCENE으로 자연스럽게 떨어진다(Partial이라 모든 키를 채울
// 필요가 없음).
export const SCENE_BY_PROFESSION: Partial<Record<ProfessionId, SceneTheme>> = {
  accountant: {
    label: '회계사의 공부방',
    layers: [
      { className: 'bg-gradient-to-b from-orange-100 via-amber-50 to-amber-50' },
      { className: 'bg-gradient-to-t from-amber-900/0 via-amber-900/0 to-amber-900/10' },
    ],
    props: ['📖', '🖊️', '🪴'],
    floorClassName: 'bg-gradient-to-t from-amber-400/60 to-amber-100/30',
  },
  singer: {
    label: '가수의 연습실',
    layers: [
      { className: 'bg-gradient-to-b from-rose-100 via-amber-50 to-amber-50' },
      { className: 'bg-gradient-to-t from-amber-900/0 via-amber-900/0 to-amber-900/10' },
    ],
    props: ['🎤', '🎵', '✨'],
    floorClassName: 'bg-gradient-to-t from-rose-300/50 to-amber-100/30',
  },
}

export function sceneForProfession(profession: ProfessionId | null): SceneTheme {
  if (!profession) return DEFAULT_SCENE
  return SCENE_BY_PROFESSION[profession] ?? DEFAULT_SCENE
}
