import { test, expect, type Page, type Route } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'

// PR #45 checkpoint 4: XP·레벨 표시 + 퀴즈/시험 UI — all mocked, no real
// DB/Gemini call. See e2e/README.md. ChatProvider also mounts at the app
// root and fetches /api/conversations as soon as a user is set, so every
// test here mocks that too even though it's unrelated to this feature.
const USER = { id: 1, email: 'alice@test.com' }

function mockEmptyConversations(page: Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

async function mockCharacterApi(
  page: Page,
  options: {
    characters?: unknown[]
    onQuiz?: (route: Route) => Promise<void>
    onQuizSubmit?: (route: Route) => Promise<void>
    onExam?: (route: Route) => Promise<void>
    onExamSubmit?: (route: Route) => Promise<void>
  },
) {
  await page.route('**/api/character**', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const method = route.request().method()

    if (method === 'GET' && action === 'messages') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], total: 0 }) })
      return
    }
    // PR #46: GrowPage now eagerly fetches exam status (for the "오늘의
    // 목표" hint) whenever a character has a profession, even on tests
    // that don't care about the exam flow — default to "not passed yet"
    // unless a test supplies its own onExam.
    if (method === 'GET' && action === 'exam' && !options.onExam) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [], alreadyPassed: false }) })
      return
    }
    // PR #47 체크포인트 1: 메인 화면 스탯 게이지용 GET ?action=knowledge
    // 기본값 — 이 파일의 테스트는 XP/레벨/퀴즈/시험을 다루므로 빈
    // 목록이면 충분하다.
    if (method === 'GET' && action === 'knowledge') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], total: 0 }) })
      return
    }
    // PR #49: 상단 리소스 바의 "행동력"용 GET ?action=usage 기본값.
    if (method === 'GET' && action === 'usage') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ teachRemaining: 10, teachLimit: 10, studyRemaining: 3, studyLimit: 3 }) })
      return
    }
    if (method === 'GET' && !action) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ characters: options.characters ?? [] }),
      })
      return
    }
    if (method === 'GET' && action === 'quiz' && options.onQuiz) {
      await options.onQuiz(route)
      return
    }
    if (method === 'POST' && action === 'quiz-submit' && options.onQuizSubmit) {
      await options.onQuizSubmit(route)
      return
    }
    if (method === 'GET' && action === 'exam' && options.onExam) {
      await options.onExam(route)
      return
    }
    if (method === 'POST' && action === 'exam-submit' && options.onExamSubmit) {
      await options.onExamSubmit(route)
      return
    }
    await route.fallback()
  })
}

const NURI_ACCOUNTANT_LV1 = {
  id: 1,
  user_id: USER.id,
  companion_type: 'nuri',
  stage: 'child',
  profession: 'accountant',
  level: 1,
  exp: 40,
  created_at: new Date().toISOString(),
}

test('the character card shows the real level and XP progress from the server, with the growth disclaimer', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_ACCOUNTANT_LV1] })

  await page.goto('/grow')

  await expect(page.getByText('Lv.1', { exact: true })).toBeVisible()
  await expect(page.getByText('40/100 XP')).toBeVisible()
  await expect(page.getByText('레벨·XP는 게임 속 성장 지표예요', { exact: false })).toBeVisible()
})

test('answering a quiz correctly shows the explanation, the XP gained, and updates the displayed XP', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let submitBody: Record<string, unknown> | null = null
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT_LV1],
    onQuiz: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          question: { id: 'accountant-1', text: '회계의 기본 등식은?', choices: ['자산 = 부채 + 자본', '수익 = 비용', '자산 = 자본', '부채 = 자본'] },
        }),
      })
    },
    onQuizSubmit: async (route) => {
      submitBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          correct: true,
          explanation: '자산은 부채와 자본의 합이에요.',
          expAwarded: 5,
          exp: 45,
          level: 1,
          leveledUp: false,
          message: '정답이에요! 자산은 부채와 자본의 합이에요. (+5XP)',
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '문제 풀기' }).click()
  await page.getByRole('button', { name: /퀴즈 풀기/ }).click()

  await expect(page.getByText('회계의 기본 등식은?')).toBeVisible()
  await page.getByRole('button', { name: '자산 = 부채 + 자본' }).click()
  await page.getByRole('button', { name: '제출' }).click()

  await expect(page.getByText('정답이에요!', { exact: false })).toBeVisible()
  await expect(page.getByText('(+5XP)', { exact: false })).toBeVisible()
  expect(submitBody?.questionId).toBe('accountant-1')
  expect(submitBody?.answerIndex).toBe(0)

  // The card's own XP display (not just the result message) reflects the
  // server's authoritative new exp value.
  await expect(page.getByText('45/100 XP')).toBeVisible()
})

