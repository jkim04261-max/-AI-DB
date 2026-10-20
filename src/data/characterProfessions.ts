export type ProfessionId = 'accountant' | 'singer'

export interface ProfessionOption {
  id: ProfessionId
  label: string
}

// Static catalog (not a DB table) — same pattern as homeFeatures.ts. Adding
// a third job later is a one-line addition here and in api/character.ts's
// PROFESSIONS set, no migration needed.
export const PROFESSIONS: ProfessionOption[] = [
  { id: 'accountant', label: '회계사' },
  { id: 'singer', label: '가수' },
]

export const PROFESSION_LABEL: Record<ProfessionId, string> = {
  accountant: '회계사',
  singer: '가수',
}
