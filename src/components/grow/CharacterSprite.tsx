import type { CompanionType } from '../../context/GrowthContext'

// Independent from GrowthContext's CharacterPose-less status types — this
// is purely a *visual* state, driven today only by the existing
// verify-knowledge flow (handleVerify/result in GrowPage.tsx). No DB/API
// field backs this; it never needs to (PR #45 checkpoint 2 is frontend-only).
export type CharacterPose = 'idle' | 'studying' | 'happy' | 'sad'

export const POSE_LABEL: Record<CharacterPose, string> = {
  idle: '대기 중',
  studying: '공부하는 중',
  happy: '기뻐하는 중',
  sad: '아쉬워하는 중',
}

interface Palette {
  skin: string
  hair: string
  hairDark: string
  outfit: string
  outfitDark: string
  accent: string
}

// 누리(남)는 인디고/블루 톤, 두리(여)는 로즈/핑크 톤 — 기존 서비스가
// 이미 쓰는 인디고-블루 그라디언트(예: 캐릭터 카드 아바타, 버튼) 및
// 그와 대비되는 톤으로 맞춰 사이드바·전체 디자인과 어울리게 했다. 두
// 캐릭터 모두 원작(프린세스 메이커 등) 디자인을 참고하지 않은 자체
// 제작 단순 도형(원/둥근 사각형/path) 조합이다.
const PALETTE: Record<CompanionType, Palette> = {
  nuri: {
    skin: '#ffe0bd',
    hair: '#4453d8',
    hairDark: '#2f3bb0',
    outfit: '#5b6bf0',
    outfitDark: '#3c46b0',
    accent: '#283593',
  },
  duri: {
    skin: '#ffe0bd',
    hair: '#e0579e',
    hairDark: '#b8407c',
    outfit: '#ef6ea8',
    outfitDark: '#c23f82',
    accent: '#8e2a5e',
  },
}

// 포즈별 입 모양(path) — 표정 변화의 핵심. 좌표는 160x220 viewBox 기준.
const MOUTH_PATH: Record<CharacterPose, string> = {
  idle: 'M 64 96 Q 80 104 96 96',
  studying: 'M 70 98 Q 80 94 90 98',
  happy: 'M 58 92 Q 80 118 102 92',
  sad: 'M 66 102 Q 80 92 94 102',
}

// 포즈별 눈썹 변형(두 눈 각각 rotate/translate) — 표정 변화 보조.
const EYEBROW_TRANSFORM: Record<CharacterPose, { left: string; right: string }> = {
  idle: { left: 'rotate(-4deg)', right: 'rotate(4deg)' },
  studying: { left: 'translate(1px, 2px) rotate(6deg)', right: 'translate(-1px, 2px) rotate(-6deg)' },
  happy: { left: 'translate(0, -3px) rotate(-10deg)', right: 'translate(0, -3px) rotate(10deg)' },
  sad: { left: 'translate(1px, 1px) rotate(14deg)', right: 'translate(-1px, 1px) rotate(-14deg)' },
}

// 포즈별 팔 자세(어깨 기준 회전) — studying은 왼팔이 노트 쪽으로,
// happy는 양팔을 위로 들어 환호, sad는 양팔이 아래로 처짐.
const ARM_TRANSFORM: Record<CharacterPose, { left: string; right: string }> = {
  idle: { left: 'rotate(12deg)', right: 'rotate(-12deg)' },
  studying: { left: 'rotate(55deg)', right: 'rotate(-6deg)' },
  happy: { left: 'rotate(150deg)', right: 'rotate(-150deg)' },
  sad: { left: 'rotate(-8deg) translate(2px, 4px)', right: 'rotate(8deg) translate(-2px, 4px)' },
}

