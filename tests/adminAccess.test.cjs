// Tests api/admin/stats.ts and api/admin/ai-usage.ts per 지시서(개인
// 마스터 DB 소유자 통제 및 보안 시스템) 2번: "관리자(Admin) 계정이라도
// 유저의 '개인 캐릭터/원본 지식' 데이터는 열람할 수 없도록 DB 접근
// 권한을 분리하세요." Until now there was no test file for either admin
// endpoint at all — this adds one, covering both the access-control gate
// (401/403/200) and the actual response shape (never a raw personal
// content field).
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.ADMIN_EMAILS = 'admin@test.com, Admin2@Test.com'

  const mock = require('./setup-postgres-mock.cjs')
  const auth = bundle('api/_lib/auth.ts')
  const statsHandler = bundle('api/admin/stats.ts').default
  const aiUsageHandler = bundle('api/admin/ai-usage.ts').default

  const t = new Tracker('adminAccess')

  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' }) // 일반(비관리자) 유저
  mock.seedUser(2, { email: 'admin@test.com' }) // ADMIN_EMAILS에 있는 관리자
  const aliceCookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const adminCookie = cookieHeaderFor(auth, 2, 0, 'admin@test.com')

  // alice의 개인 데이터처럼 보이는, 절대 admin 응답에 나오면 안 되는
  // 문자열들을 미리 심어둔다.
  const SENSITIVE_KNOWLEDGE_CONTENT = '엄마의 요리 비법: 된장찌개에 멸치육수를 쓴다'
  const SENSITIVE_LOG_CONTENT = '거래처 김철수 대표 연락처는 010-9999-8888'
  mock.state.conversations.set(10, { id: 10, user_id: 1, title: SENSITIVE_KNOWLEDGE_CONTENT })
  mock.state.messages.push({
    id: 100,
    conversation_id: 10,
    role: 'user',
    content: SENSITIVE_KNOWLEDGE_CONTENT,
    ai_provider: null,
    is_error: false,
    client_request_id: null,
    created_at: new Date().toISOString(),
  })
  mock.state.messages.push({
    id: 101,
    conversation_id: 10,
    role: 'ai',
    content: SENSITIVE_LOG_CONTENT, // 실제로는 AI 오류 메시지만 들어가는 자리지만, "혹시라도" 개인 내용이 들어가도 새지 않는지 확인하려고 일부러 심는다
    ai_provider: 'Gemini',
    is_error: true,
    client_request_id: null,
    created_at: new Date().toISOString(),
  })

  // --- 접근 제어: 비로그인/비관리자/관리자 ---
  for (const [name, handler] of [['stats', statsHandler], ['ai-usage', aiUsageHandler]]) {
    {
      const res = mockRes()
      await handler({ method: 'GET', headers: {}, query: {} }, res)
      t.assert(res.statusCode === 401, `${name}: 로그인하지 않으면 401`)
    }
    {
      const res = mockRes()
      await handler({ method: 'GET', headers: { cookie: aliceCookie }, query: {} }, res)
      t.assert(res.statusCode === 403, `${name}: 관리자가 아닌 유저(alice)는 403으로 차단된다`)
      t.assert(JSON.stringify(res.body ?? {}).length < 100, `${name}: 403 응답 본문에는 통계/데이터가 전혀 담기지 않는다`)
    }
    {
      const res = mockRes()
      await handler({ method: 'GET', headers: { cookie: adminCookie }, query: {} }, res)
      t.assert(res.statusCode === 200, `${name}: ADMIN_EMAILS에 있는 계정은 200`)
    }
    {
      // ADMIN_EMAILS는 대소문자를 구분하지 않는다(가입 시 이메일은 항상
      // 소문자로 정규화되므로, 운영자가 설정 시 대소문자를 섞어 써도
      // 동작해야 한다).
      mock.seedUser(3, { email: 'admin2@test.com' })
      const admin2Cookie = cookieHeaderFor(auth, 3, 0, 'admin2@test.com')
      const res = mockRes()
      await handler({ method: 'GET', headers: { cookie: admin2Cookie }, query: {} }, res)
      t.assert(res.statusCode === 200, `${name}: ADMIN_EMAILS 설정의 대소문자가 달라도(Admin2@Test.com) 매칭된다`)
    }
  }

  // --- 응답 내용: 통계만, 원본 콘텐츠는 절대 없음 ---
  {
    const res = mockRes()
    await statsHandler({ method: 'GET', headers: { cookie: adminCookie }, query: {} }, res)
    const keys = Object.keys(res.body).sort()
    t.assert(
      JSON.stringify(keys) === JSON.stringify(['attachments', 'conversations', 'messages', 'users']),
      'stats 응답은 딱 4개의 집계 숫자 필드만 가진다(users/conversations/messages/attachments)',
    )
    for (const key of keys) {
      t.assert(typeof res.body[key] === 'number', `stats.${key}는 숫자(집계값)다 — 개별 레코드 배열이 아니다`)
    }
    const raw = JSON.stringify(res.body)
    t.assert(!raw.includes(SENSITIVE_KNOWLEDGE_CONTENT), 'stats 응답에는 alice의 실제 대화 내용이 전혀 없다')
    t.assert(!raw.includes('alice@test.com'), 'stats 응답에는 alice의 이메일도 없다')
  }

  {
    const res = mockRes()
    await aiUsageHandler({ method: 'GET', headers: { cookie: adminCookie }, query: {} }, res)
    t.assert(typeof res.body.total === 'number' && typeof res.body.successRate === 'number', 'ai-usage 응답은 집계 숫자를 담는다')
    t.assert(Array.isArray(res.body.recentErrors), 'recentErrors는 배열이다')
    const raw = JSON.stringify(res.body)
    t.assert(!raw.includes('alice@test.com'), 'ai-usage 응답에는 특정 유저의 이메일이 전혀 없다(응답 전체에 user_id/email 필드 자체가 없음)')
  }

  return t.summary()
}

module.exports = { run }
