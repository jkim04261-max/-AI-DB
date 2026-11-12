import type { CompanionType } from '../../context/GrowthContext'
import type { AppearanceTier } from '../../data/characterAppearance'
import type { OutfitId } from '../../data/characterCustomization'
import type { AgeTier } from '../../data/characterAge'

// Independent from GrowthContext's CharacterPose-less status types — this
// is purely a *visual* state, driven today only by the existing
// verify-knowledge flow (handleVerify/result in GrowPage.tsx). No DB/API
// field backs this; it never needs to (PR #45 checkpoint 2 is frontend-only).
// 지시서(가르치기 완료 후 자동 식사 이벤트): 'eating'은 새 포즈
// 종류일 뿐, 기존 4개 포즈의 좌표·의미는 전혀 바뀌지 않는다.
export type CharacterPose = 'idle' | 'studying' | 'happy' | 'sad' | 'eating'

export const POSE_LABEL: Record<CharacterPose, string> = {
  idle: '대기 중',
  studying: '공부하는 중',
  happy: '기뻐하는 중',
  sad: '아쉬워하는 중',
  eating: '맛있게 먹는 중',
}

interface Palette {
  skin: string
  hair: string
  hairDark: string
  outfit: string
  outfitDark: string
  accent: string
}

// 성별 표기 정정: 원래 이 주석은 "누리(남)는 인디고/블루, 두리(여)는
// 로즈/핑크"였다 — 하지만 실제로 커밋돼 있는 일러스트(characterFullBody.ts
// 의 nuri-*.webp/duri-*.webp)를 직접 열어보니 누리는 분홍 한복을 입은
// 여자아이, 두리는 남색 전사풍 한복을 입은 남자아이로 그려져 있어 이
// 주석/팔레트와 정반대였다(텍스트끼리는 일관됐지만 그림과는 어긋남).
// 일러스트가 실제 게임 화면의 주 표현이라(GameStage.tsx) 그림을 기준으로
// 삼아 팔레트를 뒤집었다 — 이제 누리(여)는 로즈/핑크 톤, 두리(남)는
// 인디고/블루 톤으로 일러스트와 일치한다. 두 캐릭터 모두 원작(프린세스
// 메이커 등) 디자인을 참고하지 않은 자체 제작 단순 도형(원/둥근 사각형/
// path) 조합이다.
const PALETTE: Record<CompanionType, Palette> = {
  nuri: {
    skin: '#ffe0bd',
    hair: '#e0579e',
    hairDark: '#b8407c',
    outfit: '#ef6ea8',
    outfitDark: '#c23f82',
    accent: '#8e2a5e',
  },
  duri: {
    skin: '#ffe0bd',
    hair: '#4453d8',
    hairDark: '#2f3bb0',
    outfit: '#5b6bf0',
    outfitDark: '#3c46b0',
    accent: '#283593',
  },
}

// PR #50: 옷(Outfit) 커스터마이징 중 실제로 그림에 반영되는 첫 사례 —
// 유저가 참고로 준 레퍼런스 일러스트의 한복(빨강·금장) 톤을 그대로
// 가져왔다. CUSTOMIZATION_CATALOG의 visuallyWired=true 항목만 여기에
// 올린다 — 나머지(머리/얼굴/키/목소리)는 아직 기본 PALETTE 그대로다.
// PR #52 후속 3차: GameStage가 CSS 모드에서 실제 연령대 초상화로 바꿔
// 그릴지 판단할 때, "지금 장착한 옷이 그림에 실제로 다르게 반영되는
// 옷인지"를 여기(단일 출처)에서 그대로 가져다 쓴다 — 한복처럼 색이
// 바뀌는 옷을 입었는데 초상화로 바뀌면 커스터마이징이 안 보이게
// 되므로, 그 경우에만 기존 SVG를 계속 쓰게 하기 위함.
export const OUTFIT_PALETTE_OVERRIDE: Partial<Record<OutfitId, Palette>> = {
  hanbok_blouse: {
    skin: '#ffe0bd',
    hair: '#4453d8',
    hairDark: '#2f3bb0',
    outfit: '#b5293f',
    outfitDark: '#7a1d2b',
    accent: '#d4af37',
  },
}

