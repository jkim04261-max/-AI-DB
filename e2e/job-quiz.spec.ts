import { test, expect, type Page } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, mockEmptyCharacters } from './fixtures/mock-api'

// 지시서(직업 그림 퀴즈) — 신규 라우트 /job-quiz. 카드 맞추기와 같은
// 이유로 /api/conversations·/api/character를 모킹해야 한다(ChatProvider/
// GrowthProvider가 앱 루트에서 항상 마운트됨).
const USER = { id: 1, email: 'alice@test.com' }

function mockEmptyConversations(page: Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

async function setup(page: Page) {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockEmptyCharacters(page)
  await page.goto('/job-quiz')
}

// 매 세션(또는 "다시 하기")마다 직업·유형(A/B)·보기 순서가 랜덤이라,
// 어떤 직업이 나올지 하드코딩하지 않는다 — data-job-id/data-correct로
// 실제 렌더된 보기 중에서 정답을 찾아 쓴다(화면에는 보이지 않는 테스트
// 전용 속성, JobQuiz.tsx 참고).
async function clickCorrectOption(page: Page) {
  const options = page.getByTestId('job-quiz-option')
  const count = await options.count()
  for (let i = 0; i < count; i++) {
    const option = options.nth(i)
    if ((await option.getAttribute('data-correct')) === 'true') {
      await option.click()
      return
    }
  }
  throw new Error('정답 보기를 찾지 못했습니다')
}

async function clickWrongOption(page: Page) {
  const options = page.getByTestId('job-quiz-option')
  const count = await options.count()
  for (let i = 0; i < count; i++) {
    const option = options.nth(i)
    if ((await option.getAttribute('data-correct')) === 'false') {
      await option.click()
      return
    }
  }
  throw new Error('오답 보기를 찾지 못했습니다')
}

test('renders the first question with a pre-granted mock balance and progress bar', async ({ page }) => {
  await setup(page)

  await expect(page.getByRole('heading', { name: '직업 그림 퀴즈' })).toBeVisible()
  await expect(page.getByTestId('job-quiz-balance')).toContainText('1,000,000원')
  await expect(page.getByTestId('job-quiz-progress')).toHaveText('1 / 5 문제')
  await expect(page.getByTestId('job-quiz-option')).toHaveCount(4)
})

test('picking the wrong answer shows "다시 생각해볼까요?" and allows retrying without penalty', async ({ page }) => {
  await setup(page)

  await clickWrongOption(page)
  await expect(page.getByTestId('job-quiz-feedback-wrong')).toContainText('다시 생각해볼까요?')
  await expect(page.getByTestId('job-quiz-balance')).toContainText('1,000,000원')
  await expect(page.getByTestId('job-quiz-next-button')).toHaveCount(0)

  await clickCorrectOption(page)
  await expect(page.getByTestId('job-quiz-feedback-correct')).toContainText('정답이에요! +10,000원')
  await expect(page.getByTestId('job-quiz-balance')).toContainText('1,010,000원')
})

test('answering correctly awards 10,000원 and advances through 5 questions to a summary', async ({ page }) => {
  await setup(page)

  for (let i = 0; i < 5; i++) {
    await expect(page.getByTestId('job-quiz-progress')).toHaveText(`${i + 1} / 5 문제`)
    await clickCorrectOption(page)
    await expect(page.getByTestId('job-quiz-feedback-correct')).toBeVisible()
    await page.getByTestId('job-quiz-next-button').click()
  }

  await expect(page.getByTestId('job-quiz-summary')).toContainText('5문제 중 5개 정답!')
  await expect(page.getByTestId('job-quiz-summary')).toContainText('보너스 +20,000원')
  await expect(page.getByTestId('job-quiz-balance')).toContainText('1,070,000원')
  await expect(page.getByRole('button', { name: '다시 하기' })).toBeVisible()
})

test('missing the perfect score (one wrong-then-correct answer) skips the 20,000원 bonus', async ({ page }) => {
  await setup(page)

  await clickWrongOption(page)
  await clickCorrectOption(page)
  await page.getByTestId('job-quiz-next-button').click()

  for (let i = 1; i < 5; i++) {
    await clickCorrectOption(page)
    await page.getByTestId('job-quiz-next-button').click()
  }

  await expect(page.getByTestId('job-quiz-summary')).toContainText('5문제 중 5개 정답!')
  await expect(page.getByTestId('job-quiz-summary')).not.toContainText('보너스')
  await expect(page.getByTestId('job-quiz-balance')).toContainText('1,050,000원')
})

test('clicking 다시 하기 after finishing resets progress and generates a fresh set of questions', async ({ page }) => {
  await setup(page)

  for (let i = 0; i < 5; i++) {
    await clickCorrectOption(page)
    await page.getByTestId('job-quiz-next-button').click()
  }
  await expect(page.getByTestId('job-quiz-summary')).toBeVisible()

  await page.getByRole('button', { name: '다시 하기' }).click()

  await expect(page.getByTestId('job-quiz-summary')).toHaveCount(0)
  await expect(page.getByTestId('job-quiz-progress')).toHaveText('1 / 5 문제')
  await expect(page.getByTestId('job-quiz-option')).toHaveCount(4)
})
