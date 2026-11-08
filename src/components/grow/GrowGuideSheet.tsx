import BottomSheet from './BottomSheet'

// 지시서("누리AI 키우기 간단 설명서" UI 추가): 처음 들어온 사용자가
// 성장 규칙(연령 진화 조건)·직업 변경·미션 진행 방법을 화면 어딘가를
// 헤매지 않고 한 번에 확인할 수 있도록 만든, 순수 읽기 전용 도움말
// 패널이다. 기존 BottomSheet(default variant, 목재 톤)를 그대로
// 재사용해 다른 6개 패널과 톤을 맞췄고, 새 상태·로직은 GrowPage.tsx의
// showGuide 하나뿐이라 기존 미션/진화/직업 변경 흐름에는 전혀
// 끼어들지 않는다.
export default function GrowGuideSheet({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet title="📖 누리AI 키우기 간단 설명서" onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm text-amber-900">
        <section className="flex flex-col gap-1.5">
          <h2 className="text-sm font-bold text-amber-800">🌱 성장 규칙 (8~9살 → 10대)</h2>
          <p className="text-amber-800/80">
            8~9살 단계에서 아래 6가지 학습/시험을 모두 마치면, 레벨과 상관없이 그 즉시 10대로 자동 진화해요.
          </p>
          <ul className="flex flex-col gap-1 rounded-xl bg-amber-100/60 p-3">
            <li>🎯 예시 문제 풀이형 2개 (AI 추천 받기)</li>
            <li>📝 객관식 2개 (선택지에서 고르기)</li>
            <li>✏️ 노하우 설계형 2개 (직접 입력하기)</li>
          </ul>
          <p className="text-xs text-amber-700/70">
            "가르치기 · 스스로 공부하기" 화면을 열면 지금까지 몇 개를 채웠는지 진행 현황이 함께 보여요.
          </p>
        </section>

        <section className="flex flex-col gap-1.5">
          <h2 className="text-sm font-bold text-amber-800">💼 직업 변경 방법</h2>
          <p className="text-amber-800/80">
            화면 맨 위쪽, 제목 바로 아래에 있는 <strong>"직업 변경"</strong> 버튼을 누르면 언제든 직업을 새로 고를 수 있어요. 이미 선택한 직업을 바꿀 때는 변경 전 확인 메시지가 한 번 더 나와요.
          </p>
        </section>

        <section className="flex flex-col gap-1.5">
          <h2 className="text-sm font-bold text-amber-800">📚 미션 진행 방법</h2>
          <p className="text-amber-800/80">게임 메뉴의 "가르치기 · 스스로 공부하기"를 열면 세 가지 방법으로 지식을 채울 수 있어요.</p>
          <ul className="flex flex-col gap-1 rounded-xl bg-amber-100/60 p-3">
            <li>🎯 선택지에서 고르기 — 미리 준비된 예시를 눌러서 바로 채워요</li>
            <li>✨ AI 추천 받기 — AI가 예시를 만들어주면 확인하고 저장해요</li>
            <li>✏️ 직접 입력하기 — 제목과 내용을 직접 써서 가르쳐요</li>
          </ul>
          <p className="text-xs text-amber-700/70">
            작성한 내용은 Gemini 검증을 통과해야 저장되고, 저장해야 경험치와 미션 진행도가 올라가요.
          </p>
        </section>
      </div>
    </BottomSheet>
  )
}
