import { Coins, Zap, Calendar, Compass } from 'lucide-react'
import { todaySeasonLabel } from '../../data/characterStats'

// PR #49: 화면 상단에 항상 보이는 클래식 RPG형 리소스 바. 전부 실제
// 존재하는 값만 보여준다 — 가짜 재화/행동력을 새로 만들지 않았다:
// - 포인트 = 캐릭터의 실제 누적 XP(character.exp)를 그대로 보여준다.
// - 행동력 = 오늘 남은 가르치기/스스로 공부하기 횟수를 합친 실제 서버
//   값(api/character.ts GET action=usage, 소비 없는 조회).
// - 날짜/시즌 = 오늘 실제 날짜 + 그 달에서 파생한 꾸밈용 계절 문구일
//   뿐, 날짜·시즌에 따라 달라지는 게임 메커니즘은 없다.
// - 종합 성향 = 이미 계산되어 있는 4개 스탯 게이지 중 가장 높은 것의
//   라벨(characterStats.ts의 dominantStatLabel) — 새 데이터가 아니라
//   기존 숫자의 요약이다.
export default function ResourceBar({
  points,
  energyRemaining,
  energyTotal,
  tendencyLabel,
}: {
  points: number
  energyRemaining: number
  energyTotal: number
  tendencyLabel: string
}) {
  const today = new Date()
  const dateLabel = `${today.getMonth() + 1}.${today.getDate()}`
  const season = todaySeasonLabel(today)

  return (
    <div
      data-testid="resource-bar"
      className="grid grid-cols-4 gap-1 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-100 px-1.5 py-2 text-center shadow-sm"
    >
      <div className="flex flex-col items-center gap-0.5">
        <Coins size={14} className="text-amber-600" />
        <span data-testid="resource-points" className="text-[11px] font-bold text-amber-900">
          {points}
        </span>
        <span className="text-[9px] text-amber-600">포인트</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Zap size={14} className="text-amber-600" />
        <span data-testid="resource-energy" className="text-[11px] font-bold text-amber-900">
          {energyRemaining}/{energyTotal}
        </span>
        <span className="text-[9px] text-amber-600">행동력</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Calendar size={14} className="text-amber-600" />
        <span data-testid="resource-date" className="text-[11px] font-bold text-amber-900">
          {dateLabel}
        </span>
        <span className="text-[9px] text-amber-600">{season}</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Compass size={14} className="text-amber-600" />
        <span data-testid="resource-tendency" className="text-[11px] font-bold text-amber-900">
          {tendencyLabel}
        </span>
        <span className="text-[9px] text-amber-600">성향</span>
      </div>
    </div>
  )
}
