import { test, expect, type Page } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, mockEmptyCharacters } from './fixtures/mock-api'

// 지시서(직업 카드 맞추기 미니게임) — 신규 라우트 /card-match. 이
// 미니게임은 /grow와 완전히 별개(사용자 확인: "독립적인 별도
// 잔액")라 useMockWallet도 자체 인스턴스를 쓴다. ChatProvider/
// GrowthProvider가 앱 루트(main.tsx)에서 항상 마운트되므로, 이
// 페이지를 열 때도 /api/conversations·/api/character를 모킹해야
// 한다(다른 e2e 파일들과 같은 이유).
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
  await page.goto('/card-match')
}

// 셔플 순서(어떤 6개 직업이 뽑히는지, 각 직업의 도구가 어느 칸에
// 가는지)는 매 실행마다 랜덤이라, 특정 직업 이름을 하드코딩하지
// 않는다 — data-job-id/data-kind로 실제 렌더된 카드 중에서 골라
// 쓴다(화면에는 보이지 않는 테스트 전용 속성, CardMatchGame.tsx 참고).
async function getJobIds(page: Page): Promise<string[]> {
  const backs = page.getByTestId('card-match-back')
  const ids = await backs.evaluateAll((els) => els.map((el) => el.getAttribute('data-job-id')))
  return [...new Set(ids.filter((id): id is string => id !== null))]
}

test('renders a 4x3 grid of face-down cards with a pre-granted mock balance', async ({ page }) => {
  await setup(page)

  await expect(page.getByRole('heading', { name: '직업 카드 맞추기' })).toBeVisible()
  await expect(page.getByTestId('card-match-balance')).toContainText('1,000,000원')
  await expect(page.getByTestId('card-match-progress')).toHaveText('0 / 6 쌍')
  await expect(page.getByTestId('card-match-back')).toHaveCount(12)
})

test('matching a job card with its tool card awards 5,000원 and reveals both with text labels', async ({ page }) => {
  await setup(page)
  const [jobId] = await getJobIds(page)

  await page.locator(`[data-job-id="${jobId}"][data-kind="job"]`).click()
  await page.locator(`[data-job-id="${jobId}"][data-kind="tool"]`).click()

  await expect(page.getByTestId('card-match-message')).toContainText('정답이에요! +5,000원')
  await expect(page.getByTestId('card-match-balance')).toContainText('1,005,000원')
  await expect(page.getByTestId('card-match-progress')).toHaveText('1 / 6 쌍')
  // 이미지 파일이 실제로 없으므로(지시서) 항상 fallback 텍스트 블록으로
  // 넘어가고, 직업/도구 라벨은 매칭된 카드 아래에 그대로 보인다.
  const matchedJobCard = page.locator(`[data-job-id="${jobId}"][data-kind="job"]`)
  await expect(matchedJobCard.locator('img')).toHaveCount(0)
  await expect(matchedJobCard).toBeDisabled()
})

test('mismatched cards flip back after 3 seconds and award nothing', async ({ page }) => {
  await setup(page)
  const jobIds = await getJobIds(page)
  expect(jobIds.length).toBeGreaterThanOrEqual(2)
  const [firstJobId, secondJobId] = jobIds

  await page.locator(`[data-job-id="${firstJobId}"][data-kind="job"]`).click()
  await page.locator(`[data-job-id="${secondJobId}"][data-kind="tool"]`).click()

  // 3초 동안은 뒤집힌 채로 유지되고(라벨이 보임), 다른 카드 클릭도
  // 막힌다(busy).
  await expect(page.getByTestId(`card-match-face-${firstJobId}-job`)).toBeVisible()
  await expect(page.getByTestId('card-match-balance')).toContainText('1,000,000원')

  await expect(page.getByTestId('card-match-back')).toHaveCount(12, { timeout: 4000 })
  await expect(page.getByTestId('card-match-progress')).toHaveText('0 / 6 쌍')
})

test('clearing all 6 pairs awards a 20,000원 bonus and offers a new game', async ({ page }) => {
  await setup(page)

  for (let i = 0; i < 6; i++) {
    const jobIds = await getJobIds(page)
    const jobId = jobIds[0]
    await page.locator(`[data-job-id="${jobId}"][data-kind="job"]`).click()
    await page.locator(`[data-job-id="${jobId}"][data-kind="tool"]`).click()
    await expect(page.getByTestId('card-match-progress')).toHaveText(`${i + 1} / 6 쌍`)
  }

  await expect(page.getByTestId('card-match-message')).toContainText('전체 클리어! 보너스 +20,000원')
  await expect(page.getByTestId('card-match-balance')).toContainText('1,050,000원')
  await expect(page.getByRole('button', { name: '다시 하기' })).toBeVisible()
})
