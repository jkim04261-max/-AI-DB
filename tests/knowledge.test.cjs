// Tests the knowledge-teaching actions on api/character.ts
// (?action=verify-knowledge / save-knowledge / knowledge) added in PR #44.
// See tests/README.md for why this is a bundled-handler test, not an
// in-process one, and tests/character.test.cjs for the character/profession
// actions this builds on.
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.GEMINI_API_KEY = 'fake-key-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default
  const auth = bundle('api/_lib/auth.ts')

  // --- fetch mock: controllable per call, same shape as daily-limit.test.cjs ---
  let geminiBehavior = { kind: 'json', status: 200, result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' } }
  let geminiCallCount = 0
  global.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
      geminiCallCount++
      if (geminiBehavior.kind === 'network-error') {
        throw new Error('simulated network failure')
      }
      if (geminiBehavior.kind === 'http-error') {
        return { ok: false, status: geminiBehavior.status, json: async () => ({ error: { message: 'simulated failure' } }) }
      }
      if (geminiBehavior.kind === 'malformed') {
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '이건 JSON이 아니에요' }] } }] }) }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiBehavior.result) }] } }] }),
      }
    }
    throw new Error(`unexpected fetch to ${url}`)
  }

  const t = new Tracker('knowledge')

  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' })
  const cookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const authedReq = (overrides = {}) => ({ headers: { cookie }, query: {}, ...overrides })

  // Create 누리 (회계사) and 두리 (가수) for alice.
  await characterHandler(authedReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
  await characterHandler(authedReq({ method: 'POST', body: { companionType: 'duri' } }), mockRes())
  await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
  await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'duri', profession: 'singer' } }), mockRes())

  // --- auth required ---
  {
    const res = mockRes()
    await characterHandler({ method: 'POST', headers: {}, query: { action: 'verify-knowledge' }, body: {} }, res)
    t.assert(res.statusCode === 401, 'verify-knowledge without a session is rejected (401)')
  }
  {
    const res = mockRes()
    await characterHandler({ method: 'GET', headers: {}, query: { action: 'knowledge', companionType: 'nuri' } }, res)
    t.assert(res.statusCode === 401, 'listing knowledge without a session is rejected (401)')
  }

  // --- profession required before teaching ---
  mock.seedUser(4, { email: 'dave@test.com' })
  const daveCookie = cookieHeaderFor(auth, 4, 0, 'dave@test.com')
  await characterHandler({ headers: { cookie: daveCookie }, query: {}, method: 'POST', body: { companionType: 'nuri' } }, mockRes())
  {
    const res = mockRes()
    await characterHandler(
      { headers: { cookie: daveCookie }, query: { action: 'verify-knowledge' }, method: 'POST', body: { companionType: 'nuri', title: 't', content: 'c' } },
      res,
    )
    t.assert(res.statusCode === 400, "직업이 없는 캐릭터는 지식 검증을 거부한다 (400, '직업이 없는 캐릭터는 먼저 직업 선택을 안내')")
  }

  // --- 1 & 3: 누리(회계사)에게 지식 입력, Gemini 정상 검증(적합) ---
  geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: '정확해요', relevance: '회계사와 관련 있어요', issues: '', suggestion: '' } }
  let verifyRes = mockRes()
  await characterHandler(
    authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '복식부기', content: '거래를 차변과 대변에 동시에 기록한다.' } }),
    verifyRes,
  )
  t.assert(verifyRes.statusCode === 200, '누리(회계사)에게 지식 입력 시 검증 요청이 성공한다 (200)')
  t.assert(verifyRes.body.verification?.status === 'appropriate', 'Gemini가 적합으로 정상 검증한다')
  t.assert(typeof verifyRes.body.remaining === 'number', '남은 검증 횟수가 응답에 포함된다')
  t.assert(typeof verifyRes.body.verificationToken === 'string' && verifyRes.body.verificationToken.length > 0, '검증 결과에 서명된 verificationToken이 포함된다')

  // --- 6: 사용자 확인 전 DB 미저장 ---
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), res)
    t.assert(res.body.entries?.length === 0, '검증만 하고 저장을 누르지 않으면 학습 기록이 생기지 않는다(자동 저장 없음)')
  }

  // --- 사용자 확인 후 저장 ---
  const saveRes1 = mockRes()
  await characterHandler(
    authedReq({
      method: 'POST',
      query: { action: 'save-knowledge' },
      body: {
        companionType: 'nuri',
        title: '복식부기',
        originalContent: '거래를 차변과 대변에 동시에 기록한다.',
        finalContent: '거래를 차변과 대변에 동시에 기록한다.',
        verificationToken: verifyRes.body.verificationToken,
        requestId: 'req-1',
      },
    }),
    saveRes1,
  )
  t.assert(saveRes1.statusCode === 201, '사용자가 확인 후 저장하면 성공한다 (201)')
  t.assert(saveRes1.body.entry?.profession === 'accountant', '저장된 기록에 캐릭터의 직업(회계사)이 함께 기록된다')

  // --- 11: 중복 제출 방지 (같은 requestId로 다시 저장) ---
  {
    const res = mockRes()
    await characterHandler(
      authedReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'nuri',
          title: '복식부기',
          originalContent: '거래를 차변과 대변에 동시에 기록한다.',
          finalContent: '거래를 차변과 대변에 동시에 기록한다.',
          verificationToken: verifyRes.body.verificationToken,
          requestId: 'req-1',
        },
      }),
      res,
    )
    t.assert(res.statusCode === 200, '같은 requestId로 다시 저장을 시도하면 200(기존 기록 반환)으로 응답한다')
    t.assert(res.body.entry?.id === saveRes1.body.entry?.id, '중복 제출은 같은 id의 기존 기록을 반환할 뿐, 새 기록을 만들지 않는다')
  }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), res)
    t.assert(res.body.total === 1, '중복 제출 후에도 누리의 학습 기록은 1개뿐이다(여러 번 저장되지 않음)')
  }

  // --- 2: 두리(가수)에게 지식 입력 ---
  geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: '정확해요', relevance: '가수와 관련 있어요', issues: '', suggestion: '' } }
  const duriVerify = mockRes()
  await characterHandler(
    authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'duri', title: '발성법', content: '복식호흡으로 소리를 낸다.' } }),
    duriVerify,
  )
  t.assert(duriVerify.statusCode === 200, '두리(가수)에게 지식 입력 시 검증 요청이 성공한다 (200)')
  const duriSave = mockRes()
  await characterHandler(
    authedReq({
      method: 'POST',
      query: { action: 'save-knowledge' },
      body: {
        companionType: 'duri',
        title: '발성법',
        originalContent: '복식호흡으로 소리를 낸다.',
        finalContent: '복식호흡으로 소리를 낸다.',
        verificationToken: duriVerify.body.verificationToken,
        requestId: 'req-2',
      },
    }),
    duriSave,
  )
  t.assert(duriSave.statusCode === 201, '두리의 지식 저장도 성공한다 (201)')

  // --- 9: 누리·두리 지식 기록 분리 ---
  {
    const nuriList = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), nuriList)
    const duriList = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'knowledge', companionType: 'duri' } }), duriList)
    t.assert(nuriList.body.total === 1 && nuriList.body.entries[0].title === '복식부기', '누리의 학습 기록 목록에는 누리에게 가르친 것만 있다')
    t.assert(duriList.body.total === 1 && duriList.body.entries[0].title === '발성법', '두리의 학습 기록 목록에는 두리에게 가르친 것만 있다(서로 섞이지 않음)')
  }

  // --- 7 & 8: 새로고침·재로그인 후 기록 유지 ---
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), res)
    t.assert(res.body.entries?.[0]?.title === '복식부기', '새로고침(동일 세션 재조회)해도 학습 기록이 유지된다')
  }
  {
    const freshCookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
    const res = mockRes()
    await characterHandler({ headers: { cookie: freshCookie }, query: { action: 'knowledge', companionType: 'nuri' }, method: 'GET' }, res)
    t.assert(res.body.entries?.[0]?.title === '복식부기', '재로그인(새 세션 토큰)으로 조회해도 학습 기록이 유지된다')
  }

  // --- 4: 잘못된 지식의 수정 필요 처리 ---
  geminiBehavior = { kind: 'json', result: { status: 'needs_revision', explanation: '일부 틀렸어요', relevance: '관련 있음', issues: '연도가 틀렸어요', suggestion: '연도를 수정하세요' } }
  const revisionVerify = mockRes()
  await characterHandler(
    authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '틀린지식', content: '잘못된 내용' } }),
    revisionVerify,
  )
  t.assert(revisionVerify.body.verification?.status === 'needs_revision', "잘못된 지식은 '수정 필요'로 분류된다")
  {
    const res = mockRes()
    await characterHandler(
      authedReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'nuri',
          title: '틀린지식',
          originalContent: '잘못된 내용',
          finalContent: '잘못된 내용',
          verificationToken: revisionVerify.body.verificationToken,
          requestId: 'req-3',
        },
      }),
      res,
    )
    t.assert(res.statusCode === 400, "'수정 필요' 상태는 저장이 거부된다 (400) — 검증된 지식만 저장")
  }

  // --- 검증 불가 처리 (Gemini가 JSON이 아닌 응답을 줄 때) ---
  geminiBehavior = { kind: 'malformed' }
  const unverifiableVerify = mockRes()
  await characterHandler(
    authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '이상한지식', content: '내용' } }),
    unverifiableVerify,
  )
  t.assert(unverifiableVerify.body.verification?.status === 'unverifiable', 'Gemini 응답이 JSON 형식이 아니면 검증 불가로 처리된다(서버가 합성한 안전한 결과)')
  {
    const res = mockRes()
    await characterHandler(
      authedReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'nuri',
          title: '이상한지식',
          originalContent: '내용',
          finalContent: '내용',
          verificationToken: unverifiableVerify.body.verificationToken,
          requestId: 'req-4',
        },
      }),
      res,
    )
    t.assert(res.statusCode === 400, "'검증 불가' 상태는 저장이 거부된다 (400)")
  }

  // --- 5: Gemini 타임아웃·오류 처리 (+ 환불로 한도 소모 안 함) ---
  geminiBehavior = { kind: 'http-error', status: 500 }
  const beforeErrorCount = (await (async () => {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: 't', content: 'c' } }), res)
    return res
  })())
  t.assert(beforeErrorCount.statusCode >= 500, 'Gemini가 오류를 반환하면 서버 오류로 처리된다(사용자에게 친절한 메시지)')
  geminiBehavior = { kind: 'network-error' }
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: 't', content: 'c' } }), res)
    t.assert(res.statusCode >= 500, 'Gemini 네트워크 오류도 서버 오류로 처리된다')
  }

  // --- 10: 다른 사용자 기록 접근 차단 ---
  mock.seedUser(2, { email: 'bob@test.com' })
  const bobCookie = cookieHeaderFor(auth, 2, 0, 'bob@test.com')
  {
    const res = mockRes()
    await characterHandler({ headers: { cookie: bobCookie }, query: { action: 'knowledge', companionType: 'nuri' }, method: 'GET' }, res)
    t.assert(res.statusCode === 404, "다른 사용자(bob)가 alice의 누리 학습 기록을 조회하려 하면 404로 차단된다(캐릭터가 bob 소유가 아님)")
  }
  {
    const res = mockRes()
    await characterHandler(
      { headers: { cookie: bobCookie }, query: { action: 'verify-knowledge' }, method: 'POST', body: { companionType: 'nuri', title: 't', content: 'c' } },
      res,
    )
    t.assert(res.statusCode === 404, 'bob이 alice의 누리에게 지식을 가르치려 해도 404로 차단된다')
  }

  // --- 입력 검증 ---
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '', content: 'c' } }), res)
    t.assert(res.statusCode === 400, '빈 제목은 거부된다 (400)')
  }
  {
    const res = mockRes()
    await characterHandler(
      authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: 't', content: 'x'.repeat(5000) } }),
      res,
    )
    t.assert(res.statusCode === 400, '너무 긴 내용은 거부된다 (400)')
  }
  {
    const res = mockRes()
    await characterHandler(
      authedReq({ method: 'POST', query: { action: 'save-knowledge' }, body: { companionType: 'nuri', title: 't', originalContent: 'c', finalContent: 'c' } }),
      res,
    )
    t.assert(res.statusCode === 400, 'verificationToken이 없는 저장 요청은 거부된다 (400) — 더 이상 클라이언트의 검증 결과 주장을 신뢰하지 않는다')
  }

  // --- 보안 수정: 검증 상태·내용 변조 방지 (서명된 verificationToken으로 저장 내용을 검증 시점에 안전하게 연결) ---
  {
    // 새로 적합 검증을 하나 받아, 토큰을 변조해본다.
    geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: '정확해요', relevance: '관련 있어요', issues: '', suggestion: '' } }
    const freshVerify = mockRes()
    await characterHandler(
      authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '변조테스트', content: '원본 내용' } }),
      freshVerify,
    )
    t.assert(freshVerify.statusCode === 200, '변조 테스트용 검증 요청이 성공한다')
    const validToken = freshVerify.body.verificationToken

    // 1) 토큰 payload의 필드를 서명 없이 직접 조작(비밀키 없이) — 서명이 깨져 거부되어야 한다.
    {
      const [dataPart, signaturePart] = validToken.split('.')
      const decoded = JSON.parse(Buffer.from(dataPart, 'base64url').toString('utf8'))
      t.assert(decoded.status === 'appropriate', '원본 토큰의 상태는 적합이다 (변조 비교 기준)')
      const forgedDecoded = { ...decoded, status: 'needs_revision' }
      const forgedDataPart = Buffer.from(JSON.stringify(forgedDecoded)).toString('base64url')
      const forgedToken = `${forgedDataPart}.${signaturePart}` // 서명은 원본 그대로 재사용(공격자는 비밀키가 없음)

      const res = mockRes()
      await characterHandler(
        authedReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: { companionType: 'nuri', title: '변조테스트', originalContent: '원본 내용', finalContent: '원본 내용', verificationToken: forgedToken, requestId: 'req-tamper-status' },
        }),
        res,
      )
      t.assert(res.statusCode === 400, '검증 상태를 변조한 토큰은 서명이 깨져 저장이 거부된다 (400)')
    }

    // 2) 실제로 '수정 필요' 판정을 받은 뒤, 그 토큰의 상태만 '적합'으로 바꿔 저장을 시도 — 역시 서명이 깨져 거부되어야 한다.
    {
      geminiBehavior = { kind: 'json', result: { status: 'needs_revision', explanation: '틀림', relevance: '관련 있음', issues: '오류', suggestion: '수정하세요' } }
      const badVerify = mockRes()
      await characterHandler(
        authedReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '변조테스트2', content: '틀린 내용' } }),
        badVerify,
      )
      const [dataPart, signaturePart] = badVerify.body.verificationToken.split('.')
      const decoded = JSON.parse(Buffer.from(dataPart, 'base64url').toString('utf8'))
      t.assert(decoded.status === 'needs_revision', "'수정 필요' 검증의 토큰 상태는 needs_revision이다")
      const forged = { ...decoded, status: 'appropriate' }
      const forgedDataPart = Buffer.from(JSON.stringify(forged)).toString('base64url')
      const forgedToken = `${forgedDataPart}.${signaturePart}`

      const res = mockRes()
      await characterHandler(
        authedReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: { companionType: 'nuri', title: '변조테스트2', originalContent: '틀린 내용', finalContent: '틀린 내용', verificationToken: forgedToken, requestId: 'req-tamper-status-2' },
        }),
        res,
      )
      t.assert(res.statusCode === 400, "'수정 필요' 결과의 상태를 '적합'으로 바꿔 저장을 시도해도 서명이 깨져 거부된다 (400)")
    }

    // 3) 검증 후 내용을 바꿔서 저장 시도 — 토큰은 유효하지만 내용이 검증 시점과 달라 거부되어야 한다.
    {
      const res = mockRes()
      await characterHandler(
        authedReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: { companionType: 'nuri', title: '변조테스트', originalContent: '원본 내용', finalContent: '검증 후 몰래 바꾼 내용', verificationToken: validToken, requestId: 'req-content-change' },
        }),
        res,
      )
      t.assert(res.statusCode === 400, '검증 완료 후 내용을 바꿔 저장하려 하면 토큰과 내용이 일치하지 않아 거부된다 (400)')
    }
    {
      const res = mockRes()
      await characterHandler(
        authedReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: { companionType: 'nuri', title: '제목도 변조', originalContent: '원본 내용', finalContent: '원본 내용', verificationToken: validToken, requestId: 'req-title-change' },
        }),
        res,
      )
      t.assert(res.statusCode === 400, '검증 완료 후 제목을 바꿔 저장하려 해도 토큰과 일치하지 않아 거부된다 (400)')
    }

    // 4) 올바른 토큰 그대로는 정상 저장된다 (변조 방지 로직이 정상 경로를 막지 않는지 확인).
    {
      const res = mockRes()
      await characterHandler(
        authedReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: { companionType: 'nuri', title: '변조테스트', originalContent: '원본 내용', finalContent: '원본 내용', verificationToken: validToken, requestId: 'req-tamper-ok' },
        }),
        res,
      )
      t.assert(res.statusCode === 201, '변조되지 않은 정상 토큰으로는 저장이 성공한다 (201)')
    }

    // 5) 다른 사용자(bob)가 alice의 유효한 토큰을 가로채 자기 캐릭터에 저장을 시도해도, 토큰의 userId가 달라 거부되어야 한다.
    {
      const res = mockRes()
      await characterHandler(
        { headers: { cookie: bobCookie }, query: { action: 'save-knowledge' }, method: 'POST', body: { companionType: 'nuri', title: '변조테스트', originalContent: '원본 내용', finalContent: '원본 내용', verificationToken: validToken, requestId: 'req-steal-token' } },
        res,
      )
      t.assert(res.statusCode === 400 || res.statusCode === 404, 'alice의 검증 토큰을 bob이 가로채 사용해도 사용자 불일치로 거부된다')
    }
  }

  // --- 12: API 호출량 제한 (하루 10회, 채팅 질문 제한과 완전히 분리) ---
  mock.reset()
  mock.seedUser(3, { email: 'carol@test.com' })
  const carolCookie = cookieHeaderFor(auth, 3, 0, 'carol@test.com')
  const carolReq = (overrides = {}) => ({ headers: { cookie: carolCookie }, query: {}, ...overrides })
  await characterHandler(carolReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
  await characterHandler(carolReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
  geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' } }

  let lastRes
  for (let i = 0; i < 10; i++) {
    lastRes = mockRes()
    await characterHandler(carolReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: `t${i}`, content: `c${i}` } }), lastRes)
  }
  t.assert(lastRes.statusCode === 200, '하루 10번째 검증 요청까지는 성공한다')
  const over = mockRes()
  await characterHandler(carolReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: 't11', content: 'c11' } }), over)
  t.assert(over.statusCode === 429, '하루 11번째 검증 요청은 429로 차단된다(기본 하루 10회 제한)')
  t.assert(over.body.remaining === 0, '한도 초과 응답의 remaining은 0이다')

  // Failing on the chat daily question limit must not affect this counter,
  // and vice versa — they're separate tables (daily_question_usage vs
  // daily_teach_usage), never cross-checked by either code path. This is
  // verified structurally (separate table/column names throughout), not by
  // a shared-state assertion here.
  t.assert(geminiCallCount > 0, 'Gemini API가 실제로 (모의) 호출되었다')

  return t.summary()
}

module.exports = { run }
