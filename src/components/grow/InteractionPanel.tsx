import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  useGrowth,
  type Character,
  type KnowledgeVerification,
  type KnowledgeEntry,
  type CharacterMessage,
} from '../../context/GrowthContext'
import { PROFESSION_LABEL, type ProfessionId } from '../../data/characterProfessions'
import { AGE_TIER_LABEL, type AgeTier } from '../../data/characterAge'
import { AGE_APPROPRIATE_TOPICS } from '../../data/ageAppropriateTopics'
import { MISSION_TYPES, MISSION_TYPE_LABEL, MISSION_TYPE_ICON, type MissionType, type MissionProgress } from '../../data/characterMissions'
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_CATEGORY_LABEL, KNOWLEDGE_CATEGORY_ICON, type KnowledgeCategory } from '../../data/knowledgeCategories'
import type { CharacterPose } from './CharacterSprite'

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
}: {
  character: Character
  profession: ProfessionId
  onPoseChange?: (pose: CharacterPose) => void
}) {
  const { verifyKnowledge, studyGenerate, saveKnowledge, getMissionProgress, listKnowledge, listMessages } = useGrowth()
  const name = COMPANION_LABEL[character.companionType]
  // PR #52 후속: 지금 연령대에 맞는 예시 주제를 보여줘서, 2~3살/10대
  // 단계에서 너무 어려운 지식만 쓰다가 거절당해 진도가 막히지 않도록
  // 쉬운 쪽으로 자연스럽게 유도한다.
  // PR #63: 더 이상 level에서 다시 계산하지 않고 서버가 내려준 "진짜"
  // 연령대(6미션 게이트로 고정됐을 수 있음)를 그대로 쓴다.
  const characterAgeTier = character.ageTier
  const topicSuggestions = AGE_APPROPRIATE_TOPICS[characterAgeTier]
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
  useEffect(() => {
    let cancelled = false
    getMissionProgress(character.companionType)
      .then((p) => {
        if (!cancelled) setMissionProgress(p)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [character.companionType, getMissionProgress])

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
  const [teachRemaining, setTeachRemaining] = useState<{ remaining: number; limit: number } | null>(null)
  const [studyRemaining, setStudyRemaining] = useState<{ remaining: number; limit: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [recordsOpen, setRecordsOpen] = useState(false)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [records, setRecords] = useState<KnowledgeEntry[] | null>(null)
  const [recordsTotal, setRecordsTotal] = useState(0)
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null)

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
      flashPose(result.verification.status === 'appropriate' && !result.ageBlocked ? 'happy' : 'sad', 2500)
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
    flashPose('studying')
    try {
      const result = await studyGenerate(character.companionType)
      setTitle(result.knowledge.title)
      setContent(result.knowledge.content)
      setMissionType('subjective')
      setVerification(result.verification)
      setVerifiedSnapshot({ title: result.knowledge.title, content: result.knowledge.content })
      setVerificationToken(result.verificationToken)
      setStudyRemaining({ remaining: result.remaining, limit: result.dailyStudyLimit })
      setAgeBlocked(result.ageBlocked)
      setRequiredAgeTier(result.requiredAgeTier)
      pushLine('character', result.characterReply)
      flashPose(result.verification.status === 'appropriate' && !result.ageBlocked ? 'happy' : 'sad', 2500)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '스스로 공부하는 중 오류가 발생했어요.')
      flashPose('sad', 2500)
    } finally {
      setBusyAction(null)
    }
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
  const applyTopicSuggestion = (topic: { title: string; content: string }) => {
    setTitle(topic.title)
    setContent(topic.content)
    setMissionType('objective')
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

      {/* PR #63: 6단계 카드형 미션 진행 현황 — 유형별(객관식/주관식/
          노하우) 2개씩, 총 6개를 확정해야 다음 연령대로 진화한다. */}
      {missionProgress && (
        <div
          className="flex flex-col gap-2 rounded-2xl border border-indigo-400/20 bg-indigo-400/5 p-3.5"
          data-testid="mission-progress-summary"
        >
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-indigo-200">
              {missionProgress.ageTierLabel} 성장 미션 {missionProgress.confirmedTotal}/{missionProgress.requiredTotal}
            </p>
            {missionProgress.allConfirmed && missionProgress.nextAgeTierLabel && (
              <span className="text-sm font-bold text-emerald-300">
                레벨만 채우면 {missionProgress.nextAgeTierLabel}로 진화해요!
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MISSION_TYPES.map((type) => {
              const p = missionProgress.byType[type]
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

      {/* 미션 ① 선택지에서 고르기 — 8~9살 눈높이에서 제일 쉬운, 터치 한
          번으로 끝나는 입력 방식. 입력칸이 비어 있을 때만 보여주는 기존
          조건은 그대로 유지했다. */}
      {!title.trim() && !content.trim() && topicSuggestions.length > 0 && (
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
          금지, PR #62 요청 2번). */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-purple-400/25 bg-purple-400/5 p-4 shadow-[0_0_14px_rgba(192,132,252,0.08)]">
        <p className="text-lg font-extrabold text-purple-200 sm:text-xl">✨ AI 추천 받기</p>
        <button
          onClick={() => void handleSelfStudy()}
          disabled={busy}
          className="self-start rounded-xl border-2 border-purple-400/60 bg-gradient-to-b from-purple-400/30 to-purple-600/20 px-5 py-3 text-lg font-extrabold text-purple-100 shadow-[0_3px_0_rgba(192,132,252,0.35),0_0_14px_rgba(192,132,252,0.25)] transition hover:scale-[1.03] hover:border-purple-300 hover:from-purple-400/40 hover:to-purple-600/30 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
        >
          {busyAction === 'study' ? `${name}가 스스로 공부하는 중...` : `${name} 스스로 공부하기`}
        </button>
        <p className="text-sm font-semibold text-purple-200/70 sm:text-base">
          AI가 예시를 만들어줘요 — 내용을 확인하고 아래 "저장"을 눌러야 미션이 완료돼요. 기존 학습 기록을 참고해 새로운 학습
          내용을 생성해요(하루 최대 3회). 실제 Gemini 모델을 재학습시키는 기능은 아니에요.
        </p>
        {studyRemaining && (
          <p className="text-sm font-semibold text-purple-200/70 sm:text-base">
            오늘 남은 스스로 공부하기 횟수: {studyRemaining.remaining}/{studyRemaining.limit}
          </p>
        )}
      </div>

      {/* 미션 ③ 직접 입력하기 — 타이핑 비중이 제일 작은, 자유 입력
          경로. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-cyan-400/15 bg-slate-900/30 p-4">
        <p className="text-lg font-extrabold text-cyan-200/90 sm:text-xl">✏️ 직접 입력하기</p>
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
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            markManualEdit()
          }}
          placeholder="가르칠 지식 내용을 입력해주세요."
          maxLength={2000}
          rows={4}
          className="rounded-xl border border-cyan-400/25 bg-slate-900/60 px-4 py-3 text-lg font-medium text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
        />
        <div className="flex flex-col items-start gap-1.5">
          <button
            onClick={() => void handleTeach()}
            disabled={busy || !title.trim() || !content.trim()}
            className="rounded-xl border-2 border-cyan-300/50 bg-gradient-to-b from-cyan-400 to-blue-600 px-5 py-3 text-lg font-extrabold text-white shadow-[0_3px_0_rgba(8,47,73,0.5),0_0_14px_rgba(56,189,248,0.45)] transition hover:scale-[1.03] hover:from-cyan-300 hover:to-blue-500 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100"
          >
            {busyAction === 'teach' ? 'Gemini 검증 중...' : 'Gemini 검증하기'}
          </button>
          <p className="text-sm font-semibold text-cyan-200/60 sm:text-base">
            입력한 지식을 Gemini가 검토해요. 검증 성공 후 저장해야 경험치가 지급되고, Gemini API 호출에 따른 비용이 발생할 수 있어요.
          </p>
        </div>
      </div>

      {actionError && <p className="text-base font-bold text-rose-300">{actionError}</p>}

      {verification && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-cyan-400/20 bg-slate-900/50 p-4">
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

          {teachRemaining && (
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
