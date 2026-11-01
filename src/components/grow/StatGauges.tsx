import { STAT_META, type StatGauges } from '../../data/characterStats'

// PR #47 체크포인트 1: 4개 스탯 게이지 — 값은 GrowPage가 기존 읽기
// 전용 데이터로 계산해 내려주며, 이 컴포넌트는 그 숫자를 그려주기만
// 한다(새 API 호출 없음). PR #49: 더 이상 자체 흰/크림 카드를 갖지
// 않는다 — GrowPage가 스테이지 하단의 단일 목재 패널(footer) 안에
// GrowthHUD/QuestBanner와 함께 이어붙인다. data-testid는 그대로라
// 기존 e2e 폭(width %) 검증은 변하지 않는다.
export default function StatGaugesPanel({ values }: { values: StatGauges }) {
  return (
    <div data-testid="stat-gauges" className="grid grid-cols-2 gap-x-3 gap-y-1">
      {STAT_META.map((meta) => (
        <div key={meta.key} className="flex items-center gap-1.5">
          <span className="w-7 shrink-0 text-[10px] font-semibold text-amber-100">{meta.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-50/15">
            <span
              data-testid={`stat-gauge-${meta.key}`}
              className={`block h-full rounded-full bg-gradient-to-r ${meta.colorClassName} transition-[width] duration-500`}
              style={{ width: `${values[meta.key]}%` }}
            />
          </span>
          <span className="w-6 shrink-0 text-right text-[10px] text-amber-200/70">{values[meta.key]}</span>
        </div>
      ))}
    </div>
  )
}
