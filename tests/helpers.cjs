function mockRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(c) {
      this.statusCode = c
      return this
    },
    json(d) {
      this.body = d
      return this
    },
    setHeader(k, v) {
      this.headers[k] = v
      return this
    },
  }
}

// `authModule` is the bundled api/_lib/auth.ts (see tests/bundle.cjs) —
// reused so a cookie is signed with the exact same code getSessionUser
// will verify it with.
function cookieHeaderFor(authModule, userId, tokenVersion, email) {
  const token = authModule.signSession({ sub: userId, email: email ?? `u${userId}@test.com`, tokenVersion })
  return authModule.buildSessionCookie(token).split(';')[0]
}

class Tracker {
  constructor(label) {
    this.label = label
    this.passes = 0
    this.failures = []
  }
  assert(cond, message) {
    if (cond) {
      this.passes++
    } else {
      this.failures.push(message)
      console.log(`  FAIL: ${message}`)
    }
  }
  summary() {
    const total = this.passes + this.failures.length
    console.log(`${this.label}: ${this.passes}/${total} passed`)
    return this.failures.length === 0
  }
}

module.exports = { mockRes, cookieHeaderFor, Tracker }