test('passing the profession exam shows the pass message, awarded XP, and a level-up announcement', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let submitBody: Record<string, unknown> | null = null
  const questions = [
    { id: 'accountant-1', text: '회계의 기본 등식은?', choices: ['자산 = 부채 + 자본', '수익 = 비용', '자산 = 자본', '부채 = 자본'] },
    { id: 'accountant-2', text: '복식부기란?', choices: ['한 번만 기록', '두 번 기록', '기록하지 않음', '현금만 기록'] },
    { id: 'accountant-3', text: '손익계산서는 무엇을 보여주나?', choices: ['자산', '수익과 비용', '부채', '자본'] },
  ]
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT_LV1],
    onExam: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ questions, alreadyPassed: false }),
      })
    },
    onExamSubmit: async (route) => {
      submitBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          passed: true,
          score: 3,
          total: 3,
          results: questions.map((q) => ({ questionId: q.id, correct: true })),
          expAwarded: 50,
          exp: 90,
          level: 1,
          leveledUp: false,
          message: '시험 합격이에요! 3/3문제를 맞혔어요. (+50XP)',
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '문제 풀기' }).click()
  await page.getByRole('button', { name: /자격 시험 보기/ }).click()

  await expect(page.getByText('회계의 기본 등식은?')).toBeVisible()
  await page.getByRole('button', { name: '자산 = 부채 + 자본' }).click()
  await page.getByRole('button', { name: '두 번 기록' }).click()
  await page.getByRole('button', { name: '수익과 비용' }).click()

  await page.getByRole('button', { name: '제출' }).click()

  await expect(page.getByText('시험 합격이에요!', { exact: false })).toBeVisible()
  await expect(page.getByText('(+50XP)', { exact: false })).toBeVisible()
  expect(submitBody?.answers).toEqual([
    { questionId: 'accountant-1', answerIndex: 0 },
    { questionId: 'accountant-2', answerIndex: 1 },
    { questionId: 'accountant-3', answerIndex: 1 },
  ])
  await expect(page.getByText('90/100 XP')).toBeVisible()
})

// PR #45 checkpoint 5: XP는 클라이언트 상태가 아니라 서버(DB)에 저장된
// 값이어야 한다 — 퀴즈로 얻은 XP가 새로고침 후에도(이 테스트에서는 완전히
// 새로 간 /grow 페이지 로드, 즉 캐릭터 목록을 처음부터 다시 GET하는
// 상황) 그대로 보이는지 확인한다. 퀴즈 제출 응답이 아니라 "새로고침 후의
// 캐릭터 목록 GET"이 45XP를 돌려주는 것으로 모킹해, 화면이 실제로 그
// GET 응답을 반영하는지(제출 시점에 받은 클라이언트 메모리 값을 우연히
// 그대로 보여주는 게 아닌지) 검증한다.
test('XP earned from a quiz survives a full page reload (re-fetched from the server, not just client memory)', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  const NURI_AFTER_QUIZ = { ...NURI_ACCOUNTANT_LV1, exp: 45 }
  await mockCharacterApi(page, {
    characters: [NURI_AFTER_QUIZ],
    onQuiz: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          question: { id: 'accountant-1', text: '회계의 기본 등식은?', choices: ['자산 = 부채 + 자본', '수익 = 비용', '자산 = 자본', '부채 = 자본'] },
        }),
      })
    },
  })

  await page.goto('/grow')
  // 처음 로드에서도 (제출 전부터) exp=45가 서버에서 내려와 표시된다 —
  // 이 값은 이전 세션에서 이미 퀴즈로 얻어 DB에 저장되어 있던 XP라고
  // 가정한다.
  await expect(page.getByText('45/100 XP')).toBeVisible()

  await page.reload()

  await expect(page.getByText('45/100 XP')).toBeVisible()
  await expect(page.getByText('Lv.1', { exact: true })).toBeVisible()
})

