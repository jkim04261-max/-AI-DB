// Tests api/character.ts's town/building actions (지역 기반 2.5D 동네 및
// 직업 건물 건설 시스템): register-building, the building/update/delete
// actions, duplicate-name blocking, and ownership gating. See
// tests/README.md for why this is a bundled-handler test, not an
// in-process one.
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default

  const t = new Tracker('townBuilding')

  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' })
  mock.seedUser(2, { email: 'bob@test.com' })
  const auth = bundle('api/_lib/auth.ts')
  const aliceCookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const bobCookie = cookieHeaderFor(auth, 2, 0, 'bob@test.com')
  const aliceReq = (overrides = {}) => ({ headers: { cookie: aliceCookie }, query: {}, ...overrides })
  const bobReq = (overrides = {}) => ({ headers: { cookie: bobCookie }, query: {}, ...overrides })

  // --- auth required ---
  {
    const res = mockRes()
    await characterHandler({ method: 'POST', headers: {}, query: { action: 'register-building' }, body: { region: '경기도 일산', businessName: '자양청년치킨' } }, res)
    t.assert(res.statusCode === 401, 'register-building without a session is rejected (401)')
  }

  // --- register: success ---
  let aliceBuildingId
  {
    const res = mockRes()
    await characterHandler(
      aliceReq({ method: 'POST', query: { action: 'register-building' }, body: { region: '경기도 일산 정발산동', businessName: '자양청년치킨' } }),
      res,
    )
    t.assert(res.statusCode === 201, '등록 성공 (201)')
    t.assert(res.body.building?.businessName === '자양청년치킨', '응답에 등록한 상호명이 그대로 담긴다')
    t.assert(res.body.building?.isOwner === true, '등록한 사람 본인에게는 isOwner가 true다')
    aliceBuildingId = res.body.building?.id
    t.assert(typeof aliceBuildingId === 'number', '응답에 건물 id가 담긴다')
  }

  // --- register: validation ---
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'register-building' }, body: { region: '', businessName: '아무가게' } }), res)
    t.assert(res.statusCode === 400, '지역이 빈 값이면 400')
  }
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'register-building' }, body: { region: '서울', businessName: '' } }), res)
    t.assert(res.statusCode === 400, '상호명이 빈 값이면 400')
  }

  // --- register: exact duplicate name/region is blocked, with the exact
  // required message, even from a different user ---
  {
    const res = mockRes()
    await characterHandler(
      bobReq({ method: 'POST', query: { action: 'register-building' }, body: { region: '경기도 일산 정발산동', businessName: '자양청년치킨' } }),
      res,
    )
    t.assert(res.statusCode === 409, '같은 지역에 같은 상호명은 409로 차단된다')
    t.assert(res.body.error === '이미 등록된 상호명입니다. 다른 이름을 사용해 주세요', '지시서에 명시된 문구 그대로 내려간다')
  }

  // --- register: trivially-different whitespace/case still counts as the
  // same region/business name (server-side normalization) ---
  {
    const res = mockRes()
    await characterHandler(
      bobReq({ method: 'POST', query: { action: 'register-building' }, body: { region: '  경기도 일산   정발산동  ', businessName: '자양청년치킨' } }),
      res,
    )
    t.assert(res.statusCode === 409, '공백만 다른 지역명도 같은 지역으로 취급되어 차단된다')
  }

  // --- register: same business name is fine in a *different* region ---
  {
    const res = mockRes()
    await characterHandler(
      bobReq({ method: 'POST', query: { action: 'register-building' }, body: { region: '부산 해운대', businessName: '자양청년치킨' } }),
      res,
    )
    t.assert(res.statusCode === 201, '다른 지역이면 같은 상호명도 등록할 수 있다')
  }

  // --- GET building: owner lookup by region ---
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'GET', query: { action: 'building', region: '경기도 일산 정발산동' } }), res)
    t.assert(res.statusCode === 200, '내 건물 조회 성공 (200)')
    t.assert(res.body.building?.businessName === '자양청년치킨', '그 지역에 등록해 둔 내 건물이 반환된다')
  }
  {
    const res = mockRes()
    await characterHandler(bobReq({ method: 'GET', query: { action: 'building', region: '경기도 일산 정발산동' } }), res)
    t.assert(res.statusCode === 200 && res.body.building === null, "그 지역에 등록한 적 없는 유저(bob)는 null을 받는다")
  }

  // --- GET building: region + businessName lookup finds another user's
  // building (회사원이 동료가 만든 회사 건물에 입장할 수 있는지 확인하는 흐름) ---
  {
    const res = mockRes()
    await characterHandler(
      bobReq({ method: 'GET', query: { action: 'building', region: '경기도 일산 정발산동', businessName: '자양청년치킨' } }),
      res,
    )
    t.assert(res.statusCode === 200, '지역+상호명 조회 성공 (200)')
    t.assert(res.body.building?.isOwner === false, '본인이 등록한 게 아니면 isOwner는 false다')
  }

  // --- GET building: missing region is rejected ---
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'GET', query: { action: 'building' } }), res)
    t.assert(res.statusCode === 400, '지역 없이 조회하면 400')
  }

  // --- update: owner can rename ---
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'update-building' }, body: { id: aliceBuildingId, businessName: '자양청년치킨2호점' } }), res)
    t.assert(res.statusCode === 200, '소유자는 상호명을 수정할 수 있다 (200)')
    t.assert(res.body.building?.businessName === '자양청년치킨2호점', '수정된 상호명이 응답에 반영된다')
  }

  // --- update: a non-owner's attempt is rejected (무단 수정 방지) ---
  {
    const res = mockRes()
    await characterHandler(bobReq({ method: 'POST', query: { action: 'update-building' }, body: { id: aliceBuildingId, businessName: '도용시도' } }), res)
    t.assert(res.statusCode === 404, '소유자가 아닌 사람의 수정 시도는 차단된다 (404)')
  }

  // --- delete: a non-owner's attempt is rejected (무단 삭제 방지) ---
  {
    const res = mockRes()
    await characterHandler(bobReq({ method: 'POST', query: { action: 'delete-building' }, body: { id: aliceBuildingId } }), res)
    t.assert(res.statusCode === 404, '소유자가 아닌 사람의 삭제 시도는 차단된다 (404)')
  }

  // --- delete: owner can delete, and it's really gone afterward ---
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'delete-building' }, body: { id: aliceBuildingId } }), res)
    t.assert(res.statusCode === 200 && res.body.deleted === true, '소유자는 건물을 삭제할 수 있다 (200)')
  }
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'GET', query: { action: 'building', region: '경기도 일산 정발산동' } }), res)
    t.assert(res.body.building === null, '삭제 후에는 더 이상 조회되지 않는다')
  }
  {
    // the name is free again after deletion, in the same region
    const res = mockRes()
    await characterHandler(
      bobReq({ method: 'POST', query: { action: 'register-building' }, body: { region: '경기도 일산 정발산동', businessName: '자양청년치킨' } }),
      res,
    )
    t.assert(res.statusCode === 201, '삭제된 상호명은 같은 지역에 다시 등록할 수 있다')
  }

  return t.summary()
}

module.exports = { run }
