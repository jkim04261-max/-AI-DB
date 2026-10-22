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

export function buildSavedReply(source: 'user_taught' | 'ai_generated'): string {
  return source === 'user_taught'
    ? '이 지식을 배웠어요! 다음엔 또 어떤 걸 가르쳐 주실 건가요?'
    : '이 지식을 학습 기록에 저장했어요! 다음엔 또 무엇을 공부해볼까요?'
}