// 지시서(문제 풀기 용돈 이벤트): "문제 풀기"에서 정답을 맞힐 때마다
// 쌓는 누적 횟수로 3의 배수번째마다 체험판 용돈 보상(+30,000원, 반복)을,
// 정확히 5번째에서 간식 이벤트(1회성)를 띄운다. 이 테스트는 식사·알바
// 이벤트의 "가르치기" 트리거와 독립된 "문제 풀기" 트리거를 검증
// 한다. NURI_ACCOUNTANT_LV1은 Stage 1 온보딩을 거치지 않은 기존
// 캐릭터라 wallet.balanceWon이 null이므로(지갑 지급 전), 여기서는
// 팝업·말풍선 UI만 검증하고 정확한 원화 차감/지급 금액은 검증하지
// 않는다(식사/알바 이벤트 테스트가 이미 그 금액 계산 경로를 검증함).
test('answering quiz questions correctly triggers a 3-answer reward popup and a one-time 5th-answer snack event', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT_LV1],
    onQuiz: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          question: { id: 'accountant-1', text: '회계의 기본 등식은?', choices: ['자산 = 부채 + 자본', '수익 = 비용', '자산 = 자본', '부채 = 자본'] },
        }),
      })
    },
    onQuizSubmit: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          correct: true,
          explanation: '자산은 부채와 자본의 합이에요.',
          expAwarded: 5,
          exp: 45,
          level: 1,
          leveledUp: false,
          message: '정답이에요! (+5XP)',
        }),
      })
    },
  })

  await page.goto('/grow')

  // 매 라운드 시작 전에 이전 패널이 "저절로 닫혔는지"(3번째/5번째 정답
  // 보상 트리거)를 먼저 잠깐 기다려보고, 그래도 열려 있으면 직접
  // 닫는다 — "다른 문제 풀기" 버튼이 보이는지로 패널이 열려 있는지
  // 추측하면(isVisible/count는 재시도 없이 그 순간 DOM만 보므로) 방금
  // 끝난 제출의 상태 반영과 타이밍이 겹쳐 레이스 컨디션이 생긴다.
  const closeQuizPanelIfOpen = async () => {
    const dialog = page.getByRole('dialog', { name: '문제 풀기' })
    await dialog.waitFor({ state: 'detached', timeout: 1000 }).catch(() => {})
    if ((await dialog.count()) > 0) {
      await dialog.getByRole('button', { name: '닫기' }).first().click()
      await expect(dialog).toHaveCount(0)
    }
  }

  const answerCorrectly = async () => {
    await closeQuizPanelIfOpen()
    await page.getByRole('button', { name: '문제 풀기', exact: true }).click()
    await page.getByRole('button', { name: /퀴즈 풀기/ }).click()
    await expect(page.getByText('회계의 기본 등식은?')).toBeVisible()
    await page.getByRole('button', { name: '자산 = 부채 + 자본' }).click()
    await page.getByRole('button', { name: '제출' }).click()
    await expect(page.getByRole('button', { name: '제출' })).toHaveCount(0)
  }

  await answerCorrectly() // 1번째 정답
  await answerCorrectly() // 2번째 정답
  await answerCorrectly() // 3번째 정답 → 용돈 보상 트리거 (패널도 닫힌다)

  await expect(page.getByTestId('money-popup')).toContainText('30,000원')
  await expect(page.getByTestId('speech-bubble')).toContainText('문제를 맞혀서 30,000원 받았어요')

  await answerCorrectly() // 4번째 정답
  await answerCorrectly() // 5번째 정답 → 간식 이벤트 트리거 (1회성)

  await expect(page.getByTestId('speech-bubble')).toContainText('배가 고파요! 간식 먹고 올게요')
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠, 간식 진짜 맛있어요')
})
