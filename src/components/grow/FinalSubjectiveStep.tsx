import { useState } from 'react'
import { useGrowth, type CompanionType } from '../../context/GrowthContext'
import type { MissionProgress } from '../../data/characterMissions'

// 지시서(학습 플로우 전면 개편) 3단계 "주관식 1문제(개인 노하우)" — 기존
// "직접 입력하기" 카드와 똑같은 verify-knowledge → signed token →
// save-knowledge 파이프라인(PR #44 보안 모델)을 그대로 재사용하지만,
// 화면은 전용 textarea 하나뿐이고 버튼도 '완료' 하나뿐이다. 지시서가
// 요구한 한 번의 '완료' 클릭 UX를 지키기 위해, 이 한 번의 클릭이 내부에서
// 검증→저장 두 단계를 순서대로 처리한다 — 검증에서 막히면(수정 필요·
// 검증 불가) 토큰 저장을 건너뛰고 안내만 보여주고, 사용자가 내용을
// 고친 뒤 같은 '완료' 버튼을 다시 누르면 된다(기존 검증 보안 모델은
// 전혀 바뀌지 않는다).
//
// 문구의 "[유저이름]": 실제 로그인한 사용자의 표시 이름은 이 앱에
// 어디에도 저장되어 있지 않다(AuthContext/users 테이블에 email만
// 있음 — 배고픔 이벤트 모달에서 캐릭터 이름을 COMPANION_LABEL로 대체한
// 것과 같은 이유의 같은 종류의 빈 칸). 여기서는 이름 자리를 그냥 비워
// "8살 아이에게 꼭 해주고 싶은 말이나 나만의 노하우를 적어주세요."로
// 표시한다.
const FIXED_TITLE = '8살 아이에게 전하는 노하우'

export default function FinalSubjectiveStep({
  companionType,
  onSaved,
}: {
  companionType: CompanionType
  onSaved: (missionProgress: MissionProgress | null) => void
}) {
  const { verifyKnowledge, saveKnowledge } = useGrowth()

  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleComplete = async () => {
    if (!content.trim()) return
    setBusy(true)
    setError(null)
    setIssue(null)
    try {
      const verifyResult = await verifyKnowledge(companionType, FIXED_TITLE, content)
      if (verifyResult.ageBlocked) {
        setIssue('아직은 너무 어려워서 이해하기 힘들어요! 내용을 조금 더 쉽게 바꿔주세요.')
        return
      }
      if (verifyResult.verification.status !== 'appropriate') {
        setIssue(
          verifyResult.verification.suggestion
            ? `${verifyResult.verification.explanation} 혹시 "${verifyResult.verification.suggestion}"는 어때요?`
            : verifyResult.verification.explanation || '내용을 조금 더 구체적으로 적어주세요.',
        )
        return
      }
      const saveResult = await saveKnowledge(companionType, FIXED_TITLE, content, content, verifyResult.verificationToken, 'subjective')
      onSaved(saveResult.missionProgress)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하는 중 오류가 발생했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-purple-400/25 bg-purple-400/5 p-4" data-testid="final-subjective-step">
      <p className="text-lg font-extrabold text-purple-200 sm:text-xl">✨ 3단계 · 마지막 한 마디</p>
      <p className="text-sm font-semibold text-purple-200/80 sm:text-base">
        8살 아이에게 꼭 해주고 싶은 말이나 나만의 노하우를 적어주세요.
      </p>
      <textarea
        data-testid="final-subjective-textarea"
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          setIssue(null)
        }}
        placeholder="예: 모르는 건 부끄러운 게 아니야, 꼭 물어봐도 괜찮아!"
        maxLength={2000}
        rows={4}
        className="rounded-xl border border-purple-400/25 bg-slate-900/60 px-4 py-3 text-lg font-medium text-slate-100 placeholder:text-slate-500 focus:border-purple-400/60 focus:outline-none"
      />
      {issue && <p className="text-base font-bold text-amber-300">{issue}</p>}
      {error && <p className="text-base font-bold text-rose-300">{error}</p>}
      <button
        type="button"
        data-testid="final-subjective-complete-button"
        onClick={() => void handleComplete()}
        disabled={busy || !content.trim()}
        className="self-start rounded-xl border-2 border-emerald-300/60 bg-gradient-to-b from-emerald-400/40 to-emerald-600/30 px-5 py-3 text-base font-extrabold text-emerald-100 shadow-[0_3px_0_rgba(16,185,129,0.4)] disabled:opacity-50"
      >
        {busy ? '저장 중...' : '완료'}
      </button>
    </div>
  )
}