export default function CharacterSprite({
  companionType,
  pose = 'idle',
  size = 96,
}: {
  companionType: CompanionType
  pose?: CharacterPose
  size?: number
}) {
  const palette = PALETTE[companionType]
  const isNuri = companionType === 'nuri'
  const name = isNuri ? '누리' : '두리'
  const eyebrow = EYEBROW_TRANSFORM[pose]
  const arm = ARM_TRANSFORM[pose]
  // sad 포즈에서는 눈이 정적으로 살짝 처진 느낌을 주기 위해 눈 위쪽을
  // 피부색 사각형으로 조금 더 가린다(애니메이션인 깜빡임과는 별개).
  const staticLidHeight = pose === 'sad' ? 5 : 0

  return (
    <svg
      viewBox="0 0 160 220"
      width={size}
      height={(size * 220) / 160}
      role="img"
      aria-label={`${name} 캐릭터, ${POSE_LABEL[pose]}`}
      className={`grow-sprite-pose-${pose}`}
    >
      <g className="grow-sprite-body">
        {/* 뒤쪽 팔 (studying 시 노트를 받치는 왼팔, 몸보다 먼저 그려 뒤에 깔림) */}
        <rect
          x={-8}
          y={0}
          width={16}
          height={46}
          rx={8}
          fill={palette.skin}
          transform={`translate(40 128) ${arm.left}`}
        />

        {/* 다리/신발 */}
        <rect x={50} y={184} width={20} height={14} rx={6} fill="#ffffff" />
        <rect x={90} y={184} width={20} height={14} rx={6} fill="#ffffff" />
        <rect x={48} y={194} width={24} height={10} rx={5} fill={palette.outfitDark} />
        <rect x={88} y={194} width={24} height={10} rx={5} fill={palette.outfitDark} />

        {/* 몸(옷) */}
        <rect x={34} y={120} width={92} height={72} rx={26} fill={palette.outfit} />
        {/* 목깃 */}
        <path d="M 66 120 L 80 136 L 94 120 Z" fill={palette.outfitDark} />
        {isNuri ? (
          // 누리: 작은 넥타이
          <path d="M 78 128 L 82 128 L 85 150 L 80 158 L 75 150 Z" fill={palette.accent} />
        ) : (
          // 두리: 작은 리본
          <>
            <path d="M 80 130 L 68 122 L 70 136 Z" fill={palette.accent} />
            <path d="M 80 130 L 92 122 L 90 136 Z" fill={palette.accent} />
            <circle cx={80} cy={130} r={4} fill={palette.accent} />
          </>
        )}

        {/* 앞쪽 팔 (오른팔) */}
        <rect
          x={-8}
          y={0}
          width={16}
          height={46}
          rx={8}
          fill={palette.skin}
          transform={`translate(120 128) ${arm.right}`}
        />

        {/* studying 전용: 작은 공책 */}
        {pose === 'studying' && (
          <g transform="translate(60 150) rotate(-8)">
            <rect x={0} y={0} width={34} height={24} rx={3} fill="#ffffff" stroke="#d8dbe6" strokeWidth={1.5} />
            <line x1={6} y1={8} x2={28} y2={8} stroke="#c7cbe0" strokeWidth={1.5} />
            <line x1={6} y1={14} x2={28} y2={14} stroke="#c7cbe0" strokeWidth={1.5} />
            <line x1={6} y1={20} x2={22} y2={20} stroke="#c7cbe0" strokeWidth={1.5} />
          </g>
        )}

        {/* happy 전용: 반짝이는 별 */}
        {pose === 'happy' && (
          <>
            <path
              className="grow-sprite-star"
              d="M 24 60 l 4 9 l 9 1 l -7 6 l 2 9 l -8 -5 l -8 5 l 2 -9 l -7 -6 l 9 -1 Z"
              fill="#ffd54a"
            />
            <path
              className="grow-sprite-star"
              d="M 136 50 l 3 7 l 7 1 l -5 5 l 1 7 l -6 -4 l -6 4 l 1 -7 l -5 -5 l 7 -1 Z"
              fill="#ffd54a"
            />
            <path
              className="grow-sprite-star"
              d="M 128 92 l 3 6 l 6 1 l -4 4 l 1 6 l -6 -3 l -6 3 l 1 -6 l -4 -4 l 6 -1 Z"
              fill="#ffd54a"
            />
          </>
        )}

        {/* sad 전용: 눈물 한 방울 */}
        {pose === 'sad' && <path d="M 106 78 q 5 8 0 13 a 5 5 0 1 1 0 -13 Z" fill="#7cc3ff" opacity={0.85} />}

        {/* 머리 */}
        <circle cx={80} cy={72} r={44} fill={palette.skin} />

        {/* 머리카락 */}
        {isNuri ? (
          <path
            d="M 36 66 Q 32 20 80 22 Q 128 20 124 66 Q 118 40 100 44 Q 90 30 80 44 Q 70 30 60 44 Q 42 40 36 66 Z"
            fill={palette.hair}
          />
        ) : (
          <>
            <circle cx={30} cy={78} r={16} fill={palette.hair} />
            <circle cx={130} cy={78} r={16} fill={palette.hair} />
            <path
              d="M 34 60 Q 30 18 80 18 Q 130 18 126 60 Q 116 36 80 40 Q 44 36 34 60 Z"
              fill={palette.hair}
            />
            <path d="M 24 70 L 16 62 L 20 76 Z" fill={palette.hairDark} />
            <path d="M 136 70 L 144 62 L 140 76 Z" fill={palette.hairDark} />
          </>
        )}

        {/* 볼터치 */}
        <circle cx={54} cy={84} r={7} fill="#ff9fb0" opacity={0.5} />
        <circle cx={106} cy={84} r={7} fill="#ff9fb0" opacity={0.5} />

        {/* 눈썹 */}
        <rect x={48} y={54} width={18} height={5} rx={2.5} fill={palette.hairDark} transform={`translate(0 0) ${eyebrow.left}`} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
        <rect x={94} y={54} width={18} height={5} rx={2.5} fill={palette.hairDark} transform={`translate(0 0) ${eyebrow.right}`} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />

        {/* 눈 (흰자 + 눈동자) */}
        <circle cx={60} cy={72} r={10} fill="#ffffff" />
        <circle cx={100} cy={72} r={10} fill="#ffffff" />
        <circle cx={61} cy={73} r={5} fill="#2a2a33" />
        <circle cx={101} cy={73} r={5} fill="#2a2a33" />
        {staticLidHeight > 0 && (
          <>
            <rect x={50} y={62} width={20} height={staticLidHeight} fill={palette.skin} />
            <rect x={90} y={62} width={20} height={staticLidHeight} fill={palette.skin} />
          </>
        )}
        {/* 깜빡임 눈꺼풀 (CSS 애니메이션으로 주기적으로 덮임) */}
        <rect className="grow-sprite-eyelid grow-sprite-eyelid-left" x={48} y={62} width={24} height={20} fill={palette.skin} />
        <rect className="grow-sprite-eyelid grow-sprite-eyelid-right" x={88} y={62} width={24} height={20} fill={palette.skin} />

        {/* 입 */}
        <g className="grow-sprite-mouth-group">
          <path d={MOUTH_PATH[pose]} stroke={palette.accent} strokeWidth={3.5} strokeLinecap="round" fill="none" />
        </g>
      </g>
    </svg>
  )
}
