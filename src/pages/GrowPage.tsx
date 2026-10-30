import { useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGrowth, type CompanionType } from '../context/GrowthContext'
import { PROFESSIONS, PROFESSION_LABEL, type ProfessionId } from '../data/characterProfessions'
import type { CharacterPose } from '../components/grow/CharacterSprite'
import GameStage from '../components/grow/GameStage'
import GrowthHUD from '../components/grow/GrowthHUD'
import GameMenu, { type GameMenuAction } from '../components/grow/GameMenu'
import BottomSheet from '../components/grow/BottomSheet'
import InteractionPanel from '../components/grow/InteractionPanel'
import ExamPanel from '../components/grow/ExamPanel'
import ChatLogPanel from '../components/grow/ChatLogPanel'
import RecordsPanel from '../components/grow/RecordsPanel'
import StatGaugesPanel from '../components/grow/StatGauges'
import { computeStatGauges } from '../data/characterStats'
import { appearanceTierForLevel } from '../data/characterAppearance'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }
const SHEET_TITLE: Record<GameMenuAction, string> = {
  teach: '가르치기 · 스스로 공부하기',
  'chat-log': '함께 나눈 대화',
  quiz: '문제 풀기',
  study: '가르치기 · 스스로 공부하기',
  growth: '성장 보기',
  album: '앨범 · 기록',
}

