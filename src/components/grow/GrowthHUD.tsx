import { Briefcase } from 'lucide-react'
import { levelProgress, KNOWLEDGE_VS_MODEL_DISCLAIMER } from '../../data/characterGrowth'
import { PROFESSION_LABEL, type ProfessionId } from '../../data/characterProfessions'

const STAGE_LABEL: Record<'child' | 'adult', string> = { child: '어린이', adult: '성인' }

// PR #46: compact status strip under the stage — level/XP and a one-line
// "recent activity" preview. All values are passed in by GrowPage, computed
// from data GrowthContext already fetches (characters list, listMessages,
// getExam's alreadyPassed) — this component adds no new API calls of its
// own. PR #48: the "오늘의 목표" line moved out to QuestBanner (now with a
// bigger, action-button-carrying "퀘스트 제안" role) so the same
// recommendation isn't shown twice on the same screen.
export default function GrowthHUD({
  name,
  stage,
  profession,
  exp,
  recentLine,
}: {
  name: string
  stage: 'child' | 'adult'
  profession: ProfessionId | null
  exp: number
  recentLine: string | null
}) {
  const { level, expIntoLevel, expForNextLevel } = levelProgress(exp)
  const progressPct = expForNextLevel > 0 ? Math.min(100, Math.round((expIntoLevel / expForNextLevel) * 100)) : 0

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-amber-900">{name}</p>
          <span className="text-[11px] text-amber-700/70">{STAGE_LABEL[stage]}</span>
        </div>
        <div data-testid="profession-badge" className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800">
          <Briefcase size={11} />
          {profession ? PROFESSION_LABEL[profession] : '직업 미선택'}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-400/40">Lv.{level}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-amber-900/10">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </span>
        <span className="shrink-0 text-[11px] text-amber-700/70">
          {expIntoLevel}/{expForNextLevel} XP
        </span>
      </div>

      {recentLine && <p className="truncate text-[11px] text-amber-700/60">최근: {recentLine}</p>}

      <p className="text-[10px] leading-tight text-amber-700/40">{KNOWLEDGE_VS_MODEL_DISCLAIMER}</p>
    </div>
  )
}
