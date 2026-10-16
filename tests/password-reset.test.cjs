// Regression suite for password reset (PR #35, api/auth/password-reset.ts
// + api/_lib/email.ts). Resend is never called over the network — every
// scenario replaces global.fetch with a mock response.
const { bundle } = require('./bundle.cjs')
const { mockRes, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.RESEND_API_KEY = 'fake-key-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const handler = bundle('api/auth/password-reset.ts').default

  const t = new Tracker('password-reset')

  function reqRequest(body) {
    return { method: 'POST', query: { action: 'request' }, body, headers: { host: 'test.local' } }
  }
  function reqReset(body) {
    return { method: 'POST', query: { action: 'reset' }, body, headers: {} }
  }

  // --- request: unknown email never calls Resend, still returns the generic message ---
  mock.reset()
  {
    let resendCalled = false
    global.fetch = async () => {
      resendCalled = true
      return { ok: true, status: 200, json: async () => ({}) }
    }
    const res = mockRes()
    await handler(reqRequest({ email: 'nobody@test.com' }), res)
    t.assert(res.statusCode === 200, 'request-reset for an unknown email still returns 200 (no enumeration)')
    t.assert(!resendCalled, 'request-reset for an unknown email never calls Resend')
  }

  // --- request: known email calls Resend and stores a hashed token ---
  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com', tokenVersion: 0 })
  {
    let resendCalled = false
    let sentTo = null
    global.fetch = async (url, opts) => {
      resendCalled = true
      sentTo = JSON.parse(opts.body).to
      return { ok: true, status: 200, json: async () => ({}) }
    }
    const res = mockRes()
    await handler(reqRequest({ email: 'alice@test.com' }), res)
    t.assert(res.statusCode === 200, 'request-reset for a known email returns 200')
    t.assert(resendCalled, 'request-reset for a known email calls Resend')
    t.assert(sentTo === 'alice@test.com', 'the reset email is addressed to the account, not a client-supplied value')
    t.assert(mock.state.passwordResetTokens.length === 1, 'exactly one token row is stored')
    t.assert(
      mock.state.passwordResetTokens[0].token_hash !== undefined && mock.state.passwordResetTokens[0].token_hash.length === 64,
      'the stored token is a sha256 hash (64 hex chars), not the raw token',
    )
  }

  // --- request: a second request within 60s does not issue a new token or call Resend again ---
  {
    let resendCallCount = 0
    global.fetch = async () => {
      resendCallCount++
      return { ok: true, status: 200, json: async () => ({}) }
    }
    const res = mockRes()
    await handler(reqRequest({ email: 'alice@test.com' }), res)
    t.assert(res.statusCode === 200, 'a rapid repeat request still returns 200')
    t.assert(resendCallCount === 0, 'a rapid repeat request does not call Resend again')
    t.assert(mock.state.passwordResetTokens.length === 1, 'a rapid repeat request does not create a second token')
  }

  // --- request: Resend failure is reported as a distinct error, not success ---
  mock.reset()
  mock.seedUser(2, { email: 'bob@test.com', tokenVersion: 0 })
  {
    global.fetch = async () => ({ ok: false, status: 422, text: async () => 'rejected' })
    const res = mockRes()
    await handler(reqRequest({ email: 'bob@test.com' }), res)
    t.assert(res.statusCode === 502, 'a Resend failure is reported as 502, not reported as success')
  }

  // --- request: missing RESEND_API_KEY is reported, not silently treated as sent ---
  mock.reset()
  mock.seedUser(3, { email: 'carol@test.com', tokenVersion: 0 })
  {
    delete process.env.RESEND_API_KEY
    const res = mockRes()
    await handler(reqRequest({ email: 'carol@test.com' }), res)
    t.assert(res.statusCode === 500, 'a missing RESEND_API_KEY returns 500, not a false 200')
    process.env.RESEND_API_KEY = 'fake-key-for-ci-only'
  }

  // --- request: invalid email format rejected before touching the DB ---
  mock.reset()
  {
    const res = mockRes()
    await handler(reqRequest({ email: 'not-an-email' }), res)
    t.assert(res.statusCode === 400, 'an invalid email format is rejected (400)')
  }

  // --- reset: full happy path — valid token changes the password and bumps token_version ---
  mock.reset()
  mock.seedUser(4, { email: 'dave@test.com', tokenVersion: 0 })
  let capturedResetUrl = null
  {
    global.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body)
      const match = body.html.match(/href="([^"]+)"/)
      capturedResetUrl = match[1]
      return { ok: true, status: 200, json: async () => ({}) }
    }
    await handler(reqRequest({ email: 'dave@test.com' }), mockRes())
  }
  const rawToken = new URL(capturedResetUrl).searchParams.get('token')
  {
    const res = mockRes()
    await handler(reqReset({ token: rawToken, password: 'new-password-1' }), res)
    t.assert(res.statusCode === 200, 'reset with a valid token succeeds (200)')
    t.assert(mock.state.users.get(4).token_version === 1, 'a successful reset bumps token_version (invalidates old sessions)')
  }

  // --- reset: the same token cannot be used twice ---
  {
    const res = mockRes()
    await handler(reqReset({ token: rawToken, password: 'another-password-1' }), res)
    t.assert(res.statusCode === 400, 'reusing an already-used token is rejected (400)')
    t.assert(mock.state.users.get(4).token_version === 1, 'a rejected reuse does not bump token_version again')
  }

  // --- reset: an unknown token is rejected the same way as an expired/used one ---
  {
    const res = mockRes()
    await handler(reqReset({ token: 'not-a-real-token', password: 'whatever12' }), res)
    t.assert(res.statusCode === 400, 'a nonexistent token is rejected (400)')
  }

  // --- reset: a too-short new password is rejected ---
  mock.reset()
  mock.seedUser(5, { email: 'erin@test.com', tokenVersion: 0 })
  {
    const res = mockRes()
    await handler(reqReset({ token: 'anything', password: 'short' }), res)
    t.assert(res.statusCode === 400, 'a too-short new password is rejected before the token is even looked up')
  }

  // --- unsupported action is not reachable by anything but the two public URLs ---
  {
    const res = mockRes()
    await handler({ method: 'POST', query: {}, body: {}, headers: {} }, res)
    t.assert(res.statusCode === 404, 'a direct call with no ?action is rejected (404), not silently handled')
  }

  return t.summary()
}

module.exports = { run }
