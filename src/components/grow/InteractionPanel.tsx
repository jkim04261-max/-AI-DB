import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  useGrowth,
  type Character,
  type KnowledgeVerification,
  type KnowledgeEntry,
  type CharacterMessage,
  type StudyDraft,
} from '../../context/GrowthContext'
import { PROFESSION_LABEL, type ProfessionId } from '../../data/characterProfessions'
import { AGE_TIER_LABEL, ageNumberForTier, selfStudyDraftCountForTier, type AgeTier } from '../../data/characterAge'
import { AGE_APPROPRIATE_TOPICS } from '../../data/ageAppropriateTopics'
import { MISSION_TYPES, MISSION_TYPE_LABEL, MISSION_TYPE_ICON, type MissionType, type MissionProgress } from '../../data/characterMissions'
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_CATEGORY_LABEL, KNOWLEDGE_CATEGORY_ICON, type KnowledgeCategory } from '../../data/knowledgeCategories'
import type { AccountTierState } from '../../hooks/useAccountTier'
import type { CharacterPose } from './CharacterSprite'
import ObjectiveQuizStep from './ObjectiveQuizStep'
import FinalExamModal from './FinalExamModal'
import CardMatchGame from '../games/CardMatchGame'
import SequenceOrderGame from '../games/SequenceOrderGame'
import CategorizeGame from '../games/CategorizeGame'

const COMPANION_LABEL: Record<Character['companionType'], string> = { nuri: '누리', duri: '두리' }
const VERIFICATION_LABEL: Record<KnowledgeVerification['status'], string> = {
  appropriate: '적합',
  needs_revision: '수정 필요',
  unverifiable: '검증 불가',
}
// PR #62: 다크 글래스 "미션 창" 배경 위에서도 잘 읽히도록 배지 색을
// 밝은 바탕용(green-100 등)에서 다크 글래스용(green-400/20 등)으로
// 바꿨다 — 상태별 색 구분(초록=적합/호박=수정 필요/빨강=검증 불가)과
// 텍스트 자체는 완전히 동일해서 기존 getByText 셀렉터에 영향 없음.
const VERIFICATION_BADGE_CLASS: Record<KnowledgeVerification['status'], string> = {
  appropriate: 'bg-green-400/20 text-green-200',
  needs_revision: 'bg-amber-400/20 text-amber-200',
  unverifiable: 'bg-rose-400/20 text-rose-200',
}
const SOURCE_LABEL: Record<KnowledgeEntry['source'], string> = {
  user_taught: '직접 가르침',
  ai_generated: '스스로 학습',
}

// 지시서(가르치기 입력 화면 즉각 피드백): AI검증이 "적합"으로 끝났을
// 때 터지는 별 파티클 8개의 목표 위치 — 원 둘레에 고르게 배치한다.
// 컴포넌트 밖에 두어 렌더마다 다시 계산하지 않는다.
const STAR_PARTICLE_OFFSETS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2
  const radius = 56
  return { tx: Math.round(Math.cos(angle) * radius), ty: Math.round(Math.sin(angle) * radius) }
})

interface DialogueLine {
  id: string
  speaker: 'user' | 'character'
  text: string
}

function fromCharacterMessage(msg: CharacterMessage): DialogueLine {
  return { id: String(msg.id), speaker: msg.speaker, text: msg.content }
}

