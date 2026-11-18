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
  // PR #52 후속: 마지막으로 Gemini에 보낸 systemInstruction 텍스트 —
  // 스스로 공부하기가 캐릭터의 연령대를 실제로 프롬프트에 반영하는지
  // 확인하는 테스트에서 쓴다.
  let lastSystemInstruction = null
  global.fetch = async (url, init) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
      geminiCallCount++
      if (init?.body) {
        try {
          lastSystemInstruction = JSON.parse(init.body)?.systemInstruction?.parts?.[0]?.text ?? null
        } catch {
          lastSystemInstruction = null
        }
      }
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
  t.assert(saveRes1.body.entry?.source === 'user_taught', "사용자가 직접 가르친 지식은 source가 'user_taught'로 기록된다")

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

  // --- 지시서(만능마켓 구매 즉시 이용권 실시간 연동): carol의 지식 검증
  // (teachRemaining=0, 바로 위에서 이미 소진됨)으로 "지식 검증" 이용권을
  // 확인한다. ---
  {
    const purchase = mockRes()
    await characterHandler(carolReq({ method: 'POST', query: { action: 'purchase-knowledge-validation-ticket' }, body: {} }), purchase)
    t.assert(purchase.statusCode === 200, '지식 검증 충전권 구매가 성공한다 (200)')
    t.assert(purchase.body.knowledgeValidationTickets === 1, '구매 직후 응답에 최신 지식 검증 이용권 수량(1)이 즉시 포함된다')
    t.assert(purchase.body.aiRecommendTickets === 0, 'carol은 AI 추천 충전권을 산 적이 없으니 0이다(다른 이용권과 섞이지 않는다)')

    geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' } }
    const usedTicket = mockRes()
    await characterHandler(
      carolReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '추가 지식', content: '추가 내용' } }),
      usedTicket,
    )
    t.assert(usedTicket.statusCode === 200, '하루 검증 한도가 0이어도 구매한 지식 검증 이용권이 있으면 성공한다 (200)')
    t.assert(usedTicket.body.knowledgeValidationTickets === 0, '이용권 1장을 써서 응답의 knowledgeValidationTickets가 0으로 줄어든다')

    const blockedAgain = mockRes()
    await characterHandler(
      carolReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '또 다른 지식', content: '또 다른 내용' } }),
      blockedAgain,
    )
    t.assert(blockedAgain.statusCode === 429, '지식 검증 이용권까지 다 쓰면 다시 429로 차단된다')
    t.assert(
      blockedAgain.body.error === '오늘의 무료 검증 횟수를 모두 사용했고, 구매한 이용권도 없습니다. 만능마켓에서 구매 후 이용해 주세요.',
      '지식 검증 이용권까지 없을 때의 안내 문구가 내려온다',
    )
  }

  // Failing on the chat daily question limit must not affect this counter,
  // and vice versa — they're separate tables (daily_question_usage vs
  // daily_teach_usage), never cross-checked by either code path. This is
  // verified structurally (separate table/column names throughout), not by
  // a shared-state assertion here.
  t.assert(geminiCallCount > 0, 'Gemini API가 실제로 (모의) 호출되었다')

  // --- PR #45 checkpoint 3: "스스로 공부하기" (study-generate) ---
  mock.reset()
  mock.seedUser(5, { email: 'erin@test.com' })
  const erinCookie = cookieHeaderFor(auth, 5, 0, 'erin@test.com')
  const erinReq = (overrides = {}) => ({ headers: { cookie: erinCookie }, query: {}, ...overrides })
  await characterHandler(erinReq({ method: 'POST', body: { companionType: 'duri' } }), mockRes())
  await characterHandler(erinReq({ method: 'PATCH', body: { companionType: 'duri', profession: 'singer' } }), mockRes())

  // --- auth / profession-required guards, same shape as verify-knowledge ---
  {
    const res = mockRes()
    await characterHandler({ method: 'POST', headers: {}, query: { action: 'study-generate' }, body: { companionType: 'duri' } }, res)
    t.assert(res.statusCode === 401, 'study-generate without a session is rejected (401)')
  }
  {
    mock.seedUser(6, { email: 'frank@test.com' })
    const frankCookie = cookieHeaderFor(auth, 6, 0, 'frank@test.com')
    await characterHandler({ headers: { cookie: frankCookie }, query: {}, method: 'POST', body: { companionType: 'duri' } }, mockRes())
    const res = mockRes()
    await characterHandler(
      { headers: { cookie: frankCookie }, query: { action: 'study-generate' }, method: 'POST', body: { companionType: 'duri' } },
      res,
    )
    t.assert(res.statusCode === 400, '직업이 없는 캐릭터는 스스로 공부하기를 거부한다 (400)')
  }

  // --- 정상 흐름: 스스로 공부하기 → 한 번의 Gemini 호출로 1개(toddler
  // 기본값 — 지시서(연령대별 AI 추천(예시) 개수 1개씩 점진적 증가
  // 로직으로 수정): "아이가 부담을 느끼지 않도록 최소화") 후보
  // 생성+자체검증 → 그 1개를 골라 저장 ---
  geminiBehavior = {
    kind: 'json',
    result: [
      { title: '발성 호흡법', content: '복식호흡으로 소리를 낸다.', status: 'appropriate', explanation: '정확해요', relevance: '가수와 관련 있어요', issues: '', suggestion: '' },
    ],
  }
  const studyRes = mockRes()
  await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), studyRes)
  t.assert(studyRes.statusCode === 200, '스스로 공부하기 요청이 성공한다 (200)')
  t.assert(Array.isArray(studyRes.body.drafts) && studyRes.body.drafts.length === 1, 'toddler 캐릭터는 한 번에 1개의 후보를 받는다(부담 최소화)')
  t.assert(studyRes.body.drafts[0].knowledge.title === '발성 호흡법', '첫 번째 후보의 제목이 응답에 포함된다')
  t.assert(studyRes.body.drafts[0].verification.status === 'appropriate', '스스로 생성한 지식을 스스로 적합으로 평가한다')
  t.assert(
    typeof studyRes.body.drafts[0].verificationToken === 'string' && studyRes.body.drafts[0].verificationToken.length > 0,
    '후보마다 서명된 verificationToken이 포함된다',
  )
  t.assert(studyRes.body.dailyStudyLimit === 3, '스스로 공부하기의 일일 클릭 한도는 3회로 응답에 포함된다')

  // 사용자가 3개 중 첫 번째를 고른다 — 이후 저장은 기존 단일 흐름과 동일.
  const chosenStudy = studyRes.body.drafts[0]
  const studySave = mockRes()
  await characterHandler(
    erinReq({
      method: 'POST',
      query: { action: 'save-knowledge' },
      body: {
        companionType: 'duri',
        title: chosenStudy.knowledge.title,
        originalContent: chosenStudy.knowledge.content,
        finalContent: chosenStudy.knowledge.content,
        verificationToken: chosenStudy.verificationToken,
        requestId: 'req-study-1',
      },
    }),
    studySave,
  )
  t.assert(studySave.statusCode === 201, '스스로 공부한 지식도 기존 save-knowledge 액션으로 저장된다 (201)')
  t.assert(studySave.body.entry?.source === 'ai_generated', "스스로 공부한 지식은 source가 'ai_generated'로 기록된다(서버가 토큰에서 판단, 클라이언트가 지정하지 않음)")

  // --- 클라이언트가 body에 source를 직접 보내도 무시된다(토큰에서만 판단) ---
  {
    geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: '정확해요', relevance: '관련 있어요', issues: '', suggestion: '' } }
    const userVerify = mockRes()
    await characterHandler(
      erinReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'duri', title: '복식호흡 기초', content: '숨을 배로 쉰다' } }),
      userVerify,
    )
    const res = mockRes()
    await characterHandler(
      erinReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'duri',
          title: '복식호흡 기초',
          originalContent: '숨을 배로 쉰다',
          finalContent: '숨을 배로 쉰다',
          verificationToken: userVerify.body.verificationToken,
          source: 'ai_generated', // 위조 시도 — 서버는 이 필드를 아예 읽지 않는다
          requestId: 'req-source-spoof',
        },
      }),
      res,
    )
    t.assert(res.body.entry?.source === 'user_taught', "요청 본문에 source를 위조해 보내도 무시되고, 토큰이 실제로 가리키는 'user_taught'로 저장된다")
  }

  // --- 중복 제출 방지: 같은 requestId로 다시 저장해도 새 기록이 생기지 않는다 ---
  {
    const res = mockRes()
    await characterHandler(
      erinReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'duri',
          title: chosenStudy.knowledge.title,
          originalContent: chosenStudy.knowledge.content,
          finalContent: chosenStudy.knowledge.content,
          verificationToken: chosenStudy.verificationToken,
          requestId: 'req-study-1',
        },
      }),
      res,
    )
    t.assert(res.statusCode === 200, '같은 requestId로 다시 저장을 시도하면 200(기존 기록 반환)으로 응답한다')
    t.assert(res.body.entry?.id === studySave.body.entry?.id, '스스로 공부하기도 중복 제출 방지가 동일하게 적용된다')
  }

  // --- Gemini가 해석 불가능한 응답을 주면(배열 안 항목에 제목/내용
  // 누락) 실패로 처리되고 한도가 환불된다 — toddler는 1개를 요청하므로
  // 그 1개짜리 항목 자체가 깨져 있는 경우를 확인한다. ---
  {
    geminiBehavior = {
      kind: 'json',
      result: [{ status: 'appropriate', explanation: '설명만 있고 title/content가 없음' }],
    }
    const res = mockRes()
    await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), res)
    t.assert(res.statusCode >= 500, '유일한 항목이라도 title/content가 없으면 배치 전체가 해석 실패로 처리된다')
  }

  // --- 일일 한도 3회(클릭 횟수), 지식 검증(10회) 한도와 완전히 분리 ---
  {
    geminiBehavior = {
      kind: 'json',
      result: [{ title: '제목A', content: '내용', status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' }],
    }
    // 위에서 이미 1회(req-study-1) + 1회(실패, 환불됨) 소비했으므로, 성공
    // 기준으로는 지금까지 1회만 소비된 상태 — 2회 더 성공해야 한도(3)에 도달한다.
    let lastStudy
    for (let i = 0; i < 2; i++) {
      lastStudy = mockRes()
      await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), lastStudy)
    }
    t.assert(lastStudy.statusCode === 200, '하루 3번째 스스로 공부하기 요청까지는 성공한다(실패한 시도는 환불되어 소비되지 않음)')
    const overStudy = mockRes()
    await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), overStudy)
    t.assert(overStudy.statusCode === 429, '하루 4번째 스스로 공부하기 요청은 429로 차단된다(하루 3회 제한)')
    t.assert(overStudy.body.remaining === 0, '한도 초과 응답의 remaining은 0이다')

    // 스스로 공부하기 한도를 다 썼어도, 지식 검증(가르치기) 한도는 전혀
    // 영향받지 않는다 — 완전히 분리된 테이블/카운터.
    const teachStillWorks = mockRes()
    await characterHandler(
      erinReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'duri', title: '다른 지식', content: '다른 내용' } }),
      teachStillWorks,
    )
    t.assert(teachStillWorks.statusCode === 200, '스스로 공부하기 한도 소진과 무관하게 지식 검증(가르치기)은 계속 가능하다')
  }

  // --- 다른 사용자 차단 ---
  {
    mock.seedUser(7, { email: 'grace@test.com' })
    const graceCookie = cookieHeaderFor(auth, 7, 0, 'grace@test.com')
    const res = mockRes()
    await characterHandler(
      { headers: { cookie: graceCookie }, query: { action: 'study-generate' }, method: 'POST', body: { companionType: 'duri' } },
      res,
    )
    t.assert(res.statusCode === 404, 'grace가 erin의 두리를 대신 공부시키려 해도 404로 차단된다')
  }

  // --- 누리·두리 학습 기록에 source가 함께 내려온다 ---
  {
    const res = mockRes()
    await characterHandler(erinReq({ method: 'GET', query: { action: 'knowledge', companionType: 'duri' } }), res)
    const sources = (res.body.entries ?? []).map((e) => e.source).sort()
    t.assert(
      sources.includes('user_taught') && sources.includes('ai_generated'),
      '학습 기록 목록에 user_taught/ai_generated 출처가 각각 구분되어 내려온다',
    )
  }

  // --- PR #49: GET action=usage — 메인 화면 "행동력" HUD용 조회(소비 없음) ---
  {
    const res = mockRes()
    await characterHandler({ method: 'GET', headers: {}, query: { action: 'usage' } }, res)
    t.assert(res.statusCode === 401, 'usage 조회도 로그인 없이는 401로 거부된다')
  }
  {
    // erin은 이 테스트 안에서 study-generate를 성공적으로 3번(하루 한도
    // 끝까지) 썼고, verify-knowledge는 성공적으로 2번 썼다(위 블록들) —
    // 실패해서 환불된 시도나 429로 막힌 시도는 소비로 치지 않는다.
    const first = mockRes()
    await characterHandler(erinReq({ method: 'GET', query: { action: 'usage' } }), first)
    t.assert(first.statusCode === 200, '로그인한 사용자는 usage 조회에 성공한다 (200)')
    t.assert(first.body.studyRemaining === 0, 'erin은 study-generate를 하루 한도(3)까지 다 써서 studyRemaining이 0이다')
    t.assert(first.body.studyLimit === 3, 'studyLimit은 하루 한도(3)를 그대로 보여준다')
    t.assert(first.body.teachRemaining === 8, 'erin은 verify-knowledge를 성공적으로 2번 써서 teachRemaining이 10-2=8이다')
    t.assert(first.body.teachLimit === 10, 'teachLimit은 하루 한도(10)를 그대로 보여준다')

    const second = mockRes()
    await characterHandler(erinReq({ method: 'GET', query: { action: 'usage' } }), second)
    t.assert(second.body.studyRemaining === 0 && second.body.teachRemaining === 8, 'usage 조회는 여러 번 호출해도 값을 소비하지 않는다(똑같은 값)')
    t.assert(second.body.aiRecommendTickets === 0, 'usage 응답에 구매한 AI 추천 이용권 수량(0)도 함께 내려온다')
    t.assert(second.body.knowledgeValidationTickets === 0, 'usage 응답에 구매한 지식 검증 이용권 수량(0)도 함께 내려온다')
  }

  // --- 지시서(만능마켓 구매 즉시 이용권 실시간 연동): 하루 무료 한도가
  // 바닥난 뒤에도, 구매한 이용권으로 한 번 더 쓸 수 있는지 — erin의
  // study-generate(studyRemaining=0)로 "AI 추천" 이용권을 확인한다. ---
  {
    // 무료 한도도 없고 구매한 이용권도 없으면 여전히 차단된다.
    const stillBlocked = mockRes()
    await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), stillBlocked)
    t.assert(stillBlocked.statusCode === 429, '무료 한도와 이용권이 둘 다 없으면 여전히 429로 차단된다')
    t.assert(
      stillBlocked.body.error === '오늘의 무료 횟수를 모두 사용했고, 구매한 이용권도 없습니다. 만능마켓에서 구매 후 이용해 주세요.',
      '이용권까지 없을 때의 안내 문구가 내려온다',
    )
    t.assert(stillBlocked.body.aiRecommendTickets === 0, '이용권 없이 차단된 응답의 aiRecommendTickets도 0이다')

    // 만능마켓에서 "AI 추천 충전권"을 구매 — 서버가 클라이언트 입력과
    // 무관하게 항상 1장만 지급한다.
    const purchase = mockRes()
    await characterHandler(erinReq({ method: 'POST', query: { action: 'purchase-ai-recommend-ticket' }, body: {} }), purchase)
    t.assert(purchase.statusCode === 200, 'AI 추천 충전권 구매가 성공한다 (200)')
    t.assert(purchase.body.aiRecommendTickets === 1, '구매 직후 응답에 최신 AI 추천 이용권 수량(1)이 즉시 포함된다')
    t.assert(purchase.body.knowledgeValidationTickets === 0, '구매 응답에는 지식 검증 이용권 수량도 같이 내려오지만, 이번엔 안 건드렸으니 0이다')

    // 이제 무료 한도는 여전히 0이지만, 구매한 이용권 1장으로 한 번 더
    // 생성에 성공해야 한다 — 그리고 그 1장이 소비돼 0으로 돌아와야 한다.
    geminiBehavior = {
      kind: 'json',
      result: [{ title: '무대 매너', content: '관객과 눈을 맞추며 노래한다.', status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' }],
    }
    const usedTicket = mockRes()
    await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), usedTicket)
    t.assert(usedTicket.statusCode === 200, '무료 한도가 0이어도 구매한 이용권이 있으면 성공한다 (200)')
    t.assert(usedTicket.body.remaining === 0, '이용권으로 처리된 요청의 remaining은 0이다(무료 한도와는 별개)')
    t.assert(usedTicket.body.aiRecommendTickets === 0, '이용권 1장을 써서 응답의 aiRecommendTickets가 0으로 줄어든다')

    // 이용권도 다 썼으니 다시 차단된다.
    const blockedAgain = mockRes()
    await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), blockedAgain)
    t.assert(blockedAgain.statusCode === 429, '이용권까지 다 쓰면 다시 429로 차단된다')

    // --- 환불: Gemini 호출 자체가 실패하면 이번에 쓴 이용권을 돌려준다 ---
    await characterHandler(erinReq({ method: 'POST', query: { action: 'purchase-ai-recommend-ticket' }, body: {} }), mockRes())
    geminiBehavior = { kind: 'network-error' }
    const failedWithTicket = mockRes()
    await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), failedWithTicket)
    t.assert(failedWithTicket.statusCode >= 500, 'Gemini 호출이 실패하면 이용권을 쓴 시도도 오류로 끝난다')
    const afterRefund = mockRes()
    await characterHandler(erinReq({ method: 'GET', query: { action: 'usage' } }), afterRefund)
    t.assert(afterRefund.body.aiRecommendTickets === 1, 'Gemini 호출 실패 시 소비했던 이용권이 환불되어 다시 1장이다')

    // 다른 사용자(grace)는 erin이 산 이용권과 전혀 무관하다(계정 단위 격리).
    const graceCookie2 = cookieHeaderFor(auth, 7, 0, 'grace@test.com')
    const graceUsage = mockRes()
    await characterHandler({ headers: { cookie: graceCookie2 }, query: { action: 'usage' }, method: 'GET' }, graceUsage)
    t.assert(graceUsage.body.aiRecommendTickets === 0, 'erin이 구매한 AI 추천 이용권은 다른 계정(grace)에 전혀 영향을 주지 않는다')
  }

  // --- PR #52: 연령 제한 지식 흡수 — 아직 어린 캐릭터는 고난도 지식을 거절한다 ---
  {
    mock.seedUser(8, { email: 'henry@test.com' })
    const henryCookie = cookieHeaderFor(auth, 8, 0, 'henry@test.com')
    const henryReq = (overrides = {}) => ({ headers: { cookie: henryCookie }, query: {}, ...overrides })
    await characterHandler(henryReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(henryReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())

    const title = '공인회계사 자격증 취득 절차'
    const content = '시험 과목, 응시 자격, 합격 후 실무 수습 과정을 포함한 전체 절차.'

    // henry의 누리는 방금 만든 Lv.1(toddler) 캐릭터다 — Gemini가 이
    // 지식에 "junior_20s(20대) 이상 필요"로 판정해도, 내용 자체는
    // 적합(appropriate)하다고 가정한다(검증 로직과 연령 게이트는 별개).
    geminiBehavior = {
      kind: 'json',
      result: { status: 'appropriate', explanation: '정확해요', relevance: '회계사와 관련 있어요', issues: '', suggestion: '', requiredAgeTier: 'junior_20s' },
    }
    const blockedVerify = mockRes()
    await characterHandler(henryReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title, content } }), blockedVerify)
    t.assert(blockedVerify.statusCode === 200, '연령 제한에 걸려도 검증 요청 자체는 성공한다(200) — 내용 적합 여부와는 별개')
    t.assert(blockedVerify.body.ageBlocked === true, '아직 toddler인 캐릭터에게 junior_20s 지식을 가르치면 ageBlocked: true가 내려온다')
    t.assert(blockedVerify.body.verification.status === 'appropriate', 'Gemini의 내용 적합 판정 자체는 그대로 유지된다')
    t.assert(blockedVerify.body.characterReply.includes('너무 어려워서'), '거절 메시지가 요청하신 아동 말투 문구를 포함한다')
    t.assert(blockedVerify.body.characterAgeTier === 'toddler', '응답에 캐릭터의 현재 연령대가 함께 내려온다')
    t.assert(blockedVerify.body.requiredAgeTier === 'junior_20s', '응답에 이 지식이 필요로 하는 연령대가 함께 내려온다')

    // 서명된 토큰 자체는 유효하지만(내용 일치), 연령 제한에 걸린 토큰으로
    // 저장을 직접 시도하면 서버가 다시 한번 거부한다 — UI 우회 방지.
    const blockedSave = mockRes()
    await characterHandler(
      henryReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: { companionType: 'nuri', title, originalContent: content, finalContent: content, verificationToken: blockedVerify.body.verificationToken },
      }),
      blockedSave,
    )
    t.assert(blockedSave.statusCode === 400, '연령 제한에 걸린 토큰으로 저장을 시도하면 400으로 거부된다(우회 방지)')

    // 레벨이 15(junior_20s 구간: Lv.10~19)가 되면 같은 지식도 정상적으로
    // 배울 수 있다 — DB에 새 컬럼을 만들지 않고 character.level만으로
    // 판정하므로, 레벨만 바꿔도 연령대가 그대로 따라온다.
    const henryNuri = mock.state.characters.find((c) => c.user_id === 8 && c.companion_type === 'nuri')
    henryNuri.level = 15

    const okVerify = mockRes()
    await characterHandler(henryReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title, content } }), okVerify)
    t.assert(okVerify.body.ageBlocked === false, 'Lv.15(junior_20s)가 되면 같은 지식도 더 이상 막히지 않는다')
    t.assert(okVerify.body.characterAgeTier === 'junior_20s', '레벨 15의 캐릭터는 연령대가 junior_20s로 계산된다')

    const okSave = mockRes()
    await characterHandler(
      henryReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: { companionType: 'nuri', title, originalContent: content, finalContent: content, verificationToken: okVerify.body.verificationToken },
      }),
      okSave,
    )
    t.assert(okSave.statusCode === 201, '연령대가 충족되면 저장이 정상적으로 성공한다')
    t.assert(okSave.body.expAwarded > 0, '정상 저장이면 기존처럼 XP가 지급된다')
  }

  // --- PR #52: 기초 지식(requiredAgeTier 없음 → 가장 관대한 toddler로 처리)은 나이와 무관하게 통과한다 ---
  {
    mock.seedUser(9, { email: 'iris@test.com' })
    const irisCookie = cookieHeaderFor(auth, 9, 0, 'iris@test.com')
    const irisReq = (overrides = {}) => ({ headers: { cookie: irisCookie }, query: {}, ...overrides })
    await characterHandler(irisReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(irisReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())

    // requiredAgeTier를 아예 넣지 않은, 이 필드를 모르는 구형 모의 응답 —
    // gemini.ts가 이 필드 하나 때문에 기존 검증 전체를 깨뜨리지 않는지
    // 확인한다(토큰 발급에도 필수 필드라, 응답 파싱 단계의 관대한 기본값
    // 처리가 끝까지 이어져야 한다).
    geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: '정확해요', relevance: '관련 있어요', issues: '', suggestion: '' } }
    const res = mockRes()
    await characterHandler(irisReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '기초 개념', content: '쉬운 내용' } }), res)
    t.assert(res.body.ageBlocked === false, 'requiredAgeTier가 없는 구형 응답은 가장 관대한 기본값으로 처리되어 막히지 않는다')
    t.assert(res.body.requiredAgeTier === 'toddler', '응답에 내려오는 requiredAgeTier도 기본값(toddler)으로 채워진다')
  }

  // --- PR #52 후속: 스스로 공부하기가 캐릭터의 연령대를 Gemini 프롬프트에
  // 실제로 반영하는지(생성 단계부터 눈높이에 맞추려는 시도) 확인한다 —
  // 사후 판정만으로는 "다 만들고 나서 막혀 하루 한도만 날리는" 진도
  // 막힘을 못 고치므로, 프롬프트 자체가 연령대별로 달라져야 한다.
  {
    mock.seedUser(10, { email: 'jin@test.com' })
    const jinCookie = cookieHeaderFor(auth, 10, 0, 'jin@test.com')
    const jinReq = (overrides = {}) => ({ headers: { cookie: jinCookie }, query: {}, ...overrides })
    await characterHandler(jinReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(jinReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())

    geminiBehavior = {
      kind: 'json',
      result: Array.from({ length: 1 }, (_, i) => ({
        title: `숫자 세기 ${i}`,
        content: '하나, 둘, 셋',
        status: 'appropriate',
        explanation: 'ok',
        relevance: 'ok',
        issues: '',
        suggestion: '',
        requiredAgeTier: 'toddler',
      })),
    }
    const toddlerStudy = mockRes()
    await characterHandler(jinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'nuri' } }), toddlerStudy)
    t.assert(toddlerStudy.statusCode === 200, 'Lv.1(toddler) 캐릭터의 스스로 공부하기 요청이 성공한다')
    t.assert(
      typeof lastSystemInstruction === 'string' && lastSystemInstruction.includes('8~9살'),
      'toddler 단계에서는 프롬프트에 8~9살 눈높이 안내가 포함된다',
    )
    t.assert(
      lastSystemInstruction.includes('전문 용어나 자격증'),
      'toddler 단계 프롬프트는 전문 자격증 수준 내용을 만들지 말라고 명시한다',
    )

    const jinNuri = mock.state.characters.find((c) => c.user_id === 10 && c.companion_type === 'nuri')
    jinNuri.level = 15 // junior_20s

    geminiBehavior = {
      kind: 'json',
      result: Array.from({ length: 4 }, (_, i) => ({
        title: `복식부기 실무 ${i}`,
        content: '...',
        status: 'appropriate',
        explanation: 'ok',
        relevance: 'ok',
        issues: '',
        suggestion: '',
        requiredAgeTier: 'junior_20s',
      })),
    }
    const youngAdultStudy = mockRes()
    await characterHandler(jinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'nuri' } }), youngAdultStudy)
    t.assert(youngAdultStudy.statusCode === 200, 'Lv.15(junior_20s) 캐릭터의 스스로 공부하기 요청이 성공한다')
    t.assert(
      typeof lastSystemInstruction === 'string' && lastSystemInstruction.includes('20대'),
      'junior_20s 단계에서는 프롬프트에 20대 눈높이 안내가 포함된다(toddler 때와 다른 프롬프트)',
    )
  }

  // --- PR #63: 연령대 "진화"는 더 이상 지식 저장 개수(flat count)가
  // 아니라, 한 연령대에서 유형별(객관식=objective/주관식=subjective/
  // 노하우=knowhow) 2개씩 총 6개를 확정 저장해야 하고, teen 이후 단계는
  // *동시에* 레벨도 다음 단계 기준을 넘어야 한다(레벨 조건 유지 + 미션
  // 게이트 추가) — 둘 중 하나만 만족해서는 절대 진화하지 않는 "진짜
  // 게이트"인지 확인한다. (toddler→teen 첫 진화의 레벨-조건-면제 예외는
  // 지시서 #03 전용 테스트로 별도 확인한다 — 아래 참고.)
  {
    mock.seedUser(11, { email: 'kate@test.com' })
    const kateCookie = cookieHeaderFor(auth, 11, 0, 'kate@test.com')
    const kateReq = (overrides = {}) => ({ headers: { cookie: kateCookie }, query: {}, ...overrides })
    await characterHandler(kateReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(kateReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    const kateNuri = mock.state.characters.find((c) => c.user_id === 11 && c.companion_type === 'nuri')

    const teachOnce = async (n, missionType) => {
      geminiBehavior = {
        kind: 'json',
        result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '', requiredAgeTier: 'toddler' },
      }
      const verifyRes = mockRes()
      await characterHandler(
        kateReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: `쉬운 지식 ${n}`, content: `초등 저학년도 알 수 있는 내용 ${n}` } }),
        verifyRes,
      )
      const saveRes = mockRes()
      await characterHandler(
        kateReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: {
            companionType: 'nuri',
            title: `쉬운 지식 ${n}`,
            originalContent: `초등 저학년도 알 수 있는 내용 ${n}`,
            finalContent: `초등 저학년도 알 수 있는 내용 ${n}`,
            verificationToken: verifyRes.body.verificationToken,
            requestId: `req-evolve-${n}`,
            missionType,
          },
        }),
        saveRes,
      )
      return saveRes
    }

    // 지시서(8세 학습 총 8문제 제한 및 10대 강제 레벨업 로직 수정):
    // card_game 미션(카드 맞추기)은 complete-card-game → save-knowledge
    // 두 단계로 채워진다 — toddler(③단계)와 teen(②단계) 둘 다 같은
    // 모양이라 여기서 한 번만 정의해 두 군데서 재사용한다.
    const teachCardGame = async (n) => {
      const completeRes = mockRes()
      await characterHandler(
        kateReq({ method: 'POST', query: { action: 'complete-card-game' }, body: { companionType: 'nuri' } }),
        completeRes,
      )
      const saveRes = mockRes()
      await characterHandler(
        kateReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: {
            companionType: 'nuri',
            title: completeRes.body.knowledge.title,
            originalContent: completeRes.body.knowledge.content,
            finalContent: completeRes.body.knowledge.content,
            verificationToken: completeRes.body.verificationToken,
            requestId: `req-evolve-card-${n}`,
            missionType: 'card_game',
          },
        }),
        saveRes,
      )
      return saveRes
    }

    // 1) 첫 저장(아직 Lv.1)에서 mission_unlocked_tier가 처음으로
    // 'toddler'에 고정된다(이 게이트를 처음 평가받는 모든 캐릭터가
    // 거치는 지점 — 레벨이 이미 높은 기존 캐릭터라면 여기서 그 레벨
    // 기준 단계로 "소급 강등 없이" 고정되고, 이 캐릭터처럼 Lv.1이면
    // 당연히 toddler로 고정된다).
    const firstSave = await teachOnce(1, 'objective')
    t.assert(firstSave.statusCode === 201, '첫 지식 저장이 성공한다')
    t.assert(firstSave.body.evolved === false, 'toddler는 레벨 조건이 없지만 미션이 1/6뿐이라 아직 진화하지 않는다')
    t.assert(kateNuri.mission_unlocked_tier === 'toddler', '첫 평가에서 toddler로 고정된다')

    // 레벨이 이미 teen 기준(Lv.5)을 넘어도(퀴즈·시험 등으로 다른 곳에서
    // 올랐다고 가정), 미션을 안 끝냈으면 절대 진화하지 않는다 — "지금
    // 단계에 고정"된 채 레벨이 더 올라도 조용히 새어나가지 않아야 한다
    // (예전 EVOLUTION_KNOWLEDGE_COUNT와 다른 점).
    kateNuri.level = 5
    kateNuri.exp = 1000
    const noMissionSave = await teachOnce(2, 'objective')
    t.assert(noMissionSave.statusCode === 201, '레벨만 충분한 상태에서도 저장 자체는 성공한다')
    t.assert(noMissionSave.body.evolved === false, '미션이 2/6뿐이면 레벨이 충분해도 진화하지 않는다')
    t.assert(noMissionSave.body.missionProgress.confirmedTotal === 2, '지금까지 저장한 2건이 objective 2개로 집계된다')
    t.assert(kateNuri.mission_unlocked_tier === 'toddler', '레벨은 넘었지만 미션이 안 끝나서 toddler에 그대로 고정된다(진짜 게이트)')

    const getRes = mockRes()
    await characterHandler(kateReq({ method: 'GET', query: {} }), getRes)
    const kateNuriJson = getRes.body.characters.find((c) => c.companion_type === 'nuri')
    t.assert(kateNuriJson.level === 5 && kateNuriJson.age_tier === 'toddler', '캐릭터 목록 응답도 레벨(5)과 무관하게 age_tier는 toddler로 고정되어 내려온다')

    // 2) 유형 구성이 4(knowhow)+3(objective)+1(card_game)이 아니면
    // (객관식만 계속 쌓여도) 진화하지 않는다 — 지시서(8세 학습 총
    // 8문제 제한 및 10대 강제 레벨업 로직 수정)로 toddler가 3:2:1(총
    // 6개)에서 이 비율(총 8개)로 바뀌었다 — "총 개수"가 아니라
    // "유형별로 정해진 개수"가 조건인 것은 그대로다.
    for (let n = 3; n <= 6; n++) {
      const res = await teachOnce(n, 'objective')
      t.assert(res.body.evolved === false, `${n}번째(여전히 objective만)까지는 진화하지 않는다`)
    }
    const missionsRes = mockRes()
    await characterHandler(kateReq({ method: 'GET', query: { action: 'missions', companionType: 'nuri' } }), missionsRes)
    t.assert(
      missionsRes.body.missionProgress.byType.objective.confirmed === 3 && missionsRes.body.missionProgress.byType.objective.complete === true,
      'objective는 3개에서 더 이상 늘지 않고(유형별 상한 3) 완료 표시된다',
    )
    t.assert(missionsRes.body.missionProgress.byType.card_game.required === 1 && missionsRes.body.missionProgress.byType.knowhow.required === 4, 'toddler의 유형별 필요 개수는 card_game 1개/knowhow 4개(직접입력3+노하우1)다')
    t.assert(missionsRes.body.missionProgress.byType.card_game.confirmed === 0 && missionsRes.body.missionProgress.byType.knowhow.confirmed === 0, 'card_game/knowhow는 아직 0개다')
    t.assert(missionsRes.body.missionProgress.allConfirmed === false, '유형이 한쪽으로 쏠려 있으면 총 개수가 충분해도 allConfirmed는 false다')

    // 3) card_game 1개 + knowhow 4개까지 채우면(= 3+1+4=8) 8문제가 모두
    // 끝나지만, 종합 최종 시험에 합격하기 전까지는(final_exam_passed)
    // 레벨이 충분해도 진화하지 않는다(사용자 확인: "8문제 모두 풀고
    // 최종시험 8개 모두 합격해야 10살로 넘어감").
    const cardGame1 = await teachCardGame(7)
    t.assert(cardGame1.body.evolved === false, 'card_game까지 채웠어도 knowhow가 아직 0개라 진화하지 않는다')
    await teachOnce(8, 'knowhow')
    await teachOnce(9, 'knowhow')
    await teachOnce(10, 'knowhow')
    const allEightFilled = await teachOnce(11, 'knowhow')
    t.assert(allEightFilled.statusCode === 201, '8번째(마지막) 지식 저장이 성공한다')
    t.assert(allEightFilled.body.missionProgress.allConfirmed === true, '8문제(직접입력3+노하우1=knowhow4, 객관식3, 카드맞추기1)를 모두 채웠다')
    t.assert(allEightFilled.body.evolved === false, '8문제를 다 채워도 아직 종합 최종 시험에 합격하지 않아 진화하지 않는다')
    t.assert(kateNuri.mission_unlocked_tier === 'toddler', '미션은 끝났지만 최종 시험 전까지는 toddler에 그대로 고정된다(진짜 게이트)')

    // 3-1) 8문제를 1:1로 복습하는 종합 최종 시험에 모두 합격하면
    // 그제서야 teen으로 진화한다(레벨은 이미 충분했다 — toddler→teen은
    // 레벨과 무관).
    const buildFinalExamMock = (count, choiceCount) =>
      Array.from({ length: count }, (_, i) => ({
        text: `복습 문제 ${i + 1}`,
        choices: Array.from({ length: choiceCount }, (_, c) => `답 ${i}-${c}`),
        correctIndex: 0,
        explanation: `복습 문제 ${i + 1}의 해설`,
      }))
    geminiBehavior = { kind: 'json', result: buildFinalExamMock(8, 3) }
    const examRes = mockRes()
    await characterHandler(kateReq({ method: 'GET', query: { action: 'final-exam', companionType: 'nuri' } }), examRes)
    t.assert(examRes.statusCode === 200, '8문제를 모두 채우면 종합 최종 시험을 받을 수 있다')
    t.assert(examRes.body.questions.length === 8, '시험 문제는 저장한 지식을 1:1로 복습하므로 정확히 8문제다')
    const examSubmit = mockRes()
    await characterHandler(
      kateReq({
        method: 'POST',
        query: { action: 'final-exam-submit' },
        body: { companionType: 'nuri', examToken: examRes.body.examToken, answers: examRes.body.questions.map(() => 0) },
      }),
      examSubmit,
    )
    t.assert(examSubmit.body.passed === true, '8문제 모두 정답(0번 보기)을 고르면 합격한다')
    const evolved = examSubmit
    t.assert(evolved.body.evolved === true, '종합 최종 시험에 합격하면 그 즉시 진화한다(toddler→teen은 레벨과 무관)')
    t.assert(evolved.body.newAgeTier === 'teen', '다음 연령대는 teen이다')
    t.assert(evolved.body.message?.includes('청소년 단계로 성장했어요'), '진화 시 응답 문구에 진화 전용 안내가 포함된다')
    t.assert(kateNuri.mission_unlocked_tier === 'teen', 'DB에도 teen으로 기록되어 다음 요청에서도 유지된다')

    // 4) teen으로 넘어간 뒤에는 toddler 때 쌓은 8개가 재사용되지 않고,
    // teen 자신의 미션 집계가 0부터 다시 시작한다.
    const teenMissions = mockRes()
    await characterHandler(kateReq({ method: 'GET', query: { action: 'missions', companionType: 'nuri' } }), teenMissions)
    t.assert(
      teenMissions.body.missionProgress.ageTier === 'teen' &&
        teenMissions.body.missionProgress.confirmedTotal === 0 &&
        teenMissions.body.missionProgress.requiredTotal === 10,
      '지시서(10대 커리큘럼: 직업 카드 맞추기 통합): teen 단계는 toddler 때 저장을 재사용하지 않고 0/10(유형별 객관식3+카드맞추기1+직접입력6)부터 새로 시작한다',
    )

    // 5) 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): teen은 고정
    // 커리큘럼(①③⑤직접입력=knowhow6, ②카드맞추기=card_game1,
    // ④객관식=objective3, subjective는 0)으로 10개를 요구한다. 지금까지
    // 이미 지식 검증을 10회 썼으므로(하루 10회 제한), 이 구간에서 더
    // 쓰기 전에 날짜를 넘겨 리셋한다 — 하루 제한 자체를 테스트하는 게
    // 아니라 진화 로직을 테스트하는 구간이므로 teachOnce(5)/(7~8)의
    // 1회성 제한 소비 테스트(요청 2번)와는 무관하다.
    mock.setFakeDate('2026-03-02')
    // teachCardGame은 위(①단계 바로 뒤)에서 이미 정의했다 — toddler
    // card_game과 모양이 완전히 같아 재사용한다. 지시서(8세 학습 총
    // 8문제 제한 및 10대 강제 레벨업 로직 수정)로 toddler 구간이 n=11
    // (knowhow 4번째)까지 requestId를 썼으므로, 여기서는 n=12부터 다시
    // 시작해 requestId가 겹쳐 idempotency로 조용히 무시되는 것을
    // 막는다.
    await teachOnce(12, 'objective')
    await teachOnce(13, 'objective')
    await teachOnce(14, 'objective')
    await teachCardGame(15)
    await teachOnce(16, 'knowhow')
    await teachOnce(17, 'knowhow')
    await teachOnce(18, 'knowhow')
    await teachOnce(19, 'knowhow')
    await teachOnce(20, 'knowhow')
    const tenthTeenMission = await teachOnce(21, 'knowhow')
    t.assert(tenthTeenMission.body.missionProgress.allConfirmed === true, 'teen 단계 10미션(객관식3+카드맞추기1+직접입력6)도 모두 채웠다')
    t.assert(tenthTeenMission.body.evolved === false, '레벨(5)이 junior_20s 기준(10)에 못 미쳐 아직 진화하지 않는다')
    t.assert(kateNuri.mission_unlocked_tier === 'teen', '미션은 끝났지만 레벨이 부족해 teen에 고정된 채다')

    // 6) 미션은 이미 다 끝났는데 레벨만 모자란 경우 — 순수 XP 액션만으로도
    // "그 즉시" 진화가 완성돼야 한다(save-knowledge 한 번이 아니어도 같은
    // 판정을 공유한다는 뜻). teen의 10회로 당일 하루 제한을 이미 다
    // 썼으므로, 다시 날짜를 넘긴다.
    mock.setFakeDate('2026-03-03')
    kateNuri.level = 10
    kateNuri.exp = 4500
    geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '', requiredAgeTier: 'toddler' } }
    const bonusVerify = mockRes()
    await characterHandler(
      kateReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '아무 지식', content: '아무 내용' } }),
      bonusVerify,
    )
    const levelOnlySave = mockRes()
    await characterHandler(
      kateReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'nuri',
          title: '아무 지식',
          originalContent: '아무 내용',
          finalContent: '아무 내용',
          verificationToken: bonusVerify.body.verificationToken,
          requestId: 'req-evolve-level-catchup',
        },
      }),
      levelOnlySave,
    )
    t.assert(levelOnlySave.body.evolved === true, '미션은 이미 끝나 있었으므로 레벨만 채워지면(퀴즈든 지식 저장이든) 그 즉시 진화한다')
    t.assert(levelOnlySave.body.newAgeTier === 'junior_20s', '다음 연령대는 junior_20s다')
    t.assert(levelOnlySave.body.savedReply?.includes('청년 단계로 성장했어요'), 'junior_20s 진화 문구에는 그 단계의 스테이지 라벨("청년")이 쓰인다')
  }

  // --- PR #65: 자유 직업 입력("숲해설가") + 지식 카드 10종 분류 +
  // 집중력 게이지 소폭 반영 ---
  {
    mock.seedUser(20, { email: 'erin@test.com' })
    const erinCookie = cookieHeaderFor(auth, 20, 0, 'erin@test.com')
    const erinReq = (overrides = {}) => ({ headers: { cookie: erinCookie }, query: {}, ...overrides })
    await characterHandler(erinReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())

    // customProfessionLabel 없이 'custom' 선택은 거부된다.
    {
      const res = mockRes()
      await characterHandler(erinReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'custom' } }), res)
      t.assert(res.statusCode === 400, "customProfessionLabel 없이 profession='custom'을 보내면 거부된다 (400)")
    }
    // 30자 초과 직업명도 거부된다.
    {
      const res = mockRes()
      await characterHandler(
        erinReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'custom', customProfessionLabel: '가'.repeat(31) } }),
        res,
      )
      t.assert(res.statusCode === 400, '30자를 초과하는 자유 직업명은 거부된다 (400)')
    }
    // 정상 입력("숲해설가")은 저장된다.
    {
      const res = mockRes()
      await characterHandler(
        erinReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'custom', customProfessionLabel: '숲해설가' } }),
        res,
      )
      t.assert(res.statusCode === 200, "자유 직업 '숲해설가'를 선택하면 성공한다 (200)")
      t.assert(res.body.character?.profession === 'custom', "응답의 profession은 sentinel 값 'custom'이다")
      t.assert(res.body.character?.custom_profession_label === '숲해설가', '응답에 실제 입력한 직업명이 그대로 담긴다')
      t.assert(res.body.character?.focus_percent === 90, '새 캐릭터의 집중력은 기본값 90으로 시작한다')
    }

    // 스스로 공부하기(study-generate)가 Gemini 프롬프트에 자유 직업명을
    // 그대로 사용한다(50개 고정 라벨이 아니라 실제 입력 텍스트).
    geminiBehavior = {
      kind: 'json',
      result: Array.from({ length: 1 }, (_, i) => ({
        title: `숲 생태 관찰 팁 ${i}`,
        content: '아침 시간대에 동물 발자국을 더 쉽게 볼 수 있다.',
        status: 'appropriate',
        explanation: 'ok',
        relevance: 'ok',
        issues: '',
        suggestion: '',
        requiredAgeTier: 'toddler',
      })),
    }
    const studyRes = mockRes()
    await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'nuri' } }), studyRes)
    t.assert(studyRes.statusCode === 200, "자유 직업('숲해설가')도 스스로 공부하기가 정상 동작한다 (200)")
    t.assert(
      typeof lastSystemInstruction === 'string' && lastSystemInstruction.includes('숲해설가'),
      'Gemini 프롬프트에 사용자가 입력한 실제 직업명("숲해설가")이 쓰인다(50개 고정 라벨이 아님)',
    )

    // 지식 카드 10종 분류(knowledgeCategory)를 저장할 수 있다.
    geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' } }
    const forestVerify = mockRes()
    await characterHandler(
      erinReq({
        method: 'POST',
        query: { action: 'verify-knowledge' },
        body: { companionType: 'nuri', title: '소나무와 잣나무 구별하기', content: '잣나무는 잎이 5개씩 뭉쳐나고 소나무는 2개씩 뭉쳐난다.' },
      }),
      forestVerify,
    )
    const focusBefore = 90
    const forestSave = mockRes()
    await characterHandler(
      erinReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'nuri',
          title: '소나무와 잣나무 구별하기',
          originalContent: '잣나무는 잎이 5개씩 뭉쳐나고 소나무는 2개씩 뭉쳐난다.',
          finalContent: '잣나무는 잎이 5개씩 뭉쳐나고 소나무는 2개씩 뭉쳐난다.',
          verificationToken: forestVerify.body.verificationToken,
          requestId: 'req-forest-1',
          knowledgeCategory: 'personal_knowhow',
        },
      }),
      forestSave,
    )
    t.assert(forestSave.statusCode === 201, '지식 카드 분류와 함께 저장하면 성공한다 (201)')
    t.assert(forestSave.body.entry?.knowledge_category === 'personal_knowhow', '저장된 기록에 선택한 지식 카드 분류가 그대로 담긴다')
    t.assert(forestSave.body.entry?.custom_profession_label === '숲해설가', '저장된 기록에도 저장 당시 직업명이 스냅샷된다')
    t.assert(
      typeof forestSave.body.focusPercent === 'number' && forestSave.body.focusPercent > focusBefore,
      '지식을 실제로 완성 저장하면 집중력이 소폭 올라간다',
    )

    // 지식 카드 분류를 안 보내도(선택값) 저장 자체는 그대로 성공한다.
    const noCategoryVerify = mockRes()
    await characterHandler(
      erinReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '등산로 안내', content: '등산로 초입에 안내판이 있다.' } }),
      noCategoryVerify,
    )
    const noCategorySave = mockRes()
    await characterHandler(
      erinReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'nuri',
          title: '등산로 안내',
          originalContent: '등산로 초입에 안내판이 있다.',
          finalContent: '등산로 초입에 안내판이 있다.',
          verificationToken: noCategoryVerify.body.verificationToken,
          requestId: 'req-forest-2',
        },
      }),
      noCategorySave,
    )
    t.assert(noCategorySave.statusCode === 201, '지식 카드 분류 없이 저장해도 그대로 성공한다 (201, 선택값)')
    t.assert(noCategorySave.body.entry?.knowledge_category === null, '분류를 안 보내면 null로 저장된다')

    // 검증이 막히면(수정 필요/검증 불가) 집중력이 소폭 내려간다.
    geminiBehavior = { kind: 'json', result: { status: 'needs_revision', explanation: '조금 더 구체적으로', relevance: '', issues: '모호함', suggestion: '예시 추가' } }
    const struggleRes = mockRes()
    await characterHandler(
      erinReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '모호한 지식', content: '그냥 그래요' } }),
      struggleRes,
    )
    t.assert(struggleRes.body.verification?.status === 'needs_revision', '수정 필요 판정이 내려온다')
    t.assert(
      typeof struggleRes.body.focusPercent === 'number' && struggleRes.body.focusPercent < noCategorySave.body.focusPercent,
      '검증에서 막히면(수정 필요) 집중력이 소폭 내려간다',
    )

    // 다른 고정 직업으로 바꾸면 custom_profession_label이 사라진다.
    {
      const res = mockRes()
      await characterHandler(erinReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'teacher' } }), res)
      t.assert(res.statusCode === 200, '고정 직업(교사)으로 다시 바꾸면 성공한다 (200)')
      t.assert(res.body.character?.profession === 'teacher', '직업이 교사로 바뀐다')
      t.assert(res.body.character?.custom_profession_label === null, '고정 직업으로 바꾸면 이전 자유 직업명은 사라진다(null)')
    }
  }

  // --- 지시서 #03(8~9살 시험 시스템 전면 개편), 지시서(8세 학습 총
  // 8문제 제한 및 10대 강제 레벨업 로직 수정)로 숫자 갱신: toddler
  // (8~9살)→teen(10대) 첫 진화는 "복잡한 레벨 조건 없이" 유형별로
  // 정해진 개수 총 8개(knowhow 4+objective 3+card_game 1) 확정과 종합
  // 최종 시험 합격만으로 진화해야 한다 — Lv.1(레벨 조건
  // AGE_TIER_MIN_LEVEL.teen=5에 한참 못 미침)인 채로도 진화하는지
  // 전용으로 확인한다.
  {
    mock.seedUser(12, { email: 'leo@test.com' })
    const leoCookie = cookieHeaderFor(auth, 12, 0, 'leo@test.com')
    const leoReq = (overrides = {}) => ({ headers: { cookie: leoCookie }, query: {}, ...overrides })
    await characterHandler(leoReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(leoReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    const leoNuri = mock.state.characters.find((c) => c.user_id === 12 && c.companion_type === 'nuri')

    const teachOnceLeo = async (n, missionType) => {
      geminiBehavior = {
        kind: 'json',
        result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '', requiredAgeTier: 'toddler' },
      }
      const verifyRes = mockRes()
      await characterHandler(
        leoReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: `레오 지식 ${n}`, content: `초등 저학년도 알 수 있는 내용 ${n}` } }),
        verifyRes,
      )
      const saveRes = mockRes()
      await characterHandler(
        leoReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: {
            companionType: 'nuri',
            title: `레오 지식 ${n}`,
            originalContent: `초등 저학년도 알 수 있는 내용 ${n}`,
            finalContent: `초등 저학년도 알 수 있는 내용 ${n}`,
            verificationToken: verifyRes.body.verificationToken,
            requestId: `req-leo-evolve-${n}`,
            missionType,
          },
        }),
        saveRes,
      )
      return saveRes
    }

    await teachOnceLeo(1, 'objective')
    await teachOnceLeo(2, 'objective')
    await teachOnceLeo(3, 'objective')
    const leoCardGameComplete = mockRes()
    await characterHandler(leoReq({ method: 'POST', query: { action: 'complete-card-game' }, body: { companionType: 'nuri' } }), leoCardGameComplete)
    await characterHandler(
      leoReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'nuri',
          title: leoCardGameComplete.body.knowledge.title,
          originalContent: leoCardGameComplete.body.knowledge.content,
          finalContent: leoCardGameComplete.body.knowledge.content,
          verificationToken: leoCardGameComplete.body.verificationToken,
          requestId: 'req-leo-card-1',
          missionType: 'card_game',
        },
      }),
      mockRes(),
    )
    await teachOnceLeo(4, 'knowhow')
    await teachOnceLeo(5, 'knowhow')
    await teachOnceLeo(6, 'knowhow')
    t.assert(leoNuri.level === 1, '여기까지 레오는 여전히 Lv.1이다(AGE_TIER_MIN_LEVEL.teen=5에 한참 못 미침)')
    const leoEightFilled = await teachOnceLeo(7, 'knowhow')
    t.assert(leoEightFilled.statusCode === 201, '8번째(마지막) 지식 저장이 성공한다')
    t.assert(leoEightFilled.body.missionProgress.allConfirmed === true, '8개(knowhow4+objective3+card_game1)를 모두 채웠다')
    t.assert(leoEightFilled.body.evolved === false, '8개를 채워도 아직 종합 최종 시험에 합격하지 않아 진화하지 않는다')
    t.assert(leoNuri.mission_unlocked_tier === 'toddler', '미션은 끝났지만 최종 시험 전까지는 toddler에 그대로 고정된다')

    // 종합 최종 시험에 합격해야(레벨과 무관) 비로소 진화한다 — Lv.1인
    // 채로도 통과한다(지시서 #03: 레벨 조건 없음).
    geminiBehavior = {
      kind: 'json',
      result: Array.from({ length: 8 }, (_, i) => ({
        text: `레오 복습 문제 ${i + 1}`,
        choices: ['답0', '답1', '답2'],
        correctIndex: 0,
        explanation: '해설',
      })),
    }
    const leoExam = mockRes()
    await characterHandler(leoReq({ method: 'GET', query: { action: 'final-exam', companionType: 'nuri' } }), leoExam)
    t.assert(leoExam.statusCode === 200, 'Lv.1이어도(레벨 조건 없음) 8개를 채우면 종합 최종 시험을 받을 수 있다')
    const leoExamSubmit = mockRes()
    await characterHandler(
      leoReq({
        method: 'POST',
        query: { action: 'final-exam-submit' },
        body: { companionType: 'nuri', examToken: leoExam.body.examToken, answers: leoExam.body.questions.map(() => 0) },
      }),
      leoExamSubmit,
    )
    t.assert(leoExamSubmit.body.passed === true, '8문제 모두 정답을 고르면 합격한다')
    t.assert(leoExamSubmit.body.evolved === true, 'Lv.1이어도 종합 최종 시험에 합격하면 즉시 진화한다(지시서 #03: 레벨 조건 없음)')
    t.assert(leoExamSubmit.body.newAgeTier === 'teen', '다음 연령대는 teen이다')
    t.assert(leoNuri.mission_unlocked_tier === 'teen', 'DB에도 teen으로 기록된다')
    t.assert(leoNuri.level === 1, '진화해도 레벨/경험치는 그대로다(진화도 종합 최종 시험도 레벨을 강제로 올리지 않는다)')
  }

  // --- 지시서(8세 학습 총 8문제 제한 및 10대 강제 레벨업 로직 수정):
  // 종합 최종 시험(final-exam/final-exam-submit)과 패스권/리셋
  // (purchase-final-exam-pass/reset-character-progress) 전용 테스트 —
  // kate/leo 테스트가 "합격 1회"만 거쳤다면, 여기서는 1차 불합격(틀린
  // 문제만 재시험)·2차 불합격(차단)·패스권 구매·초기화까지 경계
  // 조건을 집중적으로 확인한다. ---
  const buildFinalExamMock = (count, choiceCount) =>
    Array.from({ length: count }, (_, i) => ({
      text: `복습 문제 ${i + 1}`,
      choices: Array.from({ length: choiceCount }, (_, c) => `답 ${i}-${c}`),
      correctIndex: 0,
      explanation: `해설 ${i + 1}`,
    }))

  {
    mock.seedUser(21, { email: 'nora@test.com' })
    const noraCookie = cookieHeaderFor(auth, 21, 0, 'nora@test.com')
    const noraReq = (overrides = {}) => ({ headers: { cookie: noraCookie }, query: {}, ...overrides })
    await characterHandler(noraReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(noraReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    const noraNuri = mock.state.characters.find((c) => c.user_id === 21 && c.companion_type === 'nuri')

    const teachOnceNora = async (n, missionType) => {
      geminiBehavior = {
        kind: 'json',
        result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '', requiredAgeTier: 'toddler' },
      }
      const verifyRes = mockRes()
      await characterHandler(
        noraReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: `노라 지식 ${n}`, content: `초등 저학년도 알 수 있는 내용 ${n}` } }),
        verifyRes,
      )
      const saveRes = mockRes()
      await characterHandler(
        noraReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: {
            companionType: 'nuri',
            title: `노라 지식 ${n}`,
            originalContent: `초등 저학년도 알 수 있는 내용 ${n}`,
            finalContent: `초등 저학년도 알 수 있는 내용 ${n}`,
            verificationToken: verifyRes.body.verificationToken,
            requestId: `req-nora-${n}`,
            missionType,
          },
        }),
        saveRes,
      )
      return saveRes
    }
    const teachCardGameNora = async (n) => {
      const completeRes = mockRes()
      await characterHandler(noraReq({ method: 'POST', query: { action: 'complete-card-game' }, body: { companionType: 'nuri' } }), completeRes)
      const saveRes = mockRes()
      await characterHandler(
        noraReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: {
            companionType: 'nuri',
            title: completeRes.body.knowledge.title,
            originalContent: completeRes.body.knowledge.content,
            finalContent: completeRes.body.knowledge.content,
            verificationToken: completeRes.body.verificationToken,
            requestId: `req-nora-card-${n}`,
            missionType: 'card_game',
          },
        }),
        saveRes,
      )
      return saveRes
    }

    // 1) 8문제를 다 채우기 전에는 종합 최종 시험을 받을 수 없다.
    const tooEarlyExam = mockRes()
    await characterHandler(noraReq({ method: 'GET', query: { action: 'final-exam', companionType: 'nuri' } }), tooEarlyExam)
    t.assert(tooEarlyExam.statusCode === 400, '8문제를 다 채우기 전에는 종합 최종 시험을 받을 수 없다(400)')

    await teachOnceNora(1, 'objective')
    await teachOnceNora(2, 'objective')
    await teachOnceNora(3, 'objective')
    await teachCardGameNora(4)
    await teachOnceNora(5, 'knowhow')
    await teachOnceNora(6, 'knowhow')
    await teachOnceNora(7, 'knowhow')
    await teachOnceNora(8, 'knowhow')

    // 2) 8문제를 모두 채우면 정확히 8문제짜리 시험을 받고, 합격 기준은
    // 100점(전부 정답)이며 1차 시도로 기록된다.
    geminiBehavior = { kind: 'json', result: buildFinalExamMock(8, 3) }
    const examRes1 = mockRes()
    await characterHandler(noraReq({ method: 'GET', query: { action: 'final-exam', companionType: 'nuri' } }), examRes1)
    t.assert(examRes1.statusCode === 200, '8문제를 모두 채우면 종합 최종 시험을 받을 수 있다')
    t.assert(examRes1.body.questions.length === 8, '시험 문제는 정확히 8문제다(저장한 학습 기록을 1:1로 복습)')
    t.assert(examRes1.body.passScore === 100, '합격 기준은 100점(전부 정답)이다')
    t.assert(examRes1.body.attemptNumber === 1, '첫 시험은 1차 시도다')

    // 3) 1문제라도 틀리면(부분 점수 없음) 1차 불합격이다 — 아직
    // 차단되지 않고, 틀린 문제만 담은 retakeExamToken/wrongQuestions
    // (id/choices 포함)를 돌려받는다.
    const answersOneWrong = examRes1.body.questions.map((_, i) => (i === 0 ? 1 : 0))
    const submit1 = mockRes()
    await characterHandler(
      noraReq({ method: 'POST', query: { action: 'final-exam-submit' }, body: { companionType: 'nuri', examToken: examRes1.body.examToken, answers: answersOneWrong } }),
      submit1,
    )
    t.assert(submit1.body.passed === false, '1문제라도 틀리면 불합격이다(부분 점수 없음)')
    t.assert(submit1.body.blocked === false, '1차 불합격은 아직 차단되지 않는다')
    t.assert(submit1.body.attemptNumber === 1, '1차 시도로 기록된다')
    t.assert(typeof submit1.body.retakeExamToken === 'string' && submit1.body.retakeExamToken.length > 0, '1차 불합격은 틀린 문제만 담은 재시험 토큰을 받는다')
    t.assert(submit1.body.wrongQuestions.length === 1, '틀린 문제 1개만 재시험 대상으로 돌려준다')
    t.assert(
      typeof submit1.body.wrongQuestions[0].id === 'string' && Array.isArray(submit1.body.wrongQuestions[0].choices),
      '재시험 화면이 다시 그릴 수 있도록 틀린 문제에 id/choices도 함께 내려온다',
    )
    t.assert(noraNuri.final_exam_attempts === 1, 'DB에도 1차 시도로 기록된다')

    // 3-1) 아직 1차 불합격뿐이므로(2회 미만) '처음부터 다시 키우기'는
    // 아직 선택할 수 없다.
    const tooEarlyReset = mockRes()
    await characterHandler(noraReq({ method: 'POST', query: { action: 'reset-character-progress' }, body: { companionType: 'nuri' } }), tooEarlyReset)
    t.assert(tooEarlyReset.statusCode === 400, '최종 시험에 두 번 불합격하기 전에는 처음부터 다시 키우기를 선택할 수 없다(400)')

    // 4) 새 GET 없이(Gemini 재호출 없이) 받은 retakeExamToken으로 바로
    // 재시험을 제출할 수 있다 — 틀린 문제만 다시 맞히면 합격하고 그
    // 즉시 teen으로 진화한다.
    const callCountBeforeRetake = geminiCallCount
    const retakeSubmit = mockRes()
    await characterHandler(
      noraReq({ method: 'POST', query: { action: 'final-exam-submit' }, body: { companionType: 'nuri', examToken: submit1.body.retakeExamToken, answers: [0] } }),
      retakeSubmit,
    )
    t.assert(geminiCallCount === callCountBeforeRetake, '재시험 제출은 Gemini를 다시 호출하지 않는다(새 GET 없이 서버가 이미 서명한 토큰만 채점)')
    t.assert(retakeSubmit.body.passed === true, '재시험에서 틀렸던 문제를 맞히면 합격한다')
    t.assert(retakeSubmit.body.evolved === true, '합격하면 그 즉시 진화한다')
    t.assert(retakeSubmit.body.newAgeTier === 'teen', '다음 연령대는 teen이다')
    t.assert(noraNuri.mission_unlocked_tier === 'teen', 'DB에도 teen으로 기록된다')

    // 5) 이미 teen으로 진화한 캐릭터는 패스권을 구매할 수 없다(8~9세
    // 전용).
    const passAfterEvolved = mockRes()
    await characterHandler(noraReq({ method: 'POST', query: { action: 'purchase-final-exam-pass' }, body: { companionType: 'nuri' } }), passAfterEvolved)
    t.assert(passAfterEvolved.statusCode === 400, '이미 teen으로 진화한 캐릭터는 패스권을 구매할 수 없다(400)')
  }

  // --- 2차 불합격(차단) 이후 '처음부터 다시 키우기' 경로 — 소프트
  // 리셋(레벨/경험치/진행도만 리셋, 기존 지식 기록은 삭제하지 않음)을
  // 확인한다. ---
  {
    mock.seedUser(22, { email: 'priya@test.com' })
    const priyaCookie = cookieHeaderFor(auth, 22, 0, 'priya@test.com')
    const priyaReq = (overrides = {}) => ({ headers: { cookie: priyaCookie }, query: {}, ...overrides })
    await characterHandler(priyaReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(priyaReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    const priyaNuri = mock.state.characters.find((c) => c.user_id === 22 && c.companion_type === 'nuri')

    const teachOncePriya = async (n, missionType) => {
      geminiBehavior = {
        kind: 'json',
        result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '', requiredAgeTier: 'toddler' },
      }
      const verifyRes = mockRes()
      await characterHandler(
        priyaReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: `프리야 지식 ${n}`, content: `초등 저학년도 알 수 있는 내용 ${n}` } }),
        verifyRes,
      )
      const saveRes = mockRes()
      await characterHandler(
        priyaReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: {
            companionType: 'nuri',
            title: `프리야 지식 ${n}`,
            originalContent: `초등 저학년도 알 수 있는 내용 ${n}`,
            finalContent: `초등 저학년도 알 수 있는 내용 ${n}`,
            verificationToken: verifyRes.body.verificationToken,
            requestId: `req-priya-${n}`,
            missionType,
          },
        }),
        saveRes,
      )
      return saveRes
    }
    const teachCardGamePriya = async (n) => {
      const completeRes = mockRes()
      await characterHandler(priyaReq({ method: 'POST', query: { action: 'complete-card-game' }, body: { companionType: 'nuri' } }), completeRes)
      const saveRes = mockRes()
      await characterHandler(
        priyaReq({
          method: 'POST',
          query: { action: 'save-knowledge' },
          body: {
            companionType: 'nuri',
            title: completeRes.body.knowledge.title,
            originalContent: completeRes.body.knowledge.content,
            finalContent: completeRes.body.knowledge.content,
            verificationToken: completeRes.body.verificationToken,
            requestId: `req-priya-card-${n}`,
            missionType: 'card_game',
          },
        }),
        saveRes,
      )
      return saveRes
    }

    await teachOncePriya(1, 'objective')
    await teachOncePriya(2, 'objective')
    await teachOncePriya(3, 'objective')
    await teachCardGamePriya(4)
    await teachOncePriya(5, 'knowhow')
    await teachOncePriya(6, 'knowhow')
    await teachOncePriya(7, 'knowhow')
    await teachOncePriya(8, 'knowhow')

    // 1차 불합격(전부 오답) → 아직 차단 전.
    geminiBehavior = { kind: 'json', result: buildFinalExamMock(8, 3) }
    const examRes1 = mockRes()
    await characterHandler(priyaReq({ method: 'GET', query: { action: 'final-exam', companionType: 'nuri' } }), examRes1)
    const allWrongAnswers = examRes1.body.questions.map(() => 1)
    const fail1 = mockRes()
    await characterHandler(
      priyaReq({ method: 'POST', query: { action: 'final-exam-submit' }, body: { companionType: 'nuri', examToken: examRes1.body.examToken, answers: allWrongAnswers } }),
      fail1,
    )
    t.assert(fail1.body.blocked === false, '1차 불합격은 아직 차단되지 않는다')
    t.assert(fail1.body.retakeExamToken, '1차 불합격은 재시험 토큰을 받는다')

    // 2차 불합격(재시험도 전부 오답) → 차단되고, retakeExamToken이
    // 더 이상 내려오지 않는다.
    const retakeAllWrong = fail1.body.wrongQuestions.map(() => 1)
    const fail2 = mockRes()
    await characterHandler(
      priyaReq({ method: 'POST', query: { action: 'final-exam-submit' }, body: { companionType: 'nuri', examToken: fail1.body.retakeExamToken, answers: retakeAllWrong } }),
      fail2,
    )
    t.assert(fail2.body.passed === false, '재시험도 틀리면 불합격이다')
    t.assert(fail2.body.blocked === true, '2차 불합격이면 차단된다(더 이상 재시험을 볼 수 없다)')
    t.assert(fail2.body.attemptNumber === 2, '2차 시도로 기록된다')
    t.assert(fail2.body.retakeExamToken === null, '차단되면 더 이상 재시험 토큰을 주지 않는다')
    t.assert(priyaNuri.final_exam_attempts === 2, 'DB에도 2차 시도(차단)로 기록된다')

    // 차단된 뒤에는 세 번째 시험 자체를 다시 받을 수 없다.
    const thirdExam = mockRes()
    await characterHandler(priyaReq({ method: 'GET', query: { action: 'final-exam', companionType: 'nuri' } }), thirdExam)
    t.assert(thirdExam.statusCode === 400, '2회 불합격 이후에는 세 번째 시험을 다시 받을 수 없다(400)')

    // '처음부터 다시 키우기' — 레벨/경험치/진행도만 리셋되고, 기존에
    // 저장한 지식 기록(character_knowledge_entries)은 삭제되지 않는다
    // (사용자 확인: "레벨/경험치/진행도만 리셋").
    const beforeResetKnowledge = mockRes()
    await characterHandler(priyaReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), beforeResetKnowledge)
    const knowledgeCountBeforeReset = beforeResetKnowledge.body.entries.length
    t.assert(knowledgeCountBeforeReset === 8, '리셋 전에는 8개의 학습 기록이 있다')

    const resetRes = mockRes()
    await characterHandler(priyaReq({ method: 'POST', query: { action: 'reset-character-progress' }, body: { companionType: 'nuri' } }), resetRes)
    t.assert(resetRes.statusCode === 200, '2회 불합격 뒤에는 처음부터 다시 키우기를 선택할 수 있다')
    t.assert(resetRes.body.character?.level === 1 && resetRes.body.character?.age_tier === 'toddler', '리셋하면 레벨 1·toddler 단계로 돌아간다')
    t.assert(priyaNuri.final_exam_attempts === 0 && priyaNuri.final_exam_passed === false, '최종 시험 시도/합격 상태도 함께 리셋된다')

    const afterResetKnowledge = mockRes()
    await characterHandler(priyaReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), afterResetKnowledge)
    t.assert(afterResetKnowledge.body.entries.length === knowledgeCountBeforeReset, '기존 학습 기록은 리셋돼도 삭제되지 않는다(소프트 리셋)')

    const afterResetMissions = mockRes()
    await characterHandler(priyaReq({ method: 'GET', query: { action: 'missions', companionType: 'nuri' } }), afterResetMissions)
    t.assert(
      afterResetMissions.body.missionProgress.confirmedTotal === 0 && afterResetMissions.body.missionProgress.allConfirmed === false,
      '리셋 이후에는 reset_at 이전 저장이 진행도 집계에서 빠져 0부터 다시 시작한다',
    )
  }

  // --- 패스권(음서재 쿠폰) 구매는 미션 게이트 자체를 건너뛴다 — 방금
  // 만든, 아직 어떤 미션도 채우지 않은 캐릭터로도 즉시 teen으로 올라갈
  // 수 있는지 확인한다. ---
  {
    mock.seedUser(23, { email: 'quinn@test.com' })
    const quinnCookie = cookieHeaderFor(auth, 23, 0, 'quinn@test.com')
    const quinnReq = (overrides = {}) => ({ headers: { cookie: quinnCookie }, query: {}, ...overrides })
    await characterHandler(quinnReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    const quinnNuri = mock.state.characters.find((c) => c.user_id === 23 && c.companion_type === 'nuri')

    const purchaseRes = mockRes()
    await characterHandler(quinnReq({ method: 'POST', query: { action: 'purchase-final-exam-pass' }, body: { companionType: 'nuri' } }), purchaseRes)
    t.assert(purchaseRes.statusCode === 200, '패스권 구매는 미션을 하나도 안 채웠어도 성공한다(미션 게이트를 건너뜀)')
    t.assert(purchaseRes.body.evolved === true && purchaseRes.body.newAgeTier === 'teen', '구매 즉시 teen으로 진화한다')
    t.assert(quinnNuri.mission_unlocked_tier === 'teen' && quinnNuri.final_exam_passed === true, 'DB에도 teen·final_exam_passed=true로 기록된다')
  }

  // --- 지시서(학습 플로우 전면 개편) 2단계: 객관식 2문제(세트 전부
  // 정답 필요) 생성/채점 API.
  //
  // 지시서(연령대별 객관식 선택지 개수 동적 변경 및 문제 유형 확장) 이후:
  // 문제가 더 이상 직업 무관 고정 문제은행이 아니라 Gemini가 매번
  // 직업별(역사·도구·목적·핵심역량) 문제를 생성하고, 선택지 개수도
  // 연령대별로 달라진다(toddler=3). 사용자 확인("전문직 포함 전체
  // 적용")에 따라 EXAM_SUPPORTED_PROFESSIONS 가드 없이 의사 등 모든
  // 직업에서 여전히 동작해야 한다.
  const OBJECTIVE_QUIZ_TEMPLATE_PHRASES = [
    '이 직업이 가진 주요 도구는 무엇인가요?',
    '이 직업의 역사적 기원은 무엇인가요?',
    '이 직업의 주된 목적은 무엇인가요?',
    '이 직업에 필요한 핵심 역량은 무엇인가요?',
  ]
  // toddler 기준 선택지 3개짜리 문제 3개를 만든다(지시서(8세 학습 총
  // 8문제 제한 및 10대 강제 레벨업 로직 수정) 이후 toddler의 objective
  // 필요 개수가 2→3으로 늘면서, handleGetObjectiveQuiz도 한 세트에
  // 정확히 그 요구 개수만큼 내려주도록 바뀌었다 — characterAge.ts의
  // MISSIONS_REQUIRED_PER_TYPE_BY_TIER[tier].objective를 그대로 쓴다)
  // — correctIndex를 테스트가 직접 지정해 정답/오답 제출에 그대로 쓴다
  // (더 이상 objectiveQuizQuestions.ts 같은 정적 은행에서 id로
  // 되찾아오지 않는다).
  const makeObjectiveQuizMock = (count, choiceCount, correctIndexes) =>
    Array.from({ length: count }, (_, i) => ({
      text: `문제 ${i + 1} (${choiceCount}지선다)`,
      choices: Array.from({ length: choiceCount }, (_, c) => `보기 ${i}-${c}`),
      correctIndex: correctIndexes[i],
      explanation: `문제 ${i + 1}의 해설`,
    }))

  {
    mock.seedUser(13, { email: 'mina@test.com' })
    const minaCookie = cookieHeaderFor(auth, 13, 0, 'mina@test.com')
    const minaReq = (overrides = {}) => ({ headers: { cookie: minaCookie }, query: {}, ...overrides })
    await characterHandler(minaReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(minaReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'doctor' } }), mockRes())
    await characterHandler(minaReq({ method: 'POST', body: { companionType: 'duri' } }), mockRes())
    await characterHandler(minaReq({ method: 'PATCH', body: { companionType: 'duri', profession: 'doctor' } }), mockRes())

    // 1) 문제 3개 + quizToken을 받고, 정답(correctIndex)은 전혀
    // 포함되지 않으며, toddler 단계는 보기 3개씩 출제된다. Gemini는
    // 정확히 1번만 호출된다(비용 절감 — N개를 1번에 배치 생성).
    const mockedSet1 = makeObjectiveQuizMock(3, 3, [1, 0, 2])
    geminiBehavior = { kind: 'json', result: mockedSet1 }
    const callCountBefore1 = geminiCallCount
    const quizRes1 = mockRes()
    await characterHandler(minaReq({ method: 'GET', query: { action: 'objective-quiz', companionType: 'nuri' } }), quizRes1)
    t.assert(quizRes1.statusCode === 200, '의사 직업이어도 객관식 퀴즈를 바로 받을 수 있다(전문직 포함 전체 적용)')
    t.assert(geminiCallCount === callCountBefore1 + 1, 'Gemini는 문제 3개를 1번의 배치 호출로 생성한다(비용 절감)')
    t.assert(Array.isArray(quizRes1.body.questions) && quizRes1.body.questions.length === 3, '문제 3개를 받는다(toddler의 objective 필요 개수와 같은 세트 크기)')
    t.assert(typeof quizRes1.body.quizToken === 'string' && quizRes1.body.quizToken.length > 0, '서명된 quizToken을 받는다')
    t.assert(quizRes1.body.questions.every((q) => q.correctIndex === undefined), '정답(correctIndex)은 클라이언트로 내려가지 않는다')
    t.assert(quizRes1.body.questions.every((q) => q.choices.length === 3), 'toddler(8~9살) 단계는 보기 3개가 출제된다(연령대별 선택지 개수)')
    const matchedTemplates1 = OBJECTIVE_QUIZ_TEMPLATE_PHRASES.filter((p) => lastSystemInstruction.includes(p))
    t.assert(matchedTemplates1.length >= 2, '프롬프트에 서로 다른 문제 유형(역사/목적/도구/핵심역량)이 여러 종류 지정된다(문제 유형 다양화)')

    // 2) 하나라도 틀리면 통과하지 못하고, 아무것도 저장되지 않는다.
    const wrongAnswers = mockedSet1.map((q) => (q.correctIndex + 1) % q.choices.length)
    const wrongSubmit = mockRes()
    await characterHandler(
      minaReq({
        method: 'POST',
        query: { action: 'objective-quiz-submit' },
        body: { companionType: 'nuri', quizToken: quizRes1.body.quizToken, answers: wrongAnswers },
      }),
      wrongSubmit,
    )
    t.assert(wrongSubmit.statusCode === 200, '틀려도 200으로 응답한다(에러가 아니라 결과)')
    t.assert(wrongSubmit.body.allCorrect === false, '하나라도 틀리면 allCorrect:false다')
    t.assert(wrongSubmit.body.results.length === 3, '세 문제 각각의 정오답이 내려온다')
    t.assert(wrongSubmit.body.expAwarded === 0, '틀리면 XP가 지급되지 않는다')
    const afterWrongKnowledge = mockRes()
    await characterHandler(minaReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), afterWrongKnowledge)
    t.assert(afterWrongKnowledge.body.entries.length === 0, '틀리면 지식 항목이 전혀 저장되지 않는다')

    // 3) 새 세트를 받아 셋 다 맞히면 세트 1개만으로 objective 요구치
    // (3개)가 정확히 채워져 통과하고, 3건이 저장되며 XP가 30(지식 저장
    // 10XP × 3) 지급된다.
    const mockedSet2 = makeObjectiveQuizMock(3, 3, [2, 1, 0])
    geminiBehavior = { kind: 'json', result: mockedSet2 }
    const quizRes2 = mockRes()
    await characterHandler(minaReq({ method: 'GET', query: { action: 'objective-quiz', companionType: 'nuri' } }), quizRes2)
    const correctAnswers = mockedSet2.map((q) => q.correctIndex)
    const correctSubmit = mockRes()
    await characterHandler(
      minaReq({
        method: 'POST',
        query: { action: 'objective-quiz-submit' },
        body: { companionType: 'nuri', quizToken: quizRes2.body.quizToken, answers: correctAnswers, requestId: 'req-obj-mina-1' },
      }),
      correctSubmit,
    )
    t.assert(correctSubmit.statusCode === 201, '셋 다 맞히면 201로 응답한다')
    t.assert(correctSubmit.body.allCorrect === true, '셋 다 맞히면 allCorrect:true다')
    t.assert(correctSubmit.body.expAwarded === 30, '지식 저장 XP(10) × 3건 = 30XP가 지급된다')
    t.assert(correctSubmit.body.missionProgress.byType.objective.confirmed === 3 && correctSubmit.body.missionProgress.byType.objective.complete === true, 'objective 미션은 세트 크기(3)가 필요 개수(3)와 같아 한 세트만으로 3/3 완료된다')
    t.assert(correctSubmit.body.evolved === false, 'objective는 완료됐어도 knowhow/card_game이 아직 안 채워져 있어 진화하지 않는다')
    const afterCorrectKnowledge = mockRes()
    await characterHandler(minaReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), afterCorrectKnowledge)
    t.assert(afterCorrectKnowledge.body.entries.length === 3, '통과한 3문제가 각각 지식 항목으로 저장된다')
    t.assert(afterCorrectKnowledge.body.entries.every((e) => e.mission_type === 'objective'), '세 항목 모두 mission_type=objective로 저장된다')

    // 4) 같은 requestId로 재제출(네트워크 재시도 등)하면 중복 저장·중복
    // XP 지급 없이 현재 상태를 그대로 돌려준다.
    const replaySubmit = mockRes()
    await characterHandler(
      minaReq({
        method: 'POST',
        query: { action: 'objective-quiz-submit' },
        body: { companionType: 'nuri', quizToken: quizRes2.body.quizToken, answers: correctAnswers, requestId: 'req-obj-mina-1' },
      }),
      replaySubmit,
    )
    t.assert(replaySubmit.statusCode === 200 && replaySubmit.body.allCorrect === true && replaySubmit.body.expAwarded === 0, '같은 requestId의 재제출은 중복 지급 없이 현재 상태를 돌려준다')
    const afterReplayKnowledge = mockRes()
    await characterHandler(minaReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), afterReplayKnowledge)
    t.assert(afterReplayKnowledge.body.entries.length === 3, '재제출로 지식 항목이 중복 저장되지 않는다(여전히 3건)')

    // 5) 다른 캐릭터(두리)의 quizToken으로 누리 쪽을 제출하면 거부된다
    // (서명은 유효해도 이 캐릭터에게 출제된 문제가 아니므로).
    geminiBehavior = { kind: 'json', result: makeObjectiveQuizMock(3, 3, [0, 0, 0]) }
    const quizResDuri = mockRes()
    await characterHandler(minaReq({ method: 'GET', query: { action: 'objective-quiz', companionType: 'duri' } }), quizResDuri)
    const crossSubmit = mockRes()
    await characterHandler(
      minaReq({
        method: 'POST',
        query: { action: 'objective-quiz-submit' },
        body: { companionType: 'nuri', quizToken: quizResDuri.body.quizToken, answers: [0, 0, 0] },
      }),
      crossSubmit,
    )
    t.assert(crossSubmit.statusCode === 400, '다른 캐릭터에게 발급된 quizToken은 거부된다(400)')

    // 6) 직업이 아직 없는 캐릭터는 퀴즈를 받을 수 없다.
    mock.seedUser(14, { email: 'noprofession@test.com' })
    const npCookie = cookieHeaderFor(auth, 14, 0, 'noprofession@test.com')
    await characterHandler({ headers: { cookie: npCookie }, query: {}, method: 'POST', body: { companionType: 'nuri' } }, mockRes())
    const noProfessionQuiz = mockRes()
    await characterHandler({ headers: { cookie: npCookie }, query: { action: 'objective-quiz', companionType: 'nuri' }, method: 'GET' }, noProfessionQuiz)
    t.assert(noProfessionQuiz.statusCode === 400, '직업이 없으면 객관식 퀴즈를 받을 수 없다(400)')

    // 7) 답 개수가 문제 수(3개)와 다르면 400.
    const malformedSubmit = mockRes()
    await characterHandler(
      minaReq({ method: 'POST', query: { action: 'objective-quiz-submit' }, body: { companionType: 'nuri', quizToken: quizRes2.body.quizToken, answers: [0, 0] } }),
      malformedSubmit,
    )
    t.assert(malformedSubmit.statusCode === 400, '답이 3개가 아니면 400으로 거부된다')

    // 8) Gemini가 선택지 개수를 어기거나(choices 길이 불일치) JSON을
    // 해석할 수 없는 응답을 주면 502 — 틀린 응답을 그대로 신뢰해 보기
    // 개수가 안 맞는 퀴즈를 내보내지 않는다. 문제 수(3개) 자체는
    // 맞췄지만, 그중 1개의 보기 개수(2개)가 요구치(3개)를 어긴다.
    geminiBehavior = {
      kind: 'json',
      result: [
        { text: '문제', choices: ['A', 'B'], correctIndex: 0, explanation: '해설' },
        { text: '문제2', choices: ['C', 'D', 'E'], correctIndex: 0, explanation: '해설2' },
        { text: '문제3', choices: ['F', 'G', 'H'], correctIndex: 0, explanation: '해설3' },
      ],
    }
    const badChoiceCountQuiz = mockRes()
    await characterHandler(minaReq({ method: 'GET', query: { action: 'objective-quiz', companionType: 'nuri' } }), badChoiceCountQuiz)
    t.assert(badChoiceCountQuiz.statusCode === 502, 'Gemini가 보기 개수(3개)를 어기면 502로 거부된다')
  }

  // --- 지시서(연령대별 객관식 선택지 개수 동적 변경 및 문제 유형 확장)
  // 완료조건: 20대 계정에서 보기가 7개인지 직접 확인한다. objective-quiz
  // 액션 자체는 UI에서 toddler/teen 단계에서만 쓰이지만, API는 캐릭터의
  // 실제 연령대로 선택지 개수를 계산하므로 junior_20s 레벨로 직접
  // 검증할 수 있다(characterAge.ts의 objectiveQuizChoiceCountForTier와
  // selfStudyDraftCountForTier가 같은 숫자 표를 공유함을 간접 확인).
  {
    mock.seedUser(17, { email: 'junior20s-objective@test.com' })
    const juniorCookie = cookieHeaderFor(auth, 17, 0, 'junior20s-objective@test.com')
    const juniorReq = (overrides = {}) => ({ headers: { cookie: juniorCookie }, query: {}, ...overrides })
    await characterHandler(juniorReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(juniorReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    const juniorNuri = mock.state.characters.find((c) => c.user_id === 17 && c.companion_type === 'nuri')
    juniorNuri.level = 10
    juniorNuri.exp = 4500

    // 지시서(8세 학습 총 8문제 제한 및 10대 강제 레벨업 로직 수정) 이후
    // handleGetObjectiveQuiz는 세트 크기도 티어별 objective 요구치
    // 그대로 쓴다 — junior_20s는 splitMissionsRequiredByType(20)의
    // 균등분배로 objective=7(remainder가 앞쪽 2개 유형에 먼저 +1되는
    // 규칙상 objective/subjective가 7, knowhow가 6)이라 문제도 7개다.
    geminiBehavior = { kind: 'json', result: makeObjectiveQuizMock(7, 7, [0, 0, 0, 0, 0, 0, 0]) }
    const juniorQuizRes = mockRes()
    await characterHandler(juniorReq({ method: 'GET', query: { action: 'objective-quiz', companionType: 'nuri' } }), juniorQuizRes)
    t.assert(juniorQuizRes.statusCode === 200, '20대 캐릭터도 객관식 퀴즈를 받을 수 있다')
    t.assert(juniorQuizRes.body.questions.length === 7, '20대(junior_20s) 단계는 objective 요구치(7)만큼 문제가 출제된다')
    t.assert(juniorQuizRes.body.questions.every((q) => q.choices.length === 7), '20대(junior_20s) 단계는 보기 7개가 출제된다')
  }

  // --- 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): teen 전용 ④단계
  // 객관식 3문제 일반화 + ②단계 카드 맞추기 완료(complete-card-game)
  // 액션을 단위 테스트로 직접 확인한다(10단계 e2e와는 별개로, API
  // 계약 자체를 검증).
  {
    mock.seedUser(15, { email: 'teen-tester@test.com' })
    const teenCookie = cookieHeaderFor(auth, 15, 0, 'teen-tester@test.com')
    const teenReq = (overrides = {}) => ({ headers: { cookie: teenCookie }, query: {}, ...overrides })
    await characterHandler(teenReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(teenReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    const teenNuri = mock.state.characters.find((c) => c.user_id === 15 && c.companion_type === 'nuri')
    // ageTierForLevel(5) === 'teen'(mission_unlocked_tier는 아직 null) —
    // applyExpGain이 매 저장마다 exp 기준으로 level을 재계산해 덮어쓰므로
    // (level만 직접 바꾸면 이어지는 save-knowledge 호출에서 레벨이 다시
    // 1로 떨어진다), level과 그에 맞는 exp(1000 = Lv.5 누적치)를 함께
    // 맞춰준다.
    teenNuri.level = 5
    teenNuri.exp = 1000

    // 1) teen 캐릭터는 객관식 퀴즈를 3문제 받는다(toddler는 2문제 —
    // 위 mina 블록에서 이미 확인됨 — 회귀 없음). 선택지도 toddler(3개)가
    // 아니라 teen 기준 5개씩이다(연령대별 선택지 개수).
    geminiBehavior = { kind: 'json', result: makeObjectiveQuizMock(3, 5, [0, 1, 2]) }
    const teenQuizRes = mockRes()
    await characterHandler(teenReq({ method: 'GET', query: { action: 'objective-quiz', companionType: 'nuri' } }), teenQuizRes)
    t.assert(teenQuizRes.statusCode === 200, 'teen 캐릭터도 객관식 퀴즈를 받을 수 있다')
    t.assert(Array.isArray(teenQuizRes.body.questions) && teenQuizRes.body.questions.length === 3, 'teen은 2문제가 아니라 3문제를 받는다')
    t.assert(teenQuizRes.body.questions.every((q) => q.choices.length === 5), '10대(teen) 단계는 보기 5개가 출제된다')

    // 2) 직업을 아직 안 고른 캐릭터는 카드 맞추기 완료도 막힌다(다른
    // 액션들과 같은 "직업 먼저" 가드).
    mock.seedUser(16, { email: 'teen-noprofession@test.com' })
    const npTeenCookie = cookieHeaderFor(auth, 16, 0, 'teen-noprofession@test.com')
    await characterHandler({ headers: { cookie: npTeenCookie }, query: {}, method: 'POST', body: { companionType: 'nuri' } }, mockRes())
    const npCardGame = mockRes()
    await characterHandler(
      { headers: { cookie: npTeenCookie }, query: { action: 'complete-card-game' }, method: 'POST', body: { companionType: 'nuri' } },
      npCardGame,
    )
    t.assert(npCardGame.statusCode === 400, '직업이 없으면 카드 맞추기 완료도 막힌다(400)')

    // 3) 카드 맞추기를 완료하면(complete-card-game) Gemini 호출 없이도
    // 바로 적합(appropriate) 판정 + 서명된 토큰을 받는다.
    const cardGameRes = mockRes()
    await characterHandler(teenReq({ method: 'POST', query: { action: 'complete-card-game' }, body: { companionType: 'nuri' } }), cardGameRes)
    t.assert(cardGameRes.statusCode === 200, '카드 맞추기 완료 요청이 성공한다')
    t.assert(cardGameRes.body.verification?.status === 'appropriate', '카드 맞추기 완료는 항상 적합(appropriate) 판정이다(Gemini 호출 없음)')
    t.assert(typeof cardGameRes.body.verificationToken === 'string' && cardGameRes.body.verificationToken.length > 0, '서명된 verificationToken을 받는다')
    t.assert(typeof cardGameRes.body.characterReply === 'string' && cardGameRes.body.characterReply.length > 0, '캐릭터의 축하 반응 문구도 함께 받는다')

    // 4) 그 토큰으로 save-knowledge를 호출하면 mission_type='card_game'
    // 으로 실제 저장되고, teen의 카드맞추기 미션(1/1)에 집계된다.
    const cardGameSave = mockRes()
    await characterHandler(
      teenReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'nuri',
          title: cardGameRes.body.knowledge.title,
          originalContent: cardGameRes.body.knowledge.content,
          finalContent: cardGameRes.body.knowledge.content,
          verificationToken: cardGameRes.body.verificationToken,
          requestId: 'req-card-game-unit-1',
          missionType: 'card_game',
        },
      }),
      cardGameSave,
    )
    t.assert(cardGameSave.statusCode === 201, '카드 맞추기 완료 토큰으로 지식 저장이 성공한다')
    t.assert(
      cardGameSave.body.missionProgress.byType.card_game.confirmed === 1 && cardGameSave.body.missionProgress.byType.card_game.complete === true,
      'card_game 미션이 1/1로 완료 표시된다',
    )
    const teenKnowledge = mockRes()
    await characterHandler(teenReq({ method: 'GET', query: { action: 'knowledge', companionType: 'nuri' } }), teenKnowledge)
    t.assert(
      teenKnowledge.body.entries.some((e) => e.mission_type === 'card_game'),
      'mission_type=card_game으로 실제 저장된 지식 항목이 있다',
    )
  }

  // --- 지시서(연령대별 스테이지 볼륨업): 연령대별 필요 지식 개수
  // (8~9살=8, 10대=10, 20대=20, 30대=30, 40대=40, 50~60대=50)가
  // characterAge.ts에 정확히 세팅되어 있는지 직접 확인한다. 단계별로
  // 실제 지식을 전부 저장해보는 end-to-end 시뮬레이션은(특히 30~50개
  // 저장) 비현실적으로 느려지므로, 순수 데이터 테이블을 직접 검증한다
  // (teen=10까지는 위에서 이미 end-to-end로 검증됨).
  {
    const characterAge = bundle('api/_lib/characterAge.ts')
    const EXPECTED_TOTAL_BY_TIER = {
      toddler: 8,
      teen: 10,
      junior_20s: 20,
      career_30s: 30,
      veteran_40s: 40,
      master_50s: 50,
    }
    for (const [tier, expectedTotal] of Object.entries(EXPECTED_TOTAL_BY_TIER)) {
      t.assert(
        characterAge.MISSIONS_REQUIRED_TOTAL_BY_TIER[tier] === expectedTotal,
        `${tier} 단계의 필요 지식 총합은 ${expectedTotal}개다`,
      )
      const perType = characterAge.MISSIONS_REQUIRED_PER_TYPE_BY_TIER[tier]
      const sum = perType.objective + perType.subjective + perType.knowhow + perType.card_game
      t.assert(
        sum === expectedTotal,
        `${tier} 단계의 유형별 필요 개수 합도 정확히 ${expectedTotal}개다(현재 objective${perType.objective}+subjective${perType.subjective}+knowhow${perType.knowhow}+card_game${perType.card_game})`,
      )
      // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합/8세 학습 총 8문제
      // 제한 및 10대 강제 레벨업 로직 수정): teen과 toddler 둘 다 고정
      // 순서 커리큘럼(teen: ①③⑤직접입력=knowhow6, ②카드맞추기=
      // card_game1, ④객관식=objective3; toddler: ①④직접입력/노하우=
      // knowhow4, ②객관식=objective3, ③카드맞추기=card_game1)이라
      // subjective가 의도적으로 0이고 다른 티어와 모양이 다르다 —
      // junior_20s 이상은 이 변경의 영향을 받지 않았는지(card_game은
      // 항상 0) 그대로 확인한다.
      if (tier === 'teen') {
        t.assert(
          perType.knowhow === 6 && perType.objective === 3 && perType.subjective === 0 && perType.card_game === 1,
          'teen 단계는 고정 커리큘럼(직접입력6+객관식3+카드맞추기1, subjective는 0)을 요구한다',
        )
      } else if (tier === 'toddler') {
        t.assert(
          perType.knowhow === 4 && perType.objective === 3 && perType.subjective === 0 && perType.card_game === 1,
          'toddler 단계는 고정 커리큘럼(직접입력3+노하우1=knowhow4, 객관식3, 카드맞추기1, subjective는 0)을 요구한다',
        )
      } else {
        t.assert(
          perType.objective > 0 && perType.subjective > 0 && perType.knowhow > 0 && perType.card_game === 0,
          `${tier} 단계는 세 유형(객관식/주관식/노하우) 모두 최소 1개 이상을 요구하고 card_game은 0이다(teen/toddler 전용 커리큘럼의 영향을 받지 않는다)`,
        )
      }
    }
  }

  // --- 지시서(AI 추천(예시 만들기) 개수에 대한 명확한 지시): "스스로
  // 공부하기(예시 만들어주기)" 한 번 클릭이 1개가 아니라 캐릭터의
  // 연령대에 맞는 개수(exampleCount)만큼의 서로 다른 후보를 "한 번의
  // Gemini 호출로" 돌려주는지 확인한다. 먼저 순수 데이터 테이블
  // (selfStudyDraftCountForTier)을 직접 검증한 뒤, 실제 API 호출로
  // 그 개수가 진짜 생성 요청(count)과 응답(drafts.length)에 반영되는지
  // 도 확인한다. 하루 클릭 한도(DAILY_STUDY_LIMIT) 자체는 연령대와
  // 무관하게 플랫한 3 그대로다(위 486줄 부근의 기존 토들러 3회 테스트가
  // 이미 검증함 — 여기서는 "개수"만 다룬다). ---
  {
    const characterAge = bundle('api/_lib/characterAge.ts')
    // 지시서(연령대별 AI 추천(예시) 개수 1개씩 점진적 증가 로직으로
    // 수정): PR #124의 "2개씩 증가"(3~15) 표를 "1개씩 증가"(1~8) 표로
    // 교체한다 — 8~9살은 "아이가 부담을 느끼지 않도록 최소화"해 1개로
    // 정했다(지시서가 준 "1개 또는 2개" 중 최소값).
    const EXPECTED_DRAFT_COUNT_BY_TIER = {
      toddler: 1,
      teen: 3,
      junior_20s: 4,
      career_30s: 5,
      veteran_40s: 6,
      master_50s: 7,
    }
    for (const [tier, expectedCount] of Object.entries(EXPECTED_DRAFT_COUNT_BY_TIER)) {
      t.assert(
        characterAge.selfStudyDraftCountForTier(tier) === expectedCount,
        `${tier} 단계는 한 번에 예시 ${expectedCount}개를 받는다`,
      )
    }
    // master_50s 안에서도 60대 이상(ageNumber>=60)은 8개로 한 번 더
    // 늘어난다 — 기존 포트레이트 이미지의 50/60대 분기와 같은 기준.
    t.assert(characterAge.selfStudyDraftCountForTier('master_50s', 59) === 7, '50대(59세)는 7개 그대로다')
    t.assert(characterAge.selfStudyDraftCountForTier('master_50s', 60) === 8, '60세부터는 8개로 늘어난다')
  }

  // --- teen(10대, level 5) 캐릭터로 실제 study-generate를 호출해,
  // 한 번의 (모의) Gemini 호출로 정확히 3개의 서로 다른 후보가
  // 돌아오는지 확인한다 — 1개씩 3번 부르지 않는다(geminiCallCount로
  // 직접 센다). ---
  {
    mock.seedUser(21, { email: 'teen-study-count@test.com' })
    const studyTeenCookie = cookieHeaderFor(auth, 21, 0, 'teen-study-count@test.com')
    const studyTeenReq = (overrides = {}) => ({ headers: { cookie: studyTeenCookie }, query: {}, ...overrides })
    await characterHandler(studyTeenReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(studyTeenReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    const studyTeenNuri = mock.state.characters.find((c) => c.user_id === 21 && c.companion_type === 'nuri')
    studyTeenNuri.level = 5 // ageTierForLevel(5) === 'teen' → 한 번에 3개

    geminiBehavior = {
      kind: 'json',
      result: Array.from({ length: 3 }, (_, i) => ({
        title: `복식부기 ${i}`,
        content: '거래를 차변과 대변에 나눠 기록한다.',
        status: 'appropriate',
        explanation: '정확해요',
        relevance: '회계사와 관련 있어요',
        issues: '',
        suggestion: '',
      })),
    }
    const callsBefore = geminiCallCount
    const res = mockRes()
    await characterHandler(studyTeenReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'nuri' } }), res)
    t.assert(res.statusCode === 200, 'teen 캐릭터의 스스로 공부하기가 성공한다')
    t.assert(Array.isArray(res.body.drafts) && res.body.drafts.length === 3, 'teen 캐릭터는 한 번에 3개의 후보를 받는다')
    t.assert(res.body.exampleCount === 3, '응답의 exampleCount도 3이다')
    t.assert(geminiCallCount === callsBefore + 1, '3개를 1개씩 3번이 아니라 Gemini를 단 1번만 호출해서 받는다')
    t.assert(new Set(res.body.drafts.map((d) => d.knowledge.title)).size === 3, '3개의 제목이 서로 다르다')
    t.assert(
      res.body.drafts.every((d) => typeof d.verificationToken === 'string' && d.verificationToken.length > 0),
      '후보마다 각자의 서명된 verificationToken을 받는다',
    )
    t.assert(res.body.dailyStudyLimit === 3, 'teen이어도 하루 클릭 한도 자체는 플랫한 3 그대로다')
    t.assert(res.body.remaining === 2, '클릭 1번은 여전히 하루 한도에서 1회만 깎는다(3-1=2)')
  }

  // --- 배치 응답이 요청한 개수(exampleCount)와 다르거나 제목이 겹치면
  // 전체를 못 믿을 응답으로 보고 SelfStudyParseError로 처리해 하루
  // 한도를 환불하는지 확인한다. ---
  {
    mock.seedUser(22, { email: 'study-batch-mismatch@test.com' })
    const mismatchCookie = cookieHeaderFor(auth, 22, 0, 'study-batch-mismatch@test.com')
    const mismatchReq = (overrides = {}) => ({ headers: { cookie: mismatchCookie }, query: {}, ...overrides })
    await characterHandler(mismatchReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(mismatchReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    // toddler(level 1 기본값) → 1개를 요청하는데 2개가 돌아온다.
    geminiBehavior = {
      kind: 'json',
      result: [
        { title: 'A', content: '내용', status: 'appropriate', explanation: '', relevance: '', issues: '', suggestion: '' },
        { title: 'B', content: '내용', status: 'appropriate', explanation: '', relevance: '', issues: '', suggestion: '' },
      ],
    }
    const res = mockRes()
    await characterHandler(mismatchReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'nuri' } }), res)
    t.assert(res.statusCode === 502, '요청한 개수(1)와 실제 응답 개수(2)가 다르면 502로 실패 처리된다')

    const usageAfterFail = mockRes()
    await characterHandler(mismatchReq({ method: 'GET', query: { action: 'usage' } }), usageAfterFail)
    t.assert(usageAfterFail.body.studyRemaining === 3, '실패한 시도는 하루 한도에서 환불되어 studyRemaining이 그대로 3이다')
  }

  // --- 후보 중 하나라도 적합(appropriate)하면 집중력이 떨어지지 않고,
  // 전부 다 적합하지 않을 때만(이번 클릭이 통째로 쓸모없었을 때)
  // 떨어지는지 확인한다(기존 handleVerifyKnowledge의 단일 판정을
  // "배치 중 하나라도"로 일반화한 규칙). 지시서(연령대별 AI 추천(예시)
  // 개수 1개씩 점진적 증가 로직으로 수정) 이후 toddler는 1개뿐이라
  // "여러 후보 중 일부만 적합"을 의미 있게 테스트할 수 없으므로, 3개를
  // 받는 teen(level 5)으로 올려서 확인한다. ---
  {
    mock.seedUser(23, { email: 'study-batch-focus@test.com' })
    const focusCookie = cookieHeaderFor(auth, 23, 0, 'study-batch-focus@test.com')
    const focusReq = (overrides = {}) => ({ headers: { cookie: focusCookie }, query: {}, ...overrides })
    await characterHandler(focusReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(focusReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    const focusNuri = mock.state.characters.find((c) => c.user_id === 23 && c.companion_type === 'nuri')
    focusNuri.level = 5 // ageTierForLevel(5) === 'teen' → 한 번에 3개

    geminiBehavior = {
      kind: 'json',
      result: [
        { title: 'C', content: '내용', status: 'needs_revision', explanation: '', relevance: '', issues: '', suggestion: '' },
        { title: 'D', content: '내용', status: 'unverifiable', explanation: '', relevance: '', issues: '', suggestion: '' },
        { title: 'E', content: '내용', status: 'needs_revision', explanation: '', relevance: '', issues: '', suggestion: '' },
      ],
    }
    const allBad = mockRes()
    await characterHandler(focusReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'nuri' } }), allBad)
    t.assert(allBad.body.focusPercent < 90, '후보 3개가 전부 적합하지 않으면 집중력이 떨어진다')

    // 1개라도 적합할 때 집중력이 "떨어지지 않는다"를 깨끗하게 보려고
    // 새 캐릭터(집중력 90부터 다시 시작)로 확인한다 — 위 allBad 호출로
    // 이미 88로 떨어진 같은 캐릭터를 재사용하면 "그대로 88"과 "다시
    // 90으로 복구"를 구분할 수 없다.
    mock.seedUser(24, { email: 'study-batch-focus-2@test.com' })
    const focusCookie2 = cookieHeaderFor(auth, 24, 0, 'study-batch-focus-2@test.com')
    const focusReq2 = (overrides = {}) => ({ headers: { cookie: focusCookie2 }, query: {}, ...overrides })
    await characterHandler(focusReq2({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(focusReq2({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
    const focusNuri2 = mock.state.characters.find((c) => c.user_id === 24 && c.companion_type === 'nuri')
    focusNuri2.level = 5 // ageTierForLevel(5) === 'teen' → 한 번에 3개

    geminiBehavior = {
      kind: 'json',
      result: [
        { title: 'F', content: '내용', status: 'needs_revision', explanation: '', relevance: '', issues: '', suggestion: '' },
        { title: 'G', content: '내용', status: 'appropriate', explanation: '', relevance: '', issues: '', suggestion: '' },
        { title: 'H', content: '내용', status: 'unverifiable', explanation: '', relevance: '', issues: '', suggestion: '' },
      ],
    }
    const oneGood = mockRes()
    await characterHandler(focusReq2({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'nuri' } }), oneGood)
    t.assert(oneGood.body.focusPercent === 90, '3개 중 1개라도 적합하면 집중력은 떨어지지 않는다')
  }

  return t.summary()
}

module.exports = { run }
