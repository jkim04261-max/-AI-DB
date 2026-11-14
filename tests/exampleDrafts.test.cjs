// Tests the "AI 예시문 3개 만들어주기" actions on api/character.ts
// (?action=generate-example-drafts / purchase-example-draft-credit) — see
// api/_lib/exampleDraftsLimit.ts and api/_lib/gemini.ts's
// generateExampleDrafts. Same bundled-handler + in-memory Postgres mock
// pattern as tests/knowledge.test.cjs (see tests/README.md).
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.GEMINI_API_KEY = 'fake-key-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default
  const auth = bundle('api/_lib/auth.ts')

  let geminiBehavior = {
    kind: 'json',
    result: {
      drafts: [
        { title: '제목1', content: '아이디어1' },
        { title: '제목2', content: '아이디어2' },
        { title: '제목3', content: '아이디어3' },
      ],
    },
  }
  global.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
      if (geminiBehavior.kind === 'network-error') {
        throw new Error('simulated network failure')
      }
      if (geminiBehavior.kind === 'http-error') {
        return { ok: false, status: geminiBehavior.status ?? 500, json: async () => ({ error: { message: 'simulated failure' } }) }
      }
      if (geminiBehavior.kind === 'malformed') {
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '이건 JSON이 아니에요' }] } }] }) }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiBehavior.result) }] } }] }),
      }
    }
    throw new Error(`unexpected fetch to ${url}`)
  }

  const t = new Tracker('exampleDrafts')

  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' })
  const cookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const aliceReq = (overrides = {}) => ({ headers: { cookie }, query: {}, ...overrides })

  await characterHandler(aliceReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
  await characterHandler(aliceReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())

  // --- 인증 필요 ---
  {
    const res = mockRes()
    await characterHandler({ method: 'POST', headers: {}, query: { action: 'generate-example-drafts' }, body: {} }, res)
    t.assert(res.statusCode === 401, 'generate-example-drafts는 로그인 없이는 401로 거부된다')
  }
  {
    const res = mockRes()
    await characterHandler({ method: 'POST', headers: {}, query: { action: 'purchase-example-draft-credit' }, body: {} }, res)
    t.assert(res.statusCode === 401, 'purchase-example-draft-credit도 로그인 없이는 401로 거부된다')
  }

  // --- 직업이 없으면 거부 ---
  {
    mock.seedUser(2, { email: 'bob@test.com' })
    const bobCookie = cookieHeaderFor(auth, 2, 0, 'bob@test.com')
    await characterHandler({ headers: { cookie: bobCookie }, query: {}, method: 'POST', body: { companionType: 'nuri' } }, mockRes())
    const res = mockRes()
    await characterHandler(
      { headers: { cookie: bobCookie }, query: { action: 'generate-example-drafts' }, method: 'POST', body: { companionType: 'nuri' } },
      res,
    )
    t.assert(res.statusCode === 400, '직업이 없는 캐릭터는 예시문 생성을 거부한다(400)')
  }

  // --- 캐릭터당 평생 3번 무료 — 성공 3번, 4번째는 유료 크레딧 없으면 402 ---
  {
    let last
    for (let i = 0; i < 3; i++) {
      last = mockRes()
      await characterHandler(aliceReq({ method: 'POST', query: { action: 'generate-example-drafts' }, body: { companionType: 'nuri' } }), last)
      t.assert(last.statusCode === 200, `${i + 1}번째 무료 예시문 생성은 성공한다`)
      t.assert(Array.isArray(last.body.drafts) && last.body.drafts.length === 3, '응답에 예시문 3개가 담겨 온다')
      t.assert(last.body.drafts[0].title === '제목1' && last.body.drafts[0].content === '아이디어1', '예시문 title/content가 Gemini 응답 그대로 내려온다')
    }
    t.assert(last.body.exampleDraftsFreeRemaining === 0, '3번 다 쓰면 무료 남은 횟수는 0이다')
    t.assert(last.body.exampleDraftsFreeLimit === 3, 'exampleDraftsFreeLimit은 3이다')
    t.assert(last.body.exampleDraftsPaidCredits === 0, '아직 구매한 적이 없으므로 유료 크레딧은 0이다')
    t.assert(last.body.usedFree === true, '세 번 모두 무료 횟수를 소비했다고 표시된다')

    const over = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'generate-example-drafts' }, body: { companionType: 'nuri' } }), over)
    t.assert(over.statusCode === 402, '무료 3번을 다 쓰고 유료 크레딧도 없으면 402로 거부된다')
    t.assert(over.body.exampleDraftsFreeRemaining === 0 && over.body.exampleDraftsPaidCredits === 0, '402 응답에도 현재 남은 값(0, 0)이 함께 내려온다')

    // 무료 3번을 다시 받으려고 재시도해도(= 다시 생성) 늘어나지 않는다 —
    // 평생 한도이므로 몇 번을 더 호출해도 계속 402다.
    const retried = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'generate-example-drafts' }, body: { companionType: 'nuri' } }), retried)
    t.assert(retried.statusCode === 402, '무료 한도는 재시도해도 다시 채워지지 않는다(평생 3번)')
  }

  // --- 구매: 만능마켓 "AI 추천 충전권" 구매 직후 호출되는 액션 — 실제
  // DB에 영속되는 크레딧을 지급하고, 그걸로 다시 생성할 수 있어야 한다 ---
  {
    const purchase = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'purchase-example-draft-credit' }, body: { companionType: 'nuri' } }), purchase)
    t.assert(purchase.statusCode === 200, '충전권 구매 직후 호출은 성공한다')
    t.assert(purchase.body.exampleDraftsPaidCredits === 1, '구매 1회로 유료 크레딧이 1이 된다')

    const generated = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'generate-example-drafts' }, body: { companionType: 'nuri' } }), generated)
    t.assert(generated.statusCode === 200, '유료 크레딧이 있으면 무료가 소진된 뒤에도 생성이 성공한다')
    t.assert(generated.body.usedFree === false, '이번엔 무료가 아니라 유료 크레딧을 소비했다고 표시된다')
    t.assert(generated.body.exampleDraftsPaidCredits === 0, '유료 크레딧을 1개 썼으므로 남은 크레딧은 0이다')

    const overAgain = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'generate-example-drafts' }, body: { companionType: 'nuri' } }), overAgain)
    t.assert(overAgain.statusCode === 402, '무료·유료 크레딧을 전부 다시 소진하면 또 402다')
  }

  // --- 새로고침 후에도 유지되는지 — GET(캐릭터 목록)에 실제로 포함돼
  // 있어야 한다(가상용돈처럼 체험판으로 사라지지 않는다). ---
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'GET' }), res)
    const nuri = (res.body.characters ?? []).find((c) => c.companion_type === 'nuri')
    t.assert(nuri != null, '캐릭터 목록에서 alice의 누리를 찾을 수 있다')
    t.assert(nuri.example_drafts_free_used === 3, '캐릭터 행에 무료 사용 횟수(3)가 실제로 저장되어 있다')
    t.assert(nuri.example_drafts_paid_credits === 0, '유료 크레딧도(1개 구매→1개 소비) 실제로 0으로 저장되어 있다')
  }

  // --- 다른 사용자 차단 ---
  {
    mock.seedUser(3, { email: 'carol@test.com' })
    const carolCookie = cookieHeaderFor(auth, 3, 0, 'carol@test.com')
    const res = mockRes()
    await characterHandler(
      { headers: { cookie: carolCookie }, query: { action: 'generate-example-drafts' }, method: 'POST', body: { companionType: 'nuri' } },
      res,
    )
    t.assert(res.statusCode === 404, 'carol이 alice의 누리를 대신 쓰려 해도 404로 차단된다')
    const purchaseRes = mockRes()
    await characterHandler(
      { headers: { cookie: carolCookie }, query: { action: 'purchase-example-draft-credit' }, method: 'POST', body: { companionType: 'nuri' } },
      purchaseRes,
    )
    t.assert(purchaseRes.statusCode === 404, 'carol이 alice의 누리에 크레딧을 지급하려 해도 404로 차단된다')
  }

  // --- Gemini 실패 시 환불 — 쓸 수 있는 결과가 없으므로 무료/유료 어느
  // 쪽도 소비되지 않아야 한다 ---
  {
    mock.seedUser(4, { email: 'dave@test.com' })
    const daveCookie = cookieHeaderFor(auth, 4, 0, 'dave@test.com')
    const daveReq = (overrides = {}) => ({ headers: { cookie: daveCookie }, query: {}, ...overrides })
    await characterHandler(daveReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(daveReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())

    geminiBehavior = { kind: 'malformed' }
    const failed = mockRes()
    await characterHandler(daveReq({ method: 'POST', query: { action: 'generate-example-drafts' }, body: { companionType: 'nuri' } }), failed)
    t.assert(failed.statusCode >= 500, 'Gemini가 해석 불가능한 응답을 주면 실패로 처리된다')

    geminiBehavior = {
      kind: 'json',
      result: { drafts: [{ title: 'x', content: 'y' }, { title: 'x2', content: 'y2' }, { title: 'x3', content: 'y3' }] },
    }
    let lastOk
    for (let i = 0; i < 3; i++) {
      lastOk = mockRes()
      await characterHandler(daveReq({ method: 'POST', query: { action: 'generate-example-drafts' }, body: { companionType: 'nuri' } }), lastOk)
    }
    t.assert(
      lastOk.statusCode === 200 && lastOk.body.exampleDraftsFreeRemaining === 0,
      '방금 실패한 시도는 환불되어 소비로 치지 않았으므로, 그 뒤로 정확히 3번(무료 한도)만 더 성공한다',
    )

    // 무료 한도는 이미 0 — 유료 크레딧을 하나 사서, 그걸 소비하는
    // 시도가 네트워크 실패했을 때도 똑같이 환불되는지 확인한다.
    await characterHandler(daveReq({ method: 'POST', query: { action: 'purchase-example-draft-credit' }, body: { companionType: 'nuri' } }), mockRes())
    geminiBehavior = { kind: 'network-error' }
    const networkFailed = mockRes()
    await characterHandler(daveReq({ method: 'POST', query: { action: 'generate-example-drafts' }, body: { companionType: 'nuri' } }), networkFailed)
    t.assert(networkFailed.statusCode >= 500, '네트워크 실패도 실패로 처리된다(이번엔 유료 크레딧을 소비하려다 실패)')
    const stillOne = mockRes()
    await characterHandler(daveReq({ method: 'GET' }), stillOne)
    const daveNuri = (stillOne.body.characters ?? []).find((c) => c.companion_type === 'nuri')
    t.assert(daveNuri.example_drafts_free_used === 3, '무료 사용 횟수는 그대로 3이다(이번 시도는 유료 크레딧 쪽)')
    t.assert(daveNuri.example_drafts_paid_credits === 1, '네트워크 실패로 소비된 유료 크레딧이 정확히 환불되어 1로 되돌아온다')
  }

  return t.summary()
}

module.exports = { run }
