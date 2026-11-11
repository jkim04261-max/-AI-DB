import JobQuiz from '../components/JobQuiz'

// 지시서(직업 그림 퀴즈): 신규 라우트 전용 페이지. JobQuiz가 쓰는
// useMockWallet은 카드 맞추기(/card-match)·/grow 어느 쪽과도 공유하지
// 않는 독립 인스턴스다(사용자 확인: "독립적인 별도 잔액").
export default function JobQuizPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-slate-900">직업 그림 퀴즈</h1>
        <p className="text-sm text-slate-500">그림을 보고 어떤 직업인지, 어떤 직업이 쓰는 도구인지 맞혀 보세요!</p>
      </div>
      <JobQuiz />
    </div>
  )
}
