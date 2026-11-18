export interface WorkProfile {
  workplace: string
  industry: string
  careerStartDate: string
  workplaceVisibility: 'private' | 'public'
}

export const WORK_PROFILE_ENDPOINT = '/api/account/work-profile'
export async function saveWorkProfile(profile: Partial<WorkProfile>, method: 'PUT' | 'PATCH') {
  const response = await fetch(WORK_PROFILE_ENDPOINT, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!response.ok) throw new Error('직업 프로필을 저장하지 못했어요. 다시 시도해 주세요.')
  const data: { profile: WorkProfile } = await response.json()
  return data.profile
}
