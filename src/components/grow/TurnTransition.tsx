// PR #49: [가르치기]/[스스로 공부하기]/[문제 풀기]를 누르면 바로 텍스트
// 입력 폼이 뜨는 대신, 짧은 "턴 진행" 연출을 한 번 보여준 뒤 기존 패널을
// 연다 — 실제 입력 폼(InteractionPanel/ExamPanel)의 내부 로직은 전혀
// 건드리지 않고, 그 앞에 거치는 전환 화면만 추가했다.
export default function TurnTransition({ label }: { label: string }) {
  return (
    <div
      data-testid="turn-transition"
      className="motion-safe:animate-[grow-bubble-pop_0.2s_ease-out] absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-amber-950/70 text-center"
    >
      <p className="text-sm font-bold text-amber-50">{label}</p>
    </div>
  )
}
