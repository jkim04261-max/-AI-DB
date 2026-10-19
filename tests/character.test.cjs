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

  // --- profession: select, change, isolation (PR #43) ---

  // auth required
  {
    const res = mockRes()
    await characterHandler({ method: 'PATCH', headers: {}, body: { companionType: 'nuri', profession: 'accountant' } }, res)
    t.assert(res.statusCode === 401, 'PATCH without a session is rejected (401, 인증되지 않은 API 요청 차단)')
  }

  // 누리 직업 선택 및 저장
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), res)
    t.assert(res.statusCode === 200, '누리의 직업을 회계사로 선택하면 성공한다 (200)')
    t.assert(res.body.character?.profession === 'accountant', '응답에 선택한 직업(회계사)이 담긴다')
    t.assert(res.body.character?.stage === 'child', '기존 캐릭터 데이터(stage)는 직업 선택으로 바뀌지 않는다')
  }

  // 두리 직업 선택 및 저장 — 두 캐릭터의 동일한 직업 선택도 허용
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'duri', profession: 'accountant' } }), res)
    t.assert(res.statusCode === 200, '두리도 같은 직업(회계사)을 선택할 수 있다 (200)')
    t.assert(res.body.character?.profession === 'accountant', '두리의 직업도 정상적으로 회계사로 저장된다')
  }

  // 두 캐릭터의 서로 다른 직업 저장
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'duri', profession: 'singer' } }), res)
    t.assert(res.statusCode === 200, '두리의 직업을 가수로 바꾸면 성공한다 (200, 직업 변경)')
    t.assert(res.body.character?.profession === 'singer', '두리의 직업이 가수로 바뀐다')
  }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET' }), res)
    const nuri = res.body.characters.find((c) => c.companion_type === 'nuri')
    const duri = res.body.characters.find((c) => c.companion_type === 'duri')
    t.assert(nuri?.profession === 'accountant', '누리는 여전히 회계사 — 두리의 변경이 누리에 영향을 주지 않는다')
    t.assert(duri?.profession === 'singer', '두리는 가수 — 두 캐릭터가 서로 다른 직업을 동시에 가질 수 있다')
  }

  // 새로고침 후 직업 유지 (같은 쿠키로 다시 GET — 서버 상태는 그대로 DB에 남아있어야 함)
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET' }), res)
    const nuri = res.body.characters.find((c) => c.companion_type === 'nuri')
    t.assert(nuri?.profession === 'accountant', '새로고침(동일 세션으로 재조회)해도 직업이 유지된다')
  }

  // 재로그인 후 직업 유지 (같은 사용자, 새로 서명된 세션 쿠키로 조회)
  {
    const freshLoginCookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
    const res = mockRes()
    await characterHandler({ headers: { cookie: freshLoginCookie }, method: 'GET' }, res)
    const nuri = res.body.characters.find((c) => c.companion_type === 'nuri')
    t.assert(nuri?.profession === 'accountant', '재로그인(새 세션 토큰)으로 조회해도 직업이 유지된다')
  }

  // 다른 사용자 캐릭터 수정 차단
  {
    const res = mockRes()
    await characterHandler({ headers: { cookie: bobCookie }, method: 'PATCH', body: { companionType: 'nuri', profession: 'singer' } }, res)
    t.assert(res.statusCode === 404, '다른 사용자(bob)가 alice의 누리 직업을 바꾸려 하면 404로 차단된다(소유권 없음)')
  }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET' }), res)
    const nuri = res.body.characters.find((c) => c.companion_type === 'nuri')
    t.assert(nuri?.profession === 'accountant', 'bob의 시도 이후에도 alice의 누리 직업은 그대로다(실제로 바뀌지 않았음)')
  }

  // 잘못된 입력 검증
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'doctor' } }), res)
    t.assert(res.statusCode === 400, '지원하지 않는 직업(doctor)은 거부된다 (400)')
  }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'robot', profession: 'singer' } }), res)
    t.assert(res.statusCode === 400, '잘못된 companionType은 거부된다 (400)')
  }

  // 존재하지 않는 캐릭터
  {
    mock.seedUser(3, { email: 'carol@test.com' })
    const carolCookie = cookieHeaderFor(auth, 3, 0, 'carol@test.com')
    const res = mockRes()
    await characterHandler({ headers: { cookie: carolCookie }, method: 'PATCH', body: { companionType: 'nuri', profession: 'singer' } }, res)
    t.assert(res.statusCode === 404, '아직 캐릭터를 만들지 않은 사용자가 직업을 선택하려 하면 404')
  }

  return t.summary()
}

module.exports = { run }
