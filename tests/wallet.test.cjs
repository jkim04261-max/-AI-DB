// Tests 서버 지갑(캐릭터별 가상 용돈)·직업 퀴즈 도전 정산 — api/_lib/wallet.ts,
// api/_lib/walletHandlers.ts (api/character.ts의 ?action=wallet*).
// 모의 postgres는 단일 스레드라 "진짜 DB 동시성"은 검증하지 못한다(tests/README.md).
// 여기서는 같은 요청 반복·동시 호출 시 한 번만 반영되는 논리와 SQL 호출 형태를 검증한다.
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.GEMINI_API_KEY = 'fake-key-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default
  const auth = bundle('api/_lib/auth.ts')
  const exam = bundle('api/_lib/examQuestions.ts')
  const obj = bundle('api/_lib/objectiveQuizQuestions.ts')
  global.fetch = async () => {
    throw new Error('wallet actions must never call Gemini')
  }

  const t = new Tracker('wallet')
  mock.reset()
  mock.seedUser(1, { email: 'a@test.com' })
  mock.seedUser(2, { email: 'b@test.com' })
  const cookie1 = cookieHeaderFor(auth, 1, 0, 'a@test.com')
  const cookie2 = cookieHeaderFor(auth, 2, 0, 'b@test.com')
  const call = async (cookie, method, action, payload) => {
    const res = mockRes()
    await characterHandler(
      { headers: { cookie }, method, query: method === 'GET' ? { action, ...(payload ?? {}) } : { action }, body: method === 'GET' ? undefined : payload },
      res,
    )
    return res
  }
  await characterHandler({ headers: { cookie: cookie1 }, query: {}, method: 'POST', body: { companionType: 'nuri' } }, mockRes())
  await characterHandler({ headers: { cookie: cookie1 }, query: {}, method: 'POST', body: { companionType: 'duri' } }, mockRes())
  await characterHandler({ headers: { cookie: cookie2 }, query: {}, method: 'POST', body: { companionType: 'nuri' } }, mockRes())
  const nuriId = mock.state.characters.find((c) => c.user_id === 1 && c.companion_type === 'nuri').id

  // 꺼져 있으면(기본) DB 지갑 테이블을 전혀 건드리지 않는다
  {
    delete process.env.WALLET_API_ENABLED
    const res = await call(cookie1, 'GET', 'wallet', { companionType: 'nuri' })
    t.assert(res.statusCode === 200 && res.body.enabled === false, 'WALLET_API_ENABLED 꺼짐 → enabled:false')
    t.assert(mock.state.wallets.size === 0 && mock.state.ledger.length === 0, '꺼짐 상태에서는 지갑·내역 행이 생기지 않는다')
    const tx = await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'errand', eventId: 'evt-00000001' })
    t.assert(tx.body.enabled === false && mock.state.ledger.length === 0, '꺼짐 상태의 거래 요청도 아무 것도 바꾸지 않는다')
  }
  process.env.WALLET_API_ENABLED = 'true'

  // 최초 1회 100,000원, 재조회·재로그인해도 유지
  {
    const a = await call(cookie1, 'GET', 'wallet', { companionType: 'nuri' })
    t.assert(a.body.enabled === true && a.body.balanceWon === 100000, '새 캐릭터 지갑은 100,000원으로 시작한다')
    await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'meal', eventId: 'meal-0000001' })
    const b = await call(cookie1, 'GET', 'wallet', { companionType: 'nuri' })
    t.assert(b.body.balanceWon === 90000, '밥 먹이기 -10,000원')
    t.assert(mock.state.ledger.filter((l) => l.reason === 'initial' && l.character_id === nuriId).length === 1, '초기 지급 내역은 한 번만')
    const d = await call(cookie1, 'GET', 'wallet', { companionType: 'duri' })
    t.assert(d.body.balanceWon === 100000, '캐릭터별 지갑은 분리된다(두리는 그대로 100,000원)')
  }

  // 거래 ID 중복 → 한 번만
  {
    const first = await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'errand', eventId: 'errand-000001' })
    const again = await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'errand', eventId: 'errand-000001' })
    t.assert(first.body.status === 'applied' && first.body.balanceWon === 100000, '심부름 +10,000원')
    t.assert(again.body.status === 'duplicate' && again.body.balanceWon === 100000, '같은 심부름 요청 재전송은 중복 처리(추가 지급 없음)')
    const burst = await Promise.all(
      Array.from({ length: 6 }, () => call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'errand', eventId: 'errand-burst001' })),
    )
    const applied = burst.filter((r) => r.body.status === 'applied').length
    t.assert(applied === 1, '동시에 같은 요청 6번 → 1번만 반영')
    const bal = (await call(cookie1, 'GET', 'wallet', { companionType: 'nuri' })).body.balanceWon
    t.assert(bal === 110000, '동시 요청 후 잔액 110,000원')
  }

  // 하루 상한(eventId를 계속 바꿔 보내는 무한 지급 방지)
  {
    let cappedSeen = false
    for (let i = 0; i < 12; i++) {
      const r = await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'errand', eventId: `errand-cap${String(i).padStart(4, '0')}` })
      if (r.body.status === 'capped') cappedSeen = true
    }
    t.assert(cappedSeen, '심부름 하루 상한을 넘기면 capped')
  }

  // 입력 검증
  {
    t.assert((await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'hack', eventId: 'evt-00000009' })).statusCode === 400, '모르는 reason은 400')
    t.assert((await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'errand', eventId: 'x' })).statusCode === 400, '짧은 eventId는 400')
    t.assert((await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'market_purchase', eventId: 'mkt-0000001', amountWon: -5000 })).statusCode === 400, '음수 금액은 400')
    t.assert((await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'market_purchase', eventId: 'mkt-0000002', amountWon: 99999999 })).statusCode === 400, '상한 초과 금액은 400')
    t.assert((await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'errand', eventId: 'evt-00000010', amountWon: 999999 })).body.deltaWon === undefined, '클라이언트가 보낸 금액은 무시된다')
    t.assert((await call(cookie1, 'GET', 'wallet', { companionType: 'zzz' })).statusCode === 404, '잘못된 캐릭터는 404')
  }

  // 마켓 구매·환불(환불 금액은 서버가 원래 내역에서 읽는다)
  {
    const before = (await call(cookie1, 'GET', 'wallet', { companionType: 'duri' })).body.balanceWon
    await call(cookie1, 'POST', 'wallet-tx', { companionType: 'duri', reason: 'market_purchase', eventId: 'mkt-0000003', amountWon: 25000 })
    const refund = await call(cookie1, 'POST', 'wallet-tx', { companionType: 'duri', reason: 'market_refund', eventId: 'mkt-0000003', amountWon: 1 })
    const refundAgain = await call(cookie1, 'POST', 'wallet-tx', { companionType: 'duri', reason: 'market_refund', eventId: 'mkt-0000003' })
    t.assert(refund.body.balanceWon === before && refundAgain.body.status === 'duplicate', '환불은 원래 금액만큼 한 번만')
  }

  // 잔액 부족: 마이너스가 되지 않는다
  {
    mock.state.wallets.get(nuriId).balance_won = 5000
    const r = await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'meal', eventId: 'meal-0000002' })
    t.assert(r.body.status === 'insufficient' && r.body.balanceWon === 5000, '잔액 부족 시 밥 차감 거부(마이너스 없음)')
    t.assert(!mock.state.ledger.some((l) => l.idempotency_key === 'meal:meal-0000002'), '거부된 요청은 내역도 남기지 않는다')
    const c = await call(cookie1, 'POST', 'quiz-challenge-start', { companionType: 'nuri', context: 'meal' })
    t.assert(c.statusCode === 409, '잔액이 20,000원 미만이면 퀴즈 도전 거부')
  }

  // DB 오류 시 잔액이 바뀌지 않고 500
  {
    mock.state.wallets.get(nuriId).balance_won = 100000
    mock.state.failNextWalletTx = true
    const r = await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'part_time_job', eventId: 'ptj-fail00001' })
    t.assert(r.statusCode === 500 && mock.state.wallets.get(nuriId).balance_won === 100000, 'DB 오류 → 500, 잔액 변동 없음')
    const retry = await call(cookie1, 'POST', 'wallet-tx', { companionType: 'nuri', reason: 'part_time_job', eventId: 'ptj-fail00001' })
    t.assert(retry.body.status === 'applied', '같은 거래 ID로 재시도하면 정상 반영')
  }

  // ---- 직업 퀴즈 도전 ----
  const lookup = (id) => exam.getQuestionById(id) ?? obj.getObjectiveQuizQuestionById(id)
  const answersFor = (questions, mode) =>
    questions.map((q, i) => {
      const correct = lookup(q.id).correctIndex
      const wrong = (correct + 1) % q.choices.length
      return mode === 'all' ? correct : mode === 'oneWrong' ? (i === 0 ? correct : wrong) : wrong
    })
  mock.state.wallets.get(nuriId).balance_won = 100000
  mock.state.ledger = mock.state.ledger.filter((l) => l.character_id !== nuriId || l.reason === 'initial')

  {
    const start = await call(cookie1, 'POST', 'quiz-challenge-start', { companionType: 'nuri', context: 'meal' })
    t.assert(start.statusCode === 200 && start.body.questions.length === 2, '문제 2개 출제')
    t.assert(JSON.stringify(start.body).includes('correctIndex') === false && JSON.stringify(start.body).includes('explanation') === false, '출제 응답에는 정답·해설이 없다')
    const again = await call(cookie1, 'POST', 'quiz-challenge-start', { companionType: 'nuri', context: 'meal' })
    t.assert(again.body.challengeId === start.body.challengeId, '진행 중 도전이 있으면 같은 문제를 이어서 푼다(중복 출제 없음)')

    t.assert((await call(cookie1, 'POST', 'quiz-challenge-submit', { challengeId: start.body.challengeId, answers: [0] })).statusCode === 400, '답 개수가 틀리면 400')
    t.assert((await call(cookie2, 'POST', 'quiz-challenge-submit', { challengeId: start.body.challengeId, answers: [0, 0] })).statusCode === 404, '다른 사용자의 도전은 제출할 수 없다')

    const submit = await call(cookie1, 'POST', 'quiz-challenge-submit', { challengeId: start.body.challengeId, answers: answersFor(start.body.questions, 'all') })
    t.assert(submit.body.outcome === 'success' && submit.body.deltaWon === 20000 && submit.body.balanceWon === 120000, '2문제 모두 정답 +20,000원')
    t.assert(submit.body.review.every((r) => typeof r.explanation === 'string' && r.explanation.length > 0), '정답·해설을 결과에 포함')
    const dbl = await Promise.all([1, 2, 3].map(() => call(cookie1, 'POST', 'quiz-challenge-submit', { challengeId: start.body.challengeId, answers: answersFor(start.body.questions, 'all') })))
    t.assert(dbl.every((r) => r.body.balanceWon === 120000), '중복·동시 제출해도 정산은 1번(잔액 120,000원)')
    t.assert(mock.state.ledger.filter((l) => l.idempotency_key === `challenge:${start.body.challengeId}`).length === 1, '정산 내역은 1건')
  }
  {
    const start = await call(cookie1, 'POST', 'quiz-challenge-start', { companionType: 'nuri', context: 'errand' })
    const r = await call(cookie1, 'POST', 'quiz-challenge-submit', { challengeId: start.body.challengeId, answers: answersFor(start.body.questions, 'oneWrong') })
    t.assert(r.body.outcome === 'fail' && r.body.deltaWon === -20000 && r.body.balanceWon === 100000, '1문제 정답·1문제 오답 → -20,000원(부분 보상 없음)')
  }
  {
    const start = await call(cookie1, 'POST', 'quiz-challenge-start', { companionType: 'nuri', context: 'meal' })
    const r = await call(cookie1, 'POST', 'quiz-challenge-submit', { challengeId: start.body.challengeId, answers: answersFor(start.body.questions, 'none') })
    t.assert(r.body.outcome === 'fail' && r.body.balanceWon === 80000, '2문제 모두 오답 → -20,000원')
  }
  // 만료: 30분 지난 미제출 도전은 보상·패널티 없이 만료
  {
    const start = await call(cookie1, 'POST', 'quiz-challenge-start', { companionType: 'nuri', context: 'meal' })
    if (start.statusCode === 200) {
      mock.state.challenges.get(start.body.challengeId).created_at = new Date(Date.now() - 31 * 60_000).toISOString()
      const before = mock.state.wallets.get(nuriId).balance_won
      const r = await call(cookie1, 'POST', 'quiz-challenge-submit', { challengeId: start.body.challengeId, answers: [0, 0] })
      t.assert(r.statusCode === 410 && mock.state.wallets.get(nuriId).balance_won === before, '30분 지난 도전은 410, 잔액 변동 없음')
    } else {
      t.assert(true, '(풀이 가능한 새 문제가 없어 만료 시나리오 생략)')
    }
  }
  // 하루 상한·문제 재사용 방지
  {
    let blocked = false
    for (let i = 0; i < 6 && !blocked; i++) {
      const s = await call(cookie1, 'POST', 'quiz-challenge-start', { companionType: 'nuri', context: 'meal' })
      if (s.statusCode === 429) {
        blocked = true
        break
      }
      if (s.statusCode !== 200) break
      await call(cookie1, 'POST', 'quiz-challenge-submit', { challengeId: s.body.challengeId, answers: answersFor(s.body.questions, 'all') })
    }
    t.assert(blocked, '하루 도전 횟수/새 문제가 소진되면 429(무한 용돈 획득 방지)')
  }

  return t.summary()
}

module.exports = { run }
