import type { KnowledgeVerificationResult } from './gemini'

// PR #45 checkpoint 3.6: these were originally client-side templates in
// InteractionPanel.tsx (checkpoint 3). Moved server-side so the *server*
// is the one deciding and writing what a character "said" — the client no
// longer invents the persisted dialogue text, it only displays whatever
// verify-knowledge/study-generate/save-knowledge returns. Zero Gemini cost
// either way: this only rephrases fields Gemini already produced
// (explanation/suggestion), never a new model call.

export function buildTeachReply(v: KnowledgeVerificationResult): string {
  if (v.status === 'appropriate') {
    return `${v.explanation || '정확해요!'} 알려주셔서 고마워요!`
  }
  if (v.status === 'needs_revision') {
    return `${v.explanation || '음, 조금 다른 것 같아요.'}${v.suggestion ? ` 혹시 "${v.suggestion}"는 어때요?` : ' 다시 한 번 알려주실래요?'}`
  }
  return `${v.explanation || '이 내용은 아직 잘 모르겠어요.'} 다른 이야기도 들려주실래요?`
}

export function buildStudyReply(title: string, v: KnowledgeVerificationResult): string {
  if (v.status === 'appropriate') {
    return `오늘은 '${title}'에 대해 혼자 공부해봤어요! ${v.explanation || ''}`.trim()
  }
  return `'${title}'를 스스로 공부해봤는데, 아직 확신이 안 서요. ${v.explanation || ''}`.trim()
}

// PR #45 checkpoint 4: appended to a reply whenever an action just pushed
// the character up a level — a lightweight, zero-Gemini-cost "reaction" to
// growth (조건 5), always phrased as a *game* milestone (Lv.N), never as
// a claim about the underlying Gemini model having learned anything
// (조건 7 — see also KNOWLEDGE_VS_MODEL_DISCLAIMER below).
function levelUpSuffix(leveledUp: boolean, newLevel: number): string {
  return leveledUp ? ` 🎉 레벨업! 이제 Lv.${newLevel}이에요!` : ''
}

export function buildSavedReply(source: 'user_taught' | 'ai_generated', leveledUp: boolean, newLevel: number): string {
  const base =
    source === 'user_taught'
      ? '이 지식을 배웠어요! 다음엔 또 어떤 걸 가르쳐 주실 건가요?'
      : '이 지식을 학습 기록에 저장했어요! 다음엔 또 무엇을 공부해볼까요?'
  return base + levelUpSuffix(leveledUp, newLevel)
}

export function buildQuizResultMessage(
  correct: boolean,
  explanation: string,
  expAwarded: number,
  leveledUp: boolean,
  newLevel: number,
): string {
  const base = correct
    ? `정답이에요! ${explanation}${expAwarded > 0 ? ` (+${expAwarded}XP)` : ''}`
    : `아쉬워요, 정답이 아니었어요. ${explanation}`
  return base + levelUpSuffix(leveledUp, newLevel)
}

export function buildExamResultMessage(
  passed: boolean,
  score: number,
  total: number,
  expAwarded: number,
  leveledUp: boolean,
  newLevel: number,
): string {
  const base = passed
    ? `시험 합격이에요! ${score}/${total}문제를 맞혔어요.${expAwarded > 0 ? ` (+${expAwarded}XP)` : ''}`
    : `아쉽지만 불합격이에요. ${score}/${total}문제를 맞혔어요. 다시 도전해볼까요?`
  return base + levelUpSuffix(leveledUp, newLevel)
}

// PR #45 checkpoint 4 (조건 7): shown in the UI next to level/XP so it's
// never mistaken for a claim about the real Gemini model's capability —
// XP/레벨은 이 게임 안에서의 성장 지표일 뿐, Gemini 모델 자체가 더
// 똑똑해졌다는 뜻이 아니다.
export const KNOWLEDGE_VS_MODEL_DISCLAIMER =
  '레벨·XP는 게임 속 성장 지표예요. 실제 Gemini AI 모델의 성능이 바뀌는 것은 아니에요.'
