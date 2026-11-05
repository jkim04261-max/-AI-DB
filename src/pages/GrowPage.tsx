import { useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGrowth, type CompanionType } from '../context/GrowthContext'
import { PROFESSION_LABEL, EXAM_SUPPORTED_PROFESSIONS, type ProfessionId } from '../data/characterProfessions'
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
import QuestBanner from '../components/grow/QuestBanner'
import ResourceBar from '../components/grow/ResourceBar'
import ProfessionPicker from '../components/grow/ProfessionPicker'
import TurnTransition from '../components/grow/TurnTransition'
import CustomizationRoom from '../components/grow/CustomizationRoom'
import ItemMarket from '../components/grow/ItemMarket'
import { computeStatGauges, dominantStatLabel } from '../data/characterStats'
import { appearanceTierForLevel } from '../data/characterAppearance'
import { ageTierForLevel, AGE_TIER_STAGE_LABEL, toddlerProfessionGreeting, ageNumberForLevel } from '../data/characterAge'
import { computeActiveQuest } from '../data/characterQuests'
import { BACKGROUND_SCENES } from '../data/backgroundCatalog'
import { useMockInventory } from '../hooks/useMockInventory'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }
const SHEET_TITLE: Record<GameMenuAction, string> = {
  teach: '가르치기 · 스스로 공부하기',
  'chat-log': '함께 나눈 대화',
  quiz: '문제 풀기',
  study: '가르치기 · 스스로 공부하기',
  growth: '성장 보기',
  customize: '커스터마이징 룸',
  market: '아이템 마켓',
  album: '앨범 · 기록',
}
// PR #49 요청 3: 텍스트 입력 폼(InteractionPanel/ExamPanel)을 대체하지는
// 않지만("진짜로 학습 내용을 입력해야" 하는 기능이라 로직은 그대로
// 두고), 그 폼이 열리기 전에 짧은 "턴 진행" 연출을 한 번 보여준다.
// chat-log/growth/album은 그냥 기록을 보는 것이라 턴 연출이 어울리지
// 않아 대상에서 뺐다.
const TURN_TRANSITION_LABEL: Partial<Record<GameMenuAction, string>> = {
  teach: '지식을 가르치러 갑니다...',
  study: '스스로 공부하러 갑니다...',
  quiz: '문제를 준비하고 있어요...',
}

