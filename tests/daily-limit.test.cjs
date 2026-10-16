// Regression suite for the daily free-question limit (PR #36,
// api/_lib/dailyLimit.ts + api/conversations/[id].ts + api/auth/me.ts).
//
// Runs the actual handler code (bundled with esbuild) against an in-memory
// Postgres mock — see tests/README.md for what this does and doesn't prove.
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.GEMINI_API_KEY = 'fake-key-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const auth = bundle('api/_lib/auth.ts')
  const convHandler = bundle('api/conversations/[id].ts').default
  const meHandler = bundle('api/auth/me.ts').default

  let geminiShouldFail = false
  global.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
      if (geminiShouldFail) {
        return { ok: false, status: 500, json: async () => ({ error: { message: 'simulated failure' } }) }
      }
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'mock answer' }] } }] }) }
    }
    throw new Error(`unexpected fetch to ${url}`)
  }

  function makeReq(userId, tokenVersion, { method = 'POST', query = {}, body = {} } = {}) {
    return {
      method,
      query,
      body,
      headers: { cookie: cookieHeaderFor(auth, userId, tokenVersion), host: 'test.local' },
    }
  }

  const t = new Tracker('daily-limit')

  // --- Scenario 1: flag OFF — fully unchanged behavior ---
  mock.reset()
  process.env.DAILY_QUESTION_LIMIT_ENABLED = 'false'
  mock.seedUser(1, { tokenVersion: 0 })
  mock.seedConversation(100, 1)
  for (let i = 1; i <= 12; i++) {
    const res = mockRes()
    await convHandler(makeReq(1, 0, { query: { id: '100' }, body: { text: `msg ${i}` } }), res)
    if (i === 1 || i === 12) {
      t.assert(res.statusCode === 201, `flag-off request ${i} succeeds (201)`)
      t.assert(res.body.remaining === undefined, `flag-off request ${i} has no 'remaining' field`)
    }
  }
  t.assert(
    !mock.state.calls.some((c) => c.includes('daily_question_usage')),
    'flag OFF: daily_question_usage table never touched',
  )
  {
    const meRes = mockRes()
    await meHandler({ headers: { cookie: cookieHeaderFor(auth, 1, 0) } }, meRes)
    t.assert(meRes.body.remainingQuestions === undefined, '/me omits remainingQuestions when flag is off')
  }

  // --- Scenario 2: flag ON — 10 allowed, 11th blocked, no orphan message ---
  mock.reset()
  process.env.DAILY_QUESTION_LIMIT_ENABLED = 'true'
  mock.seedUser(2, { tokenVersion: 0 })
  mock.seedConversation(200, 2)
  for (let i = 1; i <= 10; i++) {
    const res = mockRes()
    await convHandler(makeReq(2, 0, { query: { id: '200' }, body: { text: `q${i}`, requestId: `r-${i}` } }), res)
    t.assert(res.statusCode === 201 && res.body.remaining === 10 - i, `question ${i}/10 allowed, remaining=${10 - i}`)
  }
  {
    const res = mockRes()
    const before = mock.state.messages.length
    await convHandler(makeReq(2, 0, { query: { id: '200' }, body: { text: 'q11', requestId: 'r-11' } }), res)
    t.assert(res.statusCode === 429, '11th question blocked with 429')
    t.assert(mock.state.messages.length === before, 'blocked question inserts no message row')
  }

  // --- Scenario 3: Gemini failure refunds the reservation ---
  mock.reset()
  mock.seedUser(3, { tokenVersion: 0 })
  mock.seedConversation(300, 3)
  geminiShouldFail = true
  {
    const res = mockRes()
    await convHandler(makeReq(3, 0, { query: { id: '300' }, body: { text: 'will fail', requestId: 'f-1' } }), res)
    t.assert(res.body.aiMessage.error === true, 'Gemini failure marks aiMessage.error')
    t.assert(res.body.remaining === 10, 'remaining stays 10 after a refunded question')
  }
  geminiShouldFail = false

  // --- Scenario 4: duplicate requestId is not double-charged ---
  mock.reset()
  mock.seedUser(4, { tokenVersion: 0 })
  mock.seedConversation(400, 4)
  {
    const res1 = mockRes()
    await convHandler(makeReq(4, 0, { query: { id: '400' }, body: { text: 'dup', requestId: 'dup-1' } }), res1)
    const res2 = mockRes()
    await convHandler(makeReq(4, 0, { query: { id: '400' }, body: { text: 'dup', requestId: 'dup-1' } }), res2)
    t.assert(res2.body.aiMessage.text === res1.body.aiMessage.text, 'replayed request returns the cached reply')
    const usageRow = mock.state.dailyUsage.get(`4|${mock.state.fakeDateKST}`)
    t.assert(usageRow.used_count === 1, 'duplicate request does not double-charge the counter')
  }

  // --- Scenario 5: separate accounts have separate counters ---
  mock.reset()
  mock.seedUser(5, { tokenVersion: 0 })
  mock.seedUser(6, { tokenVersion: 0 })
  mock.seedConversation(500, 5)
  mock.seedConversation(600, 6)
  for (let i = 1; i <= 10; i++) {
    await convHandler(makeReq(5, 0, { query: { id: '500' }, body: { text: `a${i}`, requestId: `a-${i}` } }), mockRes())
  }
  {
    const res = mockRes()
    await convHandler(makeReq(6, 0, { query: { id: '600' }, body: { text: 'b1', requestId: 'b-1' } }), res)
    t.assert(res.statusCode === 201 && res.body.remaining === 9, "a second account's quota is unaffected by the first")
  }

  // --- Scenario 6: KST midnight rollover resets the counter ---
  mock.reset()
  mock.seedUser(7, { tokenVersion: 0 })
  mock.seedConversation(700, 7)
  mock.setFakeDate('2026-03-01')
  for (let i = 1; i <= 10; i++) {
    await convHandler(makeReq(7, 0, { query: { id: '700' }, body: { text: `d1-${i}`, requestId: `d1-${i}` } }), mockRes())
  }
  mock.setFakeDate('2026-03-02')
  {
    const res = mockRes()
    await convHandler(makeReq(7, 0, { query: { id: '700' }, body: { text: 'new day', requestId: 'd2-1' } }), res)
    t.assert(res.statusCode === 201 && res.body.remaining === 9, 'a new KST calendar day resets the counter')
  }

  // --- Scenario 7: concurrent requests cannot exceed 10 ---
  mock.reset()
  mock.seedUser(9, { tokenVersion: 0 })
  mock.seedConversation(900, 9)
  {
    const resList = Array.from({ length: 15 }, () => mockRes())
    await Promise.all(
      resList.map((res, i) =>
        convHandler(makeReq(9, 0, { query: { id: '900' }, body: { text: `c${i}`, requestId: `cc-${i}` } }), res),
      ),
    )
    const ok = resList.filter((r) => r.statusCode === 201).length
    const blocked = resList.filter((r) => r.statusCode === 429).length
    t.assert(ok === 10 && blocked === 5, `exactly 10 of 15 concurrent requests succeed (got ${ok} ok, ${blocked} blocked)`)
  }

  // --- Scenario 8: DB outage during reservation blocks the request (never calls Gemini) ---
  mock.reset()
  mock.seedUser(10, { tokenVersion: 0 })
  mock.seedConversation(1000, 10)
  {
    const realSql = mock.sql
    let geminiCalled = false
    const originalFetch = global.fetch
    global.fetch = async (...args) => {
      geminiCalled = true
      return originalFetch(...args)
    }
    const virtualModule = require.cache[mock.VIRTUAL_ID]
    const patched = (strings, ...values) => {
      const text = strings.join(' ')
      if (text.includes('daily_question_usage') && text.includes('INSERT')) {
        return Promise.reject(new Error('simulated DB outage'))
      }
      return realSql(strings, ...values)
    }
    virtualModule.exports.sql = patched

    const res = mockRes()
    await convHandler(makeReq(10, 0, { query: { id: '1000' }, body: { text: 'x', requestId: 'outage-1' } }), res)
    t.assert(res.statusCode === 500, 'a DB outage during reservation returns 500')
    t.assert(!geminiCalled, 'Gemini is never called when reservation fails')
    t.assert(mock.state.messages.length === 0, 'no message is saved when reservation fails')

    virtualModule.exports.sql = realSql
    global.fetch = originalFetch
  }

  // --- Scenario 9: retry of a failed turn charges exactly once on success ---
  mock.reset()
  mock.seedUser(11, { tokenVersion: 0 })
  mock.seedConversation(1100, 11)
  geminiShouldFail = true
  await convHandler(makeReq(11, 0, { query: { id: '1100' }, body: { text: 'first', requestId: 'rt-1' } }), mockRes())
  geminiShouldFail = false
  {
    const res = mockRes()
    await convHandler(makeReq(11, 0, { query: { id: '1100' }, body: { retry: true } }), res)
    t.assert(res.statusCode === 200 && res.body.aiMessage.error === false, 'retry of a failed turn succeeds')
    t.assert(res.body.remaining === 9, 'a successful retry charges exactly one question')
  }

  return t.summary()
}

module.exports = { run }
