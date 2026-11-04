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

  // --- 정상 흐름: 스스로 공부하기 → 생성+자체검증(1회 Gemini 호출) → 저장 ---
  geminiBehavior = {
    kind: 'json',
    result: { title: '발성 호흡법', content: '복식호흡으로 소리를 낸다.', status: 'appropriate', explanation: '정확해요', relevance: '가수와 관련 있어요', issues: '', suggestion: '' },
  }
  const studyRes = mockRes()
  await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), studyRes)
  t.assert(studyRes.statusCode === 200, '스스로 공부하기 요청이 성공한다 (200)')
  t.assert(studyRes.body.knowledge?.title === '발성 호흡법', '생성된 지식의 제목이 응답에 포함된다')
  t.assert(studyRes.body.verification?.status === 'appropriate', '스스로 생성한 지식을 스스로 적합으로 평가한다')
  t.assert(typeof studyRes.body.verificationToken === 'string' && studyRes.body.verificationToken.length > 0, '서명된 verificationToken이 포함된다')
  t.assert(studyRes.body.dailyStudyLimit === 3, '스스로 공부하기의 일일 한도는 3회로 응답에 포함된다')

  const studySave = mockRes()
  await characterHandler(
    erinReq({
      method: 'POST',
      query: { action: 'save-knowledge' },
      body: {
        companionType: 'duri',
        title: studyRes.body.knowledge.title,
        originalContent: studyRes.body.knowledge.content,
        finalContent: studyRes.body.knowledge.content,
        verificationToken: studyRes.body.verificationToken,
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
          title: studyRes.body.knowledge.title,
          originalContent: studyRes.body.knowledge.content,
          finalContent: studyRes.body.knowledge.content,
          verificationToken: studyRes.body.verificationToken,
          requestId: 'req-study-1',
        },
      }),
      res,
    )
    t.assert(res.statusCode === 200, '같은 requestId로 다시 저장을 시도하면 200(기존 기록 반환)으로 응답한다')
    t.assert(res.body.entry?.id === studySave.body.entry?.id, '스스로 공부하기도 중복 제출 방지가 동일하게 적용된다')
  }

  // --- Gemini가 해석 불가능한 응답을 주면(제목/내용 누락) 실패로 처리되고 한도가 환불된다 ---
  {
    geminiBehavior = { kind: 'json', result: { status: 'appropriate', explanation: '설명만 있고 title/content가 없음' } }
    const res = mockRes()
    await characterHandler(erinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'duri' } }), res)
    t.assert(res.statusCode >= 500, 'title/content가 없는 응답은 해석 실패로 처리된다')
  }

  // --- 일일 한도 3회, 지식 검증(10회) 한도와 완전히 분리 ---
  {
    geminiBehavior = {
      kind: 'json',
      result: { title: '제목', content: '내용', status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
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
      result: { title: '숫자 세기', content: '하나, 둘, 셋', status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '', requiredAgeTier: 'toddler' },
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
      result: { title: '복식부기 실무', content: '...', status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '', requiredAgeTier: 'junior_20s' },
    }
    const youngAdultStudy = mockRes()
    await characterHandler(jinReq({ method: 'POST', query: { action: 'study-generate' }, body: { companionType: 'nuri' } }), youngAdultStudy)
    t.assert(youngAdultStudy.statusCode === 200, 'Lv.15(junior_20s) 캐릭터의 스스로 공부하기 요청이 성공한다')
    t.assert(
      typeof lastSystemInstruction === 'string' && lastSystemInstruction.includes('20대'),
      'junior_20s 단계에서는 프롬프트에 20대 눈높이 안내가 포함된다(toddler 때와 다른 프롬프트)',
    )
  }

  // --- PR #53 요청 3번: 8~9살(toddler) 단계에서 지식 '적합' 판정이 5회
  // 쌓이면 일반 XP 곡선과 별개로 곧장 청소년기(teen, Lv.5)로 "진화"한다.
  // 5번째 저장에서만 진화가 발동하고(4번째까지는 Lv.1 그대로), savedReply
  // 에도 일반 레벨업과 다른 진화 전용 문구가 담긴다.
  {
    mock.seedUser(11, { email: 'kate@test.com' })
    const kateCookie = cookieHeaderFor(auth, 11, 0, 'kate@test.com')
    const kateReq = (overrides = {}) => ({ headers: { cookie: kateCookie }, query: {}, ...overrides })
    await characterHandler(kateReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
    await characterHandler(kateReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())

    const teachOnce = async (n) => {
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
          },
        }),
        saveRes,
      )
      return saveRes
    }

    for (let n = 1; n <= 4; n++) {
      const res = await teachOnce(n)
      t.assert(res.statusCode === 201, `${n}번째 적합 지식 저장이 성공한다`)
      t.assert(res.body.level === 1, `${n}번째 저장까지는 아직 Lv.1(toddler)이다 — 진화는 5번째에만 발동`)
    }

    const fifth = await teachOnce(5)
    t.assert(fifth.statusCode === 201, '5번째 적합 지식 저장이 성공한다')
    t.assert(fifth.body.level === 5, '5번째 적합 판정으로 Lv.5(청소년기 시작)로 진화한다')
    t.assert(fifth.body.leveledUp === true, '진화도 레벨업으로 취급되어 leveledUp이 true다')
    t.assert(
      fifth.body.savedReply?.includes('청소년 단계로 성장했어요'),
      '진화 시 응답 문구에 일반 레벨업과 다른 "청소년 단계로 성장" 안내가 포함된다',
    )

    const kateNuri = mock.state.characters.find((c) => c.user_id === 11 && c.companion_type === 'nuri')
    t.assert(kateNuri.exp >= 1000, 'DB에 저장된 exp도 Lv.5 임계값(누적 1000) 이상으로 올라가 있다 — 다음 저장에서 다시 역산돼도 toddler로 안 돌아간다')

    // 6번째부터는 이미 teen이라 다시 진화 로직이 발동하지 않아야 한다
    // (requiredAgeTier를 junior_20s로 바꿔 ageBlocked 없이 통과시키고,
    // 평범한 레벨업 문구인지만 확인한다).
    geminiBehavior = {
      kind: 'json',
      result: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '', requiredAgeTier: 'toddler' },
    }
    const sixthVerify = mockRes()
    await characterHandler(
      kateReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'nuri', title: '쉬운 지식 6', content: '여섯 번째 내용' } }),
      sixthVerify,
    )
    const sixthSave = mockRes()
    await characterHandler(
      kateReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'nuri',
          title: '쉬운 지식 6',
          originalContent: '여섯 번째 내용',
          finalContent: '여섯 번째 내용',
          verificationToken: sixthVerify.body.verificationToken,
          requestId: 'req-evolve-6',
        },
      }),
      sixthSave,
    )
    t.assert(sixthSave.statusCode === 201, '진화 이후의 저장도 정상 동작한다')
    t.assert(!sixthSave.body.savedReply?.includes('청소년 단계로 성장했어요'), '이미 teen이 된 뒤에는 진화 문구가 다시 뜨지 않는다')

    // --- 요청 3번 "향후 10대 10회, 20대 20회 등 확장 가능한 구조" 검증 —
    // teen 단계의 요구치(10회)는 "이번 단계부터 새로 10개"가 아니라
    // "누적 총합이 toddler(5) + teen(10) = 15개"가 되는 시점에 발동한다
    // (character_knowledge_entries를 단계별로 따로 세지 않고 캐릭터
    // 전체 누적 개수로 판정하는 설계이기 때문). 7~14번째는 teen을
    // 유지하다가 15번째에 junior_20s(Lv.10)로 진화해야, 같은 로직이
    // toddler 말고 다른 단계에서도 그대로 동작한다는 걸 보여준다.
    // 하루 지식 검증 10회 제한(knowledgeLimit.ts)과는 별개 테스트이므로,
    // 날짜를 넘겨 kate의 하루 검증 횟수를 리셋한다(1~6번째로 이미 6회를
    // 썼고, 이 구간만 8회를 더 쓰므로 그대로는 제한에 걸린다).
    mock.setFakeDate('2026-03-01')
    let lastSave
    for (let n = 7; n <= 14; n++) {
      lastSave = await teachOnce(n)
      t.assert(lastSave.statusCode === 201, `${n}번째 적합 지식 저장이 성공한다`)
      t.assert(lastSave.body.level === 5, `${n}번째 저장까지는 teen(Lv.5)을 유지한다 — 누적 15개가 되는 15번째에만 다음 진화 발동`)
    }

    const fifteenth = await teachOnce(15)
    t.assert(fifteenth.statusCode === 201, '15번째 적합 지식 저장이 성공한다')
    t.assert(fifteenth.body.level === 10, '누적 15개(toddler 5 + teen 10)에서 junior_20s(Lv.10)로 진화한다 — teen 단계에서도 같은 일반화된 로직이 동작한다')
    t.assert(
      fifteenth.body.savedReply?.includes('청년 단계로 성장했어요'),
      'junior_20s로 진화할 때는 그 단계의 스테이지 라벨("청년")이 그대로 문구에 쓰인다 — 단계마다 문구를 새로 코딩할 필요가 없다',
    )
  }

  return t.summary()
}

module.exports = { run }