// 포즈별 입 모양(path) — 표정 변화의 핵심. 좌표는 160x220 viewBox 기준.
const MOUTH_PATH: Record<CharacterPose, string> = {
  idle: 'M 64 96 Q 80 104 96 96',
  studying: 'M 70 98 Q 80 94 90 98',
  happy: 'M 58 92 Q 80 118 102 92',
  sad: 'M 66 102 Q 80 92 94 102',
  // 음식을 한입 베어 문 동그란 입 모양.
  eating: 'M 70 92 Q 80 108 90 92 Q 80 99 70 92 Z',
}

// 포즈별 눈썹 변형(두 눈 각각 rotate/translate) — 표정 변화 보조.
const EYEBROW_TRANSFORM: Record<CharacterPose, { left: string; right: string }> = {
  idle: { left: 'rotate(-4deg)', right: 'rotate(4deg)' },
  studying: { left: 'translate(1px, 2px) rotate(6deg)', right: 'translate(-1px, 2px) rotate(-6deg)' },
  happy: { left: 'translate(0, -3px) rotate(-10deg)', right: 'translate(0, -3px) rotate(10deg)' },
  sad: { left: 'translate(1px, 1px) rotate(14deg)', right: 'translate(-1px, 1px) rotate(-14deg)' },
  eating: { left: 'translate(0, -2px) rotate(-6deg)', right: 'translate(0, -2px) rotate(6deg)' },
}

// 포즈별 팔 자세(어깨 기준 회전) — studying은 왼팔이 노트 쪽으로,
// happy는 양팔을 위로 들어 환호, sad는 양팔이 아래로 처짐.
const ARM_TRANSFORM: Record<CharacterPose, { left: string; right: string }> = {
  idle: { left: 'rotate(12deg)', right: 'rotate(-12deg)' },
  studying: { left: 'rotate(55deg)', right: 'rotate(-6deg)' },
  happy: { left: 'rotate(150deg)', right: 'rotate(-150deg)' },
  sad: { left: 'rotate(-8deg) translate(2px, 4px)', right: 'rotate(8deg) translate(-2px, 4px)' },
  // 왼팔로 김밥을 입 쪽으로 들어 올리는 자세.
  eating: { left: 'rotate(95deg)', right: 'rotate(-10deg)' },
}

// PR #52 후속: 배지만으로는 "연령대별로 실제로 다른 아바타"라는 느낌이
// 약하다는 피드백을 받아, 머리/몸 비율 자체를 연령대별로 다르게 그린다
// — 2~3살은 머리가 크고 몸이 작은 "아기자기한" 비율, 10대는 그 중간,
// 20대부터는 기존 비율 그대로(scale 1 — 과거 호출부·테스트와 100%
// 동일). 머리 그룹은 머리가 목과 만나는 지점(y=116)을 축으로, 몸 그룹은
// 목깃(y=120)을 축으로 각각 따로 확대/축소해서 두 그룹이 거의 같은
// 지점에서 자연스럽게 이어지도록 했다(좌표를 직접 고치는 대신 그룹
// 전체를 감싸는 transform만 추가 — 기존 포즈·표정 좌표는 전혀 안 바뀜).
const AGE_TIER_HEAD_SCALE: Record<AgeTier, number> = {
  toddler: 1.22,
  teen: 1.08,
  junior_20s: 1,
  career_30s: 1,
  veteran_40s: 1,
  master_50s: 1,
}
const AGE_TIER_BODY_SCALE: Record<AgeTier, number> = {
  toddler: 0.78,
  teen: 0.9,
  junior_20s: 1,
  career_30s: 1,
  veteran_40s: 1,
  master_50s: 1,
}
const HEAD_PIVOT_Y = 116 // 머리(반지름 44, 중심 y=72)의 아래쪽 끝 — 목과 만나는 지점
const BODY_PIVOT_Y = 120 // 몸통 사각형의 윗변 — 목깃이 달리는 지점

