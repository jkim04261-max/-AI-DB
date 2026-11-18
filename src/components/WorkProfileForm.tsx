import { useEffect, useState, type FormEvent } from 'react'

import { WORK_PROFILE_ENDPOINT, saveWorkProfile, type WorkProfile } from '../lib/workProfile'

const INPUT_CLASS = 'min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900'

export default function WorkProfileForm() {
  const [profile, setProfile] = useState<WorkProfile | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(WORK_PROFILE_ENDPOINT, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error()
        const data: { profile: WorkProfile } = await response.json()
        if (!controller.signal.aborted) setProfile(data.profile)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('직업 프로필을 불러오지 못했어요.')
      })
    return () => controller.abort()
  }, [loadAttempt])

  function updateProfile<K extends keyof WorkProfile>(field: K, value: WorkProfile[K]) {
    setProfile((previous) => previous && { ...previous, [field]: value })
    setSaved(false)
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !profile) return
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      setProfile(await saveWorkProfile(profile, 'PUT'))
      setSaved(true)
    } catch {
      setError('직업 프로필을 저장하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="work-profile-title">
      <h2 id="work-profile-title" className="text-sm font-semibold text-slate-700">직업 프로필</h2>
      {profile ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              직장·상호명
              <input className={INPUT_CLASS} maxLength={100} value={profile.workplace} onChange={(e) => updateProfile('workplace', e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              업종
              <input className={INPUT_CLASS} maxLength={80} value={profile.industry} onChange={(e) => updateProfile('industry', e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              경력 시작일
              <input className={INPUT_CLASS} type="date" min="0001-01-01" max="9999-12-31" value={profile.careerStartDate} onChange={(e) => updateProfile('careerStartDate', e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              직장·상호명 공개 범위
              <select className={INPUT_CLASS} value={profile.workplaceVisibility} onChange={(e) => updateProfile('workplaceVisibility', e.target.value === 'public' ? 'public' : 'private')}>
                <option value="private">비공개</option>
                <option value="public">공개</option>
              </select>
            </label>
          </fieldset>
          <p className="text-xs text-slate-500">공개 범위는 직장·상호명에만 적용돼요. 현재 직업 프로필은 마이페이지에서 본인만 볼 수 있어요.</p>
          <button type="submit" disabled={saving} className="self-start rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? '저장 중…' : '직업 프로필 저장'}
          </button>
          {saved && <p role="status" className="text-sm text-emerald-700">직업 프로필을 저장했어요.</p>}
        </form>
      ) : error ? (
        <button type="button" className="self-start rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => {
          setError('')
          setLoadAttempt((attempt) => attempt + 1)
        }}>다시 불러오기</button>
      ) : <p role="status" className="text-sm text-slate-500">불러오는 중…</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
