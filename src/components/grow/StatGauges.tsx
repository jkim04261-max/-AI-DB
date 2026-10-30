import { STAT_META, type StatGauges } from '../../data/characterStats'

// PR #47 체크포인트 1: 메인 화면(캐릭터 바로 아래)에 상시 노출되는 4개
// 스탯 게이지 — 패널을 열지 않아도 바로 보이도록 GrowPage가 GameStage
// 다음에 배치한다. 값은 GrowPage가 기존 읽기 전용 데이터로 계산해
// 내려주며, 이 컴포넌트는 그 숫자를 그려주기만 한다(새 API 호출 없음).
export default function StatGaugesPanel({ values }: { values: StatGauges }) {
  return (
    <div data-testid="stat-gauges" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3">
      {STAT_META.map((meta) => (
        <div key={meta.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>{meta.label}</span>
            <span className="text-slate-400">{values[meta.key]}</span>
          </div>
          <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <span
              data-testid={`stat-gauge-${meta.key}`}
              className={`block h-full rounded-full bg-gradient-to-r ${meta.colorClassName} transition-[width] duration-500`}
              style={{ width: `${values[meta.key]}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}
