import type { ProfessionId } from './characterProfessions'
import fantasyLibraryBgImg from '../assets/grow/fantasy-library-bg.webp'

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
  // Small emoji "props" scattered in the mid-layer to suggest depth —
  // only used when backgroundImageSrc is unset (the illustrated scene
  // already has its own detailed objects drawn in, so props/floor are
  // skipped for it in GameStage).
  props: string[]
  floorClassName: string
  // PR #50 후속: 실제 제공받은 일러스트 에셋. 설정돼 있으면 GameStage가
  // CSS 그라디언트 레이어 대신 이 이미지를 그대로 배경으로 쓴다 — 누리·
  // 두리가 이미 한 장에 같이 그려진 완성본이라, 캐릭터 SVG는 이 모드에서
  // 렌더링하지 않고 그림 위에 선택 표시·말풍선·기분 이모지만 얹는다.
  backgroundImageSrc?: string
}

// PR #50 긴급 재작업: 사용자가 제공한 실제 고품질 일러스트를 기본(로비)
// 장면으로 쓴다 — 직업별로 다른 CSS 그라디언트 방을 쓰던 기존 방식
// (PR #46~#49)보다 압도적으로 품질이 높아서, 직업과 무관하게 "기본
// 방"의 대표 모습으로 승격했다. 다른 직업 전용 아트가 생기기 전까지는
// 모든 직업이 이 공통 일러스트를 공유한다.
// PR #57~60: 사용자가 처음 제공한 '누리AI 키우리 성장 판타지 랩'
// 이미지는 자체 타이틀/가짜 메뉴 버튼/나이대 선택 UI가 캐릭터와 한
// 장에 합성된 포스터라, 그대로 쓰면 실제 화면의 타이틀·메뉴와
// 중복·충돌해서 블러+마스크 처리가 필요했다(PR #60).
// PR #61: 사용자가 캐릭터·UI 없이 순수 배경(마법진 도서관)만 있는
// 새 이미지를 제공해, 그 블러/마스크 처리가 더 이상 필요 없어졌다 —
// 가릴 가짜 UI 자체가 없으므로 원본 그대로 선명하게 쓴다(GameStage
// 참고).
export const DEFAULT_SCENE: SceneTheme = {
  label: '마법진 도서관',
  layers: [],
  props: [],
  floorClassName: '',
  backgroundImageSrc: fantasyLibraryBgImg,
}

// PR #50: 마켓에서 구매하는 9개 장소 중 "로비"도 이 일러스트를 그대로
// 쓴다(backgroundCatalog.ts). 사무실/병원 등 나머지 8곳은 아직 전용
// 아트가 없어 기존 CSS 그라디언트 방식을 유지한다 — SCENE_BY_PROFESSION
// 은 더 이상 쓰지 않지만(모든 직업이 DEFAULT_SCENE을 공유), 전용 아트가
// 생기면 다시 여기에 직업별로 채워 넣을 수 있도록 타입은 남겨둔다.
export const SCENE_BY_PROFESSION: Partial<Record<ProfessionId, SceneTheme>> = {}

export function sceneForProfession(_profession: ProfessionId | null): SceneTheme {
  return DEFAULT_SCENE
}
