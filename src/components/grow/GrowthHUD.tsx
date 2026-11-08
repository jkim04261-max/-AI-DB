import { Briefcase } from 'lucide-react'
import { levelProgress, KNOWLEDGE_VS_MODEL_DISCLAIMER } from '../../data/characterGrowth'
import { PROFESSION_LABEL, type ProfessionId } from '../../data/characterProfessions'

const STAGE_LABEL: Record<'child' | 'adult', string> = { child: '어린이', adult: '성인' }

// PR #46: compact status strip — level/XP and a one-line "recent activity"
// preview. All values are passed in by GrowPage, computed from data
// GrowthContext already fetches (characters list, listMessages, getExam's
// alreadyPassed) — this component adds no new API calls of its own. PR #48:
// the "오늘의 목표" line moved out to QuestBanner. PR #49: 더 이상 자체
// 카드(흰/크림 박스)를 갖지 않는다 — GrowPage가 스테이지 하단의 단일
// 목재 패널(footer) 안에 다른 HUD 요소들과 함께 이어붙여서 "여러 개의
// 흰 박스가 쌓인 목록"처럼 보이지 않게 한다. 배경색은 그 패널이 맡고,
// 이 컴포넌트는 어두운 배경에 맞는 밝은 글자색만 책임진다.
export default function GrowthHUD({
  name,
  stage,
  profession,
  customProfessionLabel,
  exp,
  recentLine,
  ageStageLabel,
}: {
  name: string
  stage: 'child' | 'adult'
  profession: ProfessionId | null
  // PR #65: profession==='custom'일 때만 값이 있다 — 그 외엔 항상
  // PROFESSION_LABEL[profession]을 그대로 쓴다(기존 동작 그대로).
  customProfessionLabel?: string | null
  exp: number
  recentLine: string | null
  // PR #52: 6단계 연령대 중 지금 단계의 짧은 이름(예: "초등 저학년").
  ageStageLabel?: string
}) {
  const { level, expIntoLevel, expForNextLevel } = levelProgress(exp)
  const progressPct = expForNextLevel > 0 ? Math.min(100, Math.round((expIntoLevel / expForNextLevel) * 100)) : 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-amber-50">{name}</p>
          <span className="text-[11px] text-amber-200/70">{STAGE_LABEL[stage]}</span>
          {ageStageLabel && <span data-testid="age-stage-label" className="text-[11px] text-amber-200/70">· {ageStageLabel}</span>}
        </div>
        <div data-testid="profession-badge" className="flex items-center gap-1 rounded-full bg-amber-50/15 px-2.5 py-1 text-[11px] font-medium text-amber-100">
          <Briefcase size={11} />
          {profession ? (profession === 'custom' ? customProfessionLabel ?? PROFESSION_LABEL.custom : PROFESSION_LABEL[profession]) : '직업 미선택'}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-300/40">Lv.{level}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-amber-50/15">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-400 transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </span>
        <span className="shrink-0 text-[11px] text-amber-200/70">
          {expIntoLevel}/{expForNextLevel} XP
        </span>
      </div>

      {recentLine && <p className="truncate text-[11px] text-amber-200/60">최근: {recentLine}</p>}

      <p className="text-[10px] leading-tight text-amber-200/40">{KNOWLEDGE_VS_MODEL_DISCLAIMER}</p>
    </div>
  )
}