// PR #45 checkpoint 3: 가르치기(사용자 주도)와 스스로 공부하기(캐릭터
// 주도)를 별도 화면/모드로 나누지 않고, 이 패널 하나가 두 흐름을 모두
// 품는다 — 대화 피드(dialogue)와 입력창(composer)이 같은 공간을 공유하고,
// 두 흐름 모두 기존 verify-knowledge/study-generate → 서명된
// verificationToken → save-knowledge 저장 경로를 그대로 재사용한다(PR #44
// 보안 수정 그대로 유지).
export default function InteractionPanel({
  character,
  profession,
  onPoseChange,
  onKnowledgeSaved,
  onTeenJobEventDue,
  usage,
  accountTier,
  onBuyMoreUses,
}: {
  character: Character
  profession: ProfessionId
  onPoseChange?: (pose: CharacterPose) => void
  // 지시서(가르치기 완료 후 자동 식사 이벤트): 지식 저장이 성공할
  // 때마다 호출부(GrowPage)에 알려준다 — 몇 번째 저장인지, 식사
  // 이벤트를 띄울지는 전부 GrowPage가 결정하고, 이 패널은 "저장
  // 성공"이라는 사실만 알려준다.
  onKnowledgeSaved?: () => void
  // 지시서(10대 전용 알바 시스템): teen의 ②카드 맞추기 단계가 끝나는
  // 순간(handleCardGameCleared) 한 번 호출된다 — 기존 "3회 저장마다
  // 식사/알바" 로테이션과 전혀 무관한, 완전히 별도의 트리거다(그
  // 로테이션이 이미 차지한 지점과 겹치지 않도록 일부러 여기서만 쏜다).
  onTeenJobEventDue?: () => void
  // 지시서(한도 소진 시 구매 유도 UI): 계정 전체 하루 한도(GrowPage가
  // 로그인 시점·패널 닫을 때마다 getUsage()로 불러와 두는 값)를 패널이
  // 열릴 때 그대로 물려받는다 — teachRemaining/studyRemaining state의
  // 초기값으로만 쓰이고, 그 이후로는 기존처럼 각 액션(handleTeach/
  // handleSelfStudy) 응답이 최신 값으로 덮어쓴다. 새 fetch를 추가하지
  // 않기 위한 재사용이다.
  usage: { teachRemaining: number; teachLimit: number; studyRemaining: number; studyLimit: number }
  accountTier: AccountTierState
  // "만능마켓에서 구매하기" 버튼 클릭 — 호출부가 만능마켓 시트를 열어준다.
  onBuyMoreUses?: () => void
}) {
  const {
    verifyKnowledge,
    studyGenerate,
    saveKnowledge,
    completeCardGame,
    completeSequenceGame,
    completeCategorizeGame,
    getMissionProgress,
    listKnowledge,
    listMessages,
    tickets,
  } = useGrowth()
  const name = COMPANION_LABEL[character.companionType]
  // PR #52 후속: 지금 연령대에 맞는 예시 주제를 보여줘서, 2~3살/10대
  // 단계에서 너무 어려운 지식만 쓰다가 거절당해 진도가 막히지 않도록
  // 쉬운 쪽으로 자연스럽게 유도한다.
  // PR #63: 더 이상 level에서 다시 계산하지 않고 서버가 내려준 "진짜"
  // 연령대(6미션 게이트로 고정됐을 수 있음)를 그대로 쓴다.
  const characterAgeTier = character.ageTier
  const topicSuggestions = AGE_APPROPRIATE_TOPICS[characterAgeTier]
  // 지시서(AI 추천(예시 만들기) 개수에 대한 명확한 지시): "✨ 예시
  // 만들어주기"를 한 번 누를 때 한꺼번에 생성되는 예시 개수 안내
  // 문구("한 번에 N개의 예시를 만들어줘요")에 쓸 값 — 실제 생성은
  // 항상 서버 응답(studyGenerate의 exampleCount/drafts)이 기준이고,
  // 이 값은 버튼을 누르기 전에 미리 몇 개가 나올지 보여주는 안내용이다.
  const exampleCountForThisCharacter = selfStudyDraftCountForTier(characterAgeTier, ageNumberForTier(characterAgeTier, character.level))
  // PR #65: profession==='custom'일 때는 PROFESSION_LABEL 대신 캐릭터가
  // 실제로 입력한 직업명을 보여준다 — 기존 49개 직업은 1바이트도 안 바뀜.
  const professionLabel = profession === 'custom' ? character.customProfessionLabel ?? PROFESSION_LABEL.custom : PROFESSION_LABEL[profession]

  const poseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (poseTimeoutRef.current) clearTimeout(poseTimeoutRef.current)
      onPoseChange?.('idle')
    }
  }, [onPoseChange])
  const flashPose = (pose: CharacterPose, revertAfterMs?: number) => {
    onPoseChange?.(pose)
    if (poseTimeoutRef.current) clearTimeout(poseTimeoutRef.current)
    if (revertAfterMs) {
      poseTimeoutRef.current = setTimeout(() => onPoseChange?.('idle'), revertAfterMs)
    }
  }

  const [dialogue, setDialogue] = useState<DialogueLine[]>([])
  const pushLine = (speaker: DialogueLine['speaker'], text: string) => {
    setDialogue((prev) => [...prev, { id: crypto.randomUUID(), speaker, text }])
  }

  // PR #45 checkpoint 3.6: the conversation is persisted server-side
  // (character_messages) — load it once when the panel opens, instead of
  // always starting from an empty feed, so a refresh/re-login/reopening
  // the panel shows past exchanges again.
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)
    listMessages(character.companionType, { limit: 100 })
      .then((result) => {
        if (cancelled) return
        setDialogue(result.messages.map(fromCharacterMessage))
      })
      .catch((err) => {
        if (cancelled) return
        setHistoryError(err instanceof Error ? err.message : '대화 기록을 불러오는 중 오류가 발생했어요.')
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [character.companionType, listMessages])

  // PR #63: 지금 연령대의 6개 미션 카드(객관식2·주관식2·노하우2) 진행
  // 상태 — 패널이 열릴 때 한 번 불러오고, 저장이 성공할 때마다 그 응답에
  // 실려 오는 최신 값으로 갱신한다(별도 재조회 없이).
  const [missionProgress, setMissionProgress] = useState<MissionProgress | null>(null)
  // 지시서(긴급 버그 재현 확인 — 8살 문제 유형 전환 오류) 2·3번: 이 호출이
  // 실패하면(네트워크 오류, 인증 만료 등) missionProgress가 영원히
  // null로 남고, toddlerStep 계산(아래, "if (!missionProgress) return
  // 'direct'")이 그걸 "아직 안 불러왔다"가 아니라 "그냥 1번 문제"로
  // 오해해 계속 직접입력 화면만 보여줄 수 있다 — 조용히 삼키지 않고
  // 에러 상태를 남겨 화면에 안내+재시도를 보여준다(아래 mission-progress-
  // error UI). missionProgressRequestId를 올려 재시도 버튼이 같은
  // useEffect를 다시 돌게 한다.
  const [missionProgressError, setMissionProgressError] = useState<string | null>(null)
  const [missionProgressRequestId, setMissionProgressRequestId] = useState(0)
  useEffect(() => {
    let cancelled = false
    setMissionProgressError(null)
    getMissionProgress(character.companionType)
      .then((p) => {
        if (!cancelled) setMissionProgress(p)
      })
      .catch((err) => {
        if (!cancelled) {
          setMissionProgressError(err instanceof Error ? err.message : '성장 미션 정보를 불러오는 중 오류가 발생했어요.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [character.companionType, getMissionProgress, missionProgressRequestId])

  // 지시서(/grow 화면 최신 반영 및 리셋(#151) 동작 점검): "처음부터 다시
  // 키우기"는 FinalExamModal 안에서 일어나는데, 이 missionProgress/
  // records(학습 기록 목록)는 둘 다 패널이 처음 열릴 때 딱 한 번만
  // 불러오고 그 뒤로는 다시 불러오지 않는 로컬 상태라, 리셋 성공 뒤에도
  // 그대로 남아 있었다 — 서버(getMissionProgress/handleListKnowledge)는
  // 이미 reset_at 기준으로 정확히 계산해 주는데, 화면이 그 값을 다시
  // 받아오지 않아 "리셋했는데 그대로 보인다"는 혼동으로 이어졌다.
  // FinalExamModal의 onReset이 이 둘을 함께 새로고침한다.
  const handleFinalExamReset = () => {
    getMissionProgress(character.companionType)
      .then(setMissionProgress)
      .catch(() => {})
    setRecords(null)
    setRecordsTotal(0)
    if (recordsOpen) void loadRecords()
  }

  // 지시서(8세 학습 커리큘럼 순서 강제 고정 및 브라우저 기존 데이터
  // 강제 초기화): 8~9살(toddler) 단계의 8문제를 유형별로 몰아서 묻지
  // 않고, 아래 고정된 순서로 하나씩 섞어서 묻는다 — 1번 직접입력,
  // 2번 직접입력, 3번 카드 맞추기, 4번 객관식, 5번 객관식, 6번
  // 직접입력, 7번 신유형 미니게임(순서 맞추기), 8번 직접입력(합계 8,
  // 유형별 필요 개수: 직접입력(knowhow)4+객관식(objective)2+카드
  // 맞추기1+순서맞추기1 — 사용자 확인: 신유형 미니게임 자리가 7번
  // 하나뿐이라, 분류하기(categorize)는 이번 toddler 커리큘럼에서는
  // 요구 개수 0으로 빼고 코드만 남겨 둔다. 나머지 연령대(teen 이상)는
  // categorize를 쓰지 않으므로 영향 없다). 8문제를 모두 끝내면
  // (complete) 곧바로 진화하지 않고, 그 8문제 내용을 1:1로 복습하는
  // "종합 최종 시험"에 전부 합격해야 teen으로 진화한다(백엔드의
  // toddler→teen 게이트에 finalExamPassed 조건 추가 —
  // api/_lib/characterMissions.ts 참고, 사용자 확인: "8문제 모두 풀고
  // 최종시험 8개 모두 합격해야 10살로 넘어감"). 단계는 서버가 내려준
  // missionProgress(byType별 confirmed/required)에서 그때그때 다시
  // 계산한다 — 클라이언트에 별도로 저장하지 않으므로 새로고침·패널
  // 재오픈 후에도 항상 정확한 단계로 복원된다. 지시서가 말한 "브라우저
  // 캐시 문제"는 실제로는 로컬 저장소 캐시가 아니다(localStorage나
  // Zustand persist로 이 진행도를 저장하는 곳이 코드에 없다 —
  // 사용자 확인) — 계정에 예전 테스트 때 실제로 저장된 지식 기록
  // (character_knowledge_entries)이 남아 있어서 "학습 기록 (10개)"처럼
  // 보인 것이고, 이 순서 로직 자체가 매번 서버 값으로 다시 계산되는
  // 한 새 8문제 커리큘럼 적용에는 영향이 없다.
  const isToddlerStagedFlow = characterAgeTier === 'toddler'
  type ToddlerStep = 'direct' | 'multiple' | 'card_game' | 'sequence_order' | 'categorize' | 'complete'
  const TODDLER_STEP_SEQUENCE: Exclude<ToddlerStep, 'complete'>[] = ['direct', 'direct', 'card_game', 'multiple', 'multiple', 'direct', 'sequence_order', 'direct']
  const TODDLER_STEP_MISSION_TYPE: Record<Exclude<ToddlerStep, 'complete'>, MissionType> = {
    direct: 'knowhow',
    multiple: 'objective',
    card_game: 'card_game',
    sequence_order: 'sequence_order',
    categorize: 'categorize',
  }
  const toddlerStep: ToddlerStep = (() => {
    if (!missionProgress) return 'direct'
    // 지시서(8세 학습 시스템: 8문제 커리큘럼 재구성): 새 유형 추가 전에
    // 만들어진 모의 missionProgress에는 sequence_order/categorize가 아예
    // 없을 수 있다 — required 0(이미 통과)으로 안전하게 처리한다(위 진행
    // 칩 렌더링과 같은 이유).
    const fallback = { confirmed: 0, required: 0 }
    const occurrenceSoFar: Partial<Record<MissionType, number>> = {}
    for (const step of TODDLER_STEP_SEQUENCE) {
      const missionType = TODDLER_STEP_MISSION_TYPE[step]
      const occurrence = (occurrenceSoFar[missionType] ?? 0) + 1
      occurrenceSoFar[missionType] = occurrence
      const progress = missionProgress.byType[missionType] ?? fallback
      // 이 유형의 실제 요구치(required)를 이미 넘어선 자리라면(옛
      // 모의 데이터처럼 required가 0이거나 고정 순서보다 작은 경우)
      // 더 채울 수 없는 자리이므로 건너뛴다 — required만큼만 채우면
      // 끝나고, 그 이상은 절대 "아직 안 끝남"으로 보지 않는다.
      if (occurrence > progress.required) continue
      if (occurrence > progress.confirmed) return step
    }
    return 'complete'
  })()
  const isToddlerDirectStep = isToddlerStagedFlow && toddlerStep === 'direct'
  // 순서 고정으로 "①②③단계" 식 그룹 라벨이 더 이상 맞지 않으므로,
  // 지금이 8문제 중 몇 번째인지(1~8)를 confirmedTotal로 직접
  // 계산한다 — 객관식은 세트(2문제)를 한 번에 제출하므로 두 번째
  // 자리까지 함께 가리킨다.
  const toddlerQuestionNumber = Math.min((missionProgress?.confirmedTotal ?? 0) + 1, 8)

  // 지시서(누리AI 10대 성장 커리큘럼 개선 및 학습 기능 복구): teen(10대)
  // 10문제를 toddler와 똑같은 "고정 위치 순서 + 유형별 발생 횟수" 알고리즘
  // 으로 다시 섞는다 — "①~③직접입력(역사·목적·자격) → ④카드맞추기 →
  // ⑤~⑥객관식(전문지식·실무판단 세트) → ⑦직접입력(노하우) → ⑧순서맞추기
  // → ⑨분류하기 → ⑩직접입력(핵심지식)"(합계 10, characterAge.ts의 teen
  // override와 동일). toddlerStep과 완전히 같은 이유로(토글 상태를
  // 따로 저장하지 않음) 새로고침·재로그인 후에도 missionProgress만으로
  // 항상 정확한 단계로 복원된다.
  const isTeenStagedFlow = characterAgeTier === 'teen'
  type TeenStep = 'direct' | 'multiple' | 'card_game' | 'sequence_order' | 'categorize' | 'complete'
  const TEEN_STEP_SEQUENCE: Exclude<TeenStep, 'complete'>[] = [
    'direct',
    'direct',
    'direct',
    'card_game',
    'multiple',
    'multiple',
    'direct',
    'sequence_order',
    'categorize',
    'direct',
  ]
  const TEEN_STEP_MISSION_TYPE: Record<Exclude<TeenStep, 'complete'>, MissionType> = {
    direct: 'knowhow',
    multiple: 'objective',
    card_game: 'card_game',
    sequence_order: 'sequence_order',
    categorize: 'categorize',
  }
  const teenStep: TeenStep = (() => {
    if (!missionProgress) return 'direct'
    const fallback = { confirmed: 0, required: 0 }
    const occurrenceSoFar: Partial<Record<MissionType, number>> = {}
    for (const step of TEEN_STEP_SEQUENCE) {
      const missionType = TEEN_STEP_MISSION_TYPE[step]
      const occurrence = (occurrenceSoFar[missionType] ?? 0) + 1
      occurrenceSoFar[missionType] = occurrence
      const progress = missionProgress.byType[missionType] ?? fallback
      if (occurrence > progress.required) continue
      if (occurrence > progress.confirmed) return step
    }
    return 'complete'
  })()
  const isTeenDirectStep = isTeenStagedFlow && teenStep === 'direct'
  // 직접입력 단계(①②③⑦⑩)마다 주제가 다르므로(역사→목적→자격→노하우→
  // 핵심지식), 지금이 knowhow의 몇 번째 확정인지(1~5)로 그 주제를
  // 고른다 — TEEN_STEP_SEQUENCE에서 knowhow가 등장하는 순서와 정확히
  // 같은 순서다.
  const TEEN_DIRECT_TOPIC_LABELS = ['직업의 역사', '직업의 목적', '필요한 능력과 자격', '실무 경험과 노하우', '직업 핵심 지식']
  const teenDirectTopicIndex = Math.min(Math.max((missionProgress?.byType.knowhow.confirmed ?? 0), 0), TEEN_DIRECT_TOPIC_LABELS.length - 1)
  const teenDirectTopicLabel = TEEN_DIRECT_TOPIC_LABELS[teenDirectTopicIndex]
  // toddlerQuestionNumber와 같은 원리 — 지금이 10문제 중 몇 번째인지.
  const teenQuestionNumber = Math.min((missionProgress?.confirmedTotal ?? 0) + 1, 10)
  // 선택지에서 고르기(칩)/직접 입력하기 카드를 보여줄지 — toddler는
  // 직접입력 하위 단계(①)에서만, teen은 직접입력 하위 단계(①·③·⑤)
  // 에서만.
  // 지시서(긴급 버그 재현 확인 — 8살 문제 유형 전환 오류) 3번: toddler/
  // teen 고정 순서 흐름은 missionProgress가 있어야만 몇 번째 문제인지
  // 알 수 있다 — 그게 에러로 끝내 못 불러와졌는데도(missionProgressError
  // && !missionProgress) 기본값 'direct'로 조용히 1번 문제처럼 보여주면
  // 안 된다(위 mission-progress-error 안내로 대체). 로딩 중(에러 없이
  // missionProgress가 아직 null인 순간)에는 기존처럼 'direct' 기본값을
  // 그대로 쓴다.
  const missionProgressBlockedByError = (isToddlerStagedFlow || isTeenStagedFlow) && missionProgressError !== null && !missionProgress
  const showDirectInputCards =
    !missionProgressBlockedByError && (!isToddlerStagedFlow || isToddlerDirectStep) && (!isTeenStagedFlow || isTeenDirectStep)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // 지금 입력칸을 채운 경로 — ① 선택지 칩=objective ② AI 추천=subjective
  // ③ 직접 타이핑=knowhow. 저장할 때 이 값을 그대로 서버에 보내 어느
  // 미션 슬롯을 채우는지 알려준다(한 번 정해지면, 저장/초기화 전까지는
  // 이어서 수정해도 바뀌지 않는다 — 예시를 고치는 것과 처음부터 직접
  // 쓰는 것을 구분하기 위해).
  const [missionType, setMissionType] = useState<MissionType | null>(null)
  const markManualEdit = () => setMissionType((prev) => prev ?? 'knowhow')
  // PR #65: 지식 카드 10종 분류(선택값) — missionType(입력 방식)과는
  // 독립된 축이라 별도 state로 관리한다. 안 골라도 저장은 그대로 된다.
  const [knowledgeCategory, setKnowledgeCategory] = useState<KnowledgeCategory | null>(null)
  // 가르치기와 스스로 공부하기 중 어느 쪽이 지금 진행 중인지 — 두 액션은
  // 동시에 실행되지 않도록 서로를 막는다(버튼 disabled 공유).
  const [busyAction, setBusyAction] = useState<'teach' | 'study' | null>(null)
  // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 카드 맞추기 완료 처리
  // (completeCardGame → saveKnowledge) 진행 중 중복 호출을 막는다.
  const [cardGameBusy, setCardGameBusy] = useState(false)
  const [cardGameError, setCardGameError] = useState<string | null>(null)
  // 지시서(8세 학습 총 8문제 제한 및 10대 강제 레벨업 로직 수정): 8문제를
  // 모두 마친 toddler가 "종합 최종 시험 보기"를 누르면 연다.
  const [finalExamOpen, setFinalExamOpen] = useState(false)
  const [sequenceGameBusy, setSequenceGameBusy] = useState(false)
  const [sequenceGameError, setSequenceGameError] = useState<string | null>(null)
  const [categorizeGameBusy, setCategorizeGameBusy] = useState(false)
  const [categorizeGameError, setCategorizeGameError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [verification, setVerification] = useState<KnowledgeVerification | null>(null)
  // The exact title/content that `verification` above was computed from —
  // editing either field after a result invalidates it (cleared below), so
  // "저장" can only ever save content that was actually just verified.
  const [verifiedSnapshot, setVerifiedSnapshot] = useState<{ title: string; content: string } | null>(null)
  // The signed token the server returned for verifiedSnapshot — this is
  // what actually authorizes saving (and tells the server whether this was
  // user_taught or ai_generated), not the `verification` object above
  // (display only).
  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  // PR #52: 내용은 적합해도 캐릭터가 아직 어려서 막힌 경우 — 저장 버튼을
  // 숨기고, 몇 살이 되면 다시 가르칠 수 있는지 안내한다.
  const [ageBlocked, setAgeBlocked] = useState(false)
  const [requiredAgeTier, setRequiredAgeTier] = useState<AgeTier | null>(null)
  // 지시서(한도 소진 시 구매 유도 UI): 패널이 열리는 순간부터 소진
  // 여부를 바로 판단할 수 있어야(한 번 실패해 봐야 아는 게 아니라) 해서,
  // GrowPage가 이미 들고 있는 계정 전체 하루 한도(usage prop)로 초깃값을
  // 채운다 — 이후에는 기존처럼 각 액션 응답이 최신 값으로 덮어쓴다.
  const [teachRemaining, setTeachRemaining] = useState<{ remaining: number; limit: number } | null>(
    usage.teachLimit > 0 ? { remaining: usage.teachRemaining, limit: usage.teachLimit } : null,
  )
  const [studyRemaining, setStudyRemaining] = useState<{ remaining: number; limit: number } | null>(
    usage.studyLimit > 0 ? { remaining: usage.studyRemaining, limit: usage.studyLimit } : null,
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [recordsOpen, setRecordsOpen] = useState(false)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [records, setRecords] = useState<KnowledgeEntry[] | null>(null)
  const [recordsTotal, setRecordsTotal] = useState(0)
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null)

  // 지시서(가르치기 입력 화면 즉각 피드백): 타이핑마다 nodCount를
  // 올려서 끄덕이는 아이콘을 매번 새로 마운트시키고(React key로
  // 애니메이션 재시작), AI검증이 "적합"으로 끝날 때마다 celebrateCount를
  // 올려 별 파티치 묶음을 새로 마운트한다. 둘 다 순수 시각 효과일 뿐,
  // 기존 검증·저장·스탯/경제 로직에는 전혀 관여하지 않는다.
  const [nodCount, setNodCount] = useState(0)
  const [celebrateCount, setCelebrateCount] = useState(0)
  // 지시서(AI 추천(예시 만들기) 개수에 대한 명확한 지시): "✨ 예시
  // 만들어주기" 한 번 클릭이 돌려준, 아직 아무것도 고르지 않은 후보
  // 목록 — null이면 고를 후보가 없는 상태(평소, 또는 이미 하나를
  // 고른 뒤)다. 사용자가 이 중 하나를 고르면 handlePickStudyDraft가
  // title/content/verification 등 기존 단일 흐름 state로 그대로
  // 옮겨 담고 이 배열을 비운다 — 아래 verification/저장 UI는 전혀
  // 바뀌지 않는다.
  const [studyDrafts, setStudyDrafts] = useState<StudyDraft[] | null>(null)

  const isStale = verification !== null && (verifiedSnapshot?.title !== title || verifiedSnapshot?.content !== content)

  const handleTeach = async () => {
    if (!title.trim() || !content.trim()) return
    setBusyAction('teach')
    setActionError(null)
    flashPose('studying')
    pushLine('user', `${title}\n${content}`)
    try {
      const result = await verifyKnowledge(character.companionType, title, content)
      setVerification(result.verification)
      setVerifiedSnapshot({ title, content })
      setVerificationToken(result.verificationToken)
      setTeachRemaining({ remaining: result.remaining, limit: result.dailyTeachLimit })
      setAgeBlocked(result.ageBlocked)
      setRequiredAgeTier(result.requiredAgeTier)
      // characterReply is server-generated and already persisted
      // server-side (character_messages) — display exactly that text, not
      // a locally invented one.
      pushLine('character', result.characterReply)
      const succeeded = result.verification.status === 'appropriate' && !result.ageBlocked
      flashPose(succeeded ? 'happy' : 'sad', 2500)
      if (succeeded) setCelebrateCount((c) => c + 1)
    } catch (err) {
      setVerification(null)
      setVerifiedSnapshot(null)
      setVerificationToken(null)
      setActionError(err instanceof Error ? err.message : '지식을 검증하는 중 오류가 발생했어요.')
      flashPose('sad', 2500)
    } finally {
      setBusyAction(null)
    }
  }

  const handleSelfStudy = async () => {
    setBusyAction('study')
    setActionError(null)
    setStudyDrafts(null)
    flashPose('studying')
    try {
      const result = await studyGenerate(character.companionType)
      setStudyDrafts(result.drafts)
      setStudyRemaining({ remaining: result.remaining, limit: result.dailyStudyLimit })
      pushLine('character', result.characterReply)
      flashPose('happy', 2500)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '스스로 공부하는 중 오류가 발생했어요.')
      flashPose('sad', 2500)
    } finally {
      setBusyAction(null)
    }
  }

  // 지시서(AI 추천(예시 만들기) 개수에 대한 명확한 지시): studyDrafts
  // 중 하나를 고르면 — 그동안 study-generate가 "자동으로" 채워주던
  // title/content/verification/verificationToken/ageBlocked을 그대로
  // 옮겨 담는다. 이 아래부터는 기존 handleSave/저장 버튼/검증 결과
  // 표시가 전혀 바뀌지 않고 그대로 이어진다 — 나이 게이트로 막혔거나
  // 적합 판정을 받은 순간의 반응(별 파티클/표정)도 "생성 시점"이 아니라
  // 이 "고른 시점"으로 옮겨왔을 뿐, 조건은 동일하다.
  const handlePickStudyDraft = (draft: StudyDraft) => {
    setTitle(draft.knowledge.title)
    setContent(draft.knowledge.content)
    // 지시서(긴급 버그 수정 — 8세 학습 미션 진행 횟수 불일치): toddler/
    // teen의 고정 순서 커리큘럼(PR #130/#150/#118)은 더 이상 'subjective'
    // 유형을 쓰지 않는다(MISSIONS_REQUIRED_PER_TYPE_OVERRIDE에서 둘 다
    // required:0) — 그런데 이 카드는 항상 'subjective'로 태깅해서
    // 저장했으므로, "스스로 공부하기"로 저장한 지식은 학습 기록에는
    // 남지만(원인: required:0이라 complete가 항상 true로 계산되어
    // byType 집계에는 안 잡힘) 8문제/10단계 진행도에는 전혀 반영되지
    // 않았다 — "학습 기록 4개인데 confirmedTotal은 1"의 실제 원인.
    // 이 카드는 toddler/teen 둘 다 "직접 입력하기" 단계(①)에서만 보이므로
    // (showDirectInputCards와 같은 자리), 그 단계가 실제로 쓰는 유형과
    // 똑같이 태깅한다 — handleSave의 기존 기본값(knowhow) 규칙과 동일.
    setMissionType(isToddlerDirectStep || isTeenDirectStep ? 'knowhow' : 'subjective')
    setVerification(draft.verification)
    setVerifiedSnapshot({ title: draft.knowledge.title, content: draft.knowledge.content })
    setVerificationToken(draft.verificationToken)
    setAgeBlocked(draft.ageBlocked)
    setRequiredAgeTier(draft.requiredAgeTier)
    setStudyDrafts(null)
    const succeeded = draft.verification.status === 'appropriate' && !draft.ageBlocked
    flashPose(succeeded ? 'happy' : 'sad', 2500)
    if (succeeded) setCelebrateCount((c) => c + 1)
  }

  const handleApplySuggestion = () => {
    if (!verification?.suggestion) return
    setContent(verification.suggestion)
    // The content no longer matches what was verified — isStale now
    // implicitly becomes true, so saving requires re-verifying first.
  }

  // PR #52 후속: 거절(ageBlocked) 직후에도 쉬운 예시를 바로 고를 수 있게
  // — 입력칸을 통째로 비우고 다시 검증 전 상태로 되돌려서 새로
  // 가르치기를 시작한 것처럼 만든다.
  //
  // 지시서(선택예시하기(3개) 버튼 복구): toddler(8~9살) 1단계(direct)에서
  // 이 예시 칩을 쓸 때는 이 단계가 채우는 미션이 knowhow(직접 입력)이지
  // objective(선택지에서 고르기)가 아니다 — 그래서 여기서만 'knowhow'로
  // 태깅해 미션 진행도가 올바른 유형에 쌓이게 한다. teen 이후의 자유
  // 선택 3카드 UI에서는 이 칩이 그대로 ①번 카드(선택지 고르기)이므로
  // 기존 동작(objective)을 그대로 유지한다.
  //
  // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): teen의 직접입력
  // 단계(①·③·⑤)에서도 같은 이유로 이 칩이 knowhow를 채운다 — teen의
  // ④(객관식)는 이 칩이 아니라 ObjectiveQuizStep 전용 컴포넌트로 따로
  // 채워지므로 섞이지 않는다.
  const applyTopicSuggestion = (topic: { title: string; content: string }) => {
    setTitle(topic.title)
    setContent(topic.content)
    setMissionType(isToddlerDirectStep || isTeenDirectStep ? 'knowhow' : 'objective')
    setVerification(null)
    setVerifiedSnapshot(null)
    setVerificationToken(null)
    setAgeBlocked(false)
    setRequiredAgeTier(null)
  }

  const handleSave = async () => {
    if (!verification || isStale || verification.status !== 'appropriate' || ageBlocked || !verifiedSnapshot || !verificationToken) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveKnowledge(
        character.companionType,
        title,
        verifiedSnapshot.content,
        content,
        verificationToken,
        missionType ?? undefined,
        knowledgeCategory ?? undefined,
      )
      pushLine('character', result.savedReply)
      if (result.missionProgress) setMissionProgress(result.missionProgress)
      onKnowledgeSaved?.()
      setTitle('')
      setContent('')
      setMissionType(null)
      setKnowledgeCategory(null)
      setVerification(null)
      setVerifiedSnapshot(null)
      setVerificationToken(null)
      setAgeBlocked(false)
      setRequiredAgeTier(null)
      if (recordsOpen) {
        await loadRecords()
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '학습 기록을 저장하는 중 오류가 발생했어요.')
    } finally {
      setSaving(false)
    }
  }

  // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): CardMatchGame이 1세트
  // 클리어되면 onCleared로 이 핸들러가 불린다 — complete-card-game으로
  // 서명된 토큰을 받아 곧바로 기존 saveKnowledge(missionType='card_game')
  // 에 넘긴다(검증할 사용자 입력이 없으니 "AI검증하기" 단계 없이 한
  // 번에 저장까지 끝낸다). 지시서(8~9세 문제 유형 변경): toddler(8~9살)
  // 도 이제 같은 카드 맞추기 미션을 쓰지만, 10대 알바 이벤트
  // (onTeenJobEventDue, PR #122)는 teen 전용이다 — isTeenStagedFlow로
  // 가드하지 않으면 8~9살 캐릭터가 카드를 맞췄을 뿐인데 알바 이벤트가
  // 잘못 뜬다.
  const handleCardGameCleared = async () => {
    if (cardGameBusy) return
    setCardGameBusy(true)
    setCardGameError(null)
    try {
      const completion = await completeCardGame(character.companionType)
      const saveResult = await saveKnowledge(
        character.companionType,
        completion.knowledge.title,
        completion.knowledge.content,
        completion.knowledge.content,
        completion.verificationToken,
        'card_game',
      )
      pushLine('character', saveResult.savedReply)
      if (saveResult.missionProgress) setMissionProgress(saveResult.missionProgress)
      onKnowledgeSaved?.()
      flashPose('happy', 2500)
      // 지시서(8세 학습 시스템: 8문제 커리큘럼 재구성): 카드 맞추기는
      // 이제 toddler(3단계)에서도 쓰인다 — 알바 이벤트(onTeenJobEventDue)
      // 는 teen 전용 보상이므로, 거기서 넘어온 클리어일 때만 부른다.
      if (isTeenStagedFlow) onTeenJobEventDue?.()
    } catch (err) {
      setCardGameError(err instanceof Error ? err.message : '카드 맞추기 완료를 처리하는 중 오류가 발생했어요.')
    } finally {
      setCardGameBusy(false)
    }
  }

  // 지시서(8세 학습 시스템: 8문제 커리큘럼 재구성): 순서 맞추기/분류하기도
  // handleCardGameCleared와 완전히 같은 모양 — toddler 4·5단계 전용이라
  // onTeenJobEventDue는 아예 부르지 않는다.
  const handleSequenceGameCleared = async () => {
    if (sequenceGameBusy) return
    setSequenceGameBusy(true)
    setSequenceGameError(null)
    try {
      const completion = await completeSequenceGame(character.companionType)
      const saveResult = await saveKnowledge(
        character.companionType,
        completion.knowledge.title,
        completion.knowledge.content,
        completion.knowledge.content,
        completion.verificationToken,
        'sequence_order',
      )
      pushLine('character', saveResult.savedReply)
      if (saveResult.missionProgress) setMissionProgress(saveResult.missionProgress)
      onKnowledgeSaved?.()
      flashPose('happy', 2500)
    } catch (err) {
      setSequenceGameError(err instanceof Error ? err.message : '순서 맞추기 완료를 처리하는 중 오류가 발생했어요.')
    } finally {
      setSequenceGameBusy(false)
    }
  }

  const handleCategorizeGameCleared = async () => {
    if (categorizeGameBusy) return
    setCategorizeGameBusy(true)
    setCategorizeGameError(null)
    try {
      const completion = await completeCategorizeGame(character.companionType)
      const saveResult = await saveKnowledge(
        character.companionType,
        completion.knowledge.title,
        completion.knowledge.content,
        completion.knowledge.content,
        completion.verificationToken,
        'categorize',
      )
      pushLine('character', saveResult.savedReply)
      if (saveResult.missionProgress) setMissionProgress(saveResult.missionProgress)
      onKnowledgeSaved?.()
      flashPose('happy', 2500)
    } catch (err) {
      setCategorizeGameError(err instanceof Error ? err.message : '분류하기 완료를 처리하는 중 오류가 발생했어요.')
    } finally {
      setCategorizeGameBusy(false)
    }
  }

  const loadRecords = async () => {
    setRecordsLoading(true)
    setRecordsError(null)
    try {
      const result = await listKnowledge(character.companionType, { limit: 20 })
      setRecords(result.entries)
      setRecordsTotal(result.total)
    } catch (err) {
      setRecordsError(err instanceof Error ? err.message : '학습 기록을 불러오는 중 오류가 발생했어요.')
    } finally {
      setRecordsLoading(false)
    }
  }

  const handleToggleRecords = () => {
    const next = !recordsOpen
    setRecordsOpen(next)
    if (next && records === null) {
      void loadRecords()
    }
  }

  const busy = busyAction !== null

  // 지시서(한도 소진 시 구매 유도 UI): "무제한" 여부는 숫자(count)보다
  // userTier/isUnlimited...를 먼저 확인하는 방어 코드 — 프리미엄
  // 등급이면 남은 횟수가 0이어도 소진된 게 아니다. 지금은 구독이 없어
  // 항상 false/'basic'이지만, 나중에 실제 구독이 붙어도 이 두 플래그만
  // 보면 되도록 미리 이렇게 짜 둔다.
  const hasUnlimitedRecommend = accountTier.isUnlimitedRecommend || accountTier.userTier === 'premium'
  const hasUnlimitedValidation = accountTier.isUnlimitedValidation || accountTier.userTier === 'premium'
  // 지시서(만능마켓 구매 즉시 이용권 실시간 연동): 하루 무료 횟수가
  // 바닥났어도 구매한 이용권(tickets)이 남아있으면 아직 "진짜" 소진이
  // 아니다 — 버튼은 둘 다 0일 때만 막는다(서버 handleGenerateStudy/
  // handleVerifyKnowledge도 정확히 같은 순서로 판단한다).
  const recommendExhausted =
    !hasUnlimitedRecommend && studyRemaining !== null && studyRemaining.remaining <= 0 && tickets.aiRecommendTickets <= 0
  const validationExhausted =
    !hasUnlimitedValidation && teachRemaining !== null && teachRemaining.remaining <= 0 && tickets.knowledgeValidationTickets <= 0

  // PR #62 요청 1~2번: 화면 전체를 "게임 속 미션 창" 톤(다크 글래스 +
  // 청록 홀로그램)으로 바꾸고, 입력 방식을 3개의 또렷이 구분된 미션
  // 카드(① 선택지 고르기 ② AI 추천 받기 ③ 직접 입력)로 재배치한다.
  // 중요: 아래는 순수 레이아웃/색상 변경이다 — 어떤 버튼의 텍스트·
  // data-testid·활성화 조건도 바꾸지 않았다(기존 e2e가 패널을 열자마자
  // 입력칸을 바로 채우는 흐름을 그대로 쓰기 때문에, 입력칸을 "직접
  // 입력" 카드 뒤에 숨기는 토글 방식은 쓰지 않았다 — 항상 함께
  // 렌더링되고, 카드 구분은 순전히 시각적 그룹핑이다).
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-cyan-400/20 bg-slate-950/40 p-4 sm:p-6">
      <p className="text-base font-bold text-cyan-200/80 sm:text-lg">
        {name} · {professionLabel}와 상호작용하기
      </p>

      {/* 지시서(긴급 버그 재현 확인 — 8살 문제 유형 전환 오류) 2·3번: 성장
          미션 진행도를 못 불러왔으면, 그걸 숨기고 조용히 1번(직접입력)
          문제로 보여주지 않는다 — 실패를 명시하고 재시도를 준다. */}
      {missionProgressError && !missionProgress && (
        <div
          data-testid="mission-progress-error"
          className="flex flex-col gap-2 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3.5"
        >
          <p className="text-base font-bold text-rose-300">{missionProgressError}</p>
          <button
            type="button"
            data-testid="mission-progress-retry-button"
            onClick={() => setMissionProgressRequestId((n) => n + 1)}
            className="self-start rounded-xl border border-rose-300/50 bg-rose-500/20 px-4 py-2 text-sm font-bold text-rose-100 hover:bg-rose-500/30"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* PR #63, 지시서(연령대별 스테이지 볼륨업): 카드형 미션 진행
          현황 — 유형별(객관식/주관식/노하우)로 고르게 확정해야 다음
          연령대로 진화한다. 연령대별 필요 개수(6/10/20/30/40/50)는
          서버(MissionProgress.requiredTotal 등)가 내려주므로 이
          컴포넌트는 그 값을 그대로 보여줄 뿐이다. */}
      {missionProgress && (
        <div
          className="flex flex-col gap-2 rounded-2xl border border-indigo-400/20 bg-indigo-400/5 p-3.5"
          data-testid="mission-progress-summary"
        >
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-indigo-200">
              {missionProgress.ageTierLabel} 성장 미션 ({missionProgress.confirmedTotal}/{missionProgress.requiredTotal})
            </p>
            {missionProgress.allConfirmed && missionProgress.nextAgeTierLabel && (
              <span className="text-sm font-bold text-emerald-300">
                레벨만 채우면 {missionProgress.nextAgeTierLabel}로 진화해요!
              </span>
            )}
            {/* master_50s(50~60대)는 다음 연령대가 없으므로, 여기서
                allConfirmed가 되는 순간이 곧 "60대 최종 마스터 시험"
                통과다 — 별도 DB 플래그 없이 기존 미션 집계만으로 판정. */}
            {missionProgress.allConfirmed && missionProgress.ageTier === 'master_50s' && (
              <span data-testid="master-exam-passed" className="text-sm font-bold text-amber-300">
                🏆 최종 마스터 시험을 통과했어요!
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MISSION_TYPES.map((type) => {
              // 지시서(8세 학습 시스템: 8문제 커리큘럼 재구성): 새
              // 유형(sequence_order/categorize) 추가 전에 만들어진 모의
              // missionProgress(e2e 테스트 등)는 이 필드가 아예 없을 수
              // 있다 — required 0(이미 통과한 것으로 취급)으로 안전하게
              // 처리해 전체 화면이 깨지지 않도록 한다.
              const p = missionProgress.byType[type] ?? { type, confirmed: 0, required: 0, complete: true }
              return (
                <span
                  key={type}
                  data-testid={`mission-progress-${type}`}
                  className={`rounded-full px-2.5 py-1 text-sm font-bold ${
                    p.complete ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-indigo-200'
                  }`}
                >
                  {MISSION_TYPE_ICON[type]} {MISSION_TYPE_LABEL[type]} {p.confirmed}/{p.required}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {historyLoading && <p className="text-base font-semibold text-cyan-200/60">대화 기록을 불러오는 중...</p>}
      {historyError && <p className="text-base font-semibold text-rose-300">{historyError}</p>}

      {dialogue.length > 0 && (
        <div className="flex max-h-72 flex-col gap-2.5 overflow-y-auto rounded-xl bg-slate-900/50 p-4">
          {dialogue.map((line) => (
            <div key={line.id} className={`flex ${line.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-base font-medium ${
                  line.speaker === 'user' ? 'bg-cyan-600 text-white' : 'bg-slate-800/80 text-slate-100 shadow-sm'
                }`}
              >
                {line.speaker === 'character' && <span className="mr-1 font-extrabold">{name}:</span>}
                {line.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 미션 ① 선택지에서 고르기(= "선택예시하기(3개)") — 8~9살 눈높이에서
          제일 쉬운, 터치 한 번으로 끝나는 입력 방식. 입력칸이 비어 있을
          때만 보여주는 기존 조건은 그대로 유지했다.
          지시서(선택예시하기(3개) 버튼 복구): 학습 플로우 전면 개편(PR
          #108)에서 toddler(8~9살) 전체 구간을 이 카드에서 제외했는데,
          실제로는 1단계(direct, 직접 입력 카드)와 똑같이 "문제 예시를 볼
          데가 없다"는 사용자 불편으로 이어졌다 — 그 직접 입력 카드(아래
          ③)와 정확히 같은 조건(showDirectInputCards)으로 되돌려,
          1단계에서만 다시 보이게 한다(2·3단계의 전용 컴포넌트는 그대로
          둔다). 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): teen도
          같은 조건에 합류해, 직접입력 하위 단계(①·③·⑤)에서만 보인다. */}
      {showDirectInputCards && !title.trim() && !content.trim() && topicSuggestions.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-4 shadow-[0_0_14px_rgba(34,211,238,0.08)]">
          <p className="text-lg font-extrabold text-cyan-200 sm:text-xl">🎯 선택지에서 고르기</p>
          <p className="text-sm font-semibold text-cyan-200/70 sm:text-base">
            지금 {AGE_TIER_LABEL[characterAgeTier]} 단계에 맞는 예시예요 — 눌러서 채운 뒤 자유롭게 고쳐도 돼요.
          </p>
          <div className="flex flex-wrap gap-2">
            {topicSuggestions.map((topic) => (
              <button
                key={topic.title}
                type="button"
                data-testid="topic-suggestion-chip"
                onClick={() => applyTopicSuggestion(topic)}
                className="rounded-full border-2 border-cyan-400/50 bg-gradient-to-b from-cyan-400/20 to-cyan-500/10 px-4 py-2 text-base font-bold text-cyan-100 shadow-[0_2px_0_rgba(34,211,238,0.3)] transition hover:scale-[1.04] hover:border-cyan-300 hover:from-cyan-400/30 hover:to-cyan-500/20 active:scale-95"
              >
                {topic.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 미션 ② AI 추천 받기 — 버튼 하나로 예시를 받아오되, 저장(완료
          처리)은 반드시 아래 "저장" 버튼을 눌러야만 일어난다(자동 완료
          금지, PR #62 요청 2번). 지시서: 버튼 문구를 "{name} 스스로
          공부하기"에서 "✨ 예시 만들어주기"로 바꾸고, 버튼 스타일도 더
          차분한 톤으로 바꿨다 — 기능(disabled 조건, handleSelfStudy
          호출)은 그대로다.
          지시서(8세 학습 창 AI 추천 버튼 복구): toddler(8~9살)는 1단계
          (direct, 직접 입력 카드와 같은 자리)에서만 다시 보이게
          한다 — 2단계(객관식)·3단계(미니게임)는 그대로 숨긴다.
          지시서(누리AI 10대 성장 커리큘럼 개선 및 학습 기능 복구): teen
          도 직접입력 단계(①②③⑦⑩)에서는 이 카드를 다시 보여준다 —
          showDirectInputCards와 정확히 같은 자리다. handlePickStudyDraft
          (PR #154)가 toddler/teen 직접입력 단계에서는 knowhow로
          태깅하므로, 이 카드로 저장해도 8/10문제 진행도에 정확히
          반영된다. */}
      {showDirectInputCards && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-purple-400/25 bg-purple-400/5 p-4 shadow-[0_0_14px_rgba(192,132,252,0.08)]">
          <p className="text-lg font-extrabold text-purple-200 sm:text-xl">✨ AI 추천 받기</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSelfStudy()}
              disabled={busy || recommendExhausted || studyDrafts !== null}
              className="flex w-full items-center justify-center gap-2 self-start rounded-xl border border-indigo-500/40 bg-indigo-600/30 px-4 py-2.5 text-sm font-bold text-indigo-200 transition-all hover:bg-indigo-600/50 disabled:opacity-50 sm:w-auto"
            >
              {busyAction === 'study' ? '예시 만드는 중...' : '✨ 예시 만들어주기'}
            </button>
            {/* 지시서(한도 소진 시 구매 유도 UI): 무료 횟수(studyRemaining)와
                구매한 이용권(tickets.aiRecommendTickets)이 둘 다 0이 되면
                버튼을 비활성화하고 그 옆에 구매 버튼을 노출한다. */}
            {recommendExhausted && (
              <button
                type="button"
                data-testid="buy-recommend-uses-button"
                onClick={() => onBuyMoreUses?.()}
                className="flex w-full items-center justify-center gap-1.5 self-start rounded-xl border border-amber-400/50 bg-amber-500/20 px-4 py-2.5 text-sm font-bold text-amber-200 transition-all hover:bg-amber-500/30 sm:w-auto"
              >
                🛍️ 만능마켓에서 AI 추천 구매하기
              </button>
            )}
          </div>
          <p className="text-sm font-semibold text-purple-200/70 sm:text-base">
            AI가 예시를 만들어줘요 — 마음에 드는 걸 고르고 아래 "저장"을 눌러야 미션이 완료돼요. 기존 학습 기록을 참고해 새로운
            학습 내용을 생성해요(하루 최대 3회). 실제 Gemini 모델을 재학습시키는 기능은 아니에요.
          </p>
          {/* 지시서(AI 추천(예시 만들기) 개수에 대한 명확한 지시): "한
              번에 N개의 예시를 만들어줘요" 안내 문구 — 연령대가 올라갈
              수록 클릭 1번이 만들어내는 예시 개수가 늘어난다는 사실을,
              숫자 계산 없이도 바로 알 수 있게 보여준다. */}
          <p data-testid="ai-recommend-tier-count" className="text-xs font-bold text-purple-300/80 sm:text-sm">
            {AGE_TIER_LABEL[characterAgeTier]} 단계에서는 한 번에 예시 {exampleCountForThisCharacter}개를 만들어줘요.
          </p>
          {/* 지시서(만능마켓 구매 즉시 이용권 실시간 연동): "남은 횟수:
              무료 N회 / 구매 N회" 한 줄로 하루 무료 횟수와 구매한
              이용권을 함께 보여준다 — 구매한 이용권은 더 이상 표시용
              placeholder가 아니라, 무료 횟수가 0이 될 때 버튼이 실제로
              그 수량을 깎아 쓴다. 지시서(8세 학습 총 8문제 제한 및
              10대 강제 레벨업 로직 수정): toddler는 이제 "총 8문제"
              고정 흐름이라, 이 하루 무료 횟수 숫자는 전혀 다른
              개념(계정 전체 일일 한도)인데도 "몇 문제가 남았다"처럼
              오해를 줄 수 있어 toddler에서는 숨긴다(위 mission-progress-
              summary의 confirmedTotal/8이 실제 진행도를 보여준다). */}
          {studyRemaining && !isToddlerStagedFlow && (
            <p data-testid="ai-recommend-remaining" className="text-sm font-semibold text-purple-200/70 sm:text-base">
              남은 횟수: 무료 {studyRemaining.remaining}회 / 구매 {tickets.aiRecommendTickets}회
            </p>
          )}
          {/* 지시서(AI 추천(예시 만들기) 개수에 대한 명확한 지시): 방금
              받은 후보 중 하나를 고를 때까지 보여주는 카드 목록 — 고른
              순간 studyDrafts가 비워지고, 그 아래 기존 title/content/
              verification/저장 흐름이 그대로 이어받는다. */}
          {studyDrafts && (
            <div
              data-testid="study-draft-picker"
              className="flex flex-col gap-2 rounded-xl border border-purple-400/30 bg-slate-900/40 p-3"
            >
              {/* 지시서(연령대별 AI 추천(예시) 개수 1개씩 점진적 증가):
                  toddler는 이제 예시가 1~2개뿐이라 "N개 중 하나를
                  골라보세요"라는 "여러 개 중 고르기" 문구가 어색하다 —
                  더 쉬운 "이 예시를 사용해 볼까요?"로 바꾼다. 카드 자체는
                  (몇 개든) 똑같이 클릭해서 고르는 방식 그대로라 아래
                  handlePickStudyDraft 로직은 바뀌지 않는다. */}
              <p className="text-sm font-bold text-purple-200">
                {studyDrafts.length <= 2 ? '이 예시를 사용해 볼까요?' : `예시 ${studyDrafts.length}개 중 하나를 골라보세요`}
              </p>
              {/* 지시서(연령대별 AI 추천(예시) 개수 1개씩 점진적 증가): 50대
                  (7개)·60대(8개)처럼 카드가 많아지면 세로로만 쌓을 때
                  스크롤이 길어진다 — 7개 이상일 때만 2열 그리드로 바꾼다
                  (ObjectiveQuizStep.tsx의 10개 기준 2열 전환과 같은
                  원리, 이 카드는 한 줄이 더 높아서 기준을 더 낮게 잡았다). */}
              <div
                data-testid="study-draft-cards"
                className={`grid gap-2 ${studyDrafts.length >= 7 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
              >
                {studyDrafts.map((draft, index) => (
                  <button
                    key={`${draft.knowledge.title}-${index}`}
                    type="button"
                    data-testid="study-draft-card"
                    onClick={() => handlePickStudyDraft(draft)}
                    disabled={draft.ageBlocked}
                    className="flex flex-col items-start gap-1 rounded-lg border border-purple-400/20 bg-purple-400/5 px-3 py-2 text-left transition-colors hover:border-purple-300/50 hover:bg-purple-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span data-testid="study-draft-title" className="text-sm font-bold text-slate-100">
                      {draft.knowledge.title}
                    </span>
                    <span data-testid="study-draft-status" className="text-xs font-semibold text-purple-300/80">
                      {draft.ageBlocked
                        ? '아직은 너무 어려워요'
                        : draft.verification.status === 'appropriate'
                          ? '✅ 적합'
                          : draft.verification.status === 'needs_revision'
                            ? '✏️ 수정 필요'
                            : '❓ 확인 불가'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 지시서(8세 학습 커리큘럼 순서 및 유형 강제 고정): toddler
          단계는 "1·2·6번 직접입력 → 3번 카드 맞추기 → 4·5번 객관식 →
          7번 순서 맞추기 → 8번 분류하기"(총 8문제) 고정 순서다 —
          카드 맞추기는 teen의 card_game 단계와 똑같은 CardMatchGame을
          재사용하고, 직접입력은 아래 기존 "직접 입력하기" 카드(같은
          knowhow 버킷)를 그대로 쓴다. 다른 연령대는 여기 들어오지
          않는다. */}
      {isToddlerStagedFlow && toddlerStep === 'multiple' && (
        <ObjectiveQuizStep
          companionType={character.companionType}
          title={`🎯 ${toddlerQuestionNumber}~${toddlerQuestionNumber + 1}번째 문제 · 객관식 2문제`}
          description="두 문제 모두 맞혀야 다음 단계로 넘어가요."
          onAllCorrect={(progress) => {
            // handleGetObjectiveQuiz가 characterAge.ts의 요구치
            // (MISSIONS_REQUIRED_PER_TYPE_BY_TIER[tier].objective)를
            // 그대로 쓰므로, 한 세트의 문제 수와 이 호출 횟수가 항상
            // 같은 숫자(toddler=2)에서 나온다.
            setMissionProgress(progress)
            onKnowledgeSaved?.()
            onKnowledgeSaved?.()
            pushLine('character', '정답이에요! 2문제 모두 맞혔어요. 🎉')
            flashPose('happy', 2500)
          }}
        />
      )}
      {/* 지시서(8세 학습 커리큘럼 순서 및 유형 강제 고정) — 이전엔
          여기가 유형별로 몰아 묻는 "3단계"였지만, 지시서가 순서를
          "1·2·6번 직접입력 → 3번 카드 맞추기 → 4·5번 객관식 → 7·8번
          신유형 미니게임"으로 섞었다. teen의 card_game 단계와 완전히
          같은 CardMatchGame + handleCardGameCleared를 재사용하되,
          테스트 testid만 구분한다. */}
      {isToddlerStagedFlow && toddlerStep === 'card_game' && (
        <div
          data-testid="toddler-card-game-step"
          className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4"
        >
          <p className="text-lg font-extrabold text-amber-200 sm:text-xl">🃏 {toddlerQuestionNumber}번째 문제 · 직업 카드 맞추기</p>
          <p className="text-sm font-semibold text-amber-200/70 sm:text-base">
            직업 카드와 도구 카드를 전부 맞추면 다음 단계로 넘어가요.
          </p>
          <CardMatchGame onCleared={() => void handleCardGameCleared()} />
          {cardGameBusy && <p className="text-sm font-semibold text-amber-200/70">완료 처리 중...</p>}
          {cardGameError && <p className="text-base font-bold text-rose-300">{cardGameError}</p>}
        </div>
      )}
      {isToddlerStagedFlow && toddlerStep === 'sequence_order' && (
        <div
          data-testid="toddler-sequence-game-step"
          className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4"
        >
          <p className="text-lg font-extrabold text-amber-200 sm:text-xl">🔢 {toddlerQuestionNumber}번째 문제 · 순서 맞추기</p>
          <p className="text-sm font-semibold text-amber-200/70 sm:text-base">
            하루 일과를 올바른 순서대로 눌러서 전부 맞히면 다음 단계로 넘어가요.
          </p>
          <SequenceOrderGame onCleared={() => void handleSequenceGameCleared()} />
          {sequenceGameBusy && <p className="text-sm font-semibold text-amber-200/70">완료 처리 중...</p>}
          {sequenceGameError && <p className="text-base font-bold text-rose-300">{sequenceGameError}</p>}
        </div>
      )}
      {isToddlerStagedFlow && toddlerStep === 'categorize' && (
        <div
          data-testid="toddler-categorize-game-step"
          className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4"
        >
          <p className="text-lg font-extrabold text-amber-200 sm:text-xl">🗂️ {toddlerQuestionNumber}번째 문제 · 분류하기</p>
          <p className="text-sm font-semibold text-amber-200/70 sm:text-base">
            물건들을 올바른 무리로 전부 나누면 오늘 학습이 끝나요.
          </p>
          <CategorizeGame onCleared={() => void handleCategorizeGameCleared()} />
          {categorizeGameBusy && <p className="text-sm font-semibold text-amber-200/70">완료 처리 중...</p>}
          {categorizeGameError && <p className="text-base font-bold text-rose-300">{categorizeGameError}</p>}
        </div>
      )}
      {isToddlerStagedFlow && toddlerStep === 'complete' && (
        <div data-testid="toddler-staged-flow-complete" className="flex flex-col gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4">
          <p className="text-base font-bold text-emerald-300">오늘 학습을 모두 마쳤어요! 🎉</p>
          <p className="text-sm font-semibold text-emerald-200/70">
            지금까지 배운 내용으로 종합 최종 시험을 보면 10대로 올라갈 수 있어요.
          </p>
          <button
            type="button"
            data-testid="open-final-exam-button"
            onClick={() => setFinalExamOpen(true)}
            className="self-start rounded-xl border-2 border-emerald-300/60 bg-gradient-to-b from-emerald-400/40 to-emerald-600/30 px-5 py-3 text-base font-extrabold text-emerald-100 shadow-[0_3px_0_rgba(16,185,129,0.4)]"
          >
            📝 종합 최종 시험 보기
          </button>
        </div>
      )}
      {finalExamOpen && (
        <FinalExamModal
          companionType={character.companionType}
          onClose={() => setFinalExamOpen(false)}
          onPassed={(progress) => {
            // 최종 시험 자체는 지식 저장이 아니라(onKnowledgeSaved를
            // 부르지 않는다) 식사/알바 3회 로테이션 카운터를 건드리지
            // 않는다 — 진화만 반영한다.
            setMissionProgress(progress)
            pushLine('character', '종합 최종 시험 합격! 10대로 성장했어요. 🎉')
            flashPose('happy', 2500)
          }}
          onOpenPassMarket={() => {
            setFinalExamOpen(false)
            onBuyMoreUses?.()
          }}
          onReset={handleFinalExamReset}
        />
      )}

      {/* 지시서(누리AI 10대 성장 커리큘럼 개선 및 학습 기능 복구): teen
          (10대)의 고정 10단계 커리큘럼 — ①②③⑦⑩ 직접입력 단계는 아래
          기존 "직접 입력하기" 카드를 그대로 재사용하고(showDirectInputCards),
          ④카드맞추기·⑤~⑥객관식·⑧순서맞추기·⑨분류하기는 toddler가 쓰는
          것과 완전히 같은 컴포넌트(CardMatchGame/ObjectiveQuizStep/
          SequenceOrderGame/CategorizeGame)를 이 자리에서 재사용한다. */}
      {isTeenStagedFlow && teenStep === 'card_game' && (
        <div
          data-testid="teen-card-game-step"
          className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4"
        >
          <p className="text-lg font-extrabold text-amber-200 sm:text-xl">🃏 {teenQuestionNumber}번째 문제 · 직업 카드 맞추기</p>
          <p className="text-sm font-semibold text-amber-200/70 sm:text-base">
            직업 카드와 도구 카드를 전부 맞추면 다음 단계로 넘어가요.
          </p>
          <CardMatchGame onCleared={() => void handleCardGameCleared()} />
          {cardGameBusy && <p className="text-sm font-semibold text-amber-200/70">완료 처리 중...</p>}
          {cardGameError && <p className="text-base font-bold text-rose-300">{cardGameError}</p>}
        </div>
      )}
      {isTeenStagedFlow && teenStep === 'multiple' && (
        <ObjectiveQuizStep
          companionType={character.companionType}
          title={`🎯 ${teenQuestionNumber}~${teenQuestionNumber + 1}번째 문제 · 객관식 2문제(전문지식·실무판단)`}
          description="두 문제 모두 맞혀야 다음 단계로 넘어가요."
          onAllCorrect={(progress) => {
            setMissionProgress(progress)
            onKnowledgeSaved?.()
            onKnowledgeSaved?.()
            pushLine('character', '정답이에요! 2문제 모두 맞혔어요. 🎉')
            flashPose('happy', 2500)
          }}
        />
      )}
      {isTeenStagedFlow && teenStep === 'sequence_order' && (
        <div
          data-testid="teen-sequence-game-step"
          className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4"
        >
          <p className="text-lg font-extrabold text-amber-200 sm:text-xl">🔢 {teenQuestionNumber}번째 문제 · 순서 맞추기</p>
          <p className="text-sm font-semibold text-amber-200/70 sm:text-base">
            업무 절차를 올바른 순서대로 눌러서 전부 맞히면 다음 단계로 넘어가요.
          </p>
          <SequenceOrderGame onCleared={() => void handleSequenceGameCleared()} />
          {sequenceGameBusy && <p className="text-sm font-semibold text-amber-200/70">완료 처리 중...</p>}
          {sequenceGameError && <p className="text-base font-bold text-rose-300">{sequenceGameError}</p>}
        </div>
      )}
      {isTeenStagedFlow && teenStep === 'categorize' && (
        <div
          data-testid="teen-categorize-game-step"
          className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4"
        >
          <p className="text-lg font-extrabold text-amber-200 sm:text-xl">🗂️ {teenQuestionNumber}번째 문제 · 분류하기</p>
          <p className="text-sm font-semibold text-amber-200/70 sm:text-base">
            물건들을 올바른 무리로 전부 나누면 오늘 학습이 끝나요.
          </p>
          <CategorizeGame onCleared={() => void handleCategorizeGameCleared()} />
          {categorizeGameBusy && <p className="text-sm font-semibold text-amber-200/70">완료 처리 중...</p>}
          {categorizeGameError && <p className="text-base font-bold text-rose-300">{categorizeGameError}</p>}
        </div>
      )}
      {isTeenStagedFlow && teenStep === 'complete' && (
        <p data-testid="teen-staged-flow-complete" className="text-base font-bold text-emerald-300">
          오늘 학습을 모두 마쳤어요! 🎉
        </p>
      )}

      {/* 미션 ①②③⑦⑩ 직접 입력하기 — 타이핑 비중이 제일 작은, 자유 입력
          경로. toddler 단계에서는 직접입력 하위 단계(①)일 때만, teen
          단계에서는 직접입력 하위 단계(①②③⑦⑩)일 때만 보인다. */}
      {showDirectInputCards && (
      <div className="flex flex-col gap-3 rounded-2xl border border-cyan-400/15 bg-slate-900/30 p-4">
        {/* 지시서(누리AI 10대 성장 커리큘럼 개선): teen은 지금이 몇
            번째 문제인지와 그 자리의 주제(역사/목적/자격/노하우/
            핵심지식)를 함께 보여준다.
            지시서(8세 학습 커리큘럼 순서 및 유형 강제 고정): toddler는
            같은 자리에 지금이 몇 번째 문제인지(1·2·6번) 보여준다. */}
        {isTeenStagedFlow && (
          <p data-testid="teen-direct-step-label" className="text-sm font-bold text-cyan-300/80">
            {teenStep === 'direct' && `${teenQuestionNumber}번째 문제 · 직접 입력하기 — ${teenDirectTopicLabel}`}
          </p>
        )}
        {isToddlerStagedFlow && (
          <p data-testid="toddler-direct-step-label" className="text-sm font-bold text-cyan-300/80">
            {toddlerStep === 'direct' && `${toddlerQuestionNumber}번째 문제 · 직접 입력하기`}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <p className="text-lg font-extrabold text-rose-400 sm:text-xl">📌 직접 입력하기</p>
          {/* 지시서(가르치기 입력 화면 즉각 피드백): 타이핑할 때마다
              nodCount가 올라 이 아이콘이 새로 마운트되며 짧게 끄덕인다 —
              위 <p>의 정확한 문구(e2e가 exact:true로 찾음)는 바꾸지
              않는다. */}
          {nodCount > 0 && (
            <span
              key={nodCount}
              data-testid="teach-input-nod-icon"
              aria-hidden
              className="motion-safe:animate-[grow-input-nod_0.3s_ease-out] text-lg"
            >
              ✏️
            </span>
          )}
        </div>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            markManualEdit()
          }}
          placeholder="지식 제목"
          maxLength={100}
          className="rounded-xl border border-cyan-400/25 bg-slate-900/60 px-4 py-3 text-lg font-medium text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
        />
        <textarea
          data-testid="knowledge-content-textarea"
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            markManualEdit()
            setNodCount((c) => c + 1)
          }}
          // 지시서: 연령대마다 "8살 수준으로" 같은 고정 문구 대신, 지금
          // 캐릭터의 실제 연령대(AGE_TIER_LABEL)를 넣어준다 — e2e는
          // placeholder 문구가 아니라 위 data-testid로 이 입력창을 찾는다
          // (문구가 연령대별로 달라져 더 이상 안정적인 선택자가 아니다).
          placeholder={`이 직업을 가진 사람이 되어 ${AGE_TIER_LABEL[characterAgeTier]} 수준으로 나에게 가르쳐주세요`}
          maxLength={2000}
          rows={4}
          className="rounded-xl border border-cyan-400/25 bg-slate-900/60 px-4 py-3 text-lg font-medium text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
        />
        {/* 지시서: "Gemini 검증하기"라는 특정 AI 제공사 이름을 그대로
            노출하지 않고 "AI검증하기"로 바꿨다 — 실제 호출 대상
            (handleTeach → Gemini)과 비용 발생 가능성은 그대로지만, 어떤
            모델을 쓰는지는 화면에 직접 드러내지 않는다. */}
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={() => void handleTeach()}
            disabled={busy || !title.trim() || !content.trim() || validationExhausted}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 shadow-md transition-all hover:bg-slate-700 disabled:opacity-50 sm:w-auto"
          >
            {busyAction === 'teach' ? 'AI 검증 중...' : 'AI검증하기'}
          </button>
          <p className="text-sm font-semibold text-slate-400 sm:text-base">
            입력한 지식을 AI가 검토해요. 검증 성공 후 저장해야 경험치가 지급됩니다.
          </p>
          {/* 지시서(만능마켓 구매 즉시 이용권 실시간 연동): "남은 횟수:
              무료 N회 / 구매 N회" 한 줄로 하루 무료 검증 횟수와 구매한
              이용권을 함께 보여준다. 지시서(8세 학습 총 8문제 제한 및
              10대 강제 레벨업 로직 수정): toddler는 "총 8문제" 고정
              흐름이라("남은 횟수: 무료 9회" 같은 계정 전체 일일 한도
              숫자가 "문제가 몇 개 남았다"처럼 오해를 줄 수 있어) 이
              줄을 숨긴다. */}
          {teachRemaining && !isToddlerStagedFlow && (
            <p data-testid="validation-remaining" className="text-sm font-semibold text-slate-400 sm:text-base">
              남은 횟수: 무료 {teachRemaining.remaining}회 / 구매 {tickets.knowledgeValidationTickets}회
            </p>
          )}
          {/* 지시서(한도 소진 시 구매 유도 UI): 무료 횟수와 구매한
              이용권이 둘 다 0이 되면 검증 영역 하단에 구매 버튼을
              노출한다. */}
          {validationExhausted && (
            <button
              type="button"
              data-testid="buy-validation-uses-button"
              onClick={() => onBuyMoreUses?.()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-500/20 px-4 py-2.5 text-sm font-bold text-amber-200 transition-all hover:bg-amber-500/30 sm:w-auto"
            >
              🛍️ 만능마켓에서 지식 검증 횟수 구매하기
            </button>
          )}
        </div>
      </div>
      )}

      {actionError && <p className="text-base font-bold text-rose-300">{actionError}</p>}

      {verification && (
        <div className="relative flex flex-col gap-2.5 overflow-visible rounded-2xl border border-cyan-400/20 bg-slate-900/50 p-4">
          {/* 지시서(가르치기 입력 화면 즉각 피드백): AI검증이 "적합"으로
              끝날 때마다 celebrateCount가 올라 별 파티클 8개를 새로
              마운트한다(순수 CSS, 라이브러리 없음) — 결과 배지/문구 등
              기존 내용에는 전혀 손대지 않는다. */}
          {celebrateCount > 0 && (
            <div key={celebrateCount} aria-hidden className="pointer-events-none absolute inset-0 z-20">
              {STAR_PARTICLE_OFFSETS.map((offset, i) => (
                <span
                  key={i}
                  data-testid="teach-success-particle"
                  className="absolute left-1/2 top-1/2 text-xl motion-safe:animate-[grow-star-particle_0.8s_ease-out_forwards]"
                  style={{ '--tx': `${offset.tx}px`, '--ty': `${offset.ty}px`, animationDelay: `${i * 25}ms` } as CSSProperties}
                >
                  ⭐
                </span>
              ))}
            </div>
          )}
          <p className="text-lg font-extrabold text-cyan-200/90 sm:text-xl">📋 미션 결과</p>
          <span
            className={`self-start rounded-full px-3.5 py-1.5 text-base font-bold ${VERIFICATION_BADGE_CLASS[verification.status]}`}
          >
            {VERIFICATION_LABEL[verification.status]}
          </span>
          {ageBlocked && requiredAgeTier && (
            <div className="flex flex-col gap-1.5">
              <p data-testid="age-blocked-notice" className="text-base font-bold text-rose-300">
                🔒 {AGE_TIER_LABEL[requiredAgeTier]}부터 배울 수 있는 지식이에요 — 아직은 저장할 수 없어요.
              </p>
              {topicSuggestions.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-rose-300/90 sm:text-base">
                    지금 {AGE_TIER_LABEL[characterAgeTier]} 단계에서는 이런 지식부터 가르쳐 보세요:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {topicSuggestions.map((topic) => (
                      <button
                        key={topic.title}
                        type="button"
                        data-testid="age-blocked-topic-suggestion-chip"
                        onClick={() => applyTopicSuggestion(topic)}
                        className="rounded-full border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-sm font-bold text-rose-200 hover:bg-rose-400/20"
                      >
                        {topic.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {verification.explanation && <p className="text-base font-medium text-slate-200/90">설명: {verification.explanation}</p>}
          {verification.relevance && <p className="text-base font-medium text-slate-200/90">관련성: {verification.relevance}</p>}
          {verification.issues && <p className="text-base font-semibold text-rose-300">문제점: {verification.issues}</p>}
          {verification.suggestion && (
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium text-slate-200/90">💡 힌트: {verification.suggestion}</p>
              <button
                onClick={handleApplySuggestion}
                className="self-start text-base font-bold text-cyan-300 hover:text-cyan-200"
              >
                제안 내용 적용 (다시 검증 필요)
              </button>
            </div>
          )}

          {isStale && <p className="text-base font-bold text-amber-300">내용이 바뀌었어요. 저장하려면 다시 검증해주세요.</p>}
          {!isStale && verification.status === 'needs_revision' && (
            <p className="text-base font-bold text-amber-300">💡 내용을 수정한 후 다시 검증해주세요.</p>
          )}
          {!isStale && verification.status === 'unverifiable' && (
            <p className="text-base font-bold text-rose-300">이 내용은 저장할 수 없어요. 내용을 다시 확인해주세요.</p>
          )}

          {teachRemaining && !isToddlerStagedFlow && (
            <p className="text-sm font-semibold text-cyan-200/60 sm:text-base">
              오늘 남은 지식 검증 횟수: {teachRemaining.remaining}/{teachRemaining.limit}
            </p>
          )}

          {/* PR #65: 지식 카드 10종 분류 — 선택값이라 안 골라도 저장은
              그대로 된다. */}
          {!isStale && verification.status === 'appropriate' && !ageBlocked && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-bold text-cyan-200/70">이 지식은 어떤 종류인가요? (선택)</p>
              <div className="flex flex-wrap gap-1.5">
                {KNOWLEDGE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    data-testid={`knowledge-category-chip-${cat}`}
                    aria-pressed={knowledgeCategory === cat}
                    onClick={() => setKnowledgeCategory((prev) => (prev === cat ? null : cat))}
                    className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                      knowledgeCategory === cat
                        ? 'bg-cyan-400/30 text-cyan-100 ring-1 ring-cyan-300/60'
                        : 'bg-white/5 text-cyan-200/70 hover:bg-white/10'
                    }`}
                  >
                    {KNOWLEDGE_CATEGORY_ICON[cat]} {KNOWLEDGE_CATEGORY_LABEL[cat]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => void handleSave()}
            disabled={saving || isStale || verification.status !== 'appropriate' || ageBlocked}
            className="self-start rounded-xl border-2 border-emerald-300/60 bg-gradient-to-b from-emerald-400/40 to-emerald-600/30 px-5 py-3 text-lg font-extrabold text-emerald-100 shadow-[0_3px_0_rgba(16,185,129,0.4),0_0_14px_rgba(16,185,129,0.3)] transition hover:scale-[1.03] hover:border-emerald-200 hover:from-emerald-400/50 hover:to-emerald-600/40 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          {saveError && <p className="text-base font-bold text-rose-300">{saveError}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={handleToggleRecords}
          className="flex items-center gap-1 self-start text-base font-bold text-cyan-200/80 hover:text-cyan-100"
        >
          학습 기록 {recordsOpen ? `(${recordsTotal}개)` : ''}
          {recordsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {recordsOpen && (
          <div className="flex flex-col gap-2">
            {recordsLoading && <p className="text-base font-semibold text-cyan-200/60">불러오는 중...</p>}
            {recordsError && <p className="text-base font-semibold text-rose-300">{recordsError}</p>}
            {!recordsLoading && records !== null && records.length === 0 && (
              <p className="text-base font-semibold text-cyan-200/60">아직 가르친 지식이 없어요.</p>
            )}
            {records?.map((record) => (
              <div key={record.id} className="rounded-xl border border-cyan-400/15 bg-slate-900/30 p-3">
                <button
                  onClick={() => setExpandedRecordId((prev) => (prev === record.id ? null : record.id))}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold text-slate-100">{record.title}</p>
                    <p className="text-sm font-medium text-cyan-200/60">
                      {new Date(record.createdAt).toLocaleDateString('ko-KR')} · {SOURCE_LABEL[record.source]}
                      {record.knowledgeCategory && ` · ${KNOWLEDGE_CATEGORY_ICON[record.knowledgeCategory]} ${KNOWLEDGE_CATEGORY_LABEL[record.knowledgeCategory]}`}
                    </p>
                  </div>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${VERIFICATION_BADGE_CLASS[record.verificationStatus]}`}
                  >
                    {VERIFICATION_LABEL[record.verificationStatus]}
                  </span>
                </button>
                {expandedRecordId === record.id && (
                  <div className="mt-2 flex flex-col gap-1 border-t border-cyan-400/10 pt-2 text-base font-medium text-slate-200/90">
                    <p>{record.finalContent}</p>
                    <p className="text-cyan-200/50">{record.verificationExplanation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
