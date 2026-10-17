// Tests api/character.ts — character creation and per-user listing. See
// tests/README.md for why this is a bundled-handler test, not an in-process
// one.
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default

  const t = new Tracker('character')

  // --- auth required ---
  mock.reset()
  {
    const res = mockRes()
    await characterHandler({ method: 'GET', headers: {} }, res)
    t.assert(res.statusCode === 401, 'GET without a session is rejected (401)')
  }
  {
    const res = mockRes()
    await characterHandler({ method: 'POST', headers: {}, body: { companionType: 'nuri' } }, res)
    t.assert(res.statusCode === 401, 'POST without a session is rejected (401)')
  }

  // --- create ---
  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' })

  // getSessionUser needs a real signed cookie, so build one the same way
  // core-regression.test.cjs does.
  const auth = bundle('api/_lib/auth.ts')
  const cookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const authedReq = (overrides = {}) => ({ headers: { cookie }, ...overrides })

  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'POST', body: { companionType: 'nuri' } }), res)
    t.assert(res.statusCode === 201, 'creating a 누리 character succeeds (201)')
    t.assert(res.body.character?.companion_type === 'nuri', 'response carries companion_type nuri')
    t.assert(res.body.character?.stage === 'child', 'a brand-new character always starts as child (no plan/payment system yet)')
  }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'POST', body: { companionType: 'duri' } }), res)
    t.assert(res.statusCode === 201, 'creating a 두리 character for the same user also succeeds (both allowed)')
  }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'POST', body: { companionType: 'nuri' } }), res)
    t.assert(res.statusCode === 409, 'creating a second 누리 for the same user is rejected (409, already has one)')
  }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'POST', body: { companionType: 'robot' } }), res)
    t.assert(res.statusCode === 400, 'an invalid companionType is rejected (400)')
  }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'POST', body: {} }), res)
    t.assert(res.statusCode === 400, 'a missing companionType is rejected (400)')
  }

  // --- list, scoped to the caller ---
  mock.seedUser(2, { email: 'bob@test.com' })
  const bobCookie = cookieHeaderFor(auth, 2, 0, 'bob@test.com')
  {
    const res = mockRes()
    await characterHandler({ headers: { cookie } , method: 'GET' }, res)
    t.assert(res.statusCode === 200, 'GET for alice succeeds (200)')
    t.assert(res.body.characters?.length === 2, "alice's list has both characters she created")
  }
  {
    const res = mockRes()
    await characterHandler({ headers: { cookie: bobCookie }, method: 'GET' }, res)
    t.assert(res.statusCode === 200, 'GET for bob succeeds (200)')
    t.assert(res.body.characters?.length === 0, "bob's list is empty — alice's characters never leak to another user")
  }

  // --- method not allowed ---
  {
    const res = mockRes()
    await characterHandler({ headers: { cookie }, method: 'DELETE' }, res)
    t.assert(res.statusCode === 405, 'an unsupported method is rejected (405)')
  }

  return t.summary()
}

module.exports = { run }
