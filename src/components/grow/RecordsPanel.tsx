import { useEffect, useState } from 'react'
import { useGrowth, type Character, type KnowledgeEntry } from '../../context/GrowthContext'
import { levelProgress } from '../../data/characterGrowth'
import { PROFESSION_LABEL } from '../../data/characterProfessions'

const VERIFICATION_LABEL: Record<KnowledgeEntry['verificationStatus'], string> = {
  appropriate: '적합',
  needs_revision: '수정 필요',
  unverifiable: '검증 불가',
}
const SOURCE_LABEL: Record<KnowledgeEntry['source'], string> = {
  user_taught: '직접 가르침',
  ai_generated: '스스로 학습',
}

// PR #46 "성장 보기"/"앨범·기록" 메뉴 — 둘 다 새 저장소 없이 기존
// listKnowledge/getExam을 재사용한 읽기 전용 화면이다. "앨범"(사진)은
// 실제로 구현된 기능이 아니므로, 있는 척하지 않고 "준비 중"으로 명시한다.
export default function RecordsPanel({ character, variant }: { character: Character; variant: 'growth' | 'album' }) {
  const { listKnowledge, getExam } = useGrowth()
  const [entries, setEntries] = useState<KnowledgeEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [alreadyPassed, setAlreadyPassed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    listKnowledge(character.companionType, { limit: 20 })
      .then((result) => {
        if (!cancelled) setEntries(result.entries)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '학습 기록을 불러오는 중 오류가 발생했어요.')
      })
    if (character.profession) {
      getExam(character.companionType)
        .then((result) => {
          if (!cancelled) setAlreadyPassed(result.alreadyPassed)
        })
        .catch(() => {
          // 시험 합격 여부는 부가 정보라, 실패해도 기록 목록 자체는 보여준다.
        })
    }
    return () => {
      cancelled = true
    }
  }, [character.companionType, character.profession, listKnowledge, getExam])

  const { level, expIntoLevel, expForNextLevel } = levelProgress(character.exp)

  return (
    <div className="flex flex-col gap-4">
      {variant === 'growth' && (
        <div className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">
            Lv.{level} · {expIntoLevel}/{expForNextLevel} XP
          </p>
          <p className="text-xs text-slate-500">
            직업: {character.profession ? PROFESSION_LABEL[character.profession] : '미선택'}
            {character.profession && alreadyPassed !== null && (
              <span className={alreadyPassed ? 'text-green-600' : 'text-slate-400'}>
                {' · '}자격시험 {alreadyPassed ? '합격' : '미합격'}
              </span>
            )}
          </p>
        </div>
      )}

      {variant === 'album' && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          사진 앨범 기능은 아직 준비 중이에요. 대신 지금까지 쌓은 학습 기록을 모아서 보여드려요.
        </p>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-500">학습 기록</p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {entries === null && !error && <p className="text-xs text-slate-400">불러오는 중...</p>}
        {entries?.length === 0 && <p className="text-xs text-slate-400">아직 가르치거나 배운 지식이 없어요.</p>}
        <div className="flex flex-col gap-2">
          {entries?.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-slate-200 p-2.5">
              <div className="flex items-center justify-between">
                <p className="truncate text-sm font-medium text-slate-800">{entry.title}</p>
                <span className="ml-2 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {VERIFICATION_LABEL[entry.verificationStatus]}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {new Date(entry.createdAt).toLocaleDateString('ko-KR')} · {SOURCE_LABEL[entry.source]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