export default function CharacterSprite({
  companionType,
  pose = 'idle',
  size = 96,
  tier = 'rookie',
  outfitId,
  ageTier,
}: {
  companionType: CompanionType
  pose?: CharacterPose
  size?: number
  // PR #47 체크포인트 1: 레벨 기반 외형 분기 구조 — 지금은 작은 장식
  // 요소(안경/배지)만 추가하는 최소 구현이고, 기본값('rookie')은 기존
  // PR #45/#46의 모습과 100% 동일해 과거 테스트·스냅샷을 깨지 않는다.
  tier?: AppearanceTier
  // PR #50: 커스터마이징 룸에서 장착한 옷. 지정하지 않으면(undefined)
  // 또는 매핑이 없으면 기존 기본 PALETTE 그대로 — 과거 호출부/테스트는
  // 전혀 안 바뀐다.
  outfitId?: OutfitId
  // PR #52: 6단계 연령대(아직 실제 전용 일러스트는 없음 — 요청하신
  // 범위대로, 기존 SVG에 작은 장식 배지만 연령대별로 다르게 얹는다).
  // 지정하지 않으면 기존 모습과 100% 동일(배지 없음).
  ageTier?: AgeTier
}) {
  const palette = (outfitId && OUTFIT_PALETTE_OVERRIDE[outfitId]) || PALETTE[companionType]
  const isHanbok = outfitId === 'hanbok_blouse'
  const isNuri = companionType === 'nuri'
  const name = isNuri ? '누리' : '두리'
  const eyebrow = EYEBROW_TRANSFORM[pose]
  const arm = ARM_TRANSFORM[pose]
  // sad 포즈에서는 눈이 정적으로 살짝 처진 느낌을 주기 위해 눈 위쪽을
  // 피부색 사각형으로 조금 더 가린다(애니메이션인 깜빡임과는 별개).
  const staticLidHeight = pose === 'sad' ? 5 : 0
  const headScale = ageTier ? AGE_TIER_HEAD_SCALE[ageTier] : 1
  const bodyScale = ageTier ? AGE_TIER_BODY_SCALE[ageTier] : 1
  const headGroupTransform = `translate(80 ${HEAD_PIVOT_Y}) scale(${headScale}) translate(-80 -${HEAD_PIVOT_Y})`
  const bodyGroupTransform = `translate(80 ${BODY_PIVOT_Y}) scale(${bodyScale}) translate(-80 -${BODY_PIVOT_Y})`
  const isToddler = ageTier === 'toddler'

  return (
    <svg
      viewBox="0 0 160 220"
      width={size}
      height={(size * 220) / 160}
      role="img"
      aria-label={`${name} 캐릭터, ${POSE_LABEL[pose]}`}
      className={`grow-sprite-pose-${pose}`}
      // PR #49: 2.5D 입체감을 위한 부드러운 드롭섀도 — 포즈/라벨/구조는
      // 전혀 바꾸지 않는 순수 시각 효과.
      style={{ filter: 'drop-shadow(0 6px 6px rgba(120, 72, 24, 0.22))' }}
    >
      <g className="grow-sprite-body">
        {/* PR #52 후속: 몸 그룹 — 목깃(y=120)을 축으로 연령대별 bodyScale
            만큼 확대/축소한다. 내부 좌표는 전혀 안 바꾸고 그룹 전체에만
            transform을 건다. */}
        <g transform={bodyGroupTransform}>
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
          {/* PR #50: 한복 블라우스 전용 — 금장 깃 테두리(레퍼런스 일러스트의
              금박 자수 느낌을 단순화한 라인) */}
          {isHanbok && (
            <path
              d="M 38 124 Q 80 112 122 124"
              stroke={palette.accent}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
            />
          )}
          {/* 목깃 — PR #52 후속: 2~3살(toddler)은 넥타이/리본 대신 아기자기한
              둥근 턱받이(bib) + 단추 하나로 유아복 느낌을 낸다. */}
          {isToddler ? (
            <>
              <path d="M 60 120 Q 80 134 100 120 L 95 140 Q 80 148 65 140 Z" fill={palette.outfitDark} />
              <circle cx={80} cy={132} r={4} fill={palette.accent} />
            </>
          ) : (
            <>
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

          {/* eating 전용: 왼손에 든 작은 김밥 한 줄(자체 제작 단순 도형,
              특정 상호와 무관한 일반적인 음식 아이콘). */}
          {pose === 'eating' && (
            <g transform="translate(46 108) rotate(-12)" data-testid="meal-gimbap-prop">
              <rect x={0} y={0} width={24} height={11} rx={5.5} fill="#f5f0e6" stroke="#2a2a33" strokeWidth={1.5} />
              <circle cx={6} cy={5.5} r={1.8} fill="#e8b23d" />
              <circle cx={12} cy={5.5} r={1.8} fill="#5ba3e0" />
              <circle cx={18} cy={5.5} r={1.8} fill="#d9534f" />
            </g>
          )}

          {/* tier='expert' 전용: 작은 전문가 배지 — 레벨 6 이상부터 보임 */}
          {tier === 'expert' && (
            <g data-testid="appearance-accessory-expert">
              <circle cx={104} cy={136} r={7} fill="#ffd54a" stroke={palette.outfitDark} strokeWidth={1.5} />
              <path d="M 104 132 l 2 4 l 4 0.5 l -3 3 l 0.7 4 l -3.7 -2 l -3.7 2 l 0.7 -4 l -3 -3 l 4 -0.5 Z" fill={palette.accent} />
            </g>
          )}
        </g>

        {/* happy 전용: 반짝이는 별 — 머리/몸 비율과 무관한 장식이라 그대로 둔다 */}
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

        {/* PR #52 후속: 머리 그룹 — 목과 만나는 지점(y=116)을 축으로
            연령대별 headScale만큼 확대/축소한다. 눈·눈썹·입 등 얼굴
            부위는 전부 이 안에 있어야 머리 크기가 바뀌어도 자연스럽게
            같이 움직인다. */}
        <g transform={headGroupTransform}>
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

          {/* tier='student' 전용: 작은 안경 — 레벨 3 이상부터 보임 */}
          {tier === 'student' && (
            <g data-testid="appearance-accessory-student" stroke={palette.hairDark} strokeWidth={2.5} fill="none">
              <circle cx={60} cy={73} r={11} />
              <circle cx={100} cy={73} r={11} />
              <line x1={71} y1={73} x2={89} y2={73} />
            </g>
          )}

          {/* ageTier==='veteran_40s' 전용: 금테 안경 — 눈 좌표를 그대로
              따라가야 해서 머리 그룹 안으로 옮겼다. */}
          {ageTier === 'veteran_40s' && (
            <g data-testid="age-badge-veteran-40s" stroke="#d4af37" strokeWidth={2.5} fill="none">
              <circle cx={60} cy={73} r={11} />
              <circle cx={100} cy={73} r={11} />
              <line x1={71} y1={73} x2={89} y2={73} />
            </g>
          )}
        </g>

        {/* PR #52: 6단계 연령대 배지 — 아직 전용 일러스트는 없어서(요청
            범위대로), 머리 위에 작은 장식 하나로 지금 어느 연령대인지
            표시한다. ageTier가 없으면(undefined) 기존 모습과 완전히
            동일 — 과거 호출부/테스트는 전혀 영향받지 않는다. */}
        {ageTier === 'toddler' && (
          <g data-testid="age-badge-toddler" transform="translate(80 26)">
            {/* PR #52 후속 5차: 시작 연령이 8~9살(초등 저학년)로 바뀌어
                아기 고무젖꼭지 대신 작은 책가방으로 교체 */}
            <rect x={-7} y={-5} width={14} height={13} rx={3} fill="#7cc3ff" stroke="#ffffff" strokeWidth={1.2} />
            <rect x={-4} y={-8} width={8} height={4} rx={1.5} fill="#5ba3e0" />
          </g>
        )}
        {ageTier === 'teen' && (
          <g data-testid="age-badge-teen" transform="translate(80 22)">
            {/* 작은 책 — 학생 느낌 */}
            <rect x={-9} y={-6} width={18} height={13} rx={1.5} fill="#7cc3ff" stroke="#ffffff" strokeWidth={1.2} />
            <line x1={0} y1={-6} x2={0} y2={7} stroke="#ffffff" strokeWidth={1.2} />
          </g>
        )}
        {ageTier === 'career_30s' && (
          <g data-testid="age-badge-career-30s" transform="translate(80 24)">
            {/* 작은 서류가방 — 커리어 확장기 */}
            <rect x={-10} y={-4} width={20} height={13} rx={2} fill={palette.accent} />
            <rect x={-5} y={-8} width={10} height={5} rx={1.5} fill="none" stroke={palette.accent} strokeWidth={2} />
          </g>
        )}
        {ageTier === 'master_50s' && (
          <g data-testid="age-badge-master-50s" transform="translate(80 24)">
            {/* 장인증서 리본 배지 — 요청 1번의 "장인증서 수여 및 최종 완결
                단계"를 시각적으로 표시하는 가장 중요한 배지 */}
            <path d="M -5 2 L -8 14 L 0 9 L 8 14 L 5 2 Z" fill="#b5293f" />
            <circle cx={0} cy={0} r={9} fill="#ffd54a" stroke="#d4af37" strokeWidth={2} />
            <path d="M 0 -4 l 2 4 l 4 0.5 l -3 3 l 0.7 4 l -3.7 -2 l -3.7 2 l 0.7 -4 l -3 -3 l 4 -0.5 Z" fill="#b5293f" />
          </g>
        )}
      </g>
    </svg>
  )
}
