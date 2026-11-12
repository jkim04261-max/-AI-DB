// Canonical identity is persisted in characters.companion_type.
// Historical profiles never persisted gender; do not guess boolean encodings.
export type CharacterGender = 'male' | 'female'
export function normalizeGender(value: unknown): CharacterGender | null {
  if (typeof value !== 'string') return null
  switch (value.trim().toLowerCase()) {
    case 'female': case '여성': case '여': case 'f': return 'female'
    case 'male': case '남성': case '남': case 'm': return 'male'
    default: return null
  }
}
export function companionForGender(gender: CharacterGender): 'nuri' | 'duri' {
  return gender === 'female' ? 'nuri' : 'duri'
}
export function genderForCompanion(companion: 'nuri' | 'duri'): CharacterGender {
  return companion === 'nuri' ? 'female' : 'male'
}
