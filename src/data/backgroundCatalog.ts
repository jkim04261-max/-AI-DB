import { DEFAULT_SCENE, type SceneTheme } from './growthScenes'

// PR #50: 배경(장소) 카탈로그 — 요청하신 9개 장소. 로비(기본)만 무료
// 배포, 나머지는 마켓에서 골드로 구매해 잠금 해제한다. 실제 DB에는
// 저장되지 않고 useMockInventory 훅의 React state로만 보유 여부를
// 관리한다(PR #49 ResourceBar의 "포인트"와는 별개의, 이 프로토타입
// 전용 모의 재화 — 자세한 이유는 useMockInventory.ts 주석 참고).
export type BackgroundId = 'lobby' | 'office' | 'kitchen' | 'aesthetic' | 'factory' | 'classroom' | 'museum' | 'hospital' | 'bank'

export interface BackgroundItem {
  id: BackgroundId
  label: string
  priceGold: number
  icon: string
}

export const BACKGROUND_CATALOG: BackgroundItem[] = [
  // PR #57: growthScenes.ts의 DEFAULT_SCENE 라벨 변경과 맞춰 이름도
  // "성장 판타지 랩"으로 통일했다 — 같은 장소를 마켓 목록과 실제
  // 화면에서 다르게 부르면 혼란스럽다.
  { id: 'lobby', label: '성장 판타지 랩(기본)', priceGold: 0, icon: '🏠' },
  { id: 'office', label: '사무실', priceGold: 150, icon: '🏢' },
  { id: 'kitchen', label: '주방', priceGold: 150, icon: '🍳' },
  { id: 'aesthetic', label: '피부샵', priceGold: 150, icon: '💆' },
  { id: 'factory', label: '공장', priceGold: 180, icon: '🏭' },
  { id: 'classroom', label: '강의실', priceGold: 150, icon: '🏫' },
  { id: 'museum', label: '박물관', priceGold: 220, icon: '🏛️' },
  { id: 'hospital', label: '병원', priceGold: 200, icon: '🏥' },
  { id: 'bank', label: '은행', priceGold: 220, icon: '🏦' },
]

// 각 장소마다 실제로 다른 CSS 색/소품으로 보이도록 구성 — growthScenes.ts
// 의 SceneTheme과 같은 구조를 재사용한다(GameStage는 둘 중 하나를
// 받아 그대로 렌더링).
export const BACKGROUND_SCENES: Record<BackgroundId, SceneTheme> = {
  // PR #50 긴급 재작업: 로비는 growthScenes.ts의 실제 일러스트 장면을
  // 그대로 가리킨다 — CSS 그라디언트 방이 아니다.
  lobby: DEFAULT_SCENE,
  office: {
    label: '사무실',
    layers: [
      { className: 'bg-gradient-to-b from-slate-200 via-blue-50 to-slate-50' },
      { className: 'bg-gradient-to-t from-slate-900/0 via-slate-900/0 to-slate-900/10' },
    ],
    props: ['💻', '📊', '🖊️'],
    floorClassName: 'bg-gradient-to-t from-slate-400/50 to-slate-100/30',
  },
  kitchen: {
    label: '주방',
    layers: [
      { className: 'bg-gradient-to-b from-orange-100 via-red-50 to-amber-50' },
      { className: 'bg-gradient-to-t from-red-900/0 via-red-900/0 to-red-900/10' },
    ],
    props: ['🍳', '🥄', '🍅'],
    floorClassName: 'bg-gradient-to-t from-orange-300/60 to-amber-100/30',
  },
  aesthetic: {
    label: '피부샵',
    layers: [
      { className: 'bg-gradient-to-b from-pink-100 via-rose-50 to-pink-50' },
      { className: 'bg-gradient-to-t from-pink-900/0 via-pink-900/0 to-pink-900/10' },
    ],
    props: ['💆', '🧴', '🌸'],
    floorClassName: 'bg-gradient-to-t from-pink-300/50 to-pink-50/30',
  },
  factory: {
    label: '공장',
    layers: [
      { className: 'bg-gradient-to-b from-zinc-300 via-yellow-50 to-zinc-100' },
      { className: 'bg-gradient-to-t from-zinc-900/0 via-zinc-900/0 to-zinc-900/15' },
    ],
    props: ['⚙️', '🏭', '📦'],
    floorClassName: 'bg-gradient-to-t from-zinc-400/60 to-zinc-100/30',
  },
  classroom: {
    label: '강의실',
    layers: [
      { className: 'bg-gradient-to-b from-emerald-100 via-green-50 to-emerald-50' },
      { className: 'bg-gradient-to-t from-emerald-900/0 via-emerald-900/0 to-emerald-900/10' },
    ],
    props: ['📖', '✏️', '🍎'],
    floorClassName: 'bg-gradient-to-t from-emerald-300/50 to-emerald-50/30',
  },
  museum: {
    label: '박물관',
    layers: [
      { className: 'bg-gradient-to-b from-rose-200 via-amber-50 to-rose-50' },
      { className: 'bg-gradient-to-t from-rose-950/0 via-rose-950/0 to-rose-950/15' },
    ],
    props: ['🏺', '🖼️', '✨'],
    floorClassName: 'bg-gradient-to-t from-rose-400/50 to-amber-100/30',
  },
  hospital: {
    label: '병원',
    layers: [
      { className: 'bg-gradient-to-b from-sky-100 via-cyan-50 to-white' },
      { className: 'bg-gradient-to-t from-sky-900/0 via-sky-900/0 to-sky-900/10' },
    ],
    props: ['💉', '🩺', '➕'],
    floorClassName: 'bg-gradient-to-t from-sky-300/50 to-white/40',
  },
  bank: {
    label: '은행',
    layers: [
      { className: 'bg-gradient-to-b from-indigo-200 via-blue-50 to-indigo-50' },
      { className: 'bg-gradient-to-t from-indigo-950/0 via-indigo-950/0 to-indigo-950/15' },
    ],
    props: ['🏦', '💰', '📈'],
    floorClassName: 'bg-gradient-to-t from-indigo-400/50 to-indigo-100/30',
  },
}