// PR #46: /grow를 카드형 웹페이지에서 캐릭터 중심 게임 화면으로
// 재구성. 학습·검증·퀴즈·시험·XP·DB 저장 로직은 전부 기존
// GrowthContext/InteractionPanel/ExamPanel을 그대로 재사용하고(요청 9),
// 이 파일은 그 기능들을 어떻게 보여줄지(레이아웃·전환·연출)만 바꾼다.
export default function GrowPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { characters, loading, createCharacter, setProfession, listMessages, getExam, listKnowledge } = useGrowth()

  const [selected, setSelected] = useState<CompanionType>('nuri')
  const [creating, setCreating] = useState<CompanionType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [changingProfession, setChangingProfession] = useState(false)
  const [pendingChange, setPendingChange] = useState<ProfessionId | null>(null)
  const [savingProfession, setSavingProfession] = useState(false)
  const [openSheet, setOpenSheet] = useState<GameMenuAction | null>(null)
  const [pose, setPose] = useState<CharacterPose>('idle')
  const [bubbleText, setBubbleText] = useState<string | null>(null)
  const [recentLine, setRecentLine] = useState<string | null>(null)
  const [examPassed, setExamPassed] = useState<boolean | null>(null)
  const [xpPopup, setXpPopup] = useState<number | null>(null)
  const [knowledgeStats, setKnowledgeStats] = useState({ total: 0, aiGenerated: 0 })
  const [messageTotal, setMessageTotal] = useState(0)
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null)

  const character = characters.find((c) => c.companionType === selected) ?? null
  const prevExpRef = useRef<number | null>(null)
  const prevLevelRef = useRef<number | null>(null)
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const levelUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 로그인한 계정이 두리만 갖고 있는 경우처럼, 기본값('nuri')과 실제
  // 보유 캐릭터가 어긋날 수 있어 보정한다 — 둘 다 있으면 아무것도 하지
  // 않는다(사용자가 고른 탭을 덮어쓰지 않음).
  useEffect(() => {
    if (characters.length === 0) return
    if (characters.some((c) => c.companionType === selected)) return
    setSelected(characters[0].companionType)
  }, [characters, selected])

  // 캐릭터를 전환할 때마다 "오늘의 목표"/"최근 기록"/4개 스탯 게이지에
  // 쓸 가벼운 데이터를 조용히 미리 불러온다 — 셋 다 이미 있는 읽기
  // 전용 GET이라(Gemini 호출 없음, 비용 없음) 추가 과금이나 새 API
  // 없이 재사용만 한다. 스탯 게이지 자체는 characterStats.ts가 이
  // 데이터를 0~100으로 환산한 "표시용" 값일 뿐, 새로 저장되는 값은
  // 아니다(PR #47 체크포인트 1).
  useEffect(() => {
    if (!character) return
    setExamPassed(null)
    setRecentLine(null)
    setKnowledgeStats({ total: 0, aiGenerated: 0 })
    setMessageTotal(0)
    let cancelled = false
    if (character.profession) {
      getExam(character.companionType)
        .then((r) => {
          if (!cancelled) setExamPassed(r.alreadyPassed)
        })
        .catch(() => {})
    }
    listMessages(character.companionType, { limit: 5 })
      .then((r) => {
        if (!cancelled) {
          setMessageTotal(r.total)
          if (r.messages.length > 0) setRecentLine(r.messages[r.messages.length - 1].content)
        }
      })
      .catch(() => {})
    listKnowledge(character.companionType, { limit: 100 })
      .then((r) => {
        if (!cancelled) {
          const aiGenerated = r.entries.filter((e) => e.source === 'ai_generated').length
          setKnowledgeStats({ total: r.total, aiGenerated })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [character?.companionType, character?.profession, getExam, listMessages, listKnowledge])

  // XP가 늘어나면(패널이 뭘 했든 상관없이) 잠깐 "+N XP" 팝업만 띄운다 —
  // InteractionPanel/ExamPanel 내부를 전혀 건드리지 않고, 결과로 바뀐
  // character.exp만 지켜보는 방식이라 기존 로직과 완전히 분리돼 있다.
  useEffect(() => {
    if (!character) return
    const prev = prevExpRef.current
    if (prev !== null && character.exp > prev) {
      const gained = character.exp - prev
      setXpPopup(gained)
      const t = window.setTimeout(() => setXpPopup(null), 1800)
      return () => window.clearTimeout(t)
    }
    prevExpRef.current = character.exp
  }, [character?.exp])
  useEffect(() => {
    prevExpRef.current = character?.exp ?? null
  }, [character?.companionType])

  // 레벨이 실제로 올랐을 때만(지식 저장/퀴즈/시험 하나로는 보통 레벨까지
  // 안 오름) +N XP 팝업과 별개로 더 눈에 띄는 "레벨업" 연출을 띄운다 —
  // 이 효과도 InteractionPanel/ExamPanel을 전혀 건드리지 않고 결과로
  // 바뀐 character.level만 지켜보는 방식이다.
  useEffect(() => {
    if (!character) return
    const prev = prevLevelRef.current
    if (prev !== null && character.level > prev) {
      setLeveledUpTo(character.level)
      if (levelUpTimeoutRef.current) clearTimeout(levelUpTimeoutRef.current)
      levelUpTimeoutRef.current = setTimeout(() => setLeveledUpTo(null), 2200)
    }
    prevLevelRef.current = character.level
  }, [character?.level])
  useEffect(() => {
    prevLevelRef.current = character?.level ?? null
  }, [character?.companionType])

  useEffect(() => {
    return () => {
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current)
      if (levelUpTimeoutRef.current) clearTimeout(levelUpTimeoutRef.current)
    }
  }, [])

  const showBubble = (text: string) => {
    setBubbleText(text)
    if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current)
    bubbleTimeoutRef.current = setTimeout(() => setBubbleText(null), 3200)
  }

  const handleCreate = async (companionType: CompanionType) => {
    setCreating(companionType)
    setError(null)
    try {
      await createCharacter(companionType)
      setSelected(companionType)
    } catch (err) {
      setError(err instanceof Error ? err.message : '캐릭터를 만드는 중 오류가 발생했어요.')
    } finally {
      setCreating(null)
    }
  }

  const applyProfession = async (profession: ProfessionId) => {
    if (!character) return
    setSavingProfession(true)
    setError(null)
    try {
      await setProfession(character.companionType, profession)
      setChangingProfession(false)
      setPendingChange(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '직업을 저장하는 중 오류가 발생했어요.')
    } finally {
      setSavingProfession(false)
    }
  }

  // InteractionPanel/ExamPanel reset pose to 'idle' from a cleanup effect
  // keyed on this callback's identity — if this weren't memoized, every
  // unrelated GrowPage re-render (e.g. the recentLine/examPassed prefetch
  // effects resolving) would hand them a new onPoseChange reference and
  // immediately re-trigger that cleanup, snapping the pose straight back
  // to idle right after a panel just set it to happy/sad.
  const handlePoseChange = useCallback((next: CharacterPose) => {
    setPose(next)
    if (next === 'happy') showBubble('좋아요! 잘 하고 있어요!')
    if (next === 'sad') showBubble('음... 다시 해볼까요?')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!authLoading && !user) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
        <h1 className="text-xl font-bold text-slate-900">AI 키우기</h1>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">로그인하면 누리·두리를 키울 수 있어요.</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white"
          >
            로그인
          </button>
        </div>
      </div>
    )
  }

  const hasNuri = characters.some((c) => c.companionType === 'nuri')
  const hasDuri = characters.some((c) => c.companionType === 'duri')
  const otherProfessions = character ? PROFESSIONS.filter((p) => p.id !== character.profession) : []

  const goalText = !character
    ? ''
    : !character.profession
      ? '먼저 직업을 선택해 보세요'
      : examPassed === false
        ? `${PROFESSION_LABEL[character.profession]} 자격시험에 도전해보세요`
        : examPassed === true
          ? '오늘도 지식을 가르치거나 스스로 공부시켜보세요'
          : '오늘도 함께 성장해볼까요?'

  const handleMenuSelect = (action: GameMenuAction) => {
    if (!character?.profession) return
    setOpenSheet(action)
  }

  const statGauges = character
    ? computeStatGauges({
        level: character.level,
        knowledgeTotal: knowledgeStats.total,
        aiGeneratedTotal: knowledgeStats.aiGenerated,
        messageTotal,
        examPassed,
      })
    : null
  const tier = character ? appearanceTierForLevel(character.level) : 'rookie'

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 px-3 py-4 sm:px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">AI 키우기</h1>
        {characters.length > 0 && (
          <div className="flex gap-1 rounded-full bg-slate-100 p-1">
            {characters.map((c) => (
              <button
                key={c.companionType}
                onClick={() => setSelected(c.companionType)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selected === c.companionType ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'
                }`}
              >
                {COMPANION_LABEL[c.companionType]}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && character && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <GameStage
              companionType={character.companionType}
              profession={character.profession}
              pose={pose}
              bubbleText={bubbleText}
              onTapCharacter={() => showBubble(character.profession ? '안녕하세요!' : '직업을 골라주세요!')}
              tier={tier}
            />
            {xpPopup !== null && (
              <span className="motion-safe:animate-[grow-xp-pop_1.8s_ease-out_forwards] pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-base font-extrabold text-amber-500 drop-shadow">
                +{xpPopup} XP
              </span>
            )}
            {leveledUpTo !== null && (
              <span
                data-testid="level-up-banner"
                className="motion-safe:animate-[grow-levelup-pop_2.2s_ease-out_forwards] pointer-events-none absolute left-1/2 top-1/2 whitespace-nowrap text-2xl font-extrabold text-amber-500 drop-shadow-lg"
              >
                🎉 Lv.{leveledUpTo} 레벨업!
              </span>
            )}
          </div>

          <GrowthHUD
            name={COMPANION_LABEL[character.companionType]}
            stage={character.stage}
            profession={character.profession}
            exp={character.exp}
            goalText={goalText}
            recentLine={recentLine}
          />

          {statGauges && <StatGaugesPanel values={statGauges} />}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setChangingProfession((v) => !v)}
              disabled={savingProfession}
              className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 disabled:opacity-50"
            >
              {character.profession ? '직업 변경' : '직업 선택'}
            </button>
          </div>

          {changingProfession && (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 p-3">
              <div className="flex gap-2">
                {otherProfessions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => (character.profession === null ? void applyProfession(p.id) : setPendingChange(p.id))}
                    disabled={savingProfession}
                    className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {savingProfession ? '저장 중...' : p.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setChangingProfession(false)}
                disabled={savingProfession}
                className="self-start text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                취소
              </button>
            </div>
          )}

          <GameMenu disabled={!character.profession} onSelect={handleMenuSelect} />
          {!character.profession && <p className="text-center text-xs text-slate-400">직업을 선택하면 게임 메뉴를 쓸 수 있어요.</p>}
        </div>
      )}

      {!loading && (!hasNuri || !hasDuri) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700">새 캐릭터 만들기</p>
          <div className="flex gap-3">
            {!hasNuri && (
              <button
                onClick={() => handleCreate('nuri')}
                disabled={creating !== null}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {creating === 'nuri' ? '만드는 중...' : '누리 만들기 (남)'}
              </button>
            )}
            {!hasDuri && (
              <button
                onClick={() => handleCreate('duri')}
                disabled={creating !== null}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {creating === 'duri' ? '만드는 중...' : '두리 만들기 (여)'}
              </button>
            )}
          </div>
        </div>
      )}

      {pendingChange && character && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-slate-900">직업을 변경할까요?</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {COMPANION_LABEL[character.companionType]}의 직업을{' '}
              <span className="font-semibold text-slate-700">{PROFESSION_LABEL[pendingChange]}</span>
              로 변경해요. 캐릭터 자체는 삭제되지 않아요.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingChange(null)}
                disabled={savingProfession}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void applyProfession(pendingChange)}
                disabled={savingProfession}
                className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {savingProfession ? '변경 중...' : '변경'}
              </button>
            </div>
          </div>
        </div>
      )}

      {openSheet && character?.profession && (
        <BottomSheet title={SHEET_TITLE[openSheet]} onClose={() => setOpenSheet(null)}>
          {(openSheet === 'teach' || openSheet === 'study') && (
            <InteractionPanel character={character} profession={character.profession} onPoseChange={handlePoseChange} />
          )}
          {openSheet === 'quiz' && (
            <ExamPanel character={character} profession={character.profession} onPoseChange={handlePoseChange} />
          )}
          {openSheet === 'chat-log' && <ChatLogPanel character={character} />}
          {openSheet === 'growth' && <RecordsPanel character={character} variant="growth" />}
          {openSheet === 'album' && <RecordsPanel character={character} variant="album" />}
        </BottomSheet>
      )}
    </div>
  )
}
