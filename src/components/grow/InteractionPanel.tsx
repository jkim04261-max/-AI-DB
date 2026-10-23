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
import type { CharacterPose } from './CharacterSprite'

const COMPANION_LABEL: Record<Character['companionType'], string> = { nuri: '누리', duri: '두리' }
const VERIFICATION_LABEL: Record<KnowledgeVerification['status'], string> = {
  appropriate: '적합',
  needs_revision: '수정 필요',
  unverifiable: '검증 불가',
}
const VERIFICATION_BADGE_CLASS: Record<KnowledgeVerification['status'], string> = {
  appropriate: 'bg-green-100 text-green-700',
  needs_revision: 'bg-amber-100 text-amber-700',
  unverifiable: 'bg-red-100 text-red-700',
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
  const { verifyKnowledge, studyGenerate, saveKnowledge, listKnowledge, listMessages } = useGrowth()
  const name = COMPANION_LABEL[character.companionType]

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

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
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
      // characterReply is server-generated and already persisted
      // server-side (character_messages) — display exactly that text, not
      // a locally invented one.
      pushLine('character', result.characterReply)
      flashPose(result.verification.status === 'appropriate' ? 'happy' : 'sad', 2500)
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
      setVerification(result.verification)
      setVerifiedSnapshot({ title: result.knowledge.title, content: result.knowledge.content })
      setVerificationToken(result.verificationToken)
      setStudyRemaining({ remaining: result.remaining, limit: result.dailyStudyLimit })
      pushLine('character', result.characterReply)
      flashPose(result.verification.status === 'appropriate' ? 'happy' : 'sad', 2500)
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

  const handleSave = async () => {
    if (!verification || isStale || verification.status !== 'appropriate' || !verifiedSnapshot || !verificationToken) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveKnowledge(character.companionType, title, verifiedSnapshot.content, content, verificationToken)
      pushLine('character', result.savedReply)
      setTitle('')
      setContent('')
      setVerification(null)
      setVerifiedSnapshot(null)
      setVerificationToken(null)
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

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-dashed border-slate-300 p-4">
      <p className="text-xs font-semibold text-slate-500">
        {name} · {PROFESSION_LABEL[profession]}와 상호작용하기
      </p>

      {historyLoading && <p className="text-xs text-slate-400">대화 기록을 불러오는 중...</p>}
      {historyError && <p className="text-xs text-red-500">{historyError}</p>}

      {dialogue.length > 0 && (
        <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
          {dialogue.map((line) => (
            <div key={line.id} className={`flex ${line.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-xs ${
                  line.speaker === 'user' ? 'bg-indigo-500 text-white' : 'bg-white text-slate-700 shadow-sm'
                }`}
              >
                {line.speaker === 'character' && <span className="mr-1 font-semibold">{name}:</span>}
                {line.text}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="지식 제목"
          maxLength={100}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="가르칠 지식 내용을 입력해주세요."
          maxLength={2000}
          rows={4}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={() => void handleTeach()}
            disabled={busy || !title.trim() || !content.trim()}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {busyAction === 'teach' ? 'Gemini 검증 중...' : 'Gemini 검증하기'}
          </button>
          <p className="text-[11px] text-slate-400">
            입력한 지식을 Gemini가 검토해요. 검증 성공 후 저장해야 경험치가 지급되고, Gemini API 호출에 따른 비용이 발생할 수 있어요.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={() => void handleSelfStudy()}
            disabled={busy}
            className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-500 hover:bg-indigo-50 disabled:opacity-50"
          >
            {busyAction === 'study' ? `${name}가 스스로 공부하는 중...` : `${name} 스스로 공부하기`}
          </button>
          <p className="text-[11px] text-slate-400">
            기존 학습 기록을 참고해 AI가 새로운 학습 내용을 생성해요(하루 최대 3회). 실제 Gemini 모델을 재학습시키는 기능은 아니에요.
          </p>
        </div>
        {studyRemaining && (
          <p className="text-[11px] text-slate-400">
            오늘 남은 스스로 공부하기 횟수: {studyRemaining.remaining}/{studyRemaining.limit}
          </p>
        )}
      </div>

      {actionError && <p className="text-sm text-red-500">{actionError}</p>}

      {verification && (
        <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
          <span
            className={`self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERIFICATION_BADGE_CLASS[verification.status]}`}
          >
            {VERIFICATION_LABEL[verification.status]}
          </span>
          {verification.explanation && <p className="text-xs text-slate-600">설명: {verification.explanation}</p>}
          {verification.relevance && <p className="text-xs text-slate-600">관련성: {verification.relevance}</p>}
          {verification.issues && <p className="text-xs text-red-500">문제점: {verification.issues}</p>}
          {verification.suggestion && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-slate-600">제안: {verification.suggestion}</p>
              <button
                onClick={handleApplySuggestion}
                className="self-start text-xs font-semibold text-indigo-500 hover:text-indigo-600"
              >
                제안 내용 적용 (다시 검증 필요)
              </button>
            </div>
          )}

          {isStale && <p className="text-xs text-amber-600">내용이 바뀌었어요. 저장하려면 다시 검증해주세요.</p>}
          {!isStale && verification.status === 'needs_revision' && (
            <p className="text-xs text-amber-600">내용을 수정한 후 다시 검증해주세요.</p>
          )}
          {!isStale && verification.status === 'unverifiable' && (
            <p className="text-xs text-red-500">이 내용은 저장할 수 없어요. 내용을 다시 확인해주세요.</p>
          )}

          {teachRemaining && (
            <p className="text-xs text-slate-400">
              오늘 남은 지식 검증 횟수: {teachRemaining.remaining}/{teachRemaining.limit}
            </p>
          )}

          <button
            onClick={() => void handleSave()}
            disabled={saving || isStale || verification.status !== 'appropriate'}
            className="self-start rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          {saveError && <p className="text-sm text-red-500">{saveError}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={handleToggleRecords}
          className="flex items-center gap-1 self-start text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          학습 기록 {recordsOpen ? `(${recordsTotal}개)` : ''}
          {recordsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {recordsOpen && (
          <div className="flex flex-col gap-2">
            {recordsLoading && <p className="text-xs text-slate-400">불러오는 중...</p>}
            {recordsError && <p className="text-xs text-red-500">{recordsError}</p>}
            {!recordsLoading && records !== null && records.length === 0 && (
              <p className="text-xs text-slate-400">아직 가르친 지식이 없어요.</p>
            )}
            {records?.map((record) => (
              <div key={record.id} className="rounded-xl border border-slate-200 p-2.5">
                <button
                  onClick={() => setExpandedRecordId((prev) => (prev === record.id ? null : record.id))}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{record.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(record.createdAt).toLocaleDateString('ko-KR')} · {SOURCE_LABEL[record.source]}
                    </p>
                  </div>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERIFICATION_BADGE_CLASS[record.verificationStatus]}`}
                  >
                    {VERIFICATION_LABEL[record.verificationStatus]}
                  </span>
                </button>
                {expandedRecordId === record.id && (
                  <div className="mt-2 flex flex-col gap-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                    <p>{record.finalContent}</p>
                    <p className="text-slate-400">{record.verificationExplanation}</p>
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
