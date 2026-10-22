// Tests the character_messages conversation log (?action=messages, plus
// the logging side-effects of verify-knowledge/study-generate/save-knowledge)
// added in PR #45 checkpoint 3.6. See tests/README.md for why this is a
// bundled-handler test, and tests/knowledge.test.cjs for the knowledge-
// verification actions this builds on.
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.GEMINI_API_KEY = 'fake-key-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default
  const auth = bundle('api/_lib/auth.ts')

  let geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' } }
  global.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
      if (geminiBehavior.kind === 'network-error') throw new Error('simulated network failure')
      if (geminiBehavior.kind === 'http-error') {
        return { ok: false, status: geminiBehavior.status ?? 500, json: async () => ({ error: { message: 'simulated failure' } }) }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiBehavior.result) }] } }] }),
      }
    }
    throw new Error(`unexpected fetch to ${url}`)
  }

  const t = new Tracker('characterMessages')

  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' })
  const cookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const authedReq = (overrides = {}) => ({ headers: { cookie }, query: {}, ...overrides })

  await characterHandler(authedReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
  await characterHandler(authedReq({ method: 'POST', body: { companionType: 'duri' } }), mockRes())
  await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
  await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'duri', profession: 'singer' } }), mockRes())

  // --- auth required ---
  {
    const res = mockRes()
    await characterHandler({ method: 'GET', headers: {}, query: { action: 'messages', companionType: 'nuri' } }, res)
    t.assert(res.statusCode === 401, 'listing messages without a session is rejected (401)')
  }

  // --- empty history before any interaction ---
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), res)
    t.assert(res.statusCode === 200 && res.body.total === 0 && res.body.messages.length === 0, '상호작용 전에는 대화 기록이 비어 있다')
  }

  // --- 가르치기(appropriate): user + character 두 줄이 기록된다 ---
  geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: '정확해요', relevance: '회계사와 관련 있어요', issues: '', suggestion: '' } }
  const verifyRes = mockRes()
  await characterHandler(
    authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '복식부기', content: '거래를 두 번 기록한다' } }),
    verifyRes,
  )
  t.assert(verifyRes.statusCode === 200, '가르치기 검증이 성공한다')
  t.assert(typeof verifyRes.body.characterReply === 'string' && verifyRes.body.characterReply.length > 0, '응답에 캐릭터의 대사(characterReply)가 서버에서 만들어져 포함된다')

  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), res)
    t.assert(res.body.total === 2, '가르치기 1회로 사용자 발화 1줄 + 캐릭터 응답 1줄, 총 2줄이 기록된다')
    t.assert(res.body.messages[0].speaker === 'user' && res.body.messages[0].content.includes('복식부기'), '첫 줄은 사용자가 입력한 내용(시간순 첫 번째)이다')
    t.assert(res.body.messages[1].speaker === 'character' && res.body.messages[1].content === verifyRes.body.characterReply, '두 번째 줄은 응답으로 내려온 characterReply와 정확히 같다')
    t.assert(res.body.messages[1].verification_status === 'appropriate', '캐릭터 응답 줄에 검증 상태(적합)가 함께 저장된다')
    t.assert(res.body.messages[1].knowledge_entry_id === null, '저장(확정) 전까지는 knowledge_entry_id가 비어 있다 — 검증만으로 자동 저장되지 않는다')
  }

  // --- 저장하면 "저장했어요" 캐릭터 대사가 세 번째 줄로 추가되고, knowledge_entry_id가 연결된다 ---
  const saveRes = mockRes()
  await characterHandler(
    authedReq({
      method: 'POST',
      query: { action: 'save-knowledge' },
      body: {
        companionType: 'nuri',
        title: '복식부기',
        originalContent: '거래를 두 번 기록한다',
        finalContent: '거래를 두 번 기록한다',
        verificationToken: verifyRes.body.verificationToken,
        requestId: 'req-msg-1',
      },
    }),
    saveRes,
  )
  t.assert(saveRes.statusCode === 201, '저장이 성공한다')
  t.assert(typeof saveRes.body.savedReply === 'string' && saveRes.body.savedReply.length > 0, '저장 응답에도 서버가 만든 대사(savedReply)가 포함된다')

  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), res)
    t.assert(res.body.total === 3, '저장 후에는 대화 기록이 3줄(사용자 발화 + 검증 응답 + 저장 확인)로 늘어난다')
    const savedLine = res.body.messages[2]
    t.assert(savedLine.content === saveRes.body.savedReply, '세 번째 줄은 저장 확인 대사와 정확히 같다')
    t.assert(savedLine.knowledge_entry_id === saveRes.body.entry.id, '저장 확인 줄은 실제로 저장된 학습 기록 id와 연결된다')
    t.assert(savedLine.source === 'user_taught', '저장 확인 줄의 출처도 user_taught로 올바르게 기록된다')
  }

  // --- 7: '수정 필요'/'검증 불가' 시도도 대화 기록에는 남지만, 학습 기록(character_knowledge_entries)에는 저장되지 않는다 ---
  geminiBehavior = { kind: 'json', result: { status: 'needs_revision', explanation: '연도가 틀렸어요', relevance: '관련 있음', issues: '오류', suggestion: '연도를 고치세요' } }
  const revisionRes = mockRes()
  await characterHandler(
    authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '틀린지식', content: '잘못된 내용' } }),
    revisionRes,
  )
  t.assert(revisionRes.body.verification?.status === 'needs_revision', "'수정 필요' 검증 결과를 받는다")

  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), res)
    t.assert(res.body.total === 5, "'수정 필요' 시도도 대화 기록에는 남는다(사용자 발화 + 캐릭터 응답 2줄 추가)")
    const lastLine = res.body.messages[res.body.messages.length - 1]
    t.assert(lastLine.verification_status === 'needs_revision', '대화 기록에 수정 필요 상태가 그대로 보존된다')
    t.assert(lastLine.knowledge_entry_id === null, "'수정 필요' 응답 줄은 어떤 학습 기록과도 연결되지 않는다(검증되지 않은 내용은 지식으로 취급하지 않음)")
  }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), res)
    t.assert(res.body.total === 1, "'수정 필요' 시도는 학습 기록(character_knowledge_entries)에는 여전히 추가되지 않는다 — 적합 판정 1건만 존재")
  }

  // --- 스스로 공부하기: 캐릭터 발화 1줄만 기록된다(사용자가 입력한 게 없으므로) ---
  geminiBehavior = {
    kind: 'json',
    result: { title: '발생주의', content: '수익과 비용은 발생 시점에 인식한다.', status: 'appropriate', explanation: '정확해요', relevance: '관련 있음', issues: '', suggestion: '' },
  }
  const studyRes = mockRes()
  await characterHandler(authedReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'nuri' } }), studyRes)
  t.assert(studyRes.statusCode === 200, '스스로 공부하기가 성공한다')
  t.assert(typeof studyRes.body.characterReply === 'string', '스스로 공부하기 응답에도 characterReply가 포함된다')

  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), res)
    t.assert(res.body.total === 6, '스스로 공부하기는 캐릭터 발화 1줄만 추가한다(사용자 줄 없음)')
    const lastLine = res.body.messages[res.body.messages.length - 1]
    t.assert(lastLine.speaker === 'character' && lastLine.source === 'ai_generated', '마지막 줄은 캐릭터가 스스로 생성한(ai_generated) 발화다')
  }

  // --- 3: 새로고침(동일 세션 재조회) 및 재로그인 후에도 대화 기록이 유지된다 ---
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), res)
    t.assert(res.body.total === 6, '새로고침(동일 세션 재조회)해도 대화 기록이 유지된다')
  }
  {
    const freshCookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
    const res = mockRes()
    await characterHandler({ headers: { cookie: freshCookie }, query: { action: 'messages', companionType: 'nuri' }, method: 'GET' }, res)
    t.assert(res.body.total === 6, '재로그인(새 세션 토큰)으로 조회해도 대화 기록이 유지된다')
  }

  // --- 캐릭터별 분리: 두리에게는 아직 아무 대화도 없다 ---
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'duri' } }), res)
    t.assert(res.body.total === 0, '누리에게 나눈 대화가 두리의 대화 기록에는 전혀 섞이지 않는다')
  }
  geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: '좋아요', relevance: '가수와 관련 있어요', issues: '', suggestion: '' } }
  await characterHandler(
    authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'duri', title: '발성법', content: '복식호흡으로 소리를 낸다' } }),
    mockRes(),
  )
  {
    const nuriMsgs = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), nuriMsgs)
    const duriMsgs = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'duri' } }), duriMsgs)
    t.assert(nuriMsgs.body.total === 6, '두리에게 가르친 뒤에도 누리의 대화 기록 수는 그대로다')
    t.assert(duriMsgs.body.total === 2, '두리의 대화는 두리의 기록에만 추가된다(사용자 발화 + 캐릭터 응답)')
  }

  // --- 5: 다른 사용자 접근 차단 ---
  mock.seedUser(2, { email: 'bob@test.com' })
  const bobCookie = cookieHeaderFor(auth, 2, 0, 'bob@test.com')
  {
    const res = mockRes()
    await characterHandler({ headers: { cookie: bobCookie }, query: { action: 'messages', companionType: 'nuri' }, method: 'GET' }, res)
    t.assert(res.statusCode === 404, "다른 사용자(bob)가 alice의 누리 대화 기록을 조회하려 하면 404로 차단된다")
  }

  // --- 8: Gemini 호출 자체가 실패하면(검증 실패) 대화 기록도 전혀 남지 않는다 — 성공한 것처럼 보이는 일부 기록이 남지 않는다 ---
  geminiBehavior = { kind: 'network-error' }
  {
    const before = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), before)
    const beforeTotal = before.body.total

    const failedVerify = mockRes()
    await characterHandler(
      authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '실패할 지식', content: '내용' } }),
      failedVerify,
    )
    t.assert(failedVerify.statusCode >= 500, 'Gemini 호출 자체가 실패하면 500대 오류를 반환한다')

    const after = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'messages', companionType: 'nuri' } }), after)
    t.assert(after.body.total === beforeTotal, 'Gemini 호출이 실패한 시도는 대화 기록에도 전혀 남지 않는다(성공한 것처럼 표시되지 않음)')
  }

  return t.summary()
}

module.exports = { run }
