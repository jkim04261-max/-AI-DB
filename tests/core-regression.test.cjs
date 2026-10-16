// Baseline regression suite for the features CLAUDE.md calls out as
// protected: login, signup, session validation, conversation ownership,
// Gemini success/failure handling, and attachment validation. Not
// exhaustive — a safety net so a future change that breaks one of these
// fails CI instead of being noticed in Preview.
const bcrypt = require('bcryptjs')
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.GEMINI_API_KEY = 'fake-key-for-ci-only'
  process.env.DAILY_QUESTION_LIMIT_ENABLED = 'false'

  const mock = require('./setup-postgres-mock.cjs')
  const auth = bundle('api/_lib/auth.ts')
  const loginHandler = bundle('api/auth/login.ts').default
  const signupHandler = bundle('api/auth/signup.ts').default
  const convHandler = bundle('api/conversations/[id].ts').default

  global.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'mock answer' }] } }] }) }
    }
    throw new Error(`unexpected fetch to ${url}`)
  }

  const t = new Tracker('core-regression')

  // --- login ---
  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com', tokenVersion: 0, passwordHash: bcrypt.hashSync('correct-password', 4) })
  {
    const res = mockRes()
    await loginHandler({ method: 'POST', body: { email: 'alice@test.com', password: 'correct-password' } }, res)
    t.assert(res.statusCode === 200, 'login with correct credentials succeeds (200)')
    t.assert(res.body.user?.email === 'alice@test.com', 'login response carries the user email')
    t.assert(res.headers['Set-Cookie'] !== undefined, 'login sets a session cookie')
  }
  {
    const res = mockRes()
    await loginHandler({ method: 'POST', body: { email: 'alice@test.com', password: 'wrong-password' } }, res)
    t.assert(res.statusCode === 401, 'login with wrong password is rejected (401)')
  }
  {
    const res = mockRes()
    await loginHandler({ method: 'POST', body: { email: 'nobody@test.com', password: 'whatever1' } }, res)
    t.assert(res.statusCode === 401, 'login for a nonexistent account is rejected (401), not a 500 or 404')
  }

  // --- signup ---
  mock.reset()
  {
    const res = mockRes()
    await signupHandler({ method: 'POST', body: { email: 'new@test.com', password: 'longenough1' } }, res)
    t.assert(res.statusCode === 201, 'signup with a fresh email succeeds (201)')
  }
  {
    const res = mockRes()
    await signupHandler({ method: 'POST', body: { email: 'new@test.com', password: 'longenough1' } }, res)
    t.assert(res.statusCode === 409, 'signup with an already-used email is rejected (409)')
  }
  {
    const res = mockRes()
    await signupHandler({ method: 'POST', body: { email: 'bad-email', password: 'longenough1' } }, res)
    t.assert(res.statusCode === 400, 'signup with an invalid email format is rejected (400)')
  }
  {
    const res = mockRes()
    await signupHandler({ method: 'POST', body: { email: 'short@test.com', password: 'short' } }, res)
    t.assert(res.statusCode === 400, 'signup with a too-short password is rejected (400)')
  }

  // --- session / token_version invalidation ---
  mock.reset()
  mock.seedUser(2, { tokenVersion: 0 })
  mock.seedConversation(200, 2)
  {
    const staleSession = auth.signSession({ sub: 2, email: 'u2@test.com', tokenVersion: 1 }) // never matches token_version=0
    const cookie = auth.buildSessionCookie(staleSession).split(';')[0]
    const res = mockRes()
    await convHandler({ method: 'GET', query: { id: '200' }, headers: { cookie } }, res)
    t.assert(res.statusCode === 401, 'a session signed with a stale token_version is rejected (401)')
  }

  // --- conversation ownership ---
  mock.reset()
  mock.seedUser(3, { tokenVersion: 0 })
  mock.seedUser(4, { tokenVersion: 0 })
  mock.seedConversation(300, 3)
  {
    const res = mockRes()
    await convHandler({ method: 'GET', query: { id: '300' }, headers: {} }, res)
    t.assert(res.statusCode === 401, 'an unauthenticated request is rejected (401)')
  }
  {
    const res = mockRes()
    const cookie = cookieHeaderFor(auth, 4, 0)
    await convHandler({ method: 'GET', query: { id: '300' }, headers: { cookie } }, res)
    t.assert(res.statusCode === 404, "a different account can't read someone else's conversation (404, not leaked)")
  }

  // --- Gemini success / failure paths ---
  mock.reset()
  mock.seedUser(5, { tokenVersion: 0 })
  mock.seedConversation(500, 5)
  {
    const res = mockRes()
    const cookie = cookieHeaderFor(auth, 5, 0)
    await convHandler({ method: 'POST', query: { id: '500' }, body: { text: 'hello' }, headers: { cookie, host: 'test.local' } }, res)
    t.assert(res.statusCode === 201 && res.body.aiMessage.error === false, 'a successful Gemini call returns error=false')
  }
  {
    const originalFetch = global.fetch
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'down' } }) })
    const res = mockRes()
    const cookie = cookieHeaderFor(auth, 5, 0)
    await convHandler({ method: 'POST', query: { id: '500' }, body: { text: 'hello again' }, headers: { cookie, host: 'test.local' } }, res)
    t.assert(res.statusCode === 201 && res.body.aiMessage.error === true, 'a Gemini failure is saved with error=true, not a 500')
    global.fetch = originalFetch
  }

  // --- attachment validation ---
  mock.reset()
  mock.seedUser(6, { tokenVersion: 0 })
  mock.seedConversation(600, 6)
  {
    const res = mockRes()
    const cookie = cookieHeaderFor(auth, 6, 0)
    await convHandler(
      {
        method: 'POST',
        query: { id: '600' },
        body: {
          text: 'bad attachment',
          attachments: [{ url: 'https://evil.example.com/x.png', mimeType: 'image/png', name: 'x.png' }],
        },
        headers: { cookie, host: 'test.local' },
      },
      res,
    )
    t.assert(res.statusCode === 400, 'an attachment URL outside the trusted Blob host is rejected (400)')
  }
  {
    const res = mockRes()
    const cookie = cookieHeaderFor(auth, 6, 0)
    const tooMany = Array.from({ length: 6 }, (_, i) => ({
      url: `https://x.public.blob.vercel-storage.com/${i}.png`,
      mimeType: 'image/png',
      name: `${i}.png`,
    }))
    await convHandler(
      { method: 'POST', query: { id: '600' }, body: { text: 'too many', attachments: tooMany }, headers: { cookie, host: 'test.local' } },
      res,
    )
    t.assert(res.statusCode === 400, 'more than 5 attachments is rejected (400)')
  }

  return t.summary()
}

module.exports = { run }
