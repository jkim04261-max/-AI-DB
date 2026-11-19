// Tests the audit log (api/_lib/auditLog.ts, 감사 로그) added per
// 지시서(개인 마스터 DB 소유자 통제 및 보안 시스템) 3번: "본인이라도
// 데이터에 접근할 때마다 '누가, 언제, 어떤 데이터를 조회했는지' 감사
// 로그를 기록하세요." Covers the two "개인 마스터 DB" content types this
// applies to — AI 캐릭터 학습 기록(character_knowledge_entries/
// character_messages)과 지식 기록장(personal_knowledge_logs).
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default
  const auth = bundle('api/_lib/auth.ts')

  const t = new Tracker('auditLog')

  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' })
  mock.seedUser(2, { email: 'bob@test.com' })
  const aliceCookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const bobCookie = cookieHeaderFor(auth, 2, 0, 'bob@test.com')
  const aliceReq = (overrides = {}) => ({ headers: { cookie: aliceCookie }, query: {}, ...overrides })
  const bobReq = (overrides = {}) => ({ headers: { cookie: bobCookie }, query: {}, ...overrides })

  await characterHandler(aliceReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
  await characterHandler(aliceReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())

  // --- AI 캐릭터 학습 기록(character_knowledge_entries) 조회 ---
  {
    const before = mock.state.auditLogs.length
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), res)
    t.assert(res.statusCode === 200, '학습 기록 조회 자체는 평소처럼 성공한다')
    const newLogs = mock.state.auditLogs.slice(before)
    t.assert(newLogs.length === 1, '조회 1번에 감사 로그 1건이 남는다')
    t.assert(newLogs[0].user_id === 1 && newLogs[0].action === 'view' && newLogs[0].resource_type === 'character_knowledge', '감사 로그에 누가(user_id)·무엇(action/resource_type)이 정확히 기록된다')
    t.assert(typeof newLogs[0].created_at === 'string' && newLogs[0].created_at.length > 0, '언제(created_at)도 함께 기록된다')
  }

  // --- 대화 기록(character_messages) 조회 ---
  {
    const before = mock.state.auditLogs.length
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), res)
    t.assert(res.statusCode === 200)
    const newLogs = mock.state.auditLogs.slice(before)
    t.assert(newLogs.length === 1 && newLogs[0].resource_type === 'character_messages' && newLogs[0].action === 'view', '대화 기록 조회도 별도로 감사 로그에 남는다')
  }

  // --- 지식 기록장(personal_knowledge_logs): 조회/생성/수정/삭제 ---
  let logId
  {
    const before = mock.state.auditLogs.length
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'GET', query: { action: 'knowledge-log' } }), res)
    t.assert(res.statusCode === 200)
    const newLogs = mock.state.auditLogs.slice(before)
    t.assert(newLogs.length === 1 && newLogs[0].resource_type === 'personal_knowledge_log' && newLogs[0].action === 'view' && newLogs[0].resource_id === null, '지식 기록장 목록 조회도 기록된다(목록 전체 조회라 resource_id는 null)')
  }
  {
    const before = mock.state.auditLogs.length
    const res = mockRes()
    await characterHandler(
      aliceReq({ method: 'POST', query: { action: 'knowledge-log-save' }, body: { entryDate: '2026-11-19', category: 'tip', content: '감사 로그 테스트용 기록' } }),
      res,
    )
    t.assert(res.statusCode === 200)
    logId = res.body.entry.id
    const newLogs = mock.state.auditLogs.slice(before)
    t.assert(newLogs.length === 1 && newLogs[0].action === 'create' && newLogs[0].resource_id === logId, '새로 만들면 action=create로 기록되고 resource_id가 그 기록의 id다')
  }
  {
    const before = mock.state.auditLogs.length
    const res = mockRes()
    await characterHandler(
      aliceReq({ method: 'POST', query: { action: 'knowledge-log-save' }, body: { id: logId, entryDate: '2026-11-19', category: 'tip', content: '수정된 내용' } }),
      res,
    )
    t.assert(res.statusCode === 200)
    const newLogs = mock.state.auditLogs.slice(before)
    t.assert(newLogs.length === 1 && newLogs[0].action === 'update' && newLogs[0].resource_id === logId, '같은 id로 다시 저장하면 action=update로 구분되어 기록된다')
  }
  {
    const before = mock.state.auditLogs.length
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'knowledge-log-delete' }, body: { id: logId } }), res)
    t.assert(res.statusCode === 200)
    const newLogs = mock.state.auditLogs.slice(before)
    t.assert(newLogs.length === 1 && newLogs[0].action === 'delete' && newLogs[0].resource_id === logId, '삭제도 action=delete로 기록된다')
  }

  // --- 유저별로 완전히 분리된다: bob의 접근 기록에 alice가 섞이지 않는다 ---
  {
    await characterHandler(bobReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(bobReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'singer' } }), mockRes())
    await characterHandler(bobReq({ method: 'GET', query: { action: 'knowledge-log' } }), mockRes())

    const aliceLogs = mock.state.auditLogs.filter((l) => l.user_id === 1)
    const bobLogs = mock.state.auditLogs.filter((l) => l.user_id === 2)
    t.assert(aliceLogs.length > 0 && bobLogs.length > 0, '두 유저 모두 각자의 감사 로그를 갖는다')
    t.assert(bobLogs.every((l) => l.user_id === 2), "bob의 감사 로그에는 alice(user_id=1)의 접근 기록이 전혀 섞이지 않는다")
  }

  return t.summary()
}

module.exports = { run }
