// Baseline regression suite for the features CLAUDE.md calls out as
// protected: login, signup, session validation, conversation ownership,
// Gemini success/failure handling, and attachment validation. Not
// exhaustive — a safety net so a future change that breaks one of these
// fails CI instead of being noticed in Preview.
const bcrypt = require('bcryptjs')
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

const TRUSTED_BLOB_HOST = 'https://x.public.blob.vercel-storage.com'

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.GEMINI_API_KEY = 'fake-key-for-ci-only'
  process.env.DAILY_QUESTION_LIMIT_ENABLED = 'false'

  const mock = require('./setup-postgres-mock.cjs')
  const auth = bundle('api/_lib/auth.ts')
  const loginHandler = bundle('api/auth/login.ts').default
  const signupHandler = bundle('api/auth/signup.ts').default
  const convHandler = bundle('api/conversations/[id].ts').default
  const convIndexHandler = bundle('api/conversations/index.ts').default

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

  // --- successful attachment: accepted, stored, and retrievable afterward ---
  mock.reset()
  mock.seedUser(7, { tokenVersion: 0 })
  mock.seedConversation(700, 7)
  {
    const res = mockRes()
    const cookie = cookieHeaderFor(auth, 7, 0)
    await convHandler(
      {
        method: 'POST',
        query: { id: '700' },
        body: {
          text: 'here is a picture',
          attachments: [{ url: `${TRUSTED_BLOB_HOST}/a.png`, mimeType: 'image/png', name: 'a.png' }],
        },
        headers: { cookie, host: 'test.local' },
      },
      res,
    )
    t.assert(res.statusCode === 201, 'a valid attachment from the trusted Blob host is accepted (201)')
    t.assert(res.body.userMessage.attachments.length === 1, 'the accepted attachment is echoed back in the response')
  }
  {
    const res = mockRes()
    const cookie = cookieHeaderFor(auth, 7, 0)
    await convHandler({ method: 'GET', query: { id: '700' }, headers: { cookie } }, res)
    t.assert(res.statusCode === 200, 'the conversation can be read back (200)')
    const userMsg = res.body.conversation.messages.find((m) => m.role === 'user')
    t.assert(userMsg?.attachments?.[0]?.url === `${TRUSTED_BLOB_HOST}/a.png`, 'the stored attachment survives a GET round trip')
  }

  // --- conversation list and creation (api/conversations/index.ts) ---
  mock.reset()
  mock.seedUser(8, { tokenVersion: 0 })
  {
    const cookie = cookieHeaderFor(auth, 8, 0)
    const createRes = mockRes()
    await convIndexHandler({ method: 'POST', body: { title: 'my chat' }, headers: { cookie } }, createRes)
    t.assert(createRes.statusCode === 201, 'creating a conversation succeeds (201)')

    const listRes = mockRes()
    await convIndexHandler({ method: 'GET', body: {}, headers: { cookie } }, listRes)
    t.assert(listRes.statusCode === 200, 'listing conversations succeeds (200)')
    t.assert(listRes.body.conversations.length === 1, 'the newly created conversation appears in the list')

    const unauthRes = mockRes()
    await convIndexHandler({ method: 'GET', body: {}, headers: {} }, unauthRes)
    t.assert(unauthRes.statusCode === 401, 'listing conversations without a session is rejected (401)')
  }

  // --- conversation delete scoped to owner ---
  mock.reset()
  mock.seedUser(9, { tokenVersion: 0 })
  mock.seedUser(10, { tokenVersion: 0 })
  mock.seedConversation(900, 9)
  {
    const otherCookie = cookieHeaderFor(auth, 10, 0)
    const res = mockRes()
    await convHandler({ method: 'DELETE', query: { id: '900' }, headers: { cookie: otherCookie } }, res)
    t.assert(res.statusCode === 404, "a different account can't delete someone else's conversation (404)")
    t.assert(mock.state.conversations.has(900), 'the conversation still exists after the rejected delete attempt')
  }
  {
    const ownerCookie = cookieHeaderFor(auth, 9, 0)
    const res = mockRes()
    await convHandler({ method: 'DELETE', query: { id: '900' }, headers: { cookie: ownerCookie } }, res)
    t.assert(res.statusCode === 200, 'the owner can delete their own conversation (200)')
    t.assert(!mock.state.conversations.has(900), 'the conversation is actually removed')
  }

  return t.summary()
}

module.exports = { run }
