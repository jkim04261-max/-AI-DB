import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Sprout, Briefcase } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGrowth, type CompanionType, type Character } from '../context/GrowthContext'
import { PROFESSIONS, PROFESSION_LABEL, type ProfessionId } from '../data/characterProfessions'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }
const STAGE_LABEL: Record<'child' | 'adult', string> = { child: '어린이', adult: '성인' }

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
              onStartChange={() => setChangingFor(character.companionType)}
              onCancelChange={() => setChangingFor(null)}
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
  onStartChange,
  onCancelChange,
  onPickProfession,
}: {
  character: Character
  changing: boolean
  saving: boolean
  onStartChange: () => void
  onCancelChange: () => void
  onPickProfession: (profession: ProfessionId) => void
}) {
  const otherProfessions = PROFESSIONS.filter((p) => p.id !== character.profession)

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white">
          <Sprout size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-900">{COMPANION_LABEL[character.companionType]}</p>
          <p className="text-xs text-slate-400">{STAGE_LABEL[character.stage]}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
          <Briefcase size={12} />
          {character.profession ? PROFESSION_LABEL[character.profession] : '직업 미선택'}
        </div>
      </div>

      {!changing && (
        <button
          onClick={onStartChange}
          disabled={saving}
          className="self-start text-xs font-semibold text-indigo-500 hover:text-indigo-600 disabled:opacity-50"
        >
          {character.profession ? '직업 변경' : '직업 선택'}
        </button>
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
    </div>
  )
}
