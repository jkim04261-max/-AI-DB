import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { Briefcase, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  useGrowth,
  type CompanionType,
  type Character,
  type KnowledgeVerification,
  type KnowledgeEntry,
} from '../context/GrowthContext'
import { PROFESSIONS, PROFESSION_LABEL, type ProfessionId } from '../data/characterProfessions'
import CharacterSprite, { type CharacterPose } from '../components/grow/CharacterSprite'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }
const STAGE_LABEL: Record<'child' | 'adult', string> = { child: '어린이', adult: '성인' }
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

export default function GrowPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { characters, loading, createCharacter, setProfession } = useGrowth()
  const [creating, setCreating] = useState<CompanionType | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Which character's "직업 변경" chooser is open (showing the other job(s)
  // to switch to) — only ever one at a time.
  const [changingFor, setChangingFor] = useState<CompanionType | null>(null)
  // A change the user picked from that chooser, awaiting confirmation —
  // the initial pick (character.profession === null) never goes through
  // this, only an actual change away from an already-selected job does.
  const [pendingChange, setPendingChange] = useState<{ companionType: CompanionType; profession: ProfessionId } | null>(null)
  const [savingProfession, setSavingProfession] = useState<CompanionType | null>(null)
  const [teachingFor, setTeachingFor] = useState<CompanionType | null>(null)

  const handleCreate = async (companionType: CompanionType) => {
    setCreating(companionType)
    setError(null)
    try {
      await createCharacter(companionType)
    } catch (err) {
      setError(err instanceof Error ? err.message : '캐릭터를 만드는 중 오류가 발생했어요.')
    } finally {
      setCreating(null)
    }
  }

  const applyProfession = async (companionType: CompanionType, profession: ProfessionId) => {
    setSavingProfession(companionType)
    setError(null)
    try {
      await setProfession(companionType, profession)
      setChangingFor(null)
      setPendingChange(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '직업을 저장하는 중 오류가 발생했어요.')
    } finally {
      setSavingProfession(null)
    }
  }

  if (!authLoading && !user) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-bold text-slate-900">AI 키우기</h1>
      <p className="text-sm text-slate-500">
        나만의 AI 누리·두리를 어린이부터 키워보세요. 둘 다 키울 수 있어요.
      </p>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && (
        <div className="flex flex-col gap-4">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              changing={changingFor === character.companionType}
              saving={savingProfession === character.companionType}
              teaching={teachingFor === character.companionType}
              onStartChange={() => setChangingFor(character.companionType)}
              onCancelChange={() => setChangingFor(null)}
              onToggleTeach={() =>
                setTeachingFor((prev) => (prev === character.companionType ? null : character.companionType))
              }
              onPickProfession={(profession) => {
                if (character.profession === null) {
                  // First-time pick — no confirmation needed.
                  void applyProfession(character.companionType, profession)
                } else {
                  setPendingChange({ companionType: character.companionType, profession })
                }
              }}
            />
          ))}

          {(!hasNuri || !hasDuri) && (
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
        </div>
      )}

      {pendingChange && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-slate-900">직업을 변경할까요?</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {COMPANION_LABEL[pendingChange.companionType]}의 직업을{' '}
              <span className="font-semibold text-slate-700">{PROFESSION_LABEL[pendingChange.profession]}</span>
              로 변경해요. 캐릭터 자체는 삭제되지 않아요.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingChange(null)}
                disabled={savingProfession !== null}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void applyProfession(pendingChange.companionType, pendingChange.profession)}
                disabled={savingProfession !== null}
                className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {savingProfession !== null ? '변경 중...' : '변경'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CharacterCard({
  character,
  changing,
  saving,
  teaching,
  onStartChange,
  onCancelChange,
  onToggleTeach,
  onPickProfession,
}: {
  character: Character
  changing: boolean
  saving: boolean
  teaching: boolean
  onStartChange: () => void
  onCancelChange: () => void
  onToggleTeach: () => void
  onPickProfession: (profession: ProfessionId) => void
}) {
  const otherProfessions = PROFESSIONS.filter((p) => p.id !== character.profession)
  // 캐릭터의 "표정/동작" — 지금은 지식 검증 흐름(아래 KnowledgeTeachPanel)이
  // onPoseChange로 이 상태를 잠깐 studying/happy/sad로 바꿨다가 다시
  // idle로 되돌리는 것 말고는 어떤 백엔드 값에도 연결돼 있지 않다. XP·레벨
  // 연동은 체크포인트 4 이후 과제.
  const [pose, setPose] = useState<CharacterPose>('idle')
  const isNuri = character.companionType === 'nuri'

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-4">
        <span
          className={`flex h-24 w-24 shrink-0 items-end justify-center overflow-hidden rounded-2xl ${
            isNuri ? 'bg-gradient-to-b from-indigo-100 to-blue-50' : 'bg-gradient-to-b from-rose-100 to-pink-50'
          }`}
        >
          <CharacterSprite companionType={character.companionType} pose={pose} size={76} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-900">{COMPANION_LABEL[character.companionType]}</p>
          <p className="text-xs text-slate-400">{STAGE_LABEL[character.stage]}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-500">Lv.1</span>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full w-0 rounded-full bg-indigo-400" />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
          <Briefcase size={12} />
          {character.profession ? PROFESSION_LABEL[character.profession] : '직업 미선택'}
        </div>
      </div>

      {!changing && (
        <div className="flex items-center gap-4">
          <button
            onClick={onStartChange}
            disabled={saving}
            className="self-start text-xs font-semibold text-indigo-500 hover:text-indigo-600 disabled:opacity-50"
          >
            {character.profession ? '직업 변경' : '직업 선택'}
          </button>
          {character.profession ? (
            <button
              onClick={onToggleTeach}
              className="flex items-center gap-1 self-start text-xs font-semibold text-indigo-500 hover:text-indigo-600"
            >
              <BookOpen size={12} />
              지식 가르치기
              {teaching ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <p className="text-xs text-slate-400">먼저 직업을 선택해주세요.</p>
          )}
        </div>
      )}

      {changing && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 p-3">
          <div className="flex gap-2">
            {otherProfessions.map((p) => (
              <button
                key={p.id}
                onClick={() => onPickProfession(p.id)}
                disabled={saving}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? '저장 중...' : p.label}
              </button>
            ))}
          </div>
          <button
            onClick={onCancelChange}
            disabled={saving}
            className="self-start text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
          >
            취소
          </button>
        </div>
      )}

      {teaching && character.profession && (
        <KnowledgeTeachPanel character={character} profession={character.profession} onPoseChange={setPose} />
      )}
    </div>
  )
}

