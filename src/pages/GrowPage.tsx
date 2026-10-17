import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Sprout } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGrowth, type CompanionType } from '../context/GrowthContext'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }
const STAGE_LABEL: Record<'child' | 'adult', string> = { child: '어린이', adult: '성인' }

export default function GrowPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { characters, loading, createCharacter } = useGrowth()
  const [creating, setCreating] = useState<CompanionType | null>(null)
  const [error, setError] = useState<string | null>(null)

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
            <div
              key={character.id}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white">
                <Sprout size={26} />
              </span>
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {COMPANION_LABEL[character.companionType]}
                </p>
                <p className="text-xs text-slate-400">{STAGE_LABEL[character.stage]}</p>
              </div>
            </div>
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
    </div>
  )
}
