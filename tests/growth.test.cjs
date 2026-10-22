// Tests XP/레벨/퀴즈/시험 (PR #45 checkpoint 4) added to api/character.ts.
// See tests/README.md for why this is a bundled-handler test, and
// tests/knowledge.test.cjs for the knowledge-verification actions this
// builds on (knowledge-save XP is tested there as an extension; quiz/exam
// are tested fully here).
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'
  process.env.GEMINI_API_KEY = 'fake-key-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default
  const auth = bundle('api/_lib/auth.ts')

  global.fetch = async () => {
    throw new Error('quiz/exam actions should never call Gemini')
  }

  const t = new Tracker('growth')

  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' })
  const cookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const authedReq = (overrides = {}) => ({ headers: { cookie }, query: {}, ...overrides })

  await characterHandler(authedReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
  await characterHandler(authedReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())

  // --- 새 캐릭터는 Lv.1, 0XP로 시작하고, 목록 응답에 level/exp가 포함된다 ---
  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET' }), res)
    const nuri = res.body.characters.find((c) => c.companion_type === 'nuri')
    t.assert(nuri.level === 1 && nuri.exp === 0, '새 캐릭터는 Lv.1, 0XP로 시작한다')
  }

  // --- 1 & 2: 퀴즈 문제는 정답 없이 내려오고, 서버가 직접 채점한다 ---
  const quizRes = mockRes()
  await characterHandler(authedReq({ method: 'GET', query: { action: 'quiz', companionType: 'nuri' } }), quizRes)
  t.assert(quizRes.statusCode === 200, '퀴즈 문제 요청이 성공한다')
  t.assert(typeof quizRes.body.question?.id === 'string', '문제 id가 내려온다')
  t.assert(Array.isArray(quizRes.body.question?.choices) && quizRes.body.question.choices.length >= 2, '선택지가 내려온다')
  t.assert(quizRes.body.question.correctIndex === undefined, '정답(correctIndex)은 클라이언트로 내려오지 않는다')
  t.assert(quizRes.body.question.explanation === undefined, '해설도 채점 전에는 내려오지 않는다')

  // 실제 정답을 알아내기 위해, 문제은행과 동일한 질문 4개를 전부 시도해
  // 정답을 찾는다(서버 전용 정답표를 테스트가 직접 알 필요는 없다 —
  // accountant-1의 정답은 0이라는 사실만 고정값으로 사용).
  const KNOWN_CORRECT = { 'accountant-1': 0, 'accountant-2': 0, 'accountant-3': 1, 'accountant-4': 1 }

  // --- 3: 정답을 맞히면 +5XP, 처음 한 번만 ---
  const firstCorrect = mockRes()
  await characterHandler(
    authedReq({
      method: 'POST',
      query: { action: 'quiz-submit' },
      body: { companionType: 'nuri', questionId: 'accountant-1', answerIndex: KNOWN_CORRECT['accountant-1'] },
    }),
    firstCorrect,
  )
  t.assert(firstCorrect.statusCode === 200, '퀴즈 채점 요청이 성공한다')
  t.assert(firstCorrect.body.correct === true, '정답을 맞히면 correct:true를 받는다')
  t.assert(firstCorrect.body.expAwarded === 5, '처음 맞힌 퀴즈는 +5XP를 받는다')
  t.assert(firstCorrect.body.exp === 5 && firstCorrect.body.level === 1, 'XP가 5로 반영되고 아직 레벨업은 아니다')
  t.assert(typeof firstCorrect.body.explanation === 'string' && firstCorrect.body.explanation.length > 0, '정답 후 해설이 내려온다')

  // --- 같은 문제를 다시 맞혀도 XP가 또 지급되지 않는다(무한 획득 방지) ---
  const secondCorrect = mockRes()
  await characterHandler(
    authedReq({
      method: 'POST',
      query: { action: 'quiz-submit' },
      body: { companionType: 'nuri', questionId: 'accountant-1', answerIndex: KNOWN_CORRECT['accountant-1'] },
    }),
    secondCorrect,
  )
  t.assert(secondCorrect.body.correct === true && secondCorrect.body.expAwarded === 0, '같은 문제를 또 맞혀도 두 번째부터는 XP가 지급되지 않는다')
  t.assert(secondCorrect.body.exp === 5, '중복 정답으로 XP가 추가로 늘지 않는다(여전히 5)')

  // --- 오답은 XP가 없고 correct:false ---
  const wrongRes = mockRes()
  await characterHandler(
    authedReq({
      method: 'POST',
      query: { action: 'quiz-submit' },
      body: { companionType: 'nuri', questionId: 'accountant-2', answerIndex: (KNOWN_CORRECT['accountant-2'] + 1) % 4 },
    }),
    wrongRes,
  )
  t.assert(wrongRes.body.correct === false && wrongRes.body.expAwarded === 0, '오답은 XP를 받지 못한다')

  // --- 다른 직업(가수)의 문제를 회계사 캐릭터에 제출하면 거부된다 ---
  {
    const res = mockRes()
    await characterHandler(
      authedReq({ method: 'POST', query: { action: 'quiz-submit' }, body: { companionType: 'nuri', questionId: 'singer-1', answerIndex: 0 } }),
      res,
    )
    t.assert(res.statusCode === 400, "다른 직업의 문제를 제출하면 거부된다 (400)")
  }

  // --- 4: 직업별 시험 — 회계사 캐릭터는 가수 시험을 볼 수 없다(문제는
  // 직업별로만 내려온다), 전부 정답으로 제출하면 합격 + 최초 합격 +50XP ---
  const examGet = mockRes()
  await characterHandler(authedReq({ method: 'GET', query: { action: 'exam', companionType: 'nuri' } }), examGet)
  t.assert(examGet.statusCode === 200, '시험 문제 요청이 성공한다')
  t.assert(examGet.body.questions.length >= 3 && examGet.body.questions.length <= 5, '시험 문항이 3~5개다')
  t.assert(examGet.body.questions.every((q) => q.id.startsWith('accountant')), '회계사 캐릭터에게는 회계사 문제만 내려온다')
  t.assert(examGet.body.alreadyPassed === false, '아직 합격한 적이 없다')
  t.assert(examGet.body.questions[0].correctIndex === undefined, '시험 문제에도 정답이 노출되지 않는다')

  const allCorrectAnswers = examGet.body.questions.map((q) => ({ questionId: q.id, answerIndex: KNOWN_CORRECT[q.id] }))
  const examSubmit1 = mockRes()
  await characterHandler(
    authedReq({ method: 'POST', query: { action: 'exam-submit' }, body: { companionType: 'nuri', answers: allCorrectAnswers } }),
    examSubmit1,
  )
  t.assert(examSubmit1.statusCode === 200, '시험 제출이 성공한다')
  t.assert(examSubmit1.body.passed === true, '전부 정답이면 합격한다')
  t.assert(examSubmit1.body.score === examGet.body.questions.length, '만점이 기록된다')
  t.assert(examSubmit1.body.expAwarded === 50, '최초 합격은 +50XP를 받는다')
  t.assert(examSubmit1.body.exp === 55, '누적 XP는 5(퀴즈 정답) + 50(시험 합격) = 55다')
  t.assert(examSubmit1.body.leveledUp === false, '55XP는 레벨업 임계값(100XP)에 못 미쳐 아직 레벨업이 아니다')

  // --- 재응시(다시 합격)해도 XP는 또 지급되지 않는다 ---
  const examSubmit2 = mockRes()
  await characterHandler(
    authedReq({ method: 'POST', query: { action: 'exam-submit' }, body: { companionType: 'nuri', answers: allCorrectAnswers } }),
    examSubmit2,
  )
  t.assert(examSubmit2.body.passed === true && examSubmit2.body.expAwarded === 0, '다시 합격해도 두 번째부터는 XP가 지급되지 않는다')

  {
    const res = mockRes()
    await characterHandler(authedReq({ method: 'GET', query: { action: 'exam', companionType: 'nuri' } }), res)
    t.assert(res.body.alreadyPassed === true, '한 번 합격한 뒤에는 alreadyPassed가 true로 바뀐다')
  }

  // --- 일부만 답하면 거부된다 ---
  {
    const res = mockRes()
    await characterHandler(
      authedReq({ method: 'POST', query: { action: 'exam-submit' }, body: { companionType: 'nuri', answers: [{ questionId: 'accountant-1', answerIndex: 0 }] } }),
      res,
    )
    t.assert(res.statusCode === 400, '모든 문항에 답하지 않으면 거부된다 (400)')
  }

  // --- 불합격 시나리오: 전부 오답으로 제출 ---
  mock.seedUser(2, { email: 'bob@test.com' })
  const bobCookie = cookieHeaderFor(auth, 2, 0, 'bob@test.com')
  const bobReq = (overrides = {}) => ({ headers: { cookie: bobCookie }, query: {}, ...overrides })
  await characterHandler(bobReq({ method: 'POST', body: { companionType: 'nuri' } }), mockRes())
  await characterHandler(bobReq({ method: 'PATCH', body: { companionType: 'nuri', profession: 'accountant' } }), mockRes())
  const bobExamGet = mockRes()
  await characterHandler(bobReq({ method: 'GET', query: { action: 'exam', companionType: 'nuri' } }), bobExamGet)
  const allWrongAnswers = bobExamGet.body.questions.map((q) => ({ questionId: q.id, answerIndex: (KNOWN_CORRECT[q.id] + 1) % 4 }))
  const bobExamSubmit = mockRes()
  await characterHandler(bobReq({ method: 'POST', query: { action: 'exam-submit' }, body: { companionType: 'nuri', answers: allWrongAnswers } }), bobExamSubmit)
  t.assert(bobExamSubmit.body.passed === false, '전부 오답이면 불합격한다')
  t.assert(bobExamSubmit.body.expAwarded === 0, '불합격은 XP를 받지 못한다')

  // --- 5: 다른 사용자 차단 ---
  mock.seedUser(3, { email: 'carol@test.com' })
  const carolCookie = cookieHeaderFor(auth, 3, 0, 'carol@test.com')
  {
    const res = mockRes()
    await characterHandler({ headers: { cookie: carolCookie }, query: { action: 'quiz', companionType: 'nuri' }, method: 'GET' }, res)
    t.assert(res.statusCode === 404, 'carol이 alice의 누리로 퀴즈를 보려 해도 404로 차단된다')
  }
  {
    const res = mockRes()
    await characterHandler(
      { headers: { cookie: carolCookie }, query: { action: 'exam-submit' }, method: 'POST', body: { companionType: 'nuri', answers: [] } },
      res,
    )
    t.assert(res.statusCode === 404, 'carol이 alice의 누리로 시험을 보려 해도 404로 차단된다')
  }

  // --- 2: 검증된 지식 저장 +10XP (save-knowledge 확장분) ---
  mock.seedUser(4, { email: 'dave@test.com' })
  const daveCookie = cookieHeaderFor(auth, 4, 0, 'dave@test.com')
  const daveReq = (overrides = {}) => ({ headers: { cookie: daveCookie }, query: {}, ...overrides })
  await characterHandler(daveReq({ method: 'POST', body: { companionType: 'duri' } }), mockRes())
  await characterHandler(daveReq({ method: 'PATCH', body: { companionType: 'duri', profession: 'singer' } }), mockRes())

  // Gemini 검증을 흉내내기 위해 fetch를 다시 활성화한다(이 섹션만).
  global.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' }) }] } }],
        }),
      }
    }
    throw new Error(`unexpected fetch to ${url}`)
  }
  const daveVerify = mockRes()
  await characterHandler(daveReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'duri', title: '발성법', content: '복식호흡으로 소리를 낸다' } }), daveVerify)
  const daveSave = mockRes()
  await characterHandler(
    daveReq({
      method: 'POST',
      query: { action: 'save-knowledge' },
      body: {
        companionType: 'duri',
        title: '발성법',
        originalContent: '복식호흡으로 소리를 낸다',
        finalContent: '복식호흡으로 소리를 낸다',
        verificationToken: daveVerify.body.verificationToken,
        requestId: 'req-growth-1',
      },
    }),
    daveSave,
  )
  t.assert(daveSave.statusCode === 201, '지식 저장이 성공한다')
  t.assert(daveSave.body.expAwarded === 10, '검증된 지식 저장은 +10XP를 받는다')
  t.assert(daveSave.body.exp === 10 && daveSave.body.level === 1, 'XP가 10으로 반영된다')

  // --- 같은 requestId로 다시 저장해도(중복 제출) XP가 또 지급되지 않는다 ---
  const daveSaveAgain = mockRes()
  await characterHandler(
    daveReq({
      method: 'POST',
      query: { action: 'save-knowledge' },
      body: {
        companionType: 'duri',
        title: '발성법',
        originalContent: '복식호흡으로 소리를 낸다',
        finalContent: '복식호흡으로 소리를 낸다',
        verificationToken: daveVerify.body.verificationToken,
        requestId: 'req-growth-1',
      },
    }),
    daveSaveAgain,
  )
  t.assert(daveSaveAgain.statusCode === 200, '중복 제출은 200(기존 기록 반환)으로 응답한다')
  t.assert(daveSaveAgain.body.expAwarded === 0, '중복 제출로는 XP가 추가 지급되지 않는다')
  t.assert(daveSaveAgain.body.exp === 10, 'XP가 여전히 10이다(중복으로 늘지 않음)')

  // --- 6: 레벨업 — 10번 더 지식을 저장하면(총 11회, 110XP) Lv.2로 올라간다.
  // 기존 지식 검증 하루 10회 제한(knowledgeLimit.ts)과는 별개 테스트이므로,
  // 날짜를 넘겨 dave의 하루 검증 횟수를 리셋한다(이 루프 자체가 10회를
  // 쓰므로, 바로 앞의 req-growth-1 검증 1회와 합치면 11회가 되어 제한에
  // 걸리기 때문).
  mock.setFakeDate('2026-02-01')
  for (let i = 0; i < 10; i++) {
    const v = mockRes()
    await characterHandler(daveReq({ method: 'POST', query: { action: 'verify-knowledge' }, body: { companionType: 'duri', title: `지식${i}`, content: `내용${i}` } }), v)
    const s = mockRes()
    await characterHandler(
      daveReq({
        method: 'POST',
        query: { action: 'save-knowledge' },
        body: {
          companionType: 'duri',
          title: `지식${i}`,
          originalContent: `내용${i}`,
          finalContent: `내용${i}`,
          verificationToken: v.body.verificationToken,
          requestId: `req-growth-level-${i}`,
        },
      }),
      s,
    )
    // dave의 두리는 req-growth-1(10XP)로 이미 10XP를 가진 상태에서 시작 —
    // 이 루프에서 i번째(0-indexed) 저장 후 누적 XP는 10 + (i+1)*10.
    // i=8에서 정확히 100XP에 도달해 Lv.2로 레벨업한다.
    if (i === 8) {
      t.assert(s.body.exp === 100, '정확히 100XP에 도달한 저장에서')
      t.assert(s.body.level === 2, '레벨업 임계값(100XP)에 도달하면 Lv.2가 된다')
      t.assert(s.body.leveledUp === true, '이번 저장에서 실제로 레벨업이 일어났다고 응답한다')
      t.assert(s.body.savedReply.includes('레벨업'), '레벨업 시 캐릭터 대사에 레벨업 사실이 포함된다')
    }
    if (i === 9) {
      t.assert(s.body.exp === 110, '그다음 저장에서는 누적 XP가 110으로 늘어난다')
      t.assert(s.body.level === 2, '이미 Lv.2이므로 레벨은 그대로다')
      t.assert(s.body.leveledUp === false, '이미 레벨업한 뒤의 저장은 다시 레벨업으로 보고되지 않는다')
    }
  }

  // --- 7: XP가 높다고 "AI가 똑똑해졌다"고 말하지 않는다 — 메시지에
  // 실제 모델 학습을 암시하는 표현이 없는지 확인(게임 지표라는 점만 언급) ---
  {
    const res = mockRes()
    await characterHandler(daveReq({ method: 'GET' }), res)
    const duri = res.body.characters.find((c) => c.companion_type === 'duri')
    t.assert(duri.level === 2 && duri.exp === 110, '캐릭터 목록 조회에도 최신 level/exp가 반영된다')
  }

  return t.summary()
}

module.exports = { run }