// PR #46: /grow를 카드형 웹페이지에서 캐릭터 중심 게임 화면으로
// 재구성. 학습·검증·퀴즈·시험·XP·DB 저장 로직은 전부 기존
// GrowthContext/InteractionPanel/ExamPanel을 그대로 재사용하고(요청 9),
// 이 파일은 그 기능들을 어떻게 보여줄지(레이아웃·전환·연출)만 바꾼다.
// PR #49: 스테이지+HUD+스탯+퀘스트+메뉴를 하나의 목재 프레임으로
// 합쳐서, 흰/크림색 카드가 줄줄이 쌓인 웹페이지 느낌에서 벗어났다.
export default function GrowPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { characters, loading, createCharacter, setProfession, listMessages, getExam, listKnowledge, getUsage } = useGrowth()

  const [selected, setSelected] = useState<CompanionType>('nuri')
  const [creating, setCreating] = useState<CompanionType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showProfessionPicker, setShowProfessionPicker] = useState(false)
  const [pendingChange, setPendingChange] = useState<ProfessionId | null>(null)
  const [savingProfession, setSavingProfession] = useState(false)
  const [openSheet, setOpenSheet] = useState<GameMenuAction | null>(null)
  const [turnTransition, setTurnTransition] = useState<GameMenuAction | null>(null)
  const [pose, setPose] = useState<CharacterPose>('idle')
  const [bubbleText, setBubbleText] = useState<string | null>(null)
  const [recentLine, setRecentLine] = useState<string | null>(null)
  const [examPassed, setExamPassed] = useState<boolean | null>(null)
  const [xpPopup, setXpPopup] = useState<number | null>(null)
  const [knowledgeStats, setKnowledgeStats] = useState({ total: 0, aiGenerated: 0 })
  const [messageTotal, setMessageTotal] = useState(0)
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null)
  // PR #49: 상단 리소스 바의 "행동력" — 오늘 남은 가르치기/스스로
  // 공부하기 횟수(계정 전체 하루 한도, 캐릭터별이 아님). 소비 없는
  // 조회(getUsage)만 쓴다.
  const [usage, setUsage] = useState({ teachRemaining: 0, teachLimit: 0, studyRemaining: 0, studyLimit: 0 })
  // PR #50: 커스터마이징/마켓 뼈대 — 모의 재화·보유·장착 상태(새로고침
  // 시 초기화, 실제 DB 저장 없음). 자세한 설계 의도는 useMockInventory.ts
  // 참고.
  const inventory = useMockInventory()

  const character = characters.find((c) => c.companionType === selected) ?? null
  // PR #48: "지금 뭘 하면 좋을지"를 한 곳에서만 계산한다 — PR #46의
  // goalText를 대체한다. GrowthHUD의 문구와 QuestBanner/말풍선이 서로
  // 다른 소스를 보여주며 어긋나는 일이 없도록 한다.
  const quest = computeActiveQuest({
    profession: character?.profession ?? null,
    professionLabel: character?.profession ? PROFESSION_LABEL[character.profession] : null,
    knowledgeTotal: knowledgeStats.total,
    examPassed,
  })
  const prevExpRef = useRef<number | null>(null)
  const prevLevelRef = useRef<number | null>(null)
  const prevOpenSheetRef = useRef<GameMenuAction | null>(null)
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const levelUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 한 번 보여준 캐릭터는 같은 페이지 방문 동안 다시 안 보여주되, 탭을
  // 왔다갔다 전환해도(누리→두리→누리) 각자 한 번씩은 보장하기 위해
  // Set으로 추적한다(단일 ref 값이면 마지막 캐릭터만 기억해 전환 시
  // 오작동한다).
  const questBubbleShownRef = useRef<Set<CompanionType>>(new Set())
  // 진입 시 한 번 예약되는 "캐릭터가 먼저 말을 거는" 말풍선(900ms 지연)
  // 의 타이머 — 그 전에 사용자가 다른 상호작용(소품 클릭 등)으로 먼저
  // showBubble을 호출하면, 이 지연 타이머가 나중에 그 말풍선을 덮어쓰지
  // 않도록 취소해야 한다(아래 showBubble 참고).
  const questBubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // PR #51(직업 선택 제한 해제): "문제 풀기"를 지원하지 않는 직업(48개)
    // 에서는 getExam이 항상 400을 받게 되므로, 애초에 호출하지 않는다.
    if (character.profession && EXAM_SUPPORTED_PROFESSIONS.has(character.profession)) {
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

  // 행동력(usage)은 캐릭터별이 아니라 계정 전체 하루 한도라, 로그인
  // 시점에 한 번 불러온다.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getUsage()
      .then((u) => {
        if (!cancelled) setUsage(u)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user, getUsage])

  // 가르치기/스스로 공부하기/문제 풀기 패널을 닫으면(방금 그 안에서
  // 행동력을 썼을 수 있으니) 행동력을 다시 불러와 화면에 반영한다.
  useEffect(() => {
    if (prevOpenSheetRef.current && !openSheet) {
      getUsage()
        .then(setUsage)
        .catch(() => {})
    }
    prevOpenSheetRef.current = openSheet
  }, [openSheet, getUsage])

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

  // PR #48 "게임 루프 강화": 캐릭터가 먼저 말을 거는 효과 — 캐릭터를
  // 고를 때마다(또는 처음 들어왔을 때) 한 번만, 지금 추천하는 퀘스트
  // 문구를 말풍선으로 띄운다. examPassed를 아직 못 받아온 상태(로딩 중)
  // 에는 기다렸다가 실제 값이 정해진 뒤에 띄워서 "틀린 추천"이 잠깐
  // 보였다 바뀌는 깜빡임을 막는다.
  useEffect(() => {
    if (!character) return
    if (questBubbleShownRef.current.has(character.companionType)) return
    if (character.profession && examPassed === null) return
    // "이미 보여줬다"는 예약 시점이 아니라 실제로 뜬 시점에 표시한다 —
    // examPassed/quest.text가 서로 다른 타이밍에 차례로 들어오면(시험
    // 결과 먼저, 지식 개수 나중 등) 이 effect가 여러 번 다시 실행되는데,
    // 예약 시점에 바로 "표시함"으로 마크해버리면 재실행 때마다 걸리는
    // 취소(cleanup)만 일어나고 다시 예약은 안 되어 말풍선이 영영 안
    // 뜨는 문제가 있었다(CI에서 재현됨). 매번 최신 quest.text로 다시
    // 예약하고, 실제로 발동할 때만 "표시함"으로 마크한다.
    const companionType = character.companionType
    const text = quest.text
    questBubbleTimeoutRef.current = setTimeout(() => {
      questBubbleTimeoutRef.current = null
      questBubbleShownRef.current.add(companionType)
      showBubble(text)
    }, 900)
    return () => {
      if (questBubbleTimeoutRef.current) {
        clearTimeout(questBubbleTimeoutRef.current)
        questBubbleTimeoutRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.companionType, character?.profession, examPassed, quest.text])

  useEffect(() => {
    return () => {
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current)
      if (levelUpTimeoutRef.current) clearTimeout(levelUpTimeoutRef.current)
      if (turnTransitionTimeoutRef.current) clearTimeout(turnTransitionTimeoutRef.current)
    }
  }, [])

  const showBubble = (text: string) => {
    // 진입 시 예약된 "먼저 말 거는" 말풍선이 아직 안 떴다면, 지금 다른
    // 이유로 말풍선을 띄우는 이 호출이 먼저다 — 나중에 그 지연 타이머가
    // 뒤늦게 발동해 지금 막 띄운 말풍선을 덮어쓰지 않도록 취소한다.
    if (questBubbleTimeoutRef.current) {
      clearTimeout(questBubbleTimeoutRef.current)
      questBubbleTimeoutRef.current = null
    }
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
    // PR #52 요청 2번: 처음 직업을 고르는 순간(이전까지 직업이 없었고,
    // 아직 8~9살 toddler 단계)에만 아동 말투 인사를 보여준다 — 나중에
    // "직업 변경"으로 바꿀 때는 이미 성장한 캐릭터라 이 대사가 어색하다.
    const isFirstPick = !character.profession && ageTier === 'toddler'
    setSavingProfession(true)
    setError(null)
    try {
      await setProfession(character.companionType, profession)
      setPendingChange(null)
      if (isFirstPick) {
        showBubble(toddlerProfessionGreeting(PROFESSION_LABEL[profession]))
      }
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

  // 소품(책상/책 등)을 눌러도 뭔가 반응이 오도록 — 실제 패널을 열지는
  // 않고, 말풍선으로 짧은 반응만 준다(요청 1: 클릭 가능한 소품 인터랙션).
  const handlePropClick = (emoji: string) => {
    showBubble(`${emoji} 오늘도 여기 있네요!`)
  }

  if (!authLoading && !user) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
        <h1 className="text-xl font-bold text-amber-900">AI 키우기</h1>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-8 text-center">
          <p className="text-sm text-amber-700/80">로그인하면 누리·두리를 키울 수 있어요.</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2.5 text-sm font-semibold text-white"
          >
            로그인
          </button>
        </div>
      </div>
    )
  }

  const hasNuri = characters.some((c) => c.companionType === 'nuri')
  const hasDuri = characters.some((c) => c.companionType === 'duri')

  // PR #49 요청 3: 턴 연출 대상 액션(teach/study/quiz)이면 짧게 "진행
  // 중" 화면을 보여준 뒤 패널을 연다. 나머지(chat-log/growth/album)는
  // 즉시 연다 — 기록을 보는 것뿐이라 턴 느낌이 어울리지 않는다. 동작
  // 줄이기 설정에서는 전환 없이 즉시 연다.
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // PR #51(직업 선택 제한 해제): 지금 고른 직업이 회계사·가수일 때만
  // "문제 풀기"를 쓸 수 있다 — GameMenu가 이미 버튼을 막아주지만, 혹시
  // 모를 경우를 대비해 여기서도 한 번 더 막는다(방어적 가드).
  const examSupported = character?.profession ? EXAM_SUPPORTED_PROFESSIONS.has(character.profession) : false
  const handleMenuSelect = (action: GameMenuAction) => {
    // PR #50: 커스터마이징 룸/아이템 마켓은 직업 선택과 무관하게 항상
    // 열 수 있다(GameMenu의 alwaysEnabled와 동일한 예외).
    if (!character?.profession && action !== 'customize' && action !== 'market') return
    if (action === 'quiz' && !examSupported) return
    const label = TURN_TRANSITION_LABEL[action]
    if (!label || reduceMotion) {
      setOpenSheet(action)
      return
    }
    setTurnTransition(action)
    if (turnTransitionTimeoutRef.current) clearTimeout(turnTransitionTimeoutRef.current)
    turnTransitionTimeoutRef.current = setTimeout(() => {
      setTurnTransition(null)
      setOpenSheet(action)
    }, 450)
  }

  const statGauges = character
    ? computeStatGauges({
        level: character.level,
        knowledgeTotal: knowledgeStats.total,
        aiGeneratedTotal: knowledgeStats.aiGenerated,
        messageTotal,
        examPassed,
        profession: character.profession,
      })
    : null
  const tier = character ? appearanceTierForLevel(character.level) : 'rookie'
  // PR #52: 6단계 연령대 — character.level에서 그때그때 계산하는
  // 표시용 파생값(DB 변경 없음, characterAppearance.ts의 tier와 같은 원칙).
  const ageTier = character ? ageTierForLevel(character.level) : 'toddler'
  // PR #52 후속 5차 요청 3번: 티어보다 더 구체적인 "지금 몇 살인지" 숫자
  // 뱃지용 — 역시 character.level에서 그때그때 계산하는 표시용 값이다.
  const ageNumber = character ? ageNumberForLevel(character.level) : 8
  const tendencyLabel = statGauges ? dominantStatLabel(statGauges) : '균형형'

  return (
    <div
      data-testid="grow-page-container"
      // PR #55 긴급 패치: PR #54의 lg:max-w-6xl(1152px)도 여전히 "박스에
      // 갇혀 있다"는 피드백을 받았다 — 더 넓은 캡이 아니라 캡 자체를
      // 완전히 없앤다. 다른 페이지들(HomePage 등, PR #53)이 이미 쓰는
      // lg:max-w-none 패턴과 동일하게 맞춰서, <main>(App.tsx, 자체
      // max-width 없음)이 주는 가로폭을 그대로 다 쓴다. lg부터는 둥근
      // 모서리도 없애 페이지 가장자리까지 꽉 찬 느낌을 유지한다.
      className="mx-auto flex max-w-xl flex-col gap-3 rounded-3xl bg-gradient-to-b from-amber-50 to-orange-50/60 px-3 py-4 sm:px-4 lg:max-w-none lg:rounded-none xl:px-10"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-amber-900">AI 키우기</h1>
        {characters.length > 0 && (
          <div className="flex gap-1 rounded-full bg-amber-100 p-1">
            {characters.map((c) => (
              <button
                key={c.companionType}
                onClick={() => setSelected(c.companionType)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selected === c.companionType ? 'bg-white text-amber-700 shadow-sm' : 'text-amber-500/70'
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
        <div className="flex flex-col gap-2">
          <ResourceBar
            points={character.exp}
            energyRemaining={usage.teachRemaining + usage.studyRemaining}
            energyTotal={usage.teachLimit + usage.studyLimit}
            tendencyLabel={tendencyLabel}
          />

          {/* PR #49: 스테이지+HUD+스탯+퀘스트+메뉴를 하나의 목재
              프레임으로 묶었다 — 더 이상 흰 카드들이 줄줄이 쌓인
              목록이 아니라, 하나의 게임 화면이다.
              PR #54 요청 3번: PC(lg+)에서는 메뉴를 하단이 아니라 옆면
              (오른쪽) 사이드 패널로 옮긴다 — flex-col(모바일, 위아래로
              쌓임)에서 lg:flex-row(옆으로 나란히)로만 바꾸면 DOM 순서가
              그대로 "스테이지 먼저(위/왼쪽) → 메뉴 다음(아래/오른쪽)"을
              유지해, 모바일 레이아웃은 전혀 안 건드리고 PC에서만 메뉴가
              옆으로 옮겨간다.
              PR #55 긴급 패치: "카드 형태를 없애라"는 피드백에 따라
              lg부터는 이 목재 프레임 자체의 둥근 모서리·그림자를 없애서
              — 위 grow-page-container가 이미 가장자리까지 꽉 찬
              상태이므로 — 이 블록이 카드처럼 "떠 있는" 느낌 없이 화면에
              그대로 박혀 있는 듯 보이게 한다. lg:items-stretch로 바꿔
              오른쪽 사이드 패널의 테두리선이 왼쪽 스테이지 높이만큼
              끝까지 이어지게 했다(기존 items-start는 메뉴가 짧으면
              구분선이 중간에서 끊겨 보였다). */}
          <div className="overflow-hidden rounded-3xl bg-amber-950 shadow-lg lg:rounded-none lg:shadow-none">
            <div className="flex flex-col lg:flex-row lg:items-stretch">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="relative">
                  <GameStage
                    companionType={character.companionType}
                    profession={character.profession}
                    pose={pose}
                    bubbleText={bubbleText}
                    onTapCharacter={() => showBubble(character.profession ? '안녕하세요!' : '직업을 골라주세요!')}
                    onPropClick={handlePropClick}
                    tier={tier}
                    ageTier={ageTier}
                    ageNumber={ageNumber}
                    outfitId={inventory.equippedOutfit[character.companionType]}
                    // PR #50 긴급 재작업: 'lobby'도 이제 BACKGROUND_SCENES에서
                    // growthScenes.ts의 실제 일러스트 장면을 그대로 가리키므로
                    // (sceneForProfession의 기본값과 동일), 더 이상 특별 취급이
                    // 필요 없다 — 항상 inventory가 장착한 배경을 그대로 쓴다.
                    backgroundOverride={BACKGROUND_SCENES[inventory.equippedBackground]}
                  />
                  {xpPopup !== null && (
                    <span className="motion-safe:animate-[grow-xp-pop_1.8s_ease-out_forwards] pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-base font-extrabold text-amber-300 drop-shadow">
                      +{xpPopup} XP
                    </span>
                  )}
                  {leveledUpTo !== null && (
                    <span
                      data-testid="level-up-banner"
                      className="motion-safe:animate-[grow-levelup-pop_2.2s_ease-out_forwards] pointer-events-none absolute left-1/2 top-1/2 whitespace-nowrap text-2xl font-extrabold text-amber-300 drop-shadow-lg"
                    >
                      🎉 Lv.{leveledUpTo} 레벨업!
                    </span>
                  )}
                  {turnTransition && <TurnTransition label={TURN_TRANSITION_LABEL[turnTransition] ?? ''} />}
                </div>

                <div className="flex flex-col gap-2 bg-gradient-to-b from-amber-900 to-amber-950 p-3">
                  <GrowthHUD
                    name={COMPANION_LABEL[character.companionType]}
                    stage={character.stage}
                    profession={character.profession}
                    exp={character.exp}
                    recentLine={recentLine}
                    ageStageLabel={AGE_TIER_STAGE_LABEL[ageTier]}
                  />
                  {statGauges && <StatGaugesPanel values={statGauges} />}
                  <QuestBanner text={quest.text} action={quest.action} onAction={handleMenuSelect} />
                </div>
              </div>

              <div className="border-t border-amber-900/40 p-2 pt-2 lg:w-60 lg:shrink-0 lg:border-l lg:border-t-0 lg:p-3">
                <GameMenu disabled={!character.profession} examSupported={examSupported} onSelect={handleMenuSelect} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowProfessionPicker(true)}
              disabled={savingProfession}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50"
            >
              {character.profession ? '직업 변경' : '직업 선택'}
            </button>
          </div>
          {!character.profession && <p className="text-center text-xs text-amber-600/70">직업을 선택하면 게임 메뉴를 쓸 수 있어요.</p>}
        </div>
      )}

      {!loading && (!hasNuri || !hasDuri) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-5">
          <p className="text-sm font-semibold text-amber-900">새 캐릭터 만들기</p>
          <div className="flex gap-3">
            {!hasNuri && (
              <button
                onClick={() => handleCreate('nuri')}
                disabled={creating !== null}
                className="flex-1 rounded-xl border border-amber-200 bg-white py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              >
                {creating === 'nuri' ? '만드는 중...' : '누리 만들기 (남)'}
              </button>
            )}
            {!hasDuri && (
              <button
                onClick={() => handleCreate('duri')}
                disabled={creating !== null}
                className="flex-1 rounded-xl border border-amber-200 bg-white py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              >
                {creating === 'duri' ? '만드는 중...' : '두리 만들기 (여)'}
              </button>
            )}
          </div>
        </div>
      )}

      {showProfessionPicker && character && (
        <ProfessionPicker
          currentProfession={character.profession}
          onClose={() => setShowProfessionPicker(false)}
          onSelect={(id) => {
            setShowProfessionPicker(false)
            if (character.profession === null) {
              void applyProfession(id)
            } else {
              setPendingChange(id)
            }
          }}
        />
      )}

      {pendingChange && character && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-amber-50 p-5 shadow-xl">
            <h2 className="text-base font-bold text-amber-900">직업을 변경할까요?</h2>
            <p className="mt-1.5 text-sm text-amber-700/80">
              {COMPANION_LABEL[character.companionType]}의 직업을{' '}
              <span className="font-semibold text-amber-900">{PROFESSION_LABEL[pendingChange]}</span>
              로 변경해요. 캐릭터 자체는 삭제되지 않아요.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingChange(null)}
                disabled={savingProfession}
                className="rounded-full px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void applyProfession(pendingChange)}
                disabled={savingProfession}
                className="rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:from-amber-600 hover:to-yellow-600 disabled:opacity-50"
              >
                {savingProfession ? '변경 중...' : '변경'}
              </button>
            </div>
          </div>
        </div>
      )}

      {openSheet && character && (character.profession || openSheet === 'customize' || openSheet === 'market') && (
        <BottomSheet
          title={SHEET_TITLE[openSheet]}
          onClose={() => setOpenSheet(null)}
          variant={openSheet === 'teach' || openSheet === 'study' ? 'mission' : 'default'}
        >
          {(openSheet === 'teach' || openSheet === 'study') && character.profession && (
            <InteractionPanel character={character} profession={character.profession} onPoseChange={handlePoseChange} />
          )}
          {openSheet === 'quiz' && character.profession && (
            <ExamPanel character={character} profession={character.profession} onPoseChange={handlePoseChange} />
          )}
          {openSheet === 'chat-log' && <ChatLogPanel character={character} />}
          {openSheet === 'growth' && <RecordsPanel character={character} variant="growth" />}
          {openSheet === 'album' && <RecordsPanel character={character} variant="album" />}
          {openSheet === 'customize' && (
            <CustomizationRoom
              companionType={character.companionType}
              tier={tier}
              ageTier={ageTier}
              inventory={inventory}
              onOpenMarket={() => setOpenSheet('market')}
            />
          )}
          {openSheet === 'market' && <ItemMarket companionType={character.companionType} inventory={inventory} />}
        </BottomSheet>
      )}
    </div>
  )
}
