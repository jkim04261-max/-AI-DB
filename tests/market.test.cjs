// Tests the 마켓/거래 placeholder data structure & policy added per
// 지시서(만능마켓·공유·거래 후속 개발을 위한 데이터 구조 및 정책
// 설계): market_items/purchases 테이블과 그 위의 등록(market-item-
// register)·구매(market-purchase)·목록(market-items) 액션. 화면은
// 아직 없다(사이드바는 "준비 중" 모달만 띄운다 — e2e/home-dashboard.spec.ts
// 참고) — 여기서는 API/정책 레벨만 검증한다.
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default
  const auth = bundle('api/_lib/auth.ts')

  const t = new Tracker('market')

  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' })
  mock.seedUser(2, { email: 'bob@test.com' })
  const aliceCookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const bobCookie = cookieHeaderFor(auth, 2, 0, 'bob@test.com')
  const aliceReq = (overrides = {}) => ({ headers: { cookie: aliceCookie }, query: {}, ...overrides })
  const bobReq = (overrides = {}) => ({ headers: { cookie: bobCookie }, query: {}, ...overrides })

  // alice의 지식 기록장 글 하나를 만들어둔다 — market_items가 참조할
  // personal_knowledge_log 소스.
  const saveRes = mockRes()
  await characterHandler(
    aliceReq({ method: 'POST', query: { action: 'knowledge-log-save' }, body: { entryDate: '2026-11-19', category: 'tip', content: '비공개 원본 상세 노하우 전문' } }),
    saveRes,
  )
  const aliceLogId = saveRes.body.entry.id

  // alice의 AI 캐릭터(누리)와 학습 기록 하나도 직접 심어둔다 — 실제
  // "가르치기" 플로우(Gemini 호출)를 거치지 않고, market_items가
  // 참조할 character_knowledge_entries 소스만 필요하기 때문.
  mock.state.characters.push({
    id: 100,
    user_id: 1,
    companion_type: 'nuri',
    stage: 'child',
    profession: 'accountant',
    custom_profession_label: null,
    level: 1,
    exp: 0,
    mission_unlocked_tier: null,
    focus_percent: 100,
    created_at: new Date().toISOString(),
  })
  mock.state.knowledgeEntries.push({
    id: 200,
    user_id: 1,
    character_id: 100,
    profession: 'accountant',
    custom_profession_label: null,
    title: '부가세 신고 요령',
    original_content: '부가세 신고는...',
    final_content: '부가세 신고는 매 분기...',
    verification_status: 'appropriate',
    verification_explanation: 'ok',
    client_request_id: 'seed-1',
    source: 'teach',
    mission_type: null,
    age_tier_at_save: null,
    knowledge_category: null,
    created_at: new Date().toISOString(),
  })

  // --- 1) 등록: 위험 키워드가 없으면 review_status='approved'로 바로
  // 승인되고, 요청한 visibility가 그대로 반영된다. ---
  let approvedItemId
  {
    const res = mockRes()
    await characterHandler(
      aliceReq({
        method: 'POST',
        query: { action: 'market-item-register' },
        body: { sourceType: 'personal_knowledge_log', sourceId: aliceLogId, title: '매장 청소 꿀팁 패키지', description: '깨끗하게 유지하는 법', priceWon: 3000, visibility: 'public' },
      }),
      res,
    )
    t.assert(res.statusCode === 200, '위험 키워드가 없으면 등록 자체는 성공한다')
    t.assert(res.body.item.reviewStatus === 'approved', '위험 키워드가 없으면 검수 없이 승인(approved) 상태로 저장된다')
    t.assert(res.body.item.visibility === 'public', '요청한 공개 범위(public)가 그대로 반영된다')
    t.assert(res.body.item.title === '매장 청소 꿀팁 패키지', '제목이 그대로 저장된다')
    t.assert(JSON.stringify(res.body).includes('비공개 원본 상세 노하우 전문') === false, '응답에는 원본 지식 본문(content)이 전혀 포함되지 않는다')
    approvedItemId = res.body.item.id
  }

  // --- 2) 등록: 위험 키워드(계좌번호)가 있으면 공개 요청이었어도
  // under_review + private로 강제된다("등록 불가 또는 비공개"). ---
  let underReviewItemId
  {
    const res = mockRes()
    await characterHandler(
      aliceReq({
        method: 'POST',
        query: { action: 'market-item-register' },
        body: {
          sourceType: 'character_knowledge',
          sourceId: 200,
          title: '계좌번호 모음',
          description: '이 상품은 공개로 팔고 싶어요',
          priceWon: 5000,
          visibility: 'public',
        },
      }),
      res,
    )
    t.assert(res.statusCode === 200, '위험 키워드가 있어도 저장 자체는 성공한다(등록 거부가 아니라 검수 대기)')
    t.assert(res.body.item.reviewStatus === 'under_review', "제목에 '계좌번호' 같은 위험 키워드가 있으면 검수 대기(under_review) 상태로 강제된다")
    t.assert(res.body.item.visibility === 'private', '검수 대기 상태에서는 요청한 public을 무시하고 비공개로 강제된다')
    underReviewItemId = res.body.item.id
  }

  // --- 3) 소유권 검증: bob이 alice의 지식 기록/학습 기록으로는 상품을
  // 등록할 수 없다. ---
  {
    const res = mockRes()
    await characterHandler(
      bobReq({ method: 'POST', query: { action: 'market-item-register' }, body: { sourceType: 'personal_knowledge_log', sourceId: aliceLogId, title: '남의 기록 도용', priceWon: 1000 } }),
      res,
    )
    t.assert(res.statusCode === 404, '남의 지식 기록으로는 상품을 등록할 수 없다(404)')
  }
  {
    const res = mockRes()
    await characterHandler(
      bobReq({ method: 'POST', query: { action: 'market-item-register' }, body: { sourceType: 'character_knowledge', sourceId: 200, title: '남의 학습 기록 도용', priceWon: 1000 } }),
      res,
    )
    t.assert(res.statusCode === 404, '남의 캐릭터 학습 기록으로도 상품을 등록할 수 없다(404)')
  }

  // --- 4) 입력 검증 ---
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'market-item-register' }, body: { sourceType: 'invalid', sourceId: aliceLogId, title: '제목', priceWon: 0 } }), res)
    t.assert(res.statusCode === 400, '알 수 없는 sourceType은 400이다')
  }
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'market-item-register' }, body: { sourceType: 'personal_knowledge_log', sourceId: aliceLogId, title: '', priceWon: 0 } }), res)
    t.assert(res.statusCode === 400, '제목이 비어 있으면 400이다')
  }
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'market-item-register' }, body: { sourceType: 'personal_knowledge_log', sourceId: aliceLogId, title: '제목', priceWon: -100 } }), res)
    t.assert(res.statusCode === 400, '가격이 음수면 400이다')
  }

  // --- 5) 감사 로그: 등록도 '개인 마스터 DB' 접근이라 감사 로그가
  // 남는다(지시서 12번과의 연동). ---
  {
    const marketLogs = mock.state.auditLogs.filter((l) => l.resource_type === 'market_item' && l.action === 'create')
    t.assert(marketLogs.length === 2, '등록 성공 2건(승인/검수대기) 모두 감사 로그에 남는다')
  }

  // --- 6) 목록: scope='mine'은 내 상품을 상태 무관하게 전부 보여준다. ---
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'GET', query: { action: 'market-items', scope: 'mine' } }), res)
    t.assert(res.statusCode === 200 && res.body.items.length === 2, "scope='mine'이면 승인/검수대기 상품이 모두 보인다")
  }

  // --- 7) 목록(기본값): 검수를 통과해 공개된 남의 상품만 보인다 — 내
  // 상품도, 검수 대기 중인 상품도 보이지 않는다. ---
  {
    const res = mockRes()
    await characterHandler(bobReq({ method: 'GET', query: { action: 'market-items' } }), res)
    t.assert(res.statusCode === 200, '공개 목록 조회는 성공한다')
    t.assert(res.body.items.length === 1 && res.body.items[0].id === approvedItemId, '검수를 통과해 공개된 상품 1개만 보인다')
    t.assert(
      res.body.items.every((i) => i.id !== underReviewItemId),
      '검수 대기(under_review) 상품은 공개 목록에 절대 뜨지 않는다',
    )
  }
  {
    // alice 자신에게는 본인이 등록한 approved 상품도 "공개 목록"에는
    // 보이지 않아야 한다(자기 자신 제외).
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'GET', query: { action: 'market-items' } }), res)
    t.assert(res.body.items.length === 0, '공개 목록에는 내가 등록한 상품이 보이지 않는다(자기 제외)')
  }

  // --- 8) 구매: [비밀번호 판매 금지] — 구매에 성공하면 license_key만
  // 받고, 원본 지식 내용이나 비밀번호는 응답에 전혀 없다. ---
  let licenseKey
  {
    const res = mockRes()
    await characterHandler(bobReq({ method: 'POST', query: { action: 'market-purchase' }, body: { marketItemId: approvedItemId } }), res)
    t.assert(res.statusCode === 200, '검수를 통과한 공개 상품은 구매할 수 있다')
    t.assert(typeof res.body.purchase.licenseKey === 'string' && res.body.purchase.licenseKey.length > 0, '구매 성공 시 license_key가 발급된다')
    t.assert(JSON.stringify(res.body).includes('비공개 원본 상세 노하우 전문') === false, '구매 응답에도 원본 지식 본문은 전혀 담기지 않는다')
    licenseKey = res.body.purchase.licenseKey
  }

  // --- 9) 구매 차단: 검수 대기 상품은 구매할 수 없다. ---
  {
    const res = mockRes()
    await characterHandler(bobReq({ method: 'POST', query: { action: 'market-purchase' }, body: { marketItemId: underReviewItemId } }), res)
    t.assert(res.statusCode === 404, '검수 대기 중인 상품은 구매할 수 없다')
  }

  // --- 10) 구매 차단: 자기 상품은 구매할 수 없다. ---
  {
    const res = mockRes()
    await characterHandler(aliceReq({ method: 'POST', query: { action: 'market-purchase' }, body: { marketItemId: approvedItemId } }), res)
    t.assert(res.statusCode === 400, '내가 등록한 상품은 내가 구매할 수 없다')
  }

  // --- 11) 구매 차단: 같은 상품을 두 번 구매할 수 없다(라이선스는
  // 1인당 1개). ---
  {
    const res = mockRes()
    await characterHandler(bobReq({ method: 'POST', query: { action: 'market-purchase' }, body: { marketItemId: approvedItemId } }), res)
    t.assert(res.statusCode === 409, '이미 구매한 상품을 다시 구매하려 하면 막힌다')
  }

  // --- 12) purchases 테이블이 실제로 설계·사용되고 있는지 확인(id,
  // buyer_user_id, market_item_id, license_key, purchased_at). ---
  {
    const row = mock.state.purchases.find((p) => p.license_key === licenseKey)
    t.assert(!!row && row.buyer_user_id === 2 && row.market_item_id === approvedItemId, 'purchases 테이블에 구매자·상품·라이선스 키가 올바르게 기록된다')
  }

  return t.summary()
}

module.exports = { run }
