import CardMatchGame from '../components/games/CardMatchGame'

// 지시서(직업 카드 맞추기 미니게임): 신규 라우트 전용 페이지. 기존
// /grow 페이지·로직은 전혀 건드리지 않는다 — CardMatchGame이 쓰는
// useMockWallet은 /grow의 것과 공유하지 않는 독립 인스턴스다(사용자
// 확인: "독립적인 별도 잔액").
export default function CardMatchPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-slate-900">직업 카드 맞추기</h1>
        <p className="text-sm text-slate-500">직업 카드를 뒤집고, 그 직업이 쓰는 도구 카드를 찾아 짝지어 보세요!</p>
      </div>
      <CardMatchGame />
    </div>
  )
}
