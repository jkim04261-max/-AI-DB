const assert = require('node:assert/strict')
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  const mock = require('./setup-postgres-mock.cjs')
  mock.reset()
  mock.seedUser(1)
  mock.seedUser(2)
  const auth = bundle('api/_lib/auth.ts')
  const handler = bundle('api/auth/me.ts').default

  async function request(method, userId, body) {
    const res = mockRes()
    const headers = userId ? { cookie: cookieHeaderFor(auth, userId, 0) } : {}
    await handler({ method, headers, query: { action: 'work-profile', userId: '1' }, body }, res)
    return res
  }

  const empty = { workplace: '', industry: '', careerStartDate: '', workplaceVisibility: 'private' }
  const original = await request('GET', 1)
  assert.equal(original.statusCode, 200)
  assert.equal(original.headers['Cache-Control'], 'private, no-store')
  assert.deepEqual(original.body.profile, empty)
  assert.equal((await request('GET')).statusCode, 401)
  assert.equal((await request('PUT', undefined, empty)).statusCode, 401)
  assert.equal((await request('POST', 1)).statusCode, 405)

  const profile = { workplace: '누리상점', industry: '교육', careerStartDate: '2024-02-29', workplaceVisibility: 'public' }
  const saved = await request('PUT', 1, { ...profile, workplace: ' 누리상점 ', userId: 2 })
  assert.equal(saved.statusCode, 200)
  assert.deepEqual(saved.body.profile, profile)
  assert.deepEqual((await request('GET', 1)).body.profile, profile)
  assert.deepEqual((await request('GET', 2)).body.profile, empty)

  for (const invalid of [
    { ...profile, careerStartDate: '2025-02-29' },
    { ...profile, workplace: '가'.repeat(101) },
    { ...profile, workplaceVisibility: 'everyone' },
    { workplace: '새 직장' },
  ]) {
    assert.equal((await request('PUT', 1, invalid)).statusCode, 400)
  }
  assert.deepEqual((await request('GET', 1)).body.profile, profile)
  assert.equal((await request('PATCH', undefined, { workplace: '누리상점' })).statusCode, 401)
  assert.equal((await request('PATCH', 1, { careerStartDate: '2024-13-01' })).statusCode, 400)
  const partial = await request('PATCH', 1, { industry: 'IT/개발', workplaceVisibility: 'private' })
  assert.equal(partial.statusCode, 200)
  assert.deepEqual(partial.body.profile, { ...profile, industry: 'IT/개발', workplaceVisibility: 'private' })
  assert.deepEqual((await request('GET', 1)).body.profile, partial.body.profile)
  assert.deepEqual((await request('GET', 2)).body.profile, empty)
  assert.deepEqual((await request('PUT', 1, empty)).body.profile, empty)
  assert.deepEqual((await request('GET', 1)).body.profile, empty)
  return true
}

module.exports = { run }
