import { test, expect, type Page } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'

// 지시서(연령별 미니게임 보조 편성) — 메인 학습 화면의 [미니게임]
// 서브 메뉴. 실제 플레이 화면은 이미 검증된 독립형 컴포넌트
// (CardMatchGame/JobQuiz, 각자 전용 useMockWallet)를 그대로 재사용하므로
// 플레이 자체의 상세 동작은 e2e/job-quiz.spec.ts에서 이미 다룬다 — 이
// 파일은 ①연령대별로 해금 개수가 다르게 노출되는지, ②재사용된 게임이
// 서브 메뉴 안에서 실제로 열리고 플레이되는지만 확인한다.
const USER = { id: 1, email: 'alice@test.com' }

function mockEmptyConversations(page: Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

async function mockCharacterApi(page: Page, characters: unknown[]) {
  await page.route('**/api/character**', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const method = route.request().method()

    if (method === 'GET' && action === 'messages') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], total: 0 }) })
      return
    }
    if (method === 'GET' && action === 'knowledge') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], total: 0 }) })
      return
    }
    if (method === 'GET' && action === 'exam') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [], alreadyPassed: false }) })
      return
    }
    if (method === 'GET' && action === 'usage') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ teachRemaining: 10, teachLimit: 10, studyRemaining: 3, studyLimit: 3 }) })
      return
    }
    if (method === 'GET' && !action) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters }) })
      return
    }
    await route.fallback()
  })
}

const NURI_BASE = {
  id: 1,
  user_id: USER.id,
  companion_type: 'nuri',
  stage: 'child',
  profession: 'accountant',
  exp: 0,
  created_at: new Date().toISOString(),
}

test('a toddler (8~9살) account sees only 1 minigame slot, with the second game shown locked', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, [{ ...NURI_BASE, level: 1, age_tier: 'toddler' }])

  await page.goto('/grow')
  await page.getByRole('button', { name: '미니게임' }).click()

  await expect(page.getByTestId('minigame-slot-count')).toContainText('최대 1개')
  await expect(page.getByTestId('minigame-tile-card_match')).toBeEnabled()
  await expect(page.getByTestId('minigame-tile-job_quiz')).toBeDisabled()
})

test('a teen (10대) account unlocks more slots than a toddler, including the second real minigame', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, [{ ...NURI_BASE, level: 5, age_tier: 'teen' }])

  await page.goto('/grow')
  await page.getByRole('button', { name: '미니게임' }).click()

  // 지시서(10대=3) — 실제 구현된 미니게임은 2종뿐이라 "최대 3개" 중
  // 2개까지 실제로 플레이 가능하고, 남은 1자리는 "준비 중"으로 보여야
  // 한다(지정된 슬롯 수 자체는 거짓으로 줄이지 않는다).
  await expect(page.getByTestId('minigame-slot-count')).toContainText('최대 3개')
  await expect(page.getByTestId('minigame-tile-card_match')).toBeEnabled()
  await expect(page.getByTestId('minigame-tile-job_quiz')).toBeEnabled()
  await expect(page.getByTestId('minigame-tile-coming-soon')).toHaveCount(1)
})

test('a 60대 master account (level 65) unlocks the full 13-slot count from the tier mapping', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, [{ ...NURI_BASE, level: 65, age_tier: 'master_50s' }])

  await page.goto('/grow')
  await page.getByRole('button', { name: '미니게임' }).click()

  await expect(page.getByTestId('minigame-slot-count')).toContainText('최대 13개')
  await expect(page.getByTestId('minigame-tile-coming-soon')).toHaveCount(11)
})

test('a 50대 (not yet 60) master account unlocks 11 slots, fewer than the 60대 tier', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, [{ ...NURI_BASE, level: 40, age_tier: 'master_50s' }])

  await page.goto('/grow')
  await page.getByRole('button', { name: '미니게임' }).click()

  await expect(page.getByTestId('minigame-slot-count')).toContainText('최대 11개')
})

test('opening the reused 직업 그림 퀴즈 from the minigame hub actually plays it, independent of the main wallet', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, [{ ...NURI_BASE, level: 5, age_tier: 'teen' }])

  await page.goto('/grow')
  await page.getByRole('button', { name: '미니게임' }).click()
  await page.getByTestId('minigame-tile-job_quiz').click()

  // JobQuiz.tsx 자체 testid — 독립 /job-quiz 라우트와 동일한 컴포넌트가
  // 그대로 렌더된다는 증거.
  await expect(page.getByTestId('job-quiz-balance')).toContainText('1,000,000원')
  await expect(page.getByTestId('job-quiz-option')).toHaveCount(4)

  await page.getByTestId('minigame-back-button').click()
  await expect(page.getByTestId('minigame-slot-count')).toBeVisible()
})

test('minigames are locked behind having a profession, same gating as 가르치기/문제 풀기', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, [{ ...NURI_BASE, profession: null, level: 1, age_tier: 'toddler' }])

  await page.goto('/grow')

  await expect(page.getByRole('button', { name: '미니게임' })).toBeDisabled()
})
