import type { ProfessionId } from './characterProfessions'

// PR #46: purely a visual theme lookup (profession -> room dressing). No
// DB/API involved — this never decides what profession a character has,
// it only decides how to *paint* whatever profession is already stored
// (profession itself stays fully user-selectable, see characterProfessions.ts
// and api/character.ts's existing setProfession flow — this file must never
// hardcode a companion-to-profession lock). Kept as plain data so a future
// 2.5D/3D reskin only has to edit this file, never the components that
// read it.
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
    { className: 'bg-gradient-to-b from-indigo-100 via-blue-50 to-amber-50' },
    { className: 'bg-gradient-to-t from-white/0 via-white/0 to-white/40' },
  ],
  props: ['🪴', '📚'],
  floorClassName: 'bg-gradient-to-t from-amber-100 to-amber-50/40',
}

export const SCENE_BY_PROFESSION: Record<ProfessionId, SceneTheme> = {
  accountant: {
    label: '회계사의 공부방',
    layers: [
      { className: 'bg-gradient-to-b from-sky-100 via-blue-50 to-amber-50' },
      { className: 'bg-gradient-to-t from-white/0 via-white/0 to-white/40' },
    ],
    props: ['📖', '🖊️', '🪴'],
    floorClassName: 'bg-gradient-to-t from-amber-200/70 to-amber-50/30',
  },
  singer: {
    label: '가수의 연습실',
    layers: [
      { className: 'bg-gradient-to-b from-rose-100 via-fuchsia-50 to-amber-50' },
      { className: 'bg-gradient-to-t from-white/0 via-white/0 to-white/40' },
    ],
    props: ['🎤', '🎵', '✨'],
    floorClassName: 'bg-gradient-to-t from-rose-200/60 to-amber-50/30',
  },
}

export function sceneForProfession(profession: ProfessionId | null): SceneTheme {
  if (!profession) return DEFAULT_SCENE
  return SCENE_BY_PROFESSION[profession]
}