function KnowledgeTeachPanel({
  character,
  profession,
  onPoseChange,
}: {
  character: Character
  profession: ProfessionId
  // 지식 검증 중/결과에 따라 카드 상단 캐릭터의 표정을 studying/happy/sad로
  // 잠깐 바꿔주기 위한 콜백 — 순수 시각 효과이며 서버에는 아무 영향 없음.
  onPoseChange?: (pose: CharacterPose) => void
}) {
  const { verifyKnowledge, saveKnowledge, listKnowledge } = useGrowth()
  // 표정을 studying/happy/sad로 바꾼 뒤 일정 시간 후 idle로 되돌리는
  // 타이머 — 언마운트 후 setState를 막기 위해 ref로 보관하고 정리한다.
  const poseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (poseTimeoutRef.current) clearTimeout(poseTimeoutRef.current)
      // 패널이 닫힐 때(= 언마운트) 표정이 studying/happy/sad에 멈춰있지
      // 않도록 되돌린다 — 타이머가 아직 안 끝났어도 즉시 idle로.
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
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verification, setVerification] = useState<KnowledgeVerification | null>(null)
  // The exact title/content that `verification` above was computed from —
  // editing either field after a result invalidates it (cleared below),
  // so "저장" can only ever save content that was actually just verified.
  const [verifiedSnapshot, setVerifiedSnapshot] = useState<{ title: string; content: string } | null>(null)
  // The signed token the server returned for verifiedSnapshot — this is
  // what actually authorizes saving, not the `verification` object above
  // (which is for display only). It's only ever used while !isStale, i.e.
  // while title/content still match verifiedSnapshot exactly.
  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<{ remaining: number; limit: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [recordsOpen, setRecordsOpen] = useState(false)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [records, setRecords] = useState<KnowledgeEntry[] | null>(null)
  const [recordsTotal, setRecordsTotal] = useState(0)
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null)

  const isStale = verification !== null && (verifiedSnapshot?.title !== title || verifiedSnapshot?.content !== content)

  const handleChangeTitle = (value: string) => {
    setTitle(value)
  }
  const handleChangeContent = (value: string) => {
    setContent(value)
  }

  const handleVerify = async () => {
    if (!title.trim() || !content.trim()) return
    setVerifying(true)
    setVerifyError(null)
    setSaveSuccess(false)
    flashPose('studying')
    try {
      const result = await verifyKnowledge(character.companionType, title, content)
      setVerification(result.verification)
      setVerifiedSnapshot({ title, content })
      setVerificationToken(result.verificationToken)
      setRemaining({ remaining: result.remaining, limit: result.dailyTeachLimit })
      flashPose(result.verification.status === 'appropriate' ? 'happy' : 'sad', 2500)
    } catch (err) {
      setVerification(null)
      setVerifiedSnapshot(null)
      setVerificationToken(null)
      setVerifyError(err instanceof Error ? err.message : '지식을 검증하는 중 오류가 발생했어요.')
      flashPose('sad', 2500)
    } finally {
      setVerifying(false)
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
      await saveKnowledge(character.companionType, title, verifiedSnapshot.content, content, verificationToken)
      setSaveSuccess(true)
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

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-dashed border-slate-300 p-4">
      <p className="text-xs font-semibold text-slate-500">
        {COMPANION_LABEL[character.companionType]} · {PROFESSION_LABEL[profession]}에게 가르치기
      </p>

      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => handleChangeTitle(e.target.value)}
          placeholder="지식 제목"
          maxLength={100}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <textarea
          value={content}
          onChange={(e) => handleChangeContent(e.target.value)}
          placeholder="가르칠 지식 내용을 입력해주세요."
          maxLength={2000}
          rows={4}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          onClick={() => void handleVerify()}
          disabled={verifying || !title.trim() || !content.trim()}
          className="self-start rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {verifying ? 'Gemini 검증 중...' : 'Gemini 검증하기'}
        </button>
      </div>

      {verifyError && <p className="text-sm text-red-500">{verifyError}</p>}

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

          {isStale && (
            <p className="text-xs text-amber-600">내용이 바뀌었어요. 저장하려면 다시 검증해주세요.</p>
          )}
          {!isStale && verification.status === 'needs_revision' && (
            <p className="text-xs text-amber-600">내용을 수정한 후 다시 검증해주세요.</p>
          )}
          {!isStale && verification.status === 'unverifiable' && (
            <p className="text-xs text-red-500">이 내용은 저장할 수 없어요. 내용을 다시 확인해주세요.</p>
          )}

          {remaining && (
            <p className="text-xs text-slate-400">
              오늘 남은 지식 검증 횟수: {remaining.remaining}/{remaining.limit}
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

      {saveSuccess && <p className="text-sm text-green-600">학습 기록으로 저장했어요.</p>}

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
                    <p className="text-[11px] text-slate-400">{new Date(record.createdAt).toLocaleDateString('ko-KR')}</p>
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
